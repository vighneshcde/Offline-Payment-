const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');
const CryptoEngine = require('../services/crypto');
const NotificationService = require('../services/sms');
const FirebaseVault = require('../services/firebase');

/**
 * 1. SYNC OFFLINE TRANSACTIONS
 * Reconciles offline signed transactions when device connects to internet
 * POST /api/transactions/sync
 */
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of transactions required for sync' });
    }

    const results = [];

    for (const txn of transactions) {
      const {
        id,
        payer_phone,
        payer_name,
        payee_phone,
        payee_name,
        amount,
        mode,
        counter,
        nonce,
        signature,
        offline_timestamp
      } = txn;

      // 1. Check double spending
      const check = await CryptoEngine.validateAgainstDoubleSpending(id, payer_phone, counter);
      if (!check.safe) {
        results.push({
          id,
          status: 'REJECTED',
          reason: check.reason
        });
        continue;
      }

      // 2. Cryptographic signature verification
      const sigCheck = CryptoEngine.verifyVoucherSignature(txn);
      if (!sigCheck.valid) {
        results.push({
          id,
          status: 'REJECTED',
          reason: 'Cryptographic signature verification failed: ' + sigCheck.reason
        });
        continue;
      }

      // 3. Ensure payee exists, create if new
      let payee = await db.get('SELECT * FROM users WHERE phone = ?', [payee_phone]);
      if (!payee) {
        const insertPayee = await db.run(
          `INSERT INTO users (phone, name, role) VALUES (?, ?, 'dual')`,
          [payee_phone, payee_name || `Merchant-${payee_phone.slice(-4)}`]
        );
        payee = await db.get('SELECT * FROM users WHERE id = ?', [insertPayee.lastID]);
        await db.run('INSERT INTO wallets (user_id, online_balance, offline_allocated_balance) VALUES (?, 0, 0)', [payee.id]);
      }

      let payeeWallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [payee.id]);
      if (!payeeWallet) {
        await db.run('INSERT INTO wallets (user_id, online_balance, offline_allocated_balance) VALUES (?, 0, 0)', [payee.id]);
        payeeWallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [payee.id]);
      }

      const txnAmount = parseFloat(amount);
      const payerUser = check.user;

      // Extract device and network metadata
      const payerDeviceId = txn.payer_device_id || txn.payerDeviceId || txn.device_id || payerUser.device_id || 'DEV-UNKNOWN';
      const payeeDeviceId = txn.payee_device_id || txn.payeeDeviceId || req.headers['x-device-id'] || 'DEV-UNKNOWN';
      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const rawPayload = txn.raw_payload || JSON.stringify(txn);

      // Balances before calculation
      const payerWallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [payerUser.id]);
      const payerBalBefore = payerWallet ? parseFloat(payerWallet.offline_allocated_balance) : 0;
      const payerBalAfter = Math.max(0, payerBalBefore - txnAmount);

      const payeeBalBefore = payeeWallet ? parseFloat(payeeWallet.online_balance) : 0;
      const payeeBalAfter = payeeBalBefore + txnAmount;

      // 4. Update balances: credit Payee online balance
      await db.run(
        'UPDATE wallets SET online_balance = online_balance + ?, updated_at = datetime("now") WHERE user_id = ?',
        [txnAmount, payee.id]
      );

      // Update Payer offline allocation counter
      await db.run(
        `UPDATE wallets 
         SET offline_allocated_balance = MAX(0, offline_allocated_balance - ?),
             last_sync_counter = MAX(last_sync_counter, ?),
             updated_at = datetime("now") 
         WHERE user_id = ?`,
        [txnAmount, counter || 0, payerUser.id]
      );

      // 5. Store completed transaction in central permanent ledger
      await db.run(
        `INSERT INTO transactions (
          id, payer_phone, payer_name, payer_device_id,
          payee_phone, payee_name, payee_device_id,
          amount, mode, counter, nonce, signature, 
          status, offline_timestamp, synced_at,
          raw_payload, ip_address, currency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, datetime('now'), ?, ?, 'INR')`,
        [
          id,
          payer_phone,
          payer_name || 'Anonymous Payer',
          payerDeviceId,
          payee_phone,
          payee_name || payee.name,
          payeeDeviceId,
          txnAmount,
          mode || 'OFFLINE_QR_SCAN',
          counter || 0,
          nonce || '',
          signature || '',
          offline_timestamp || new Date().toISOString(),
          rawPayload,
          clientIp
        ]
      );

      // 6. Record Double-Entry General Ledger: DEBIT for Payer
      await db.run(
        `INSERT INTO wallet_ledger_entries (
          txn_id, user_id, entry_type, amount, pocket, balance_before, balance_after, description
        ) VALUES (?, ?, 'DEBIT', ?, 'OFFLINE', ?, ?, ?)`,
        [
          id,
          payerUser.id,
          txnAmount,
          payerBalBefore,
          payerBalAfter,
          `Offline payment sent to ${payee_name || payee.name} (${payee_phone})`
        ]
      );

      // 7. Record Double-Entry General Ledger: CREDIT for Payee
      await db.run(
        `INSERT INTO wallet_ledger_entries (
          txn_id, user_id, entry_type, amount, pocket, balance_before, balance_after, description
        ) VALUES (?, ?, 'CREDIT', ?, 'ONLINE', ?, ?, ?)`,
        [
          id,
          payee.id,
          txnAmount,
          payeeBalBefore,
          payeeBalAfter,
          `Offline payment received from ${payer_name || 'Customer'} (${payer_phone})`
        ]
      );

      // 8. Record Comprehensive Payment Audit Trail
      await db.run(
        `INSERT INTO payment_audit_trail (
          txn_id, event_type, details, device_id, ip_address
        ) VALUES (?, 'PAYMENT_SETTLED_CLOUD', ?, ?, ?)`,
        [
          id,
          JSON.stringify({
            amount: txnAmount,
            counter,
            nonce,
            payer_phone,
            payee_phone,
            mode: mode || 'OFFLINE_QR_SCAN',
            payer_balance_after: payerBalAfter,
            payee_balance_after: payeeBalAfter,
            status: 'COMPLETED'
          }),
          payerDeviceId,
          clientIp
        ]
      );

      // 9. Update Lifetime Metrics for both users
      await db.run(
        `UPDATE users 
         SET total_spent = COALESCE(total_spent, 0) + ?,
             txn_count = COALESCE(txn_count, 0) + 1,
             updated_at = datetime('now')
         WHERE id = ?`,
        [txnAmount, payerUser.id]
      );

      await db.run(
        `UPDATE users 
         SET total_received = COALESCE(total_received, 0) + ?,
             txn_count = COALESCE(txn_count, 0) + 1,
             updated_at = datetime('now')
         WHERE id = ?`,
        [txnAmount, payee.id]
      );

      // 10. Audit log entry
      await db.run(
        `INSERT INTO audit_logs (action, phone, details) VALUES (?, ?, ?)`,
        ['TRANSACTION_RECONCILED', payer_phone, `Settled ₹${txnAmount.toFixed(2)} to ${payee_phone} [ID: ${id}]`]
      );

      // 11. Send Real SMS Notification to BOTH Payer and Payee!
      try {
        await NotificationService.sendTransactionSettlementSMS({
          payerPhone: payer_phone,
          payerName: payer_name || payerUser.name || 'Customer',
          payeePhone: payee_phone,
          payeeName: payee_name || payee.name || 'Merchant',
          amount: txnAmount,
          txnId: id
        });
      } catch (smsErr) {
        console.warn('⚠️ Non-blocking SMS error:', smsErr.message);
      }

      // 12. Store Transaction & User Profiles to Firebase Cloud!
      try {
        await FirebaseVault.syncTransactionToFirebase({
          id,
          payer_phone,
          payer_name: payer_name || payerUser.name || 'Customer',
          payer_device_id: payerDeviceId,
          payee_phone,
          payee_name: payee_name || payee.name || 'Merchant',
          payee_device_id: payeeDeviceId,
          amount: txnAmount,
          mode: mode || 'OFFLINE_QR_SCAN',
          counter: counter || 0,
          nonce: nonce || '',
          signature: signature || '',
          status: 'COMPLETED',
          offline_timestamp: offline_timestamp || new Date().toISOString()
        });

        // Sync refreshed user profiles to Firebase
        const updatedPayer = await db.get('SELECT * FROM users WHERE id = ?', [payerUser.id]);
        const updatedPayee = await db.get('SELECT * FROM users WHERE id = ?', [payee.id]);
        if (updatedPayer) await FirebaseVault.syncUserToFirebase(updatedPayer);
        if (updatedPayee) await FirebaseVault.syncUserToFirebase(updatedPayee);
      } catch (fbErr) {
        console.warn('⚠️ Non-blocking Firebase sync error:', fbErr.message);
      }

      results.push({
        id,
        status: 'SYNCED_SUCCESS',
        amount: txnAmount,
        payee_phone,
        message: `Offline transaction of ₹${txnAmount.toFixed(2)} reconciled and settled`
      });

      // Notify connected WebSockets if available
      if (req.app.locals.broadcastEvent) {
        req.app.locals.broadcastEvent({
          type: 'TRANSACTION_SETTLED',
          transaction: {
            id,
            payer_phone,
            payee_phone,
            amount: txnAmount,
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    res.json({
      success: true,
      results,
      syncedCount: results.filter(r => r.status === 'SYNCED_SUCCESS').length
    });
  } catch (err) {
    console.error('❌ Sync error:', err);
    res.status(500).json({ success: false, error: 'Sync processing failed: ' + err.message });
  }
});

/**
 * 2. TRANSACTION HISTORY
 * GET /api/transactions/history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;
    const history = await db.all(
      `SELECT * FROM transactions 
       WHERE payer_phone = ? OR payee_phone = ? 
       ORDER BY created_at DESC LIMIT 50`,
      [phone, phone]
    );

    res.json({
      success: true,
      transactions: history.map(t => ({
        ...t,
        type: t.payer_phone === phone ? 'SENT' : 'RECEIVED'
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. GET SINGLE RECEIPT DETAILS (WITH AUDIT TRAIL & DOUBLE-ENTRY LEDGER)
 * GET /api/transactions/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const txn = await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) {
      return res.status(404).json({ success: false, error: 'Transaction receipt not found' });
    }
    const ledger = await db.all('SELECT * FROM wallet_ledger_entries WHERE txn_id = ?', [txn.id]);
    const audit = await db.all('SELECT * FROM payment_audit_trail WHERE txn_id = ?', [txn.id]);

    res.json({
      success: true,
      transaction: txn,
      ledgerEntries: ledger,
      auditTrail: audit
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
