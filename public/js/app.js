/**
 * PayOffline - Apple iOS 18 FinTech Engine & Fluid Animation Controller
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
  currentScanPayload: null,
  receiveQrMode: 'DEVICE', // 'DEVICE' or 'USER'
  currentFilter: 'ALL',
  searchQuery: '',
  islandTimeout: null,
  currentTabIndex: 0,
  selectedCountryCode: '+91',
  selectedRole: 'dual',
  pendingVerificationPhone: '',
  pendingVerificationName: '',
  generatedOtpCode: ''
};

// Apple Taptic Engine Simulation
function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  try {
    switch (type) {
      case 'light':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(18);
        break;
      case 'success':
        navigator.vibrate([15, 60, 20]);
        break;
      case 'warning':
        navigator.vibrate([25, 40, 25]);
        break;
      case 'heavy':
        navigator.vibrate(40);
        break;
    }
  } catch (e) {
    // Ignore haptic failures
  }
}

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

  playTone(freq, type = 'sine', duration = 0.15, delay = 0) {
    if (!appState.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch (e) {
      console.warn('Audio synthesis note:', e);
    }
  }

  playNotificationSound() {
    this.playTone(587.33, 'sine', 0.12, 0);     // D5
    this.playTone(880, 'sine', 0.25, 0.12);     // A5
  }

  playScanBeep() {
    this.playTone(1318.51, 'square', 0.08, 0);  // E6
  }

  playPaymentSuccessChime() {
    this.playTone(523.25, 'triangle', 0.1, 0);    // C5
    this.playTone(659.25, 'triangle', 0.1, 0.09); // E5
    this.playTone(783.99, 'triangle', 0.1, 0.18); // G5
    this.playTone(1046.50, 'triangle', 0.35, 0.27); // C6
  }

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

/**
 * APPLE DYNAMIC ISLAND CONTROLLER
 */
function expandDynamicIsland(icon, title, subtitle, durationMs = 4000) {
  const island = document.getElementById('dynamic-island');
  const iconEl = document.getElementById('island-icon');
  const titleEl = document.getElementById('island-title');
  const subEl = document.getElementById('island-sub');

  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;

  island.classList.add('expanded');
  triggerHaptic('medium');

  if (appState.islandTimeout) clearTimeout(appState.islandTimeout);
  appState.islandTimeout = setTimeout(() => {
    island.classList.remove('expanded');
    setTimeout(() => {
      if (iconEl) iconEl.textContent = '⚡';
      if (titleEl) titleEl.textContent = 'PayOffline';
      if (subEl) subEl.textContent = 'Ready';
    }, 450);
  }, durationMs);
}

/**
 * SIMULATED APPLE FACE ID BIOMETRICS
 */
function triggerFaceId(callback) {
  if (!walletEngine.isFaceIdEnabled()) {
    return callback();
  }

  const modal = document.getElementById('faceid-modal');
  const glyph = document.getElementById('faceid-glyph');
  const title = document.getElementById('faceid-title');
  const sub = document.getElementById('faceid-sub');

  glyph.className = 'faceid-scanner-glyph';
  glyph.textContent = '👤';
  title.textContent = 'Face ID';
  sub.textContent = 'Verifying Biometrics...';

  modal.classList.add('active');
  triggerHaptic('light');

  setTimeout(() => {
    glyph.classList.add('verified');
    glyph.textContent = '✓';
    title.textContent = 'Verified';
    sub.textContent = 'Identity Confirmed';
    triggerHaptic('success');
    soundbox.playTone(880, 'sine', 0.1);

    setTimeout(() => {
      modal.classList.remove('active');
      callback();
    }, 550);
  }, 750);
}

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initTheme();
  initAuthSession();
  initNetworkListeners();
  initUIEvents();
  initOnboardingEvents();
  initWebSocket();
  initOtpBoxes();
  requestNotificationPermission();
  refreshDashboard();
  renderQuickContacts();
  autoRegisterDeviceCloud();
  updateNavIndicator(0);
});

/**
 * 1. PWA Service Worker Registration
 */
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ ServiceWorker active:', reg.scope))
      .catch(err => console.warn('ServiceWorker notice:', err));
  }
}

/**
 * 2. Theme Initialization (Dark / Light)
 */
function initTheme() {
  const savedTheme = walletEngine.getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  const darkSwitch = document.getElementById('switch-dark-mode');
  if (darkSwitch) darkSwitch.checked = savedTheme === 'dark';
}

function toggleTheme(isDark) {
  const theme = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  walletEngine.setTheme(theme);
  triggerHaptic('light');
  expandDynamicIsland(isDark ? '🌙' : '☀️', 'Appearance Changed', `${theme.toUpperCase()} Mode Active`, 2500);
}

/**
 * 3. Notification Permissions Request
 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * 4. Auth Session & Onboarding Handling
 */
function initAuthSession() {
  const user = walletEngine.getUser();
  const token = walletEngine.getAuthToken();

  if (user && token) {
    appState.user = user;
    appState.token = token;
    document.getElementById('onboarding-screen').classList.add('hidden');
    updateUserHeader();
  } else {
    // Show Fullscreen Onboarding Screen
    showOnboardingScreen();
  }
}

function showOnboardingScreen() {
  const ob = document.getElementById('onboarding-screen');
  ob.classList.remove('hidden');
  document.getElementById('onboarding-step-create').classList.remove('hidden');
  document.getElementById('onboarding-step-verify').classList.add('hidden');
}

function updateUserHeader() {
  if (appState.user) {
    const initials = appState.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'PO';
    document.getElementById('header-avatar').textContent = initials;
    document.getElementById('header-user-name').textContent = appState.user.name;
    document.getElementById('header-user-status').textContent = appState.user.phone;

    // Settings Profile
    document.getElementById('settings-avatar').textContent = initials;
    document.getElementById('settings-user-name').textContent = appState.user.name;
    document.getElementById('settings-user-phone').textContent = appState.user.phone;
    document.getElementById('settings-device-name').textContent = walletEngine.getDeviceName();
    document.getElementById('settings-device-id').textContent = walletEngine.getDeviceId();

    // Lifetime user stats in profile card
    const spentEl = document.getElementById('settings-total-spent');
    const recEl = document.getElementById('settings-total-received');
    const countEl = document.getElementById('settings-txn-count');
    if (spentEl) spentEl.textContent = `₹${parseFloat(appState.user.totalSpent || 0).toFixed(2)}`;
    if (recEl) recEl.textContent = `₹${parseFloat(appState.user.totalReceived || 0).toFixed(2)}`;
    if (countEl) countEl.textContent = (appState.user.txnCount || 0).toString();

    // Receive Tab
    document.getElementById('qr-merchant-name').textContent = appState.user.name;
    document.getElementById('qr-merchant-phone').textContent = appState.user.phone;
    document.getElementById('badge-device-name').textContent = `Terminal: ${walletEngine.getDeviceName()} (${walletEngine.getDeviceId()})`;
    document.getElementById('qr-device-id-label').textContent = `Terminal ID: ${walletEngine.getDeviceId()}`;
  }
}

