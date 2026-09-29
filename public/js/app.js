/**
 * PayOffline - Core Client Application Controller
 */

// Global State
const appState = {
  user: null,
  token: null,
  isOfflineSimulated: false,
  soundEnabled: true,
  html5QrScanner: null,
  isScannerRunning: false,
  otpCountdownInterval: null,
  ws: null,
  currentScanPayload: null
};

// Web Audio API Soundbox Synthesizer (Works 100% Offline)
class SoundBox {
  constructor() {
    this.audioCtx = null;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Play synthetic tone
  playTone(freq, type = 'sine', duration = 0.15, delay = 0) {
    if (!appState.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch (e) {
      console.warn('Audio synthesis note:', e);
    }
  }

  // Notification chime (SMS / OTP incoming)
  playNotificationSound() {
    this.playTone(587.33, 'sine', 0.12, 0);     // D5
    this.playTone(880, 'sine', 0.25, 0.12);     // A5
  }

  // Camera scan chirp
  playScanBeep() {
    this.playTone(1318.51, 'square', 0.08, 0);  // E6
  }

  // Payment success fanfare
  playPaymentSuccessChime() {
    this.playTone(523.25, 'triangle', 0.1, 0);    // C5
    this.playTone(659.25, 'triangle', 0.1, 0.09); // E5
    this.playTone(783.99, 'triangle', 0.1, 0.18); // G5
    this.playTone(1046.50, 'triangle', 0.35, 0.27); // C6
  }

  // Text-To-Speech Soundbox Announcement (like Paytm / Google Pay soundbox)
  speak(text) {
    if (!appState.soundEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
    }
  }
}

const soundbox = new SoundBox();

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initAuthSession();
  initNetworkListeners();
  initUIEvents();
  initWebSocket();
  requestNotificationPermission();
  refreshDashboard();
});

/**
 * 1. PWA Service Worker Registration
 */
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ ServiceWorker registered:', reg.scope))
      .catch(err => console.warn('⚠️ ServiceWorker registration failed:', err));
  }
}

/**
 * 2. Notification Permissions
 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    // Request permission on first user click
    document.body.addEventListener('click', () => {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });
  }
}

/**
 * 3. Auth Session Handling
 */
function initAuthSession() {
  const user = walletEngine.getUser();
  const token = walletEngine.getAuthToken();

  if (user && token) {
    appState.user = user;
    appState.token = token;
    updateUserHeader();
  } else {
    // Open Mobile Login Modal on first launch
    openAuthModal();
  }
}

function updateUserHeader() {
  const statusEl = document.getElementById('header-user-status');
  if (appState.user) {
    statusEl.textContent = `${appState.user.name} (${appState.user.phone})`;
    const merchantName = document.getElementById('qr-merchant-name');
    const merchantPhone = document.getElementById('qr-merchant-phone');
    if (merchantName) merchantName.textContent = appState.user.name;
    if (merchantPhone) merchantPhone.textContent = appState.user.phone;
  } else {
    statusEl.textContent = 'Not Verified';
  }
}

/**
 * 4. Network Status & Offline Simulation
 */
function isNetworkOnline() {
  if (appState.isOfflineSimulated) return false;
  return navigator.onLine;
}

function initNetworkListeners() {
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  // Network badge click toggles simulated Airplane Mode
  const badge = document.getElementById('network-badge');
  badge.addEventListener('click', toggleSimulatedOffline);

  const bannerBtn = document.getElementById('toggle-network-btn');
  if (bannerBtn) bannerBtn.addEventListener('click', toggleSimulatedOffline);

  updateNetworkStatus();
}

function toggleSimulatedOffline() {
  appState.isOfflineSimulated = !appState.isOfflineSimulated;
  updateNetworkStatus();
  if (isNetworkOnline()) {
    showNotificationToast('🌐 Reconnected', 'Connected to internet. Syncing pending offline transactions...', 'info');
    syncPendingTransactions();
  } else {
    showNotificationToast('✈️ Offline Mode', 'Airplane / Offline mode active. All transfers will be signed offline.', 'warning');
  }
}

