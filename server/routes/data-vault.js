const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

/**
 * PAYOFFLINE DATA VAULT & CENTRAL AUDIT LEDGER
 * Provides full transparency and permanent data storage access
 * for all payments, double-entry ledgers, and user records.
 */

/**
 * 1. SYSTEM OVERVIEW & METRICS
 * GET /api/data-vault/overview
 */
router.get('/overview', async (req, res) => {
  try {
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const txnCount = await db.get('SELECT COUNT(*) as count FROM transactions');
    const volumeSum = await db.get('SELECT SUM(amount) as total FROM transactions WHERE status = "COMPLETED"');
    const ledgerCount = await db.get('SELECT COUNT(*) as count FROM wallet_ledger_entries');
    const deviceCount = await db.get('SELECT COUNT(*) as count FROM devices');
    const backupCount = await db.get('SELECT COUNT(*) as count FROM cloud_backups');
    const loginCount = await db.get('SELECT COUNT(*) as count FROM user_login_history');

    const recentTxns = await db.all(
      `SELECT id, payer_phone, payer_name, payee_phone, payee_name, amount, mode, status, created_at 
       FROM transactions ORDER BY created_at DESC LIMIT 6`
    );

    const recentAudit = await db.all(
      `SELECT * FROM payment_audit_trail ORDER BY created_at DESC LIMIT 6`
    );

    res.json({
      success: true,
      stats: {
        totalUsers: userCount ? userCount.count : 0,
        totalTransactions: txnCount ? txnCount.count : 0,
        totalVolumeSettled: volumeSum && volumeSum.total ? parseFloat(volumeSum.total) : 0,
        totalLedgerEntries: ledgerCount ? ledgerCount.count : 0,
        totalRegisteredDevices: deviceCount ? deviceCount.count : 0,
        totalCloudBackups: backupCount ? backupCount.count : 0,
        totalLoginSessions: loginCount ? loginCount.count : 0
      },
      recentTransactions: recentTxns,
      recentAuditTrail: recentAudit
    });
  } catch (err) {
    console.error('❌ Data Vault overview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. ALL USERS AUDIT & LIFETIME METRICS
 * GET /api/data-vault/users
 */
router.get('/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.id, u.phone, u.name, u.role, u.status, u.created_at, u.last_login_at,
        u.total_spent, u.total_received, u.txn_count,
        w.online_balance, w.offline_allocated_balance, w.last_sync_counter,
        (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) as device_count,
        (SELECT COUNT(*) FROM user_login_history l WHERE l.user_id = u.id) as login_count
      FROM users u
      LEFT JOIN wallets w ON u.id = w.user_id
      ORDER BY u.created_at DESC
    `);

    res.json({
      success: true,
      count: users.length,
      users: users.map(u => ({
        ...u,
        total_spent: parseFloat(u.total_spent || 0),
        total_received: parseFloat(u.total_received || 0),
        online_balance: parseFloat(u.online_balance || 0),
        offline_allocated_balance: parseFloat(u.offline_allocated_balance || 0),
        total_balance: parseFloat(u.online_balance || 0) + parseFloat(u.offline_allocated_balance || 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. SINGLE USER COMPLETE AUDIT PROFILE
 * GET /api/data-vault/user/:id
 */
router.get('/user/:id', async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, phone, name, role, status, created_at, last_login_at, total_spent, total_received, txn_count 
       FROM users WHERE id = ? OR phone = ?`,
      [req.params.id, req.params.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User record not found' });
    }

    const wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);
    const devices = await db.all('SELECT * FROM devices WHERE user_id = ? ORDER BY last_active_at DESC', [user.id]);
    const logins = await db.all('SELECT * FROM user_login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [user.id]);
    const ledger = await db.all('SELECT * FROM wallet_ledger_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user.id]);
    const txns = await db.all(
      `SELECT * FROM transactions WHERE payer_phone = ? OR payee_phone = ? ORDER BY created_at DESC LIMIT 50`,
      [user.phone, user.phone]
    );

    res.json({
      success: true,
      user,
      wallet: wallet || { online_balance: 0, offline_allocated_balance: 0 },
      devices,
      recentLogins: logins,
      ledgerEntries: ledger,
      transactions: txns
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. ALL PAYMENTS WITH AUDIT TRAIL & DOUBLE-ENTRY LEDGER ROWS
 * GET /api/data-vault/payments
 */
router.get('/payments', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = (page - 1) * limit;

    const payments = await db.all(
      `SELECT * FROM transactions ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const totalCount = await db.get('SELECT COUNT(*) as count FROM transactions');

    // Attach ledger entries and audit events for each transaction
    const enrichedPayments = await Promise.all(payments.map(async (txn) => {
      const ledgerEntries = await db.all(
        'SELECT * FROM wallet_ledger_entries WHERE txn_id = ?',
        [txn.id]
      );
      const auditTrail = await db.all(
        'SELECT * FROM payment_audit_trail WHERE txn_id = ?',
        [txn.id]
      );
      return {
        ...txn,
        ledgerEntries,
        auditTrail
      };
    }));

    res.json({
      success: true,
      total: totalCount ? totalCount.count : 0,
      page,
      limit,
      payments: enrichedPayments
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. DOUBLE-ENTRY GENERAL LEDGER RECORDS
 * GET /api/data-vault/ledger
 */
router.get('/ledger', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const entries = await db.all(`
      SELECT 
        l.id, l.txn_id, l.user_id, l.entry_type, l.amount, l.pocket,
        l.balance_before, l.balance_after, l.description, l.created_at,
        u.phone as user_phone, u.name as user_name
      FROM wallet_ledger_entries l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      count: entries.length,
      ledger: entries
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. USER LOGIN & SESSION HISTORY
 * GET /api/data-vault/logins
 */
router.get('/logins', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logins = await db.all(`
      SELECT l.*, u.name as user_name 
      FROM user_login_history l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      count: logins.length,
      logins
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. COMPLETE DATABASE AUDIT EXPORT (JSON DOWNLOAD)
 * GET /api/data-vault/export
 */
router.get('/export', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, phone, name, role, status, total_spent, total_received, txn_count, last_login_at, created_at 
      FROM users ORDER BY id ASC
    `);

    const wallets = await db.all('SELECT * FROM wallets ORDER BY id ASC');
    const transactions = await db.all('SELECT * FROM transactions ORDER BY created_at ASC');
    const ledger = await db.all('SELECT * FROM wallet_ledger_entries ORDER BY id ASC');
    const auditTrail = await db.all('SELECT * FROM payment_audit_trail ORDER BY id ASC');
    const devices = await db.all('SELECT * FROM devices ORDER BY id ASC');
    const logins = await db.all('SELECT * FROM user_login_history ORDER BY id ASC');
    const auditLogs = await db.all('SELECT * FROM audit_logs ORDER BY id ASC LIMIT 500');

    const exportPayload = {
      exportMetadata: {
        system: 'PayOffline Secure Financial Core',
        version: '2.0.0-PROD',
        exportTimestamp: new Date().toISOString(),
        environment: 'SQLite Production Vault',
        summary: {
          userCount: users.length,
          walletCount: wallets.length,
          transactionCount: transactions.length,
          ledgerEntryCount: ledger.length,
          auditEventCount: auditTrail.length,
          registeredDevicesCount: devices.length,
          loginHistoryCount: logins.length
        }
      },
      users,
      wallets,
      transactions,
      doubleEntryLedger: ledger,
      paymentAuditTrail: auditTrail,
      devices,
      userLoginHistory: logins,
      auditLogs
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="payoffline-audit-vault-${Date.now()}.json"`);
    res.send(JSON.stringify(exportPayload, null, 2));
  } catch (err) {
    console.error('❌ Export audit error:', err);
    res.status(500).json({ success: false, error: 'Export failed: ' + err.message });
  }
});

module.exports = router;
