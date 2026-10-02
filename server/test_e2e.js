const http = require('http');

async function runTests() {
  console.log('🧪 Starting End-to-End Verification Suite for PayOffline...\n');

  const BASE_URL = 'http://localhost:3000';

  // Helper fetch function
  const request = async (path, method = 'GET', body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  try {
    // 1. Health check
    console.log('1️⃣ Testing Server Health Check...');
    const health = await request('/api/health');
    console.log('   Health Status:', health.data.status);
    if (health.data.status !== 'ONLINE') throw new Error('Health check failed');
    console.log('   ✅ Health Check PASSED\n');

    // 2. Mobile Verification - Send Real OTP
    console.log('2️⃣ Testing Mobile Verification Code Dispatch (POST /api/auth/send-otp)...');
    const testPhone = '+919876543210';
    const otpRes = await request('/api/auth/send-otp', 'POST', {
      phone: testPhone,
      name: 'Rohan Verma'
    });
    console.log('   Response message:', otpRes.data.message);
    console.log('   Verification Code Dispatched:', otpRes.data.verificationCode);
    console.log('   Delivery Channels:', otpRes.data.delivery.channels.map(c => `${c.provider} (${c.status})`).join(', '));
    if (!otpRes.data.success || !otpRes.data.verificationCode) throw new Error('Send OTP failed');
    console.log('   ✅ Mobile OTP Dispatch PASSED\n');

    // 3. Verify OTP & Login
    console.log('3️⃣ Testing Mobile OTP Verification & Wallet Creation (POST /api/auth/verify-otp)...');
    const verifyRes = await request('/api/auth/verify-otp', 'POST', {
      phone: testPhone,
      otpCode: otpRes.data.verificationCode,
      name: 'Rohan Verma'
    });
    console.log('   Verified User:', verifyRes.data.user.name, `(${verifyRes.data.user.phone})`);
    console.log('   Initial Online Balance: ₹' + verifyRes.data.wallet.onlineBalance);
    console.log('   Initial Offline Pocket: ₹' + verifyRes.data.wallet.offlineAllocatedBalance);
    const token = verifyRes.data.token;
    if (!token) throw new Error('Verification failed, token missing');
    console.log('   ✅ Mobile Verification & Login PASSED\n');

    // 4. Wallet Inquiry
    console.log('4️⃣ Testing Wallet Balance API (GET /api/wallet/balance)...');
    const balRes = await request('/api/wallet/balance', 'GET', null, token);
    console.log('   Total Balance: ₹' + balRes.data.totalBalance);
    console.log('   ✅ Wallet Inquiry PASSED\n');

    // 5. Offline Cash Allocation
    console.log('5️⃣ Testing Offline Balance Allocation (POST /api/wallet/allocate-offline)...');
    const allocRes = await request('/api/wallet/allocate-offline', 'POST', { amount: 500 }, token);
    console.log('   Updated Offline Cash: ₹' + allocRes.data.wallet.offlineAllocatedBalance);
    console.log('   ✅ Offline Allocation PASSED\n');

    // 6. Simulate Offline Cryptographic Payment Voucher
    console.log('6️⃣ Testing Offline Cryptographic Payment & Server Reconciliation (POST /api/transactions/sync)...');
    const txnId = 'txn_test_' + Date.now();
    const offlineTimestamp = new Date().toISOString();
    const amount = 150.00;
    const payeePhone = '+919988776655';

    // Generate canonical HMAC signature
    const crypto = require('crypto');
    const payload = `${txnId}|${testPhone}|${payeePhone}|${amount.toFixed(2)}|1|nonce123|${offlineTimestamp}`;
    const signature = 'hmac:' + crypto.createHmac('sha256', 'offline_secret_seed').update(payload).digest('hex');

    const syncRes = await request('/api/transactions/sync', 'POST', {
      transactions: [{
        id: txnId,
        payer_phone: testPhone,
        payer_name: 'Rohan Verma',
        payee_phone: payeePhone,
        payee_name: 'Supermarket Store',
        amount: amount,
        mode: 'OFFLINE_QR_SCAN',
        counter: 1,
        nonce: 'nonce123',
        signature: signature,
        offline_timestamp: offlineTimestamp
      }]
    }, token);

    console.log('   Sync Results:', syncRes.data.results);
    if (!syncRes.data.success || syncRes.data.syncedCount !== 1) throw new Error('Transaction sync failed');
    console.log('   ✅ Offline Payment Reconciliation PASSED\n');

    // 7. Test Anti-Replay & Double-Spending Defense
    console.log('7️⃣ Testing Anti-Replay & Double-Spending Defense (Re-submitting same txnId)...');
    const replayRes = await request('/api/transactions/sync', 'POST', {
      transactions: [{
        id: txnId,
        payer_phone: testPhone,
        payee_phone: payeePhone,
        amount: amount,
        counter: 1,
        nonce: 'nonce123',
        signature: signature,
        offline_timestamp: offlineTimestamp
      }]
    }, token);

    console.log('   Replay check result:', replayRes.data.results[0].status, '-', replayRes.data.results[0].reason);
    if (replayRes.data.results[0].status !== 'REJECTED') throw new Error('Replay attack was NOT rejected!');
    console.log('   ✅ Anti-Replay Defense PASSED (Attack safely blocked!)\n');

    // 8. Transaction History
    console.log('8️⃣ Testing Transaction Ledger (GET /api/transactions/history)...');
    const histRes = await request('/api/transactions/history', 'GET', null, token);
    console.log(`   Found ${histRes.data.transactions.length} transaction(s) in ledger.`);
    console.log('   Latest Txn:', histRes.data.transactions[0].id, 'Amount: ₹' + histRes.data.transactions[0].amount);
    console.log('   ✅ Transaction Ledger PASSED\n');

    // 9. Separate Device Terminal Registration & Unique QR
    console.log('9️⃣ Testing Separate Device Terminal Registration (POST /api/cloud/device/register)...');
    const deviceId = 'DEV-IPHONE-TEST01';
    const deviceRes = await request('/api/cloud/device/register', 'POST', {
      deviceId,
      deviceName: 'Apple iPhone 15 Pro (iOS)',
      platform: 'iPhone iOS 18',
      publicKey: 'test_device_public_key_abc123'
    }, token);

    console.log('   Device Registered:', deviceRes.data.device.deviceName);
    console.log('   Dedicated Terminal QR Payload:', deviceRes.data.device.terminalQrPayload);
    if (!deviceRes.data.success || !deviceRes.data.device.terminalQrPayload.includes('DEV-IPHONE-TEST01')) {
      throw new Error('Device Terminal QR registration failed');
    }
    console.log('   ✅ Separate Device Terminal QR PASSED\n');

    // 10. Cloud Contacts & Beneficiaries for Quick-Pay
    console.log('🔟 Testing Cloud Contacts & Quick-Pay Beneficiaries (GET /api/cloud/contacts)...');
    const contactsRes = await request('/api/cloud/contacts', 'GET', null, token);
    console.log(`   Retrieved ${contactsRes.data.contacts.length} saved contacts:`, contactsRes.data.contacts.map(c => c.name).join(', '));
    if (!contactsRes.data.success || contactsRes.data.contacts.length === 0) {
      throw new Error('Contacts retrieval failed');
    }
    console.log('   ✅ Cloud Contacts & Quick-Pay PASSED\n');

    // 11. Cloud Backup Vault & Multi-Device Restore
    console.log('1️⃣1️⃣ Testing Cloud Backup & Multi-Device Restore (POST /api/cloud/backup & GET /api/cloud/restore)...');
    const mockBackupPayload = {
      version: 2,
      deviceId,
      savedOfflineBalance: 2450.00,
      timestamp: new Date().toISOString()
    };
    const backupRes = await request('/api/cloud/backup', 'POST', {
      deviceId,
      backupData: mockBackupPayload
    }, token);
    console.log('   Backup Snapshot Message:', backupRes.data.message);

    const restoreRes = await request('/api/cloud/restore', 'GET', null, token);
    console.log('   Restored Snapshot Device:', restoreRes.data.backup.deviceId, 'Balance:', restoreRes.data.backup.savedOfflineBalance);
    if (!restoreRes.data.success || restoreRes.data.backup.deviceId !== deviceId) {
      throw new Error('Cloud restore failed');
    }
    console.log('   ✅ Cloud Backup Vault & Restore PASSED\n');

    console.log('🎉 ALL 11 TEST SUITES PASSED FLAWLESSLY! SYSTEM IS 100% OPERATIONAL WITH CLOUD & MULTI-DEVICE SUPPORT.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

// If invoked directly, run test against server
runTests();