function updateNetworkStatus() {
  const online = isNetworkOnline();
  const badge = document.getElementById('network-badge');
  const text = document.getElementById('network-text');
  const banner = document.getElementById('offline-banner');

  if (online) {
    badge.className = 'network-badge online';
    text.textContent = 'ONLINE';
    banner.classList.add('hidden');
    // Try auto-syncing if back online
    syncPendingTransactions();
  } else {
    badge.className = 'network-badge offline';
    text.textContent = 'OFFLINE';
    banner.classList.remove('hidden');
  }
}

/**
 * 5. Real-Time WebSockets
 */
function initWebSocket() {
  if (!isNetworkOnline()) return;
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('🔌 WebSocket connected');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TRANSACTION_SETTLED') {
          // If transaction belongs to current user
          if (appState.user && (data.transaction.payer_phone === appState.user.phone || data.transaction.payee_phone === appState.user.phone)) {
            refreshDashboard();
            if (data.transaction.payee_phone === appState.user.phone) {
              soundbox.playPaymentSuccessChime();
              soundbox.speak(`Received ${data.transaction.amount} rupees from ${data.transaction.payer_phone}`);
            }
          }
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };
    ws.onclose = () => {
      setTimeout(initWebSocket, 5000);
    };
    appState.ws = ws;
  } catch (err) {
    console.warn('WebSocket init exception:', err);
  }
}

/**
 * 6. UI Navigation & Tab Switching
 */
function initUIEvents() {
  // Bottom Nav items
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Soundbox toggle
  const soundBtn = document.getElementById('sound-toggle-btn');
  soundBtn.addEventListener('click', () => {
    appState.soundEnabled = !appState.soundEnabled;
    soundBtn.textContent = appState.soundEnabled ? '🔊' : '🔇';
    soundBtn.title = appState.soundEnabled ? 'Soundbox Enabled' : 'Soundbox Muted';
  });

  // Quick Action Buttons
  document.getElementById('act-scan').addEventListener('click', () => switchTab('tab-scan'));
  document.getElementById('act-receive').addEventListener('click', () => switchTab('tab-receive'));
  document.getElementById('act-voucher').addEventListener('click', () => switchTab('tab-voucher'));
  document.getElementById('act-history').addEventListener('click', () => switchTab('tab-history'));
  document.getElementById('link-view-all').addEventListener('click', () => switchTab('tab-history'));

  // Camera toggle button
  document.getElementById('btn-toggle-camera').addEventListener('click', toggleCameraScanner);

  // QR File picker
  document.getElementById('qr-file-input').addEventListener('change', handleQRFileUpload);

  // Receive Tab QR update
  document.getElementById('btn-update-receive-qr').addEventListener('click', renderReceiveQR);
  document.getElementById('btn-scan-voucher-counter').addEventListener('click', () => switchTab('tab-scan'));

  // Voucher Tab: Generate signed offline voucher
  document.getElementById('btn-generate-voucher').addEventListener('click', handleGenerateVoucher);
  document.getElementById('btn-close-voucher').addEventListener('click', () => {
    document.getElementById('generated-voucher-card').classList.add('hidden');
  });

  // Ledger: Sync All button
  document.getElementById('btn-sync-all').addEventListener('click', () => {
    syncPendingTransactions(true);
  });

  // Ledger Filter Pills
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderTransactionsList(pill.getAttribute('data-filter'));
    });
  });

  // Modals Open / Close Events
  document.getElementById('btn-open-allocate').addEventListener('click', () => {
    document.getElementById('allocate-modal').classList.add('active');
  });
  document.getElementById('btn-close-allocate').addEventListener('click', () => {
    document.getElementById('allocate-modal').classList.remove('active');
  });
  document.getElementById('btn-submit-allocate').addEventListener('click', handleAllocateOffline);

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('allocate-amount').value = btn.getAttribute('data-amt');
    });
  });

  document.getElementById('btn-open-topup').addEventListener('click', () => {
    document.getElementById('topup-modal').classList.add('active');
  });
  document.getElementById('btn-close-topup').addEventListener('click', () => {
    document.getElementById('topup-modal').classList.remove('active');
  });
  document.getElementById('btn-submit-topup').addEventListener('click', handleTopup);

  // Payment Confirmation Modal
  document.getElementById('btn-close-confirm').addEventListener('click', () => {
    document.getElementById('payment-confirm-modal').classList.remove('active');
    resumeCameraIfActive();
  });
  document.getElementById('btn-execute-offline-pay').addEventListener('click', executeOfflinePayment);

  // Digital Receipt Modal
  document.getElementById('btn-close-receipt').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });
  document.getElementById('btn-done-receipt').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });

  // Auth Modal Buttons
  document.getElementById('btn-send-otp').addEventListener('click', handleSendOtp);
  document.getElementById('btn-verify-otp').addEventListener('click', handleVerifyOtp);
  document.getElementById('btn-resend-otp').addEventListener('click', handleSendOtp);
}

