const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

/**
 * 1. GET WALLET BALANCE
 * GET /api/wallet/balance
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    res.json({
      success: true,
      onlineBalance: wallet.online_balance,
      offlineAllocatedBalance: wallet.offline_allocated_balance,
      totalBalance: wallet.online_balance + wallet.offline_allocated_balance,
      lastSyncCounter: wallet.last_sync_counter
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. TOP UP ONLINE WALLET
 * POST /api/wallet/topup
 */
router.post('/topup', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const topupAmount = parseFloat(amount);

    if (isNaN(topupAmount) || topupAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid top-up amount is required' });
    }

    await db.run(
      'UPDATE wallets SET online_balance = online_balance + ?, updated_at = datetime("now") WHERE user_id = ?',
      [topupAmount, req.user.id]
    );

    const updatedWallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);

    // Record audit log
    await db.run(
      'INSERT INTO audit_logs (action, phone, details) VALUES (?, ?, ?)',
      ['WALLET_TOPUP', req.user.phone, `Topped up online balance by ₹${topupAmount}`]
    );

    res.json({
      success: true,
      message: `Successfully topped up ₹${topupAmount.toFixed(2)} to online wallet`,
      wallet: {
        onlineBalance: updatedWallet.online_balance,
        offlineAllocatedBalance: updatedWallet.offline_allocated_balance,
        totalBalance: updatedWallet.online_balance + updatedWallet.offline_allocated_balance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. ALLOCATE BALANCE TO OFFLINE WALLET
 * Moves money from online balance to offline allocated balance for spending without internet
 * POST /api/wallet/allocate-offline
 */
router.post('/allocate-offline', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const allocateAmount = parseFloat(amount);

    if (isNaN(allocateAmount) || allocateAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    const wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
    if (!wallet || wallet.online_balance < allocateAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient online balance (Current: ₹${wallet ? wallet.online_balance.toFixed(2) : 0})`
      });
    }

    // Transfer from online to offline
    await db.run(
      `UPDATE wallets 
       SET online_balance = online_balance - ?, 
           offline_allocated_balance = offline_allocated_balance + ?,
           updated_at = datetime("now") 
       WHERE user_id = ?`,
      [allocateAmount, allocateAmount, req.user.id]
    );

    const updated = await db.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);

    res.json({
      success: true,
      message: `Allocated ₹${allocateAmount.toFixed(2)} to Offline Wallet! You can now spend this offline without internet.`,
      wallet: {
        onlineBalance: updated.online_balance,
        offlineAllocatedBalance: updated.offline_allocated_balance,
        totalBalance: updated.online_balance + updated.offline_allocated_balance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
