const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

/**
 * 1. REGISTER OR UPDATE A DEVICE (Separate QR per Device)
 * POST /api/cloud/device/register
 */
router.post('/device/register', authenticateToken, async (req, res) => {
  try {
    const { deviceId, deviceName, platform, publicKey } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Device ID is required' });
    }

    const name = deviceName || 'Apple iPhone (iOS)';
    const plat = platform || 'Mobile PWA';

    // Check if device already registered
    const existing = await db.get(
      'SELECT id FROM devices WHERE user_id = ? AND device_id = ?',
      [req.user.id, deviceId]
    );

    if (existing) {
      await db.run(
        `UPDATE devices 
         SET device_name = ?, platform = ?, public_key = ?, last_active_at = datetime('now') 
         WHERE id = ?`,
        [name, plat, publicKey || '', existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO devices (user_id, device_id, device_name, platform, public_key, is_primary) 
         VALUES (?, ?, ?, ?, ?, 1)`,
        [req.user.id, deviceId, name, plat, publicKey || '']
      );
    }

    // Generate unique device-specific terminal QR token payload
    const deviceQrPayload = `PAYOFFLINE:DEV:${deviceId}:${req.user.phone}:${encodeURIComponent(req.user.name)}:${encodeURIComponent(name)}`;

    res.json({
      success: true,
      message: 'Device registered successfully to cloud registry',
      device: {
        deviceId,
        deviceName: name,
        platform: plat,
        terminalQrPayload: deviceQrPayload
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. LIST ALL REGISTERED DEVICES FOR THIS ACCOUNT
 * GET /api/cloud/devices
 */
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const devices = await db.all(
      'SELECT device_id, device_name, platform, last_active_at, created_at FROM devices WHERE user_id = ? ORDER BY last_active_at DESC',
      [req.user.id]
    );
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. GET OR SEED SAVED CONTACTS / BENEFICIARIES
 * GET /api/cloud/contacts
 */
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    let contacts = await db.all(
      'SELECT id, name, phone, avatar_color, favorite FROM contacts WHERE user_id = ? ORDER BY favorite DESC, name ASC',
      [req.user.id]
    );

    // If new user with no contacts, populate sample popular contacts for high-end FinTech feel
    if (contacts.length === 0) {
      const defaultContacts = [
        { name: 'Mom', phone: '+919811223344', color: '#ff2d55' },
        { name: 'Sharma Store', phone: '+919877001122', color: '#34c759' },
        { name: 'Alex Smith', phone: '+919822334455', color: '#007aff' },
        { name: 'Coffee Lab', phone: '+919833445566', color: '#ff9500' }
      ];

      for (const c of defaultContacts) {
        await db.run(
          'INSERT INTO contacts (user_id, name, phone, avatar_color, favorite) VALUES (?, ?, ?, ?, 1)',
          [req.user.id, c.name, c.phone, c.color]
        );
      }

      contacts = await db.all(
        'SELECT id, name, phone, avatar_color, favorite FROM contacts WHERE user_id = ?',
        [req.user.id]
      );
    }

    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. ADD NEW CONTACT
 * POST /api/cloud/contacts
 */
router.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, phone, avatarColor } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone required' });
    }

    const color = avatarColor || '#007aff';
    const result = await db.run(
      'INSERT INTO contacts (user_id, name, phone, avatar_color) VALUES (?, ?, ?, ?)',
      [req.user.id, name.trim(), phone.trim(), color]
    );

    res.json({
      success: true,
      contact: {
        id: result.lastID,
        name: name.trim(),
        phone: phone.trim(),
        avatar_color: color
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. CREATE CLOUD BACKUP SNAPSHOT
 * POST /api/cloud/backup
 */
router.post('/backup', authenticateToken, async (req, res) => {
  try {
    const { deviceId, backupData } = req.body;
    if (!backupData) {
      return res.status(400).json({ success: false, error: 'Backup data payload is required' });
    }

    const payloadString = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);

    await db.run(
      `INSERT INTO cloud_backups (user_id, device_id, backup_data) VALUES (?, ?, ?)`,
      [req.user.id, deviceId || 'unknown_device', payloadString]
    );

    // Record audit
    await db.run(
      `INSERT INTO audit_logs (action, phone, details) VALUES (?, ?, ?)`,
      ['CLOUD_BACKUP', req.user.phone, `Created cloud snapshot for device ${deviceId}`]
    );

    res.json({
      success: true,
      message: 'Cloud backup snapshot saved securely',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. RESTORE LATEST CLOUD BACKUP
 * GET /api/cloud/restore
 */
router.get('/restore', authenticateToken, async (req, res) => {
  try {
    const backup = await db.get(
      'SELECT backup_data, created_at FROM cloud_backups WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );

    if (!backup) {
      return res.status(404).json({ success: false, error: 'No cloud backups found for this account' });
    }

    let parsed = {};
    try {
      parsed = JSON.parse(backup.backup_data);
    } catch (e) {
      parsed = { raw: backup.backup_data };
    }

    res.json({
      success: true,
      backup: parsed,
      createdAt: backup.created_at
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
