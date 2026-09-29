const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');
const CryptoEngine = require('../services/crypto');

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

      // 4. Update balances: credit Payee online balance
      await db.run(
        'UPDATE wallets SET online_balance = online_balance + ?, updated_at = datetime("now") WHERE user_id = ?',
        [txnAmount, payee.id]
      );

      // Update Payer offline allocation counter
      const payerUser = check.user;
      await db.run(
        `UPDATE wallets 
         SET offline_allocated_balance = MAX(0, offline_allocated_balance - ?),
             last_sync_counter = MAX(last_sync_counter, ?),
             updated_at = datetime("now") 
         WHERE user_id = ?`,
        [txnAmount, counter || 0, payerUser.id]
      );

      // 5. Store completed transaction in central ledger
      await db.run(
        `INSERT INTO transactions (
          id, payer_phone, payer_name, payee_phone, payee_name, 
          amount, mode, counter, nonce, signature, status, offline_timestamp, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, datetime('now'))`,
        [
          id,
          payer_phone,
          payer_name || 'Anonymous Payer',
          payee_phone,
          payee_name || payee.name,
          txnAmount,
          mode || 'OFFLINE_QR_SCAN',
          counter || 0,
          nonce || '',
          signature || '',
          offline_timestamp || new Date().toISOString()
        ]
      );

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
 * 3. GET SINGLE RECEIPT DETAILS
 * GET /api/transactions/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const txn = await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) {
      return res.status(404).json({ success: false, error: 'Transaction receipt not found' });
    }
    res.json({ success: true, transaction: txn });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
