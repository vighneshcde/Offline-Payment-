/**
 * Client-side Cryptographic Engine & Offline Local Ledger
 * Operates 100% offline using Web Crypto API and LocalStorage/IndexedDB
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
      DEVICE_KEY: 'payoffline_device_secret'
    };

    this.initDeviceSecret();
  }

  // Ensure a persistent device secret exists for offline HMAC/signatures
  initDeviceSecret() {
    let secret = localStorage.getItem(this.STORAGE_KEYS.DEVICE_KEY);
    if (!secret) {
      // Generate 256-bit random entropy hex string
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

  getUser() {
    const data = localStorage.getItem(this.STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  }

  setUser(user) {
    localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(user));
  }

  getAuthToken() {
    return localStorage.getItem(this.STORAGE_KEYS.TOKEN);
  }

  setAuthToken(token) {
    localStorage.setItem(this.STORAGE_KEYS.TOKEN, token);
  }

  getOfflineBalance() {
    const val = localStorage.getItem(this.STORAGE_KEYS.OFFLINE_BALANCE);
    return val !== null ? parseFloat(val) : 2000.00; // Default ₹2000 initial allocation
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
    // Prepend new transaction
    history.unshift(txn);
    this.saveLocalHistory(history.slice(0, 100)); // Keep latest 100
  }

  /**
   * Pure client-side cryptographic SHA-256 HMAC signature
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
   * CREATE AN OFFLINE SIGNED PAYMENT VOUCHER / TOKEN
   * Called when Payer scans a merchant QR code offline, or generates an Offline Pay QR
   */
  async createOfflinePaymentVoucher({ payeePhone, payeeName, amount, mode = 'OFFLINE_QR_SCAN' }) {
    const user = this.getUser();
    if (!user) {
      throw new Error('User not logged in');
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      throw new Error('Invalid payment amount');
    }

    const currentBalance = this.getOfflineBalance();
    if (currentBalance < payAmount) {
      throw new Error(`Insufficient offline balance! You have ₹${currentBalance.toFixed(2)}, need ₹${payAmount.toFixed(2)}.`);
    }

    const counter = this.incrementCounter();
    const nonce = Math.random().toString(36).substring(2, 10);
    const txnId = 'txn_off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const offlineTimestamp = new Date().toISOString();

    // Canonical string to sign
    const payload = `${txnId}|${user.phone}|${payeePhone}|${payAmount.toFixed(2)}|${counter}|${nonce}|${offlineTimestamp}`;
    const signature = await this.generateSignature(payload);

    const voucher = {
      id: txnId,
      payer_phone: user.phone,
      payer_name: user.name,
      payee_phone: payeePhone,
      payee_name: payeeName || 'Merchant',
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
    const newBalance = currentBalance - payAmount;
    this.setOfflineBalance(newBalance);

    // Queue in pending sync
    const pending = this.getPendingTransactions();
    pending.push(voucher);
    this.savePendingTransactions(pending);

    // Add to local history
    this.addLocalTransaction({
      ...voucher,
      type: 'SENT'
    });

    return voucher;
  }

  /**
   * PROCESS A SCANNED PAYMENT VOUCHER / TOKEN (Recipient / Merchant side offline)
   */
  async processIncomingOfflinePayment(voucher) {
    const user = this.getUser();
    if (!user) {
      throw new Error('Please login to accept payments');
    }

    // Basic structure validation
    if (!voucher.id || !voucher.payer_phone || !voucher.amount || !voucher.signature) {
      throw new Error('Invalid offline payment voucher format');
    }

    const history = this.getLocalHistory();
    const alreadyProcessed = history.some(t => t.id === voucher.id);
    if (alreadyProcessed) {
      throw new Error('This voucher has already been accepted! (Double-spend prevention)');
    }

    const payAmount = parseFloat(voucher.amount);

    // Credit recipient local offline balance
    const currentBalance = this.getOfflineBalance();
    this.setOfflineBalance(currentBalance + payAmount);

    const acceptedTxn = {
      ...voucher,
      type: 'RECEIVED',
      status: 'OFFLINE_PENDING',
      accepted_at: new Date().toISOString()
    };

    // Queue for sync so it gets credited to bank/central account when online
    const pending = this.getPendingTransactions();
    pending.push(acceptedTxn);
    this.savePendingTransactions(pending);

    // Add to history
    this.addLocalTransaction(acceptedTxn);

    return acceptedTxn;
  }

  /**
   * Mark synced transactions as completed
   */
  markSynced(syncedTxnIds) {
    let pending = this.getPendingTransactions();
    pending = pending.filter(t => !syncedTxnIds.includes(t.id));
    this.savePendingTransactions(pending);

    // Update history statuses
    const history = this.getLocalHistory().map(t => {
      if (syncedTxnIds.includes(t.id)) {
        return { ...t, status: 'COMPLETED' };
      }
      return t;
    });
    this.saveLocalHistory(history);
  }
}

// Global instance
window.walletEngine = new CryptoWallet();