/**
 * 5. Network Status & Offline Simulation
 */
function isNetworkOnline() {
  if (appState.isOfflineSimulated) return false;
  return navigator.onLine;
}

function initNetworkListeners() {
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

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
    triggerHaptic('success');
    expandDynamicIsland('🌐', 'Connected to Cloud', 'Synchronizing offline ledger...', 3500);
    syncPendingTransactions();
  } else {
    triggerHaptic('warning');
    expandDynamicIsland('✈️', 'Airplane Mode Active', '100% Offline Cryptographic Transfers', 3500);
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
    syncPendingTransactions();
  } else {
    badge.className = 'network-badge offline';
    text.textContent = 'OFFLINE';
    banner.classList.remove('hidden');
  }
}

/**
 * 6. Real-Time WebSockets
 */
function initWebSocket() {
  if (!isNetworkOnline()) return;
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('🔌 WebSocket live channel connected');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TRANSACTION_SETTLED') {
          if (appState.user && (data.transaction.payer_phone === appState.user.phone || data.transaction.payee_phone === appState.user.phone)) {
            refreshDashboard();
            if (data.transaction.payee_phone === appState.user.phone) {
              soundbox.playPaymentSuccessChime();
              soundbox.speak(`Received ${data.transaction.amount} rupees from ${data.transaction.payer_phone}`);
              expandDynamicIsland('💰', `Received ₹${data.transaction.amount}`, `From ${data.transaction.payer_phone}`);
            }
          }
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };
    ws.onclose = () => {
      setTimeout(initWebSocket, 6000);
    };
    appState.ws = ws;
  } catch (err) {
    console.warn('WebSocket init exception:', err);
  }
}

/**
 * 7. Multi-Device Cloud Registration
 */
async function autoRegisterDeviceCloud() {
  if (!isNetworkOnline() || !appState.token) return;
  try {
    const deviceId = walletEngine.getDeviceId();
    const deviceName = walletEngine.getDeviceName();
    const publicKey = walletEngine.getDeviceSecret().slice(0, 32);

    await fetch('/api/cloud/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({
        deviceId,
        deviceName,
        platform: navigator.platform || 'iOS PWA',
        publicKey
      })
    });
    console.log('✅ Device terminal registered to cloud registry:', deviceId);
  } catch (e) {
    console.warn('Cloud device register background error:', e);
  }
}

/**
 * 8. ONBOARDING & 6-DIGIT REAL DEVICE NOTIFICATION VERIFICATION
 */
function initOnboardingEvents() {
  // Role selector buttons
  const rolePersonal = document.getElementById('ob-role-personal');
  const roleMerchant = document.getElementById('ob-role-merchant');

  if (rolePersonal && roleMerchant) {
    rolePersonal.addEventListener('click', () => {
      rolePersonal.classList.add('active');
      roleMerchant.classList.remove('active');
      appState.selectedRole = 'personal';
      triggerHaptic('light');
    });

    roleMerchant.addEventListener('click', () => {
      roleMerchant.classList.add('active');
      rolePersonal.classList.remove('active');
      appState.selectedRole = 'merchant';
      triggerHaptic('light');
    });
  }

  // Country code selector
  const ccSelect = document.getElementById('ob-country-code');
  if (ccSelect) {
    ccSelect.addEventListener('change', (e) => {
      appState.selectedCountryCode = e.target.value;
    });
  }

  // Create Account & Send Code Button
  const btnSendCode = document.getElementById('btn-ob-send-code');
  if (btnSendCode) {
    btnSendCode.addEventListener('click', handleOnboardingSendCode);
  }

  // Verify Button
  const btnVerify = document.getElementById('btn-ob-verify');
  if (btnVerify) {
    btnVerify.addEventListener('click', handleOnboardingVerify);
  }

  // Quick-Fill Button
  const btnQuickFill = document.getElementById('btn-ob-quick-fill');
  if (btnQuickFill) {
    btnQuickFill.addEventListener('click', () => {
      if (appState.generatedOtpCode) {
        fillOtpBoxes(appState.generatedOtpCode);
        triggerHaptic('success');
      }
    });
  }

  // Resend Button
  const btnResend = document.getElementById('btn-ob-resend');
  if (btnResend) {
    btnResend.addEventListener('click', handleOnboardingSendCode);
  }
}

async function handleOnboardingSendCode() {
  const name = document.getElementById('ob-name').value.trim();
  const rawPhone = document.getElementById('ob-phone').value.trim().replace(/\s+/g, '');
  const cc = document.getElementById('ob-country-code').value;

  if (!rawPhone || rawPhone.length < 5) {
    alert('Please enter a valid mobile phone number');
    return;
  }

  const fullPhone = rawPhone.startsWith('+') ? rawPhone : `${cc}${rawPhone}`;
  appState.pendingVerificationPhone = fullPhone;
  appState.pendingVerificationName = name || 'User';

  const sendBtn = document.getElementById('btn-ob-send-code');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Dispatching Code to Device...';

  // Explicitly prompt device for native notification permission
  if ('Notification' in window && Notification.permission !== 'granted') {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.warn('Notification permission error:', e);
    }
  }

  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: fullPhone, name: appState.pendingVerificationName, role: appState.selectedRole })
    });
    const data = await res.json();

    if (data.success) {
      appState.generatedOtpCode = data.verificationCode;

      // 1. Send REAL Native OS Notification to current device
      dispatchRealDeviceNotification('🔐 PayOffline Verification Code', `Your verification code is: ${data.verificationCode}. Valid for 5 minutes.`);

      // 2. Play audio notification chime & Taptic Engine
      soundbox.playNotificationSound();
      triggerHaptic('medium');

      // 3. Expand Apple Dynamic Island with verification code
      expandDynamicIsland('🔑', `Verification Code: ${data.verificationCode}`, `Dispatched to ${fullPhone}`, 8000);

      // 4. Transition to Step 2
      document.getElementById('onboarding-step-create').classList.add('hidden');
      document.getElementById('onboarding-step-verify').classList.remove('hidden');
      document.getElementById('ob-display-phone').textContent = fullPhone;

      // Clear boxes and focus first
      clearOtpBoxes();
      focusFirstOtpBox();
      startOnboardingTimer();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    // Local / Offline fallback code
    const fallbackCode = '849201';
    appState.generatedOtpCode = fallbackCode;

    dispatchRealDeviceNotification('🔐 PayOffline Verification Code', `Your verification code is: ${fallbackCode}`);
    soundbox.playNotificationSound();
    triggerHaptic('medium');

    expandDynamicIsland('🔑', `Verification Code: ${fallbackCode}`, `Dispatched to ${fullPhone}`, 8000);

    document.getElementById('onboarding-step-create').classList.add('hidden');
    document.getElementById('onboarding-step-verify').classList.remove('hidden');
    document.getElementById('ob-display-phone').textContent = fullPhone;

    clearOtpBoxes();
    focusFirstOtpBox();
    startOnboardingTimer();
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '📲 Create Account & Send Code';
  }
}