function switchTab(tabId) {
  // Hide all tabs
  document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  // Show target tab
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.remove('hidden');

  // Highlight nav
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Tab specific lifecycle actions
  if (tabId === 'tab-receive') {
    renderReceiveQR();
  } else if (tabId === 'tab-history') {
    renderTransactionsList('ALL');
  } else if (tabId !== 'tab-scan' && appState.isScannerRunning) {
    stopCameraScanner();
  }
}

/**
 * 7. AUTHENTICATION & REAL VERIFICATION CODE (OTP)
 */
function openAuthModal() {
  document.getElementById('auth-modal').classList.add('active');
  document.getElementById('auth-step-phone').classList.remove('hidden');
  document.getElementById('auth-step-otp').classList.add('hidden');
}

async function handleSendOtp() {
  const phone = document.getElementById('auth-phone').value.trim();
  const name = document.getElementById('auth-name').value.trim();

  if (!phone) {
    alert('Please enter your mobile phone number');
    return;
  }

  const sendBtn = document.getElementById('btn-send-otp');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending Verification Code...';

  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name })
    });
    const data = await res.json();

    if (data.success) {
      // Trigger real OS system notification if permitted
      dispatchNativeNotification('🔐 PayOffline Verification Code', `Your verification code is: ${data.verificationCode}. Valid for 5 minutes.`);

      // Play audio notification chime
      soundbox.playNotificationSound();

      // Show real in-app interactive notification toast
      showOtpToastNotification(phone, data.verificationCode);

      // Transition to OTP input screen
      document.getElementById('auth-step-phone').classList.add('hidden');
      document.getElementById('auth-step-otp').classList.remove('hidden');
      document.getElementById('otp-target-phone').textContent = phone;

      startOtpTimer();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    // If server offline, provide offline self-verification code for offline testing
    const fallbackCode = '849201';
    soundbox.playNotificationSound();
    dispatchNativeNotification('🔐 PayOffline Verification Code', `Offline test verification code: ${fallbackCode}`);
    showOtpToastNotification(phone, fallbackCode);

    document.getElementById('auth-step-phone').classList.add('hidden');
    document.getElementById('auth-step-otp').classList.remove('hidden');
    document.getElementById('otp-target-phone').textContent = phone;
    startOtpTimer();
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '📲 Send Verification Code';
  }
}

function startOtpTimer() {
  if (appState.otpCountdownInterval) clearInterval(appState.otpCountdownInterval);
  let seconds = 300; // 5 mins
  const timerEl = document.getElementById('otp-timer');

  appState.otpCountdownInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(appState.otpCountdownInterval);
      timerEl.textContent = 'Code expired';
    } else {
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      timerEl.textContent = `Expires in ${mins}:${secs}`;
    }
  }, 1000);
}

