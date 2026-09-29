const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const NotificationService = require('../services/sms');

const JWT_SECRET = process.env.JWT_SECRET || 'offline-payment-super-secure-jwt-secret-key-2026';

// Middleware to authenticate JWT
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User session invalid' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
};

/**
 * 1. SEND REAL VERIFICATION CODE (OTP)
 * POST /api/auth/send-otp
 */
router.post('/send-otp', async (req, res) => {
  try {
    let { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Mobile phone number is required' });
    }

    // Clean phone number
    phone = phone.trim().replace(/\s+/g, '');

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Store in DB
    await db.run(
      `INSERT INTO otps (phone, otp_code, expires_at) VALUES (?, ?, ?)`,
      [phone, otpCode, expiresAt]
    );

    // Send real notification / SMS
    const dispatchResults = await NotificationService.sendVerificationSMS(phone, otpCode);

    res.json({
      success: true,
      message: `Verification code sent to ${phone}`,
      phone,
      expiresAt,
      delivery: dispatchResults,
      // Provide OTP in response for instant one-click testing or offline dev
      verificationCode: otpCode
    });
  } catch (err) {
    console.error('❌ Send OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to send verification code: ' + err.message });
  }
});

/**
 * 2. VERIFY OTP & LOGIN / REGISTER
 * POST /api/auth/verify-otp
 */
router.post('/verify-otp', async (req, res) => {
  try {
    let { phone, otpCode, name, role } = req.body;
    if (!phone || !otpCode) {
      return res.status(400).json({ success: false, error: 'Phone and OTP code are required' });
    }

    phone = phone.trim().replace(/\s+/g, '');
    otpCode = otpCode.trim();

    // Verify OTP from database
    const otpRecord = await db.get(
      `SELECT * FROM otps 
       WHERE phone = ? AND otp_code = ? AND used = 0 AND expires_at > datetime('now') 
       ORDER BY id DESC LIMIT 1`,
      [phone, otpCode]
    );

    // Allow default master test OTP '123456' for rapid developer/demo testing
    const isMasterOtp = otpCode === '123456';

    if (!otpRecord && !isMasterOtp) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
    }

    if (otpRecord) {
      await db.run('UPDATE otps SET used = 1 WHERE id = ?', [otpRecord.id]);
    }

    // Check if user already exists
    let user = await db.get('SELECT * FROM users WHERE phone = ?', [phone]);

    if (!user) {
      // Create new user
      const userName = (name && name.trim()) || `User-${phone.slice(-4)}`;
      const userRole = role || 'dual';
      const insertResult = await db.run(
        `INSERT INTO users (phone, name, role, status) VALUES (?, ?, ?, 'active')`,
        [phone, userName, userRole]
      );
      user = await db.get('SELECT * FROM users WHERE id = ?', [insertResult.lastID]);

      // Create initial wallet with ₹5,000 online and ₹2,000 offline allocated balance
      await db.run(
        `INSERT INTO wallets (user_id, online_balance, offline_allocated_balance) VALUES (?, 5000.00, 2000.00)`,
        [user.id]
      );
    } else if (name && name.trim() && user.name.startsWith('User-')) {
      // Update name if provided
      await db.run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), user.id]);
      user.name = name.trim();
    }

    // Fetch user wallet
    let wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);
    if (!wallet) {
      await db.run(
        `INSERT INTO wallets (user_id, online_balance, offline_allocated_balance) VALUES (?, 5000.00, 2000.00)`,
        [user.id]
      );
      wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);
    }

    // Generate JWT token (valid for 30 days)
    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Mobile number verified successfully!',
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        hasPin: !!user.pin_hash
      },
      wallet: {
        onlineBalance: wallet.online_balance,
        offlineAllocatedBalance: wallet.offline_allocated_balance,
        lastSyncCounter: wallet.last_sync_counter
      }
    });
  } catch (err) {
    console.error('❌ Verify OTP error:', err);
    res.status(500).json({ success: false, error: 'Verification error: ' + err.message });
  }
});

/**
 * 3. GET CURRENT PROFILE & WALLET STATUS
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const wallet = await db.get('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);
    res.json({
      success: true,
      user: {
        id: req.user.id,
        phone: req.user.phone,
        name: req.user.name,
        role: req.user.role,
        hasPin: !!req.user.pin_hash
      },
      wallet: {
        onlineBalance: wallet ? wallet.online_balance : 0,
        offlineAllocatedBalance: wallet ? wallet.offline_allocated_balance : 0,
        lastSyncCounter: wallet ? wallet.last_sync_counter : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. SET OR UPDATE 4-DIGIT SECURITY PIN
 * POST /api/auth/set-pin
 */
router.post('/set-pin', authenticateToken, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length < 4) {
      return res.status(400).json({ success: false, error: '4-digit security PIN is required' });
    }

    await db.run('UPDATE users SET pin_hash = ? WHERE id = ?', [pin, req.user.id]);
    res.json({ success: true, message: 'Security PIN updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = {
  router,
  authenticateToken
};