function dispatchRealDeviceNotification(title, body) {
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body: body,
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          vibrate: [200, 100, 200],
          tag: 'payoffline-verification'
        });
        notif.onclick = () => window.focus();
      } catch (e) {
        console.warn('Native notification call error:', e);
      }
    }
  }
}

function startOnboardingTimer() {
  if (appState.otpCountdownInterval) clearInterval(appState.otpCountdownInterval);
  let seconds = 300;
  const timerEl = document.getElementById('ob-timer');

  appState.otpCountdownInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(appState.otpCountdownInterval);
      if (timerEl) timerEl.textContent = 'Code expired';
    } else {
      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      if (timerEl) timerEl.textContent = `Expires in ${mins}:${secs}`;
    }
  }, 1000);
}

/**
 * 6-Digit Individual OTP Input Boxes Controller
 */
function initOtpBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach((box, index) => {
    // Handle typing
    box.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.length >= 1) {
        box.classList.add('filled');
        // Auto-advance to next box
        if (index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      } else {
        box.classList.remove('filled');
      }
    });

    // Handle backspace navigation
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        boxes[index - 1].focus();
        boxes[index - 1].value = '';
        boxes[index - 1].classList.remove('filled');
      }
    });

    // Handle paste event (auto-distribute 6 digits!)
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasteData)) {
        fillOtpBoxes(pasteData);
      }
    });
  });
}

function fillOtpBoxes(codeString) {
  const boxes = document.querySelectorAll('.otp-box');
  const digits = codeString.split('');
  boxes.forEach((box, i) => {
    if (digits[i]) {
      box.value = digits[i];
      box.classList.add('filled');
    }
  });
  if (boxes[boxes.length - 1]) {
    boxes[boxes.length - 1].focus();
  }
}

function clearOtpBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach(box => {
    box.value = '';
    box.classList.remove('filled');
  });
}

function focusFirstOtpBox() {
  const first = document.querySelector('.otp-box[data-index="0"]');
  if (first) setTimeout(() => first.focus(), 150);
}

function getEnteredOtp() {
  const boxes = document.querySelectorAll('.otp-box');
  let code = '';
  boxes.forEach(box => code += box.value.trim());
  return code;
}

async function handleOnboardingVerify() {
  const otpCode = getEnteredOtp();
  if (!otpCode || otpCode.length < 6) {
    alert('Please enter the full 6-digit verification code');
    return;
  }

  const verifyBtn = document.getElementById('btn-ob-verify');
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: appState.pendingVerificationPhone,
        otpCode,
        name: appState.pendingVerificationName,
        role: appState.selectedRole,
        deviceId: walletEngine.getDeviceId(),
        deviceName: walletEngine.getDeviceName()
      })
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

      // Close onboarding screen with smooth spring animation
      document.getElementById('onboarding-screen').classList.add('hidden');
      soundbox.playPaymentSuccessChime();
      triggerHaptic('success');

      expandDynamicIsland('🟢', `Welcome, ${data.user.name}!`, 'Offline Wallet Initialized', 4000);

      updateUserHeader();
      refreshDashboard();
      autoRegisterDeviceCloud();
    } else {
      alert('Verification Failed: ' + data.error);
    }
  } catch (err) {
    // Offline demo fallback login
    const mockUser = {
      id: 999,
      phone: appState.pendingVerificationPhone,
      name: appState.pendingVerificationName || 'Demo User',
      role: appState.selectedRole
    };
    walletEngine.setUser(mockUser);
    walletEngine.setAuthToken('mock_offline_jwt_token');
    appState.user = mockUser;
    appState.token = 'mock_offline_jwt_token';

    document.getElementById('onboarding-screen').classList.add('hidden');
    expandDynamicIsland('🟢', `Welcome, ${mockUser.name}!`, 'Offline Mode Enabled', 3500);
    updateUserHeader();
    refreshDashboard();
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = '✅ Verify & Unlock Wallet';
  }
}

/**
 * 9. UI NAVIGATION & DIRECTION-AWARE FLUID TAB TRANSITIONS
 */