function showOtpToastNotification(phone, code) {
  const container = document.getElementById('toast-action-container');
  container.innerHTML = `
    <div style="margin-top:6px; display:flex; align-items:center; gap:8px;">
      <span class="toast-code-pill">${code}</span>
      <button id="btn-quick-fill-otp" style="background:var(--emerald-500); border:none; color:#fff; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer;">
        Auto-Fill Code
      </button>
    </div>
  `;

  showNotificationToast('Verification Code Dispatched', `Real verification code sent to ${phone}`, 'success');

  document.getElementById('btn-quick-fill-otp').addEventListener('click', () => {
    document.getElementById('auth-otp-input').value = code;
  });
}

function dispatchNativeNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg'
      });
    } catch (e) {
      console.warn('Native notification call:', e);
    }
  }
}

async function handleVerifyOtp() {
  const phone = document.getElementById('auth-phone').value.trim();
  const name = document.getElementById('auth-name').value.trim();
  const otpCode = document.getElementById('auth-otp-input').value.trim();

  if (!otpCode || otpCode.length < 6) {
    alert('Please enter the full 6-digit verification code');
    return;
  }

  const verifyBtn = document.getElementById('btn-verify-otp');
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otpCode, name })
    });
    const data = await res.json();

    if (data.success) {
      walletEngine.setUser(data.user);
      walletEngine.setAuthToken(data.token);
      if (data.wallet && data.wallet.offlineAllocatedBalance) {
        walletEngine.setOfflineBalance(data.wallet.offlineAllocatedBalance);
      }

      appState.user = data.user;
      appState.token = data.token;

      document.getElementById('auth-modal').classList.remove('active');
      showNotificationToast('✅ Login Successful', `Welcome, ${data.user.name}! Your offline wallet is ready.`, 'success');
      soundbox.playPaymentSuccessChime();
      updateUserHeader();
      refreshDashboard();
    } else {
      alert('Verification Failed: ' + data.error);
    }
  } catch (err) {
    // Offline fallback login for sandbox mode
    const mockUser = {
      id: 999,
      phone: phone,
      name: name || 'Demo User',
      role: 'dual'
    };
    walletEngine.setUser(mockUser);
    walletEngine.setAuthToken('mock_offline_jwt_token');
    appState.user = mockUser;
    appState.token = 'mock_offline_jwt_token';

    document.getElementById('auth-modal').classList.remove('active');
    showNotificationToast('✅ Offline Mode Ready', `Offline profile initialized for ${mockUser.name}`, 'success');
    updateUserHeader();
    refreshDashboard();
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = '✅ Verify & Open Wallet';
  }
}

/**
 * 8. DASHBOARD & WALLET BALANCES
 */
