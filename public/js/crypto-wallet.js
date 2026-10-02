/**
 * Client-side Cryptographic Engine, Device Identity & Offline Local Ledger
 * Operates 100% offline using Web Crypto API and LocalStorage/IndexedDB
 * Includes multi-device separation, cloud snapshot backup, and contacts manager
 */
class CryptoWallet {
  constructor() {
    this.STORAGE_KEYS = {
      USER: 'payoffline_user',
      TOKEN: 'payoffline_token',
      OFFLINE_BALANCE: 'payoffline_offline_balance',
      COUNTER: 'payoffline_counter',
      PENDING_TXNS: 'payoffline_pending_txns',
      HISTORY: 'payoffline_history',
      DEVICE_KEY: 'payoffline_device_secret',
      DEVICE_ID: 'payoffline_device_id',
      DEVICE_NAME: 'payoffline_device_name',
      CONTACTS: 'payoffline_contacts',
      FACE_ID: 'payoffline_face_id',
      THEME: 'payoffline_theme',
      LAST_CLOUD_SYNC: 'payoffline_last_cloud_sync'
    };

    this.initDeviceSecret();
    this.initDeviceIdentity();
  }

  // Ensure persistent device secret exists for offline HMAC/signatures
  initDeviceSecret() {
    let secret = localStorage.getItem(this.STORAGE_KEYS.DEVICE_KEY);
    if (!secret) {
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      secret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(this.STORAGE_KEYS.DEVICE_KEY, secret);
    }
    return secret;
  }

  getDeviceSecret() {
    return localStorage.getItem(this.STORAGE_KEYS.DEVICE_KEY) || this.initDeviceSecret();
  }