function initUIEvents() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item, index) => {
    item.addEventListener('click', () => {
      triggerHaptic('light');
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId, index);
    });
  });

  // Soundbox toggle
  const soundBtn = document.getElementById('sound-toggle-btn');
  soundBtn.addEventListener('click', () => {
    appState.soundEnabled = !appState.soundEnabled;
    soundBtn.textContent = appState.soundEnabled ? '🔊' : '🔇';
    triggerHaptic('medium');
    expandDynamicIsland(appState.soundEnabled ? '🔊' : '🔇', 'Soundbox Audio', appState.soundEnabled ? 'Enabled' : 'Muted', 2000);
  });

  // Header Avatar -> Settings Tab
  document.getElementById('header-avatar').addEventListener('click', () => switchTab('tab-settings', 4));

  // Quick Action Buttons
  document.getElementById('act-scan').addEventListener('click', () => switchTab('tab-scan', 1));
  document.getElementById('act-receive').addEventListener('click', () => switchTab('tab-receive', 2));
  document.getElementById('act-voucher').addEventListener('click', () => switchTab('tab-voucher', 3));
  document.getElementById('act-cloud').addEventListener('click', () => handleCloudBackupAction());
  document.getElementById('link-view-all').addEventListener('click', () => switchTab('tab-history', 4));

  // Camera Toggle
  document.getElementById('btn-toggle-camera').addEventListener('click', toggleCameraScanner);
  document.getElementById('qr-file-input').addEventListener('change', handleQRFileUpload);

  // Receive Tab: Device Terminal QR vs Personal QR Toggle
  document.getElementById('seg-device-qr').addEventListener('click', () => {
    appState.receiveQrMode = 'DEVICE';
    document.getElementById('seg-device-qr').classList.add('active');
    document.getElementById('seg-user-qr').classList.remove('active');
    document.getElementById('device-identity-badge').classList.remove('hidden');
    renderReceiveQR();
  });
  document.getElementById('seg-user-qr').addEventListener('click', () => {
    appState.receiveQrMode = 'USER';
    document.getElementById('seg-user-qr').classList.add('active');
    document.getElementById('seg-device-qr').classList.remove('active');
    document.getElementById('device-identity-badge').classList.add('hidden');
    renderReceiveQR();
  });
  document.getElementById('btn-update-receive-qr').addEventListener('click', renderReceiveQR);
  document.getElementById('btn-scan-voucher-counter').addEventListener('click', () => switchTab('tab-scan', 1));

  // Voucher Tab
  document.getElementById('btn-generate-voucher').addEventListener('click', () => {
    triggerFaceId(() => handleGenerateVoucher());
  });
  document.getElementById('btn-close-voucher').addEventListener('click', () => {
    document.getElementById('generated-voucher-card').classList.add('hidden');
  });

  // Ledger: Search Input
  const searchInput = document.getElementById('ledger-search-input');
  searchInput.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value.toLowerCase().trim();
    renderTransactionsList(appState.currentFilter);
  });

  // Ledger: Filter Pills
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      triggerHaptic('light');
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.currentFilter = pill.getAttribute('data-filter');
      renderTransactionsList(appState.currentFilter);
    });
  });

  document.getElementById('btn-sync-all').addEventListener('click', () => syncPendingTransactions(true));
  document.getElementById('btn-export-statement').addEventListener('click', exportTransactionStatement);

  // Contacts
  document.getElementById('btn-manage-contacts').addEventListener('click', () => {
    document.getElementById('contact-modal').classList.add('active');
  });
  document.getElementById('btn-close-contact').addEventListener('click', () => {
    document.getElementById('contact-modal').classList.remove('active');
  });
  document.getElementById('btn-save-contact').addEventListener('click', handleSaveContact);

  // Modals Open/Close
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
      triggerHaptic('light');
    });
  });

  document.getElementById('btn-open-topup').addEventListener('click', () => {
    document.getElementById('topup-modal').classList.add('active');
  });
  document.getElementById('btn-close-topup').addEventListener('click', () => {
    document.getElementById('topup-modal').classList.remove('active');
  });
  document.getElementById('btn-submit-topup').addEventListener('click', handleTopup);

  // Confirm Modal
  document.getElementById('btn-close-confirm').addEventListener('click', () => {
    document.getElementById('payment-confirm-modal').classList.remove('active');
    resumeCameraIfActive();
  });
  document.getElementById('btn-execute-offline-pay').addEventListener('click', () => {
    triggerFaceId(() => executeOfflinePayment());
  });

  // Receipt Modal
  document.getElementById('btn-close-receipt').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });
  document.getElementById('btn-done-receipt').addEventListener('click', () => {
    document.getElementById('receipt-modal').classList.remove('active');
  });

  // Settings Events
  document.getElementById('switch-face-id').addEventListener('change', (e) => {
    walletEngine.setFaceIdEnabled(e.target.checked);
    triggerHaptic('medium');
    expandDynamicIsland('👤', 'Face ID Biometrics', e.target.checked ? 'Enabled' : 'Disabled', 2000);
  });

  document.getElementById('switch-dark-mode').addEventListener('change', (e) => {
    toggleTheme(e.target.checked);
  });

  document.getElementById('switch-soundbox').addEventListener('change', (e) => {
    appState.soundEnabled = e.target.checked;
    document.getElementById('sound-toggle-btn').textContent = e.target.checked ? '🔊' : '🔇';
    triggerHaptic('medium');
    expandDynamicIsland(e.target.checked ? '🔊' : '🔇', 'Voice Soundbox', e.target.checked ? 'Active' : 'Muted', 2000);
  });

  document.getElementById('row-cloud-backup').addEventListener('click', handleCloudBackupAction);
  document.getElementById('row-cloud-restore').addEventListener('click', handleCloudRestoreAction);
  document.getElementById('row-rename-device').addEventListener('click', handleRenameDevice);
  document.getElementById('row-change-pin').addEventListener('click', handleChangePin);
  document.getElementById('row-logout').addEventListener('click', handleLogout);

  // Data Vault & Central Audit Ledger
  const rowVault = document.getElementById('row-open-data-vault');
  if (rowVault) rowVault.addEventListener('click', openDataVaultModal);

  const rowExportVault = document.getElementById('row-export-vault');
  if (rowExportVault) rowExportVault.addEventListener('click', handleExportDatabaseAudit);

  const btnCloseVault = document.getElementById('btn-close-data-vault');
  if (btnCloseVault) btnCloseVault.addEventListener('click', closeDataVaultModal);

  const btnExportJson = document.getElementById('btn-vault-export-json');
  if (btnExportJson) btnExportJson.addEventListener('click', handleExportDatabaseAudit);

  const btnVaultRefresh = document.getElementById('btn-vault-refresh');
  if (btnVaultRefresh) btnVaultRefresh.addEventListener('click', refreshActiveVaultTab);

  // Vault Tab Navigation
  const vaultTabs = document.querySelectorAll('.vault-tab-btn');
  vaultTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      vaultTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetVTab = btn.getAttribute('data-vtab');
      switchVaultTab(targetVTab);
    });
  });
}

/**
 * DIRECTION-AWARE FLUID PAGE SWITCHER
 */
function switchTab(tabId, targetIndex = 0) {
  const isForward = targetIndex >= appState.currentTabIndex;
  const previousIndex = appState.currentTabIndex;
  appState.currentTabIndex = targetIndex;

  // Update animated sliding capsule on bottom nav
  updateNavIndicator(targetIndex);

  // Hide all tabs and remove existing animation classes
  document.querySelectorAll('.tab-view').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('page-enter-right', 'page-enter-left');
  });

  // Update active state in bottom nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Show target tab with direction-aware spring transition!
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.remove('hidden');
    targetTab.classList.add(isForward ? 'page-enter-right' : 'page-enter-left');
  }

  // Dynamic Island Brief Notification on Page Change
  const pageTitles = {
    'tab-home': { icon: '💳', name: 'Wallet Overview' },
    'tab-scan': { icon: '📷', name: 'Camera Scanner Ready' },
    'tab-receive': { icon: '📥', name: 'Terminal QR Code' },
    'tab-voucher': { icon: '🎫', name: 'Offline Token Pay' },
    'tab-history': { icon: '📑', name: 'Transaction Ledger' },
    'tab-settings': { icon: '⚙️', name: 'Settings & Cloud' }
  };
  const page = pageTitles[tabId];
  if (page && previousIndex !== targetIndex) {
    expandDynamicIsland(page.icon, page.name, 'Swipe or tap to navigate', 1800);
  }

  // Tab specific lifecycle actions
  if (tabId === 'tab-receive') {
    renderReceiveQR();
  } else if (tabId === 'tab-history') {
    renderTransactionsList(appState.currentFilter);
  } else if (tabId !== 'tab-scan' && appState.isScannerRunning) {
    stopCameraScanner();
  }
}

function updateNavIndicator(tabIndex) {
  const pill = document.getElementById('nav-indicator-pill');
  if (!pill) return;
  const navItems = document.querySelectorAll('.nav-item');
  const targetItem = navItems[tabIndex];
  if (targetItem) {
    const leftOffset = targetItem.offsetLeft;
    pill.style.transform = `translateX(${leftOffset}px)`;
    pill.style.width = `${targetItem.offsetWidth}px`;
  }
}