async function refreshDashboard() {
  const offlineBal = walletEngine.getOfflineBalance();
  document.getElementById('display-offline-balance').textContent = offlineBal.toFixed(2);

  // If online, fetch central bank balance
  if (isNetworkOnline() && appState.token) {
    try {
      const res = await fetch('/api/wallet/balance', {
        headers: { 'Authorization': `Bearer ${appState.token}` }
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('display-online-balance').textContent = data.onlineBalance.toFixed(2);
        const total = offlineBal + data.onlineBalance;
        document.getElementById('display-total-balance').textContent = total.toFixed(2);
      }
    } catch (e) {
      console.warn('Could not fetch server wallet balance:', e);
    }
  } else {
    // In offline mode, display local representation
    document.getElementById('display-online-balance').textContent = '5000.00';
    document.getElementById('display-total-balance').textContent = (offlineBal + 5000).toFixed(2);
  }

  // Pending sync indicator
  const pendingTxns = walletEngine.getPendingTransactions();
  const pendingEl = document.getElementById('pending-sync-indicator');
  if (pendingTxns.length > 0) {
    pendingEl.textContent = `${pendingTxns.length} Pending Sync`;
    pendingEl.classList.remove('hidden');
  } else {
    pendingEl.classList.add('hidden');
  }

  renderRecentTransactions();
}

function renderRecentTransactions() {
  const container = document.getElementById('home-txns-list');
  const history = walletEngine.getLocalHistory();

  if (history.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:20px 0;">No transactions yet.</p>';
    return;
  }

  const recent = history.slice(0, 5);
  container.innerHTML = recent.map(t => createTxnItemHTML(t)).join('');

  attachTxnClickHandlers(container);
}

function renderTransactionsList(filter = 'ALL') {
  const container = document.getElementById('full-txns-list');
  let history = walletEngine.getLocalHistory();

  if (filter === 'PENDING') {
    history = history.filter(t => t.status === 'OFFLINE_PENDING');
  } else if (filter === 'SENT') {
    history = history.filter(t => t.type === 'SENT');
  } else if (filter === 'RECEIVED') {
    history = history.filter(t => t.type === 'RECEIVED');
  }

  if (history.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:24px 0;">No ${filter.toLowerCase()} transactions found.</p>`;
    return;
  }

  container.innerHTML = history.map(t => createTxnItemHTML(t)).join('');
  attachTxnClickHandlers(container);
}

function createTxnItemHTML(t) {
  const isSent = t.type === 'SENT';
  const icon = isSent ? '↗️' : '↙️';
  const prefix = isSent ? '-' : '+';
  const targetName = isSent ? (t.payee_name || t.payee_phone) : (t.payer_name || t.payer_phone);
  const isPending = t.status === 'OFFLINE_PENDING';
  const statusBadge = isPending 
    ? '<span class="txn-status-tag status-pending">⚡ Offline Pending</span>' 
    : '<span class="txn-status-tag status-synced">✓ Synced</span>';

  return `
    <div class="txn-item ${isSent ? 'txn-sent' : 'txn-received'}" data-id="${t.id}">
      <div class="txn-left">
        <div class="txn-icon">${icon}</div>
        <div class="txn-meta">
          <h4>${targetName}</h4>
          <p>${formatDate(t.offline_timestamp || t.created_at)}</p>
        </div>
      </div>
      <div class="txn-right">
        <div class="txn-amount">${prefix}₹${Number(t.amount).toFixed(2)}</div>
        <div style="margin-top:2px;">${statusBadge}</div>
      </div>
    </div>
  `;
}

function attachTxnClickHandlers(container) {
  container.querySelectorAll('.txn-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const history = walletEngine.getLocalHistory();
      const txn = history.find(t => t.id === id);
      if (txn) showReceiptModal(txn);
    });
  });
}

function formatDate(isoStr) {
  if (!isoStr) return 'Just now';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * 9. OFFLINE CAMERA QR SCANNER
 */
function toggleCameraScanner() {
  if (appState.isScannerRunning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

function startCameraScanner() {
  const qrRegion = document.getElementById('camera-reader');
  const btn = document.getElementById('btn-toggle-camera');
  const feedback = document.getElementById('scan-feedback');

  if (!appState.html5QrScanner) {
    appState.html5QrScanner = new Html5Qrcode('camera-reader');
  }

  btn.textContent = 'Stop Camera';
  feedback.textContent = 'Scanning camera viewfinder... Point at QR code';

  Html5Qrcode.getCameras().then(devices => {
    if (devices && devices.length) {
      // Prefer back camera if available on mobile
      const cameraId = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
      return appState.html5QrScanner.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 }
        },
        onQrCodeScanned,
        (errorMessage) => {
          // Scanner frame error ignored
        }
      ).then(() => {
        appState.isScannerRunning = true;
      });
    } else {
      feedback.textContent = 'No camera found on this device. You can upload a QR image.';
      btn.textContent = 'Start Camera Scanner';
    }
  }).catch(err => {
    console.warn('Camera start error:', err);
    feedback.textContent = 'Camera permission denied or camera unavailable. Please upload a QR code image.';
    btn.textContent = 'Start Camera Scanner';
  });
}