  // Multi-Device Architecture: Each login device has its own distinct ID and Name
  initDeviceIdentity() {
    let deviceId = localStorage.getItem(this.STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const isApple = /iPhone|iPad|Macintosh/i.test(navigator.userAgent);
      const prefix = isApple ? 'DEV-IPHONE' : 'DEV-TERM';
      deviceId = `${prefix}-${rand}`;
      localStorage.setItem(this.STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    let deviceName = localStorage.getItem(this.STORAGE_KEYS.DEVICE_NAME);
    if (!deviceName) {
      if (/iPhone/i.test(navigator.userAgent)) {
        deviceName = 'Apple iPhone (iOS 18)';
      } else if (/iPad/i.test(navigator.userAgent)) {
        deviceName = 'Apple iPad Pro';
      } else if (/Macintosh/i.test(navigator.userAgent)) {
        deviceName = 'Apple Mac Terminal';
      } else if (/Android/i.test(navigator.userAgent)) {
        deviceName = 'Android Secure Terminal';
      } else {
        deviceName = 'FinTech Mobile POS';
      }
      localStorage.setItem(this.STORAGE_KEYS.DEVICE_NAME, deviceName);
    }

    return { deviceId, deviceName };
  }

  getDeviceId() {
    return localStorage.getItem(this.STORAGE_KEYS.DEVICE_ID) || this.initDeviceIdentity().deviceId;
  }

  getDeviceName() {
    return localStorage.getItem(this.STORAGE_KEYS.DEVICE_NAME) || this.initDeviceIdentity().deviceName;
  }

  setDeviceName(name) {
    localStorage.setItem(this.STORAGE_KEYS.DEVICE_NAME, name);
  }

  // User Profile
  getUser() {
    const data = localStorage.getItem(this.STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  }

  setUser(user) {
    if (!user) {
      localStorage.removeItem(this.STORAGE_KEYS.USER);
    } else {
      localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(user));
    }
  }

  getAuthToken() {
    return localStorage.getItem(this.STORAGE_KEYS.TOKEN);
  }

  setAuthToken(token) {
    if (!token) {
      localStorage.removeItem(this.STORAGE_KEYS.TOKEN);
    } else {
      localStorage.setItem(this.STORAGE_KEYS.TOKEN, token);
    }
  }

  // Offline Balances
  getOfflineBalance() {
    const val = localStorage.getItem(this.STORAGE_KEYS.OFFLINE_BALANCE);
    return val !== null ? parseFloat(val) : 2000.00;
  }

  setOfflineBalance(amount) {
    localStorage.setItem(this.STORAGE_KEYS.OFFLINE_BALANCE, parseFloat(amount).toFixed(2));
  }

  getCounter() {
    const val = localStorage.getItem(this.STORAGE_KEYS.COUNTER);
    return val !== null ? parseInt(val, 10) : 1;
  }

  incrementCounter() {
    const next = this.getCounter() + 1;
    localStorage.setItem(this.STORAGE_KEYS.COUNTER, next.toString());
    return next;
  }

  getPendingTransactions() {
    const data = localStorage.getItem(this.STORAGE_KEYS.PENDING_TXNS);
    return data ? JSON.parse(data) : [];
  }

  savePendingTransactions(txns) {
    localStorage.setItem(this.STORAGE_KEYS.PENDING_TXNS, JSON.stringify(txns));
  }

  getLocalHistory() {
    const data = localStorage.getItem(this.STORAGE_KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  }

  saveLocalHistory(history) {
    localStorage.setItem(this.STORAGE_KEYS.HISTORY, JSON.stringify(history));
  }

  addLocalTransaction(txn) {
    const history = this.getLocalHistory();
    history.unshift(txn);
    this.saveLocalHistory(history.slice(0, 100));
  }

  // Preferences & Biometrics (Face ID)
  isFaceIdEnabled() {
    const val = localStorage.getItem(this.STORAGE_KEYS.FACE_ID);
    return val !== 'false'; // Default true for iOS experience
  }

  setFaceIdEnabled(enabled) {
    localStorage.setItem(this.STORAGE_KEYS.FACE_ID, enabled ? 'true' : 'false');
  }

  getTheme() {
    return localStorage.getItem(this.STORAGE_KEYS.THEME) || 'dark';
  }

  setTheme(theme) {
    localStorage.setItem(this.STORAGE_KEYS.THEME, theme);
  }

  getLastCloudSync() {
    return localStorage.getItem(this.STORAGE_KEYS.LAST_CLOUD_SYNC) || null;
  }

  setLastCloudSync(isoStr) {
    localStorage.setItem(this.STORAGE_KEYS.LAST_CLOUD_SYNC, isoStr || new Date().toISOString());
  }

  // Contacts / Beneficiaries for Quick-Pay
  getContacts() {
    const data = localStorage.getItem(this.STORAGE_KEYS.CONTACTS);
    if (data) return JSON.parse(data);

    // Initial default contacts
    const defaults = [
      { id: 'c1', name: 'Mom', phone: '+919811223344', color: '#ff2d55', initials: 'M' },
      { id: 'c2', name: 'Sharma Store', phone: '+919877001122', color: '#34c759', initials: 'S' },
      { id: 'c3', name: 'Alex', phone: '+919822334455', color: '#007aff', initials: 'A' },
      { id: 'c4', name: 'Coffee Lab', phone: '+919833445566', color: '#ff9500', initials: 'C' },
      { id: 'c5', name: 'Landlord', phone: '+919844556677', color: '#af52de', initials: 'L' }
    ];
    this.saveContacts(defaults);
    return defaults;
  }

  saveContacts(contacts) {
    localStorage.setItem(this.STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
  }

  addContact(contact) {
    const contacts = this.getContacts();
    const initials = contact.name.trim().slice(0, 2).toUpperCase();
    const newContact = {
      id: 'c_' + Date.now(),
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      color: contact.color || '#007aff',
      initials: initials
    };
    contacts.push(newContact);
    this.saveContacts(contacts);
    return newContact;
  }

  /**
   * PURE CLIENT-SIDE CRYPTOGRAPHIC SIGNATURE
   */
  async generateSignature(payloadString) {
    try {
      const secret = this.getDeviceSecret();
      const enc = new TextEncoder();
      const keyData = enc.encode(secret);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign']
      );

      const signature = await window.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        enc.encode(payloadString)
      );

      const hashArray = Array.from(new Uint8Array(signature));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return 'hmac:' + hex;
    } catch (err) {
      console.warn('Fallback basic signature generator:', err);
      return 'hmac:fallback_' + btoa(payloadString).slice(0, 32);
    }
  }

  /**
   * CREATE AN OFFLINE SIGNED PAYMENT VOUCHER
   */
  async createOfflinePaymentVoucher({ payeePhone, payeeName, amount, mode = 'OFFLINE_QR_SCAN', targetDeviceId = '' }) {
    const user = this.getUser();
    if (!user) throw new Error('User not logged in');

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) throw new Error('Invalid payment amount');

    const currentBalance = this.getOfflineBalance();
    if (currentBalance < payAmount) {
      throw new Error(`Insufficient offline cash! Available: ₹${currentBalance.toFixed(2)}, Needed: ₹${payAmount.toFixed(2)}.`);
    }

    const deviceId = this.getDeviceId();
    const counter = this.incrementCounter();
    const nonce = Math.random().toString(36).substring(2, 10);
    const txnId = 'txn_off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const offlineTimestamp = new Date().toISOString();

    const payload = `${txnId}|${user.phone}|${payeePhone}|${payAmount.toFixed(2)}|${counter}|${nonce}|${offlineTimestamp}|${deviceId}`;
    const signature = await this.generateSignature(payload);

    const voucher = {
      id: txnId,
      payer_phone: user.phone,
      payer_name: user.name,
      payer_device_id: deviceId,
      payee_phone: payeePhone,
      payee_name: payeeName || 'Merchant',
      payee_device_id: targetDeviceId,
      amount: payAmount,
      mode: mode,
      counter: counter,
      nonce: nonce,
      offline_timestamp: offlineTimestamp,
      signature: signature,
      status: 'OFFLINE_PENDING',
      created_at: offlineTimestamp
    };

    // Deduct offline balance immediately
    this.setOfflineBalance(currentBalance - payAmount);

    // Queue in pending sync
    const pending = this.getPendingTransactions();
    pending.push(voucher);
    this.savePendingTransactions(pending);

    // Add to local history
    this.addLocalTransaction({ ...voucher, type: 'SENT' });

    return voucher;
  }

  /**
   * PROCESS A SCANNED PAYMENT VOUCHER (RECIPIENT SIDE)
   */
  async processIncomingOfflinePayment(voucher) {
    const user = this.getUser();
    if (!user) throw new Error('Please login to accept payments');

    if (!voucher.id || !voucher.payer_phone || !voucher.amount || !voucher.signature) {
      throw new Error('Invalid offline payment voucher format');
    }

    const history = this.getLocalHistory();
    if (history.some(t => t.id === voucher.id)) {
      throw new Error('This voucher has already been accepted! (Double-spend prevention)');
    }

    const payAmount = parseFloat(voucher.amount);
    const currentBalance = this.getOfflineBalance();
    this.setOfflineBalance(currentBalance + payAmount);

    const acceptedTxn = {
      ...voucher,
      type: 'RECEIVED',
      status: 'OFFLINE_PENDING',
      accepted_at: new Date().toISOString(),
      accepted_by_device: this.getDeviceId()
    };

    const pending = this.getPendingTransactions();
    pending.push(acceptedTxn);
    this.savePendingTransactions(pending);

    this.addLocalTransaction(acceptedTxn);
    return acceptedTxn;
  }

  markSynced(syncedTxnIds) {
    let pending = this.getPendingTransactions();
    pending = pending.filter(t => !syncedTxnIds.includes(t.id));
    this.savePendingTransactions(pending);

    const history = this.getLocalHistory().map(t => {
      if (syncedTxnIds.includes(t.id)) {
        return { ...t, status: 'COMPLETED' };
      }
      return t;
    });
    this.saveLocalHistory(history);
  }

  /**
   * GENERATE DEDICATED SEPARATE DEVICE QR CODE PAYLOAD
   * Format: PAYOFFLINE:DEV:<deviceId>:<phone>:<name>:<amount>
   */
  getDeviceTerminalQrPayload(amount = '') {
    const user = this.getUser();
    if (!user) return '';
    const deviceId = this.getDeviceId();
    const deviceName = this.getDeviceName();
    return `PAYOFFLINE:DEV:${deviceId}:${user.phone}:${encodeURIComponent(user.name)}:${amount}:${encodeURIComponent(deviceName)}`;
  }

  /**
   * CLOUD BACKUP SNAPSHOT GENERATOR
   */
  createCloudBackupSnapshot() {
    return {
      version: 2,
      timestamp: new Date().toISOString(),
      user: this.getUser(),
      deviceId: this.getDeviceId(),
      deviceName: this.getDeviceName(),
      offlineBalance: this.getOfflineBalance(),
      counter: this.getCounter(),
      history: this.getLocalHistory(),
      contacts: this.getContacts()
    };
  }

  /**
   * RESTORE FROM CLOUD SNAPSHOT
   */
  restoreFromCloudSnapshot(snapshot) {
    if (!snapshot || !snapshot.user) throw new Error('Invalid cloud snapshot file');
    this.setUser(snapshot.user);
    if (snapshot.offlineBalance !== undefined) this.setOfflineBalance(snapshot.offlineBalance);
    if (snapshot.counter !== undefined) localStorage.setItem(this.STORAGE_KEYS.COUNTER, snapshot.counter.toString());
    if (Array.isArray(snapshot.history)) this.saveLocalHistory(snapshot.history);
    if (Array.isArray(snapshot.contacts)) this.saveContacts(snapshot.contacts);
    this.setLastCloudSync(new Date().toISOString());
    return true;
  }
}

// Global instance
window.walletEngine = new CryptoWallet();