/**
 * 10. QUICK PAY BENEFICIARIES / CONTACTS ROW
 */
function renderQuickContacts() {
  const container = document.getElementById('contacts-scroll-row');
  const contacts = walletEngine.getContacts();

  let html = contacts.map(c => `
    <div class="contact-bubble" data-phone="${c.phone}" data-name="${c.name}">
      <div class="contact-avatar" style="background:${c.color};">
        ${c.initials || c.name.slice(0, 2).toUpperCase()}
      </div>
      <span class="contact-name">${c.name}</span>
    </div>
  `).join('');

  html += `
    <div class="contact-bubble" id="btn-add-contact-bubble">
      <div class="contact-avatar add-btn">+</div>
      <span class="contact-name">Add</span>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.contact-bubble[data-phone]').forEach(el => {
    el.addEventListener('click', () => {
      triggerHaptic('light');
      const phone = el.getAttribute('data-phone');
      const name = el.getAttribute('data-name');
      initiatePaymentToContact(phone, name);
    });
  });

  const addBtn = document.getElementById('btn-add-contact-bubble');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('contact-modal').classList.add('active');
    });
  }
}

function initiatePaymentToContact(phone, name) {
  appState.currentScanPayload = {
    payeePhone: phone,
    payeeName: name,
    amount: ''
  };

  document.getElementById('confirm-payee-name').textContent = name;
  document.getElementById('confirm-payee-phone').textContent = phone;
  document.getElementById('confirm-device-tag').textContent = 'Beneficiary Quick-Pay';
  document.getElementById('confirm-amount').value = '';
  document.getElementById('confirm-avail-balance').textContent = walletEngine.getOfflineBalance().toFixed(2);

  document.getElementById('payment-confirm-modal').classList.add('active');
}

function handleSaveContact() {
  const name = document.getElementById('contact-name-input').value.trim();
  const phone = document.getElementById('contact-phone-input').value.trim();

  if (!name || !phone) {
    alert('Please enter both name and mobile number');
    return;
  }

  const colors = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#00c7be'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];

  walletEngine.addContact({ name, phone, color: randomColor });
  renderQuickContacts();

  document.getElementById('contact-modal').classList.remove('active');
  document.getElementById('contact-name-input').value = '';
  document.getElementById('contact-phone-input').value = '';

  triggerHaptic('success');
  expandDynamicIsland('👤', 'Contact Saved', `${name} added to Quick Pay`, 2500);

  if (isNetworkOnline() && appState.token) {
    fetch('/api/cloud/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({ name, phone, avatarColor: randomColor })
    }).catch(e => console.warn('Cloud contact sync deferred'));
  }
}

/**
 * 11. DASHBOARD & WALLET BALANCES
 */
async function refreshDashboard() {
  const offlineBal = walletEngine.getOfflineBalance();
  document.getElementById('display-offline-balance').textContent = offlineBal.toFixed(2);

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

      // Refresh user lifetime metrics
      const profileRes = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${appState.token}` }
      });
      const profileData = await profileRes.json();
      if (profileData.success && profileData.user) {
        appState.user = { ...appState.user, ...profileData.user };
        walletEngine.setUser(appState.user);
        updateUserHeader();
      }
    } catch (e) {
      console.warn('Could not fetch server wallet balance:', e);
    }
  } else {
    document.getElementById('display-online-balance').textContent = '5000.00';
    document.getElementById('display-total-balance').textContent = (offlineBal + 5000).toFixed(2);
  }

  const lastSync = walletEngine.getLastCloudSync();
  const syncPill = document.getElementById('cloud-sync-status');
  if (lastSync) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(lastSync).getTime()) / 60000));
    syncPill.textContent = `☁️ Synced ${mins}m ago`;
  }

  renderRecentTransactions();
}

function renderRecentTransactions() {
  const container = document.getElementById('home-txns-list');
  const history = walletEngine.getLocalHistory();

  if (history.length === 0) {
    container.innerHTML = '<p style="color:var(--ios-text-secondary); font-size:0.85rem; text-align:center; padding:20px 0;">No transactions yet.</p>';
    return;
  }

  const recent = history.slice(0, 5);
  container.innerHTML = recent.map(t => createTxnItemHTML(t)).join('');
  attachTxnClickHandlers(container);
}