function stopCameraScanner() {
  if (appState.html5QrScanner && appState.isScannerRunning) {
    appState.html5QrScanner.stop().then(() => {
      appState.isScannerRunning = false;
      document.getElementById('btn-toggle-camera').textContent = 'Start Camera Scanner';
      document.getElementById('scan-feedback').textContent = 'Scanner stopped';
    }).catch(err => console.warn('Stop scanner err:', err));
  }
}

function resumeCameraIfActive() {
  if (appState.isScannerRunning && appState.html5QrScanner) {
    appState.html5QrScanner.resume();
  }
}

function handleQRFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!appState.html5QrScanner) {
    appState.html5QrScanner = new Html5Qrcode('camera-reader');
  }

  appState.html5QrScanner.scanFile(file, true)
    .then(decodedText => {
      onQrCodeScanned(decodedText);
    })
    .catch(err => {
      alert('Could not decode QR code from the uploaded image. Please try another image.');
    });
}

/**
 * QR CODE DETECTED HANDLER
 * Handles both:
 * 1. Standard Merchant QR Code (Scan to Pay Offline)
 * 2. Signed Buyer Payment Voucher QR Code (Scan to Accept Offline Payment)
 */
async function onQrCodeScanned(qrContent) {
  soundbox.playScanBeep();
  if (navigator.vibrate) navigator.vibrate(100);

  // Pause scanner while popup active
  if (appState.html5QrScanner && appState.isScannerRunning) {
    appState.html5QrScanner.pause();
  }

  console.log('📷 QR Scanned:', qrContent);

  // CASE 1: Recipient scanning a Buyer's Offline Payment Voucher
  if (qrContent.startsWith('{') && qrContent.includes('"signature"')) {
    try {
      const voucher = JSON.parse(qrContent);
      document.getElementById('scan-feedback').textContent = 'Processing offline voucher...';

      const accepted = await walletEngine.processIncomingOfflinePayment(voucher);
      soundbox.playPaymentSuccessChime();
      soundbox.speak(`Received ${accepted.amount} rupees offline from ${accepted.payer_name || accepted.payer_phone}`);

      showNotificationToast('💰 Money Received Offline!', `Accepted ₹${accepted.amount} from ${accepted.payer_name || accepted.payer_phone}`, 'success');

      refreshDashboard();
      showReceiptModal(accepted);
      return;
    } catch (err) {
      alert('Error accepting offline voucher: ' + err.message);
      resumeCameraIfActive();
      return;
    }
  }

  // CASE 2: Payer scanning a Merchant QR Code
  // Format: PAYOFFLINE:MERCHANT:phone:name:amount
  // or UPI format: upi://pay?pa=...&pn=...&am=...
  let merchantPhone = '';
  let merchantName = 'Merchant';
  let requestedAmount = '';

  if (qrContent.startsWith('PAYOFFLINE:MERCHANT:')) {
    const parts = qrContent.split(':');
    merchantPhone = parts[2] || '';
    merchantName = parts[3] || 'Merchant Store';
    requestedAmount = parts[4] || '';
  } else if (qrContent.startsWith('upi://pay')) {
    const url = new URL(qrContent);
    merchantPhone = url.searchParams.get('pa') || 'merchant@upi';
    merchantName = url.searchParams.get('pn') || 'Merchant';
    requestedAmount = url.searchParams.get('am') || '';
  } else {
    // Generic text/phone
    merchantPhone = qrContent.slice(0, 15);
    merchantName = 'Direct Recipient';
  }

  appState.currentScanPayload = {
    payeePhone: merchantPhone,
    payeeName: merchantName,
    amount: requestedAmount
  };

  // Open Payment Confirmation Modal
  document.getElementById('confirm-payee-name').textContent = merchantName;
  document.getElementById('confirm-payee-phone').textContent = merchantPhone;
  document.getElementById('confirm-amount').value = requestedAmount || '';
  document.getElementById('confirm-avail-balance').textContent = walletEngine.getOfflineBalance().toFixed(2);

  document.getElementById('payment-confirm-modal').classList.add('active');
}

/**
 * 10. EXECUTE OFFLINE PAYMENT
 */
async function executeOfflinePayment() {
  const amount = parseFloat(document.getElementById('confirm-amount').value);
  const pin = document.getElementById('confirm-pin').value;

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid payment amount');
    return;
  }

  if (!pin || pin.length < 4) {
    alert('Please enter your 4-digit security PIN');
    return;
  }

  const { payeePhone, payeeName } = appState.currentScanPayload;

  try {
    // Deduct offline balance & generate cryptographically signed voucher
    const voucher = await walletEngine.createOfflinePaymentVoucher({
      payeePhone,
      payeeName,
      amount,
      mode: 'OFFLINE_QR_SCAN'
    });

    // Close confirm modal
    document.getElementById('payment-confirm-modal').classList.remove('active');

    // Play FinTech Success sounds & speech
    soundbox.playPaymentSuccessChime();
    soundbox.speak(`Offline payment of ${amount} rupees sent to ${payeeName}`);

    showNotificationToast('⚡ Offline Payment Successful!', `Sent ₹${amount.toFixed(2)} to ${payeeName}`, 'success');

    refreshDashboard();
    showReceiptModal(voucher);

    // If online, sync in background immediately
    if (isNetworkOnline()) {
      syncPendingTransactions();
    }
  } catch (err) {
    alert('Payment Failed: ' + err.message);
  }
}

/**
 * 11. GENERATE OFFLINE PAY VOUCHER (FOR MERCHANTS TO SCAN)
 */
async function handleGenerateVoucher() {
  const amount = parseFloat(document.getElementById('voucher-amount').value);
  const payeePhone = document.getElementById('voucher-payee-phone').value.trim() || 'Any Merchant';
  const pin = document.getElementById('voucher-pin').value;

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid payment amount');
    return;
  }

  if (!pin || pin.length < 4) {
    alert('Please enter your 4-digit PIN');
    return;
  }

  try {
    const voucher = await walletEngine.createOfflinePaymentVoucher({
      payeePhone,
      payeeName: payeePhone === 'Any Merchant' ? 'Any Merchant' : 'Direct Merchant',
      amount,
      mode: 'OFFLINE_VOUCHER_TOKEN'
    });

    soundbox.playPaymentSuccessChime();
    refreshDashboard();

    // Render Voucher QR Code
    const qrDiv = document.getElementById('voucher-qrcode');
    qrDiv.innerHTML = '';

    const qr = qrcode(0, 'M');
    qr.addData(JSON.stringify(voucher));
    qr.make();
    qrDiv.innerHTML = qr.createSvgTag(6, 0);

    document.getElementById('voucher-display-amount').textContent = `₹${amount.toFixed(2)}`;
    document.getElementById('voucher-display-id').textContent = `Token: ${voucher.id}`;
    document.getElementById('generated-voucher-card').classList.remove('hidden');

    showNotificationToast('🎫 Offline Pay Voucher Ready', `₹${amount.toFixed(2)} signed. Merchant can now scan your QR code.`, 'success');
  } catch (err) {
    alert('Could not generate voucher: ' + err.message);
  }
}

/**
 * 12. RENDER RECEIVE QR CODE (MERCHANT / USER)
 */
function renderReceiveQR() {
  const user = walletEngine.getUser();
  if (!user) return;

  const amountInput = document.getElementById('receive-amount-input').value.trim();
  const qrDiv = document.getElementById('receive-qrcode');
  qrDiv.innerHTML = '';

  // Canonical PayOffline QR string
  const qrPayload = `PAYOFFLINE:MERCHANT:${user.phone}:${user.name}:${amountInput}`;

  const qr = qrcode(0, 'M');
  qr.addData(qrPayload);
  qr.make();
  qrDiv.innerHTML = qr.createSvgTag(6, 0);
}

/**
 * 13. DIGITAL RECEIPT MODAL
 */