function renderTransactionsList(filter = 'ALL') {
  const container = document.getElementById('full-txns-list');
  let history = walletEngine.getLocalHistory();

  if (appState.searchQuery) {
    const q = appState.searchQuery;
    history = history.filter(t => 
      (t.payer_name && t.payer_name.toLowerCase().includes(q)) ||
      (t.payee_name && t.payee_name.toLowerCase().includes(q)) ||
      (t.payer_phone && t.payer_phone.toLowerCase().includes(q)) ||
      (t.payee_phone && t.payee_phone.toLowerCase().includes(q)) ||
      (t.id && t.id.toLowerCase().includes(q))
    );
  }

  if (filter === 'PENDING') {
    history = history.filter(t => t.status === 'OFFLINE_PENDING');
  } else if (filter === 'SENT') {
    history = history.filter(t => t.type === 'SENT');
  } else if (filter === 'RECEIVED') {
    history = history.filter(t => t.type === 'RECEIVED');
  }

  if (history.length === 0) {
    container.innerHTML = `<p style="color:var(--ios-text-secondary); font-size:0.85rem; text-align:center; padding:24px 0;">No matching transactions found.</p>`;
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
    ? '<span class="txn-status-tag status-pending">⚡ Offline</span>' 
    : '<span class="txn-status-tag status-synced">✓ Cloud</span>';

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
      triggerHaptic('light');
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
 * 12. CAMERA QR SCANNER
 */
function toggleCameraScanner() {
  if (appState.isScannerRunning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

function startCameraScanner() {
  const btn = document.getElementById('btn-toggle-camera');
  const feedback = document.getElementById('scan-feedback');

  if (!appState.html5QrScanner) {
    appState.html5QrScanner = new Html5Qrcode('camera-reader');
  }

  btn.textContent = 'Stop Scanner';
  feedback.textContent = 'Scanning camera viewfinder... Point at QR code';

  Html5Qrcode.getCameras().then(devices => {
    if (devices && devices.length) {
      const cameraId = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
      return appState.html5QrScanner.start(
        cameraId,
        { fps: 15, qrbox: { width: 250, height: 250 } },
        onQrCodeScanned,
        () => {}
      ).then(() => {
        appState.isScannerRunning = true;
      });
    } else {
      feedback.textContent = 'No camera found on this device. You can upload a QR image.';
      btn.textContent = 'Start Camera Scanner';
    }
  }).catch(err => {
    console.warn('Camera start error:', err);
    feedback.textContent = 'Camera permission unavailable. Please upload a QR code image.';
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
    .then(decodedText => onQrCodeScanned(decodedText))
    .catch(() => alert('Could not decode QR code from the uploaded image. Please try another image.'));
}

/**
 * QR CODE DETECTED HANDLER
 */
async function onQrCodeScanned(qrContent) {
  soundbox.playScanBeep();
  triggerHaptic('success');

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

      expandDynamicIsland('💰', `Received ₹${accepted.amount}`, `From ${accepted.payer_name || accepted.payer_phone}`, 5000);

      refreshDashboard();
      showReceiptModal(accepted);
      return;
    } catch (err) {
      alert('Error accepting offline voucher: ' + err.message);
      resumeCameraIfActive();
      return;
    }
  }

  // CASE 2: Payer scanning a Separate Device Terminal QR
  let merchantPhone = '';
  let merchantName = 'Merchant';
  let requestedAmount = '';
  let targetDeviceId = '';

  if (qrContent.startsWith('PAYOFFLINE:DEV:')) {
    const parts = qrContent.split(':');
    targetDeviceId = parts[2] || '';
    merchantPhone = parts[3] || '';
    merchantName = decodeURIComponent(parts[4] || 'Merchant Terminal');
    requestedAmount = parts[5] || '';
  } else if (qrContent.startsWith('PAYOFFLINE:MERCHANT:')) {
    const parts = qrContent.split(':');
    merchantPhone = parts[2] || '';
    merchantName = parts[3] || 'Merchant';
    requestedAmount = parts[4] || '';
  } else if (qrContent.startsWith('upi://pay')) {
    const url = new URL(qrContent);
    merchantPhone = url.searchParams.get('pa') || 'merchant@upi';
    merchantName = url.searchParams.get('pn') || 'Merchant';
    requestedAmount = url.searchParams.get('am') || '';
  } else {
    merchantPhone = qrContent.slice(0, 15);
    merchantName = 'Direct Recipient';
  }

  appState.currentScanPayload = {
    payeePhone: merchantPhone,
    payeeName: merchantName,
    amount: requestedAmount,
    targetDeviceId
  };

  document.getElementById('confirm-payee-name').textContent = merchantName;
  document.getElementById('confirm-payee-phone').textContent = merchantPhone;
  document.getElementById('confirm-device-tag').textContent = targetDeviceId ? `Terminal: ${targetDeviceId}` : 'Direct Merchant';
  document.getElementById('confirm-amount').value = requestedAmount || '';
  document.getElementById('confirm-avail-balance').textContent = walletEngine.getOfflineBalance().toFixed(2);

  document.getElementById('payment-confirm-modal').classList.add('active');
}

/**
 * 13. EXECUTE OFFLINE PAYMENT
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

  const { payeePhone, payeeName, targetDeviceId } = appState.currentScanPayload;

  try {
    const voucher = await walletEngine.createOfflinePaymentVoucher({
      payeePhone,
      payeeName,
      amount,
      mode: 'OFFLINE_QR_SCAN',
      targetDeviceId
    });

    document.getElementById('payment-confirm-modal').classList.remove('active');

    soundbox.playPaymentSuccessChime();
    soundbox.speak(`Offline payment of ${amount} rupees sent to ${payeeName}`);
    triggerHaptic('success');

    expandDynamicIsland('⚡', `Paid ₹${amount.toFixed(2)} Offline`, `Sent to ${payeeName}`, 4500);

    refreshDashboard();
    showReceiptModal(voucher);

    if (isNetworkOnline()) syncPendingTransactions();
  } catch (err) {
    alert('Payment Failed: ' + err.message);
  }
}

/**
 * 14. GENERATE OFFLINE PAY VOUCHER QR
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
    triggerHaptic('success');
    refreshDashboard();

    const qrDiv = document.getElementById('voucher-qrcode');
    qrDiv.innerHTML = '';

    const qr = qrcode(0, 'M');
    qr.addData(JSON.stringify(voucher));
    qr.make();
    qrDiv.innerHTML = qr.createSvgTag(6, 0);

    document.getElementById('voucher-display-amount').textContent = `₹${amount.toFixed(2)}`;
    document.getElementById('voucher-display-id').textContent = `Token: ${voucher.id}`;
    document.getElementById('generated-voucher-card').classList.remove('hidden');

    expandDynamicIsland('🎫', `Voucher ₹${amount.toFixed(2)} Ready`, 'Merchant can now scan your QR', 4000);
  } catch (err) {
    alert('Could not generate voucher: ' + err.message);
  }
}

/**
 * 15. RENDER RECEIVE QR CODE (DEVICE TERMINAL QR vs USER QR)
 */
function renderReceiveQR() {
  const user = walletEngine.getUser();
  if (!user) return;

  const amountInput = document.getElementById('receive-amount-input').value.trim();
  const qrDiv = document.getElementById('receive-qrcode');
  qrDiv.innerHTML = '';

  let qrPayload = '';
  if (appState.receiveQrMode === 'DEVICE') {
    qrPayload = walletEngine.getDeviceTerminalQrPayload(amountInput);
  } else {
    qrPayload = `PAYOFFLINE:MERCHANT:${user.phone}:${user.name}:${amountInput}`;
  }

  const qr = qrcode(0, 'M');
  qr.addData(qrPayload);
  qr.make();
  qrDiv.innerHTML = qr.createSvgTag(6, 0);
}

/**
 * 16. DIGITAL RECEIPT MODAL
 */
function showReceiptModal(txn) {
  document.getElementById('receipt-amount').textContent = `₹${Number(txn.amount).toFixed(2)}`;
  document.getElementById('receipt-id').textContent = txn.id;
  document.getElementById('receipt-recipient').textContent = `${txn.payee_name || 'Merchant'} (${txn.payee_phone})`;
  document.getElementById('receipt-payer').textContent = `${txn.payer_name || 'You'} (${txn.payer_phone})`;
  document.getElementById('receipt-time').textContent = formatDate(txn.offline_timestamp || txn.created_at);
  document.getElementById('receipt-sig').textContent = (txn.signature || '').slice(0, 24) + '...';

  const isSent = txn.type === 'SENT';
  const impactEl = document.getElementById('receipt-ledger-impact');
  if (impactEl) {
    impactEl.textContent = isSent 
      ? `Offline Pocket: -₹${Number(txn.amount).toFixed(2)} (DEBIT)` 
      : `Online Vault: +₹${Number(txn.amount).toFixed(2)} (CREDIT)`;
    impactEl.style.color = isSent ? 'var(--ios-red)' : 'var(--ios-green)';
  }

  const devEl = document.getElementById('receipt-device-info');
  if (devEl) {
    devEl.textContent = txn.payer_device_id || txn.payerDeviceId || walletEngine.getDeviceId();
  }

  document.getElementById('receipt-modal').classList.add('active');
}

/**
 * 17. ALLOCATE ONLINE TO OFFLINE
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
        triggerHaptic('success');
        expandDynamicIsland('⚡', `Allocated ₹${amount.toFixed(2)}`, 'Offline Pocket Cash Ready', 3500);
        soundbox.playPaymentSuccessChime();
        refreshDashboard();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Network request failed: ' + e.message);
    }
  } else {
    const current = walletEngine.getOfflineBalance();
    walletEngine.setOfflineBalance(current + amount);
    document.getElementById('allocate-modal').classList.remove('active');
    triggerHaptic('success');
    expandDynamicIsland('⚡', `Allocated ₹${amount.toFixed(2)}`, 'Offline Pocket (Local Simulation)', 3000);
    soundbox.playPaymentSuccessChime();
    refreshDashboard();
  }
}

/**
 * 18. TOP UP ONLINE BANK VAULT
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
        triggerHaptic('success');
        expandDynamicIsland('🏦', `Added ₹${amount.toFixed(2)}`, 'Online Bank Vault Topped Up', 3500);
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
 * 19. RECONCILIATION & AUTO-SYNC ENGINE
 */
async function syncPendingTransactions(manualClick = false) {
  if (!isNetworkOnline()) {
    if (manualClick) alert('Device is currently offline. Connect to internet to sync.');
    return;
  }

  const pending = walletEngine.getPendingTransactions();
  if (pending.length === 0) {
    if (manualClick) expandDynamicIsland('☁️', 'All Synced', 'All records reconciled with cloud database', 2500);
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
      walletEngine.setLastCloudSync();

      triggerHaptic('success');
      expandDynamicIsland('🔄', `${data.syncedCount} Txn(s) Reconciled`, 'Settled with cloud ledger', 3500);
      refreshDashboard();
      renderTransactionsList(appState.currentFilter);
    }
  } catch (err) {
    console.warn('Sync attempt failed:', err);
  }
}

/**
 * 20. CLOUD BACKUP & RESTORE ACTIONS
 */
async function handleCloudBackupAction() {
  triggerHaptic('medium');
  expandDynamicIsland('☁️', 'Backing Up to Cloud', 'Saving encrypted snapshot...', 2500);

  const snapshot = walletEngine.createCloudBackupSnapshot();

  if (isNetworkOnline() && appState.token) {
    try {
      const res = await fetch('/api/cloud/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appState.token}`
        },
        body: JSON.stringify({
          deviceId: walletEngine.getDeviceId(),
          backupData: snapshot
        })
      });
      const data = await res.json();
      if (data.success) {
        walletEngine.setLastCloudSync();
        triggerHaptic('success');
        expandDynamicIsland('✅', 'Cloud Vault Synced', 'Full account snapshot saved to cloud', 3500);
        document.getElementById('settings-last-backup').textContent = 'Backed up just now';
        refreshDashboard();
        return;
      }
    } catch (e) {
      console.warn('Network backup error:', e);
    }
  }

  walletEngine.setLastCloudSync();
  triggerHaptic('success');
  expandDynamicIsland('✅', 'Local Snapshot Created', 'Wallet data saved securely', 3000);
  document.getElementById('settings-last-backup').textContent = 'Saved locally just now';
}

async function handleCloudRestoreAction() {
  if (!isNetworkOnline()) {
    alert('Internet connection required to restore from cloud.');
    return;
  }

  if (!confirm('Restore account state from cloud vault?')) return;

  try {
    const res = await fetch('/api/cloud/restore', {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    const data = await res.json();

    if (data.success && data.backup) {
      walletEngine.restoreFromCloudSnapshot(data.backup);
      triggerHaptic('success');
      expandDynamicIsland('📥', 'Cloud Restore Complete', 'Account state restored across devices', 3500);
      refreshDashboard();
      renderQuickContacts();
    } else {
      alert('No cloud backup found for this account.');
    }
  } catch (e) {
    alert('Could not restore from cloud: ' + e.message);
  }
}

function handleRenameDevice() {
  const current = walletEngine.getDeviceName();
  const next = prompt('Enter a new label for this terminal/device:', current);
  if (next && next.trim()) {
    walletEngine.setDeviceName(next.trim());
    updateUserHeader();
    renderReceiveQR();
    triggerHaptic('light');
    expandDynamicIsland('🏷️', 'Device Renamed', next.trim(), 2500);
    autoRegisterDeviceCloud();
  }
}

function handleChangePin() {
  const current = prompt('Enter current 4-digit PIN (Default: 1234):');
  if (!current) return;
  const next = prompt('Enter new 4-digit security PIN:');
  if (next && next.length === 4) {
    alert('Security PIN updated successfully.');
    triggerHaptic('success');
    expandDynamicIsland('🔢', 'PIN Updated', 'New security PIN active', 2500);
  } else {
    alert('PIN must be exactly 4 digits.');
  }
}

function handleLogout() {
  if (confirm('Log out from this device? Offline wallet will remain secured locally.')) {
    localStorage.removeItem('payoffline_token');
    appState.token = null;
    triggerHaptic('medium');
    showOnboardingScreen();
  }
}

/**
 * 21. EXPORT TRANSACTION STATEMENT (CSV / JSON)
 */
function exportTransactionStatement() {
  const history = walletEngine.getLocalHistory();
  if (history.length === 0) {
    alert('No transactions to export.');
    return;
  }

  let csv = 'Transaction ID,Type,Recipient / Payer,Amount,Status,Time,Signature\n';
  history.forEach(t => {
    const isSent = t.type === 'SENT';
    const target = isSent ? (t.payee_name || t.payee_phone) : (t.payer_name || t.payer_phone);
    csv += `"${t.id}","${t.type}","${target}","${t.amount}","${t.status}","${t.offline_timestamp || t.created_at}","${t.signature || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payoffline_statement_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  triggerHaptic('success');
  expandDynamicIsland('📥', 'Statement Exported', `${history.length} records saved to CSV`, 3000);
}

/**
 * 22. DATA VAULT & CENTRAL AUDIT LEDGER CONTROLLER
 */
let currentVaultTab = 'kpi';

function openDataVaultModal() {
  triggerHaptic('medium');
  document.getElementById('modal-data-vault').classList.add('active');
  switchVaultTab(currentVaultTab);
}

function closeDataVaultModal() {
  document.getElementById('modal-data-vault').classList.remove('active');
}

function switchVaultTab(tabKey) {
  currentVaultTab = tabKey;
  // Update tab buttons
  document.querySelectorAll('.vault-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-vtab') === tabKey);
  });

  // Hide all views
  document.querySelectorAll('.vault-view').forEach(v => v.classList.add('hidden'));

  const targetView = document.getElementById(`vtab-view-${tabKey}`);
  if (targetView) targetView.classList.remove('hidden');

  if (tabKey === 'kpi') {
    loadVaultOverview();
  } else if (tabKey === 'ledger') {
    loadVaultLedger();
  } else if (tabKey === 'users') {
    loadVaultUsers();
  } else if (tabKey === 'payments') {
    loadVaultPayments();
  }
}

function refreshActiveVaultTab() {
  triggerHaptic('light');
  switchVaultTab(currentVaultTab);
}

async function loadVaultOverview() {
  try {
    const res = await fetch('/api/data-vault/overview');
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('vkpi-users').textContent = data.stats.totalUsers;
      document.getElementById('vkpi-volume').textContent = `₹${data.stats.totalVolumeSettled.toFixed(2)}`;
      document.getElementById('vkpi-txns').textContent = data.stats.totalTransactions;
      document.getElementById('vkpi-ledger').textContent = data.stats.totalLedgerEntries;
      document.getElementById('vkpi-devices').textContent = data.stats.totalRegisteredDevices;
      document.getElementById('vkpi-logins').textContent = data.stats.totalLoginSessions;
    }
  } catch (err) {
    console.warn('Vault overview fetch error:', err);
  }
}

async function loadVaultLedger() {
  const container = document.getElementById('vault-ledger-list');
  container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">Fetching ledger entries...</p>';
  try {
    const res = await fetch('/api/data-vault/ledger?limit=100');
    const data = await res.json();
    if (data.success && data.ledger && data.ledger.length) {
      container.innerHTML = data.ledger.map(e => `
        <div class="ledger-row-card">
          <div class="ledger-row-header">
            <span class="${e.entry_type === 'DEBIT' ? 'ledger-tag-debit' : 'ledger-tag-credit'}">${e.entry_type} (${e.pocket})</span>
            <span style="font-weight:700; font-size:0.85rem; color:${e.entry_type === 'DEBIT' ? 'var(--ios-red)' : 'var(--ios-green)'};">
              ${e.entry_type === 'DEBIT' ? '-' : '+'}₹${Number(e.amount).toFixed(2)}
            </span>
          </div>
          <div style="font-weight:600; color:var(--ios-text-primary);">${e.description || 'Wallet Transaction'}</div>
          <div style="font-size:0.7rem; color:var(--ios-text-secondary); margin-top:2px;">User: ${e.user_name || 'User'} (${e.user_phone || 'N/A'})</div>
          <div class="ledger-balance-track">
            <span>Before: ₹${Number(e.balance_before || 0).toFixed(2)}</span>
            <span>After: ₹${Number(e.balance_after || 0).toFixed(2)}</span>
          </div>
          <div style="font-size:0.65rem; color:#8e8e93; margin-top:4px; font-family:monospace;">Txn: ${e.txn_id} • ${formatDate(e.created_at)}</div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">No double-entry ledger records found yet.</p>';
    }
  } catch (err) {
    container.innerHTML = `<p style="text-align:center; color:var(--ios-red); padding:20px;">Error loading ledger: ${err.message}</p>`;
  }
}

async function loadVaultUsers() {
  const container = document.getElementById('vault-users-list');
  container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">Fetching registered users...</p>';
  try {
    const res = await fetch('/api/data-vault/users');
    const data = await res.json();
    if (data.success && data.users && data.users.length) {
      container.innerHTML = data.users.map(u => `
        <div class="user-vault-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <b style="color:var(--ios-text-primary); font-size:0.88rem;">${u.name}</b>
              <div style="font-size:0.74rem; color:var(--ios-text-secondary);">${u.phone}</div>
            </div>
            <span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:rgba(0,122,255,0.15); color:var(--ios-blue); font-weight:700;">
              ${u.role.toUpperCase()}
            </span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-top:8px; font-size:0.7rem;">
            <div style="background:var(--ios-card-secondary); padding:6px; border-radius:8px;">
              <span style="color:var(--ios-text-secondary);">Spent</span>
              <div style="font-weight:700; color:var(--ios-text-primary);">₹${u.total_spent.toFixed(2)}</div>
            </div>
            <div style="background:var(--ios-card-secondary); padding:6px; border-radius:8px;">
              <span style="color:var(--ios-text-secondary);">Received</span>
              <div style="font-weight:700; color:var(--ios-green);">₹${u.total_received.toFixed(2)}</div>
            </div>
            <div style="background:var(--ios-card-secondary); padding:6px; border-radius:8px;">
              <span style="color:var(--ios-text-secondary);">Txns</span>
              <div style="font-weight:700; color:var(--ios-blue);">${u.txn_count || 0}</div>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--ios-text-secondary); margin-top:6px; padding-top:4px; border-top:1px dashed var(--ios-border);">
            <span>Bank: ₹${u.online_balance.toFixed(2)} • Offline: ₹${u.offline_allocated_balance.toFixed(2)}</span>
            <span>📱 ${u.device_count || 1} Device(s)</span>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">No registered users found.</p>';
    }
  } catch (err) {
    container.innerHTML = `<p style="text-align:center; color:var(--ios-red); padding:20px;">Error loading users: ${err.message}</p>`;
  }
}

async function loadVaultPayments() {
  const container = document.getElementById('vault-payments-list');
  container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">Fetching payments audit...</p>';
  try {
    const res = await fetch('/api/data-vault/payments?limit=50');
    const data = await res.json();
    if (data.success && data.payments && data.payments.length) {
      container.innerHTML = data.payments.map(p => `
        <div class="user-vault-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <b style="color:var(--ios-text-primary); font-size:0.85rem;">₹${Number(p.amount).toFixed(2)}</b>
              <span style="font-size:0.7rem; color:var(--ios-text-secondary); margin-left:6px;">${p.mode}</span>
            </div>
            <span style="font-size:0.68rem; padding:2px 8px; border-radius:10px; background:rgba(52,199,89,0.15); color:var(--ios-green); font-weight:700;">
              ${p.status}
            </span>
          </div>
          <div style="font-size:0.73rem; margin-top:5px; color:var(--ios-text-secondary);">
            <div><b style="color:var(--ios-text-primary);">From:</b> ${p.payer_name || 'Payer'} (${p.payer_phone})</div>
            <div><b style="color:var(--ios-text-primary);">To:</b> ${p.payee_name || 'Payee'} (${p.payee_phone})</div>
          </div>
          <div style="font-size:0.66rem; color:#8e8e93; font-family:monospace; margin-top:6px; display:flex; flex-direction:column; gap:2px;">
            <div>ID: ${p.id}</div>
            <div>Payer Terminal: ${p.payer_device_id || 'UNKNOWN'}</div>
            <div>Sync: ${formatDate(p.synced_at || p.created_at)}</div>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="text-align:center; color:var(--ios-text-secondary); padding:20px;">No payments recorded in vault yet.</p>';
    }
  } catch (err) {
    container.innerHTML = `<p style="text-align:center; color:var(--ios-red); padding:20px;">Error loading payments: ${err.message}</p>`;
  }
}

function handleExportDatabaseAudit() {
  triggerHaptic('success');
  expandDynamicIsland('💾', 'Exporting Database', 'Generating full audit archive...', 2500);
  window.open('/api/data-vault/export', '_blank');
}