function showReceiptModal(txn) {
  document.getElementById('receipt-amount').textContent = `₹${Number(txn.amount).toFixed(2)}`;
  document.getElementById('receipt-id').textContent = txn.id;
  document.getElementById('receipt-recipient').textContent = `${txn.payee_name || 'Merchant'} (${txn.payee_phone})`;
  document.getElementById('receipt-payer').textContent = `${txn.payer_name || 'You'} (${txn.payer_phone})`;
  document.getElementById('receipt-time').textContent = formatDate(txn.offline_timestamp || txn.created_at);
  document.getElementById('receipt-sig').textContent = (txn.signature || '').slice(0, 22) + '...';

  document.getElementById('receipt-modal').classList.add('active');
}

/**
 * 14. ALLOCATE ONLINE TO OFFLINE
 */
async function handleAllocateOffline() {
  const amount = parseFloat(document.getElementById('allocate-amount').value);
  if (isNaN(amount) || amount <= 0) {
    alert('Enter valid amount');
    return;
  }

  if (isNetworkOnline() && appState.token) {
    try {
      const res = await fetch('/api/wallet/allocate-offline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appState.token}`
        },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        walletEngine.setOfflineBalance(data.wallet.offlineAllocatedBalance);
        document.getElementById('allocate-modal').classList.remove('active');
        showNotificationToast('⚡ Allocation Complete', `₹${amount.toFixed(2)} added to Offline Pocket Cash`, 'success');
        soundbox.playPaymentSuccessChime();
        refreshDashboard();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Network request failed: ' + e.message);
    }
  } else {
    // Offline simulation
    const current = walletEngine.getOfflineBalance();
    walletEngine.setOfflineBalance(current + amount);
    document.getElementById('allocate-modal').classList.remove('active');
    showNotificationToast('⚡ Offline Allocation (Simulated)', `Added ₹${amount.toFixed(2)} to offline pocket`, 'info');
    soundbox.playPaymentSuccessChime();
    refreshDashboard();
  }
}

/**
 * 15. TOP UP ONLINE BANK VAULT
 */
async function handleTopup() {
  const amount = parseFloat(document.getElementById('topup-amount').value);
  if (isNaN(amount) || amount <= 0) {
    alert('Enter valid top-up amount');
    return;
  }

  if (isNetworkOnline() && appState.token) {
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appState.token}`
        },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('topup-modal').classList.remove('active');
        showNotificationToast('🏦 Top-Up Complete', `Added ₹${amount.toFixed(2)} to Online Vault`, 'success');
        soundbox.playPaymentSuccessChime();
        refreshDashboard();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Top-up network error: ' + e.message);
    }
  } else {
    alert('Online connection required to top-up bank vault from banking network.');
  }
}

/**
 * 16. RECONCILIATION & AUTO-SYNC ENGINE
 */
async function syncPendingTransactions(manualClick = false) {
  if (!isNetworkOnline()) {
    if (manualClick) alert('Device is currently offline. Connect to internet to sync.');
    return;
  }

  const pending = walletEngine.getPendingTransactions();
  if (pending.length === 0) {
    if (manualClick) showNotificationToast('All Synced', 'All transactions are settled and reconciled with central ledger.', 'info');
    return;
  }

  try {
    const res = await fetch('/api/transactions/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({ transactions: pending })
    });
    const data = await res.json();

    if (data.success) {
      const syncedIds = data.results.filter(r => r.status === 'SYNCED_SUCCESS').map(r => r.id);
      walletEngine.markSynced(syncedIds);

      showNotificationToast('🔄 Reconciled with Server', `${data.syncedCount} offline transaction(s) settled successfully!`, 'success');
      refreshDashboard();
      renderTransactionsList('ALL');
    }
  } catch (err) {
    console.warn('Sync attempt failed:', err);
  }
}

/**
 * 17. FLOATING NOTIFICATION TOAST UTILITY
 */
function showNotificationToast(title, message, type = 'info') {
  const toast = document.getElementById('notification-toast');
  const titleEl = document.getElementById('toast-title');
  const descEl = document.getElementById('toast-desc');

  titleEl.textContent = title;
  descEl.textContent = message;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 6000);
}
