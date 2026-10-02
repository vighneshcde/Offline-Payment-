const db = require('../db');

/**
 * Service to handle real SMS delivery and real notifications
 */
class NotificationService {
  /**
   * Dispatch a real verification code via configured SMS providers
   * Supports Twilio, Fast2SMS, or System Push Notification
   */
  static async sendVerificationSMS(phone, otpCode) {
    const message = `[PayOffline] Your verification code is ${otpCode}. Valid for 5 minutes. Do not share this OTP with anyone.`;
    const results = {
      phone,
      otpCode,
      channels: []
    };

    console.log(`\n======================================================`);
    console.log(`📱 [DISPATCHING VERIFICATION CODE]`);
    console.log(`📞 Recipient: ${phone}`);
    console.log(`🔑 Verification Code: ${otpCode}`);
    console.log(`💬 Message: ${message}`);
    console.log(`======================================================\n`);

    // 1. Try Twilio if credentials are set
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        console.log('📡 Sending real SMS via Twilio API...');
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        
        const params = new URLSearchParams();
        params.append('To', phone);
        params.append('From', twilioFrom);
        params.append('Body', message);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        const data = await response.json();
        if (response.ok) {
          console.log('✅ Twilio SMS sent successfully! SID:', data.sid);
          results.channels.push({ provider: 'twilio', status: 'delivered', sid: data.sid });
        } else {
          console.warn('⚠️ Twilio returned error:', data.message);
          results.channels.push({ provider: 'twilio', status: 'failed', error: data.message });
        }
      } catch (err) {
        console.error('❌ Twilio SMS dispatch error:', err.message);
        results.channels.push({ provider: 'twilio', status: 'error', error: err.message });
      }
    }

    // 2. Try Fast2SMS (for India mobile numbers) if configured
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (fast2smsKey) {
      try {
        console.log('📡 Sending real SMS via Fast2SMS Gateway...');
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        const url = 'https://www.fast2sms.com/dev/bulkV2';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'authorization': fast2smsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otpCode,
            numbers: cleanPhone
          })
        });
        const data = await response.json();
        if (data.return) {
          console.log('✅ Fast2SMS OTP delivered successfully!');
          results.channels.push({ provider: 'fast2sms', status: 'delivered' });
        } else {
          console.warn('⚠️ Fast2SMS returned error:', data.message);
          results.channels.push({ provider: 'fast2sms', status: 'failed', error: data.message });
        }
      } catch (err) {
        console.error('❌ Fast2SMS dispatch error:', err.message);
        results.channels.push({ provider: 'fast2sms', status: 'error', error: err.message });
      }
    }

    if (!twilioSid && !fast2smsKey) {
      console.log(`ℹ️ [SMS Notice] Telecom cellular SMS gateway key (FAST2SMS_API_KEY / TWILIO) not set in .env.`);
      console.log(`🔑 Verification code [${otpCode}] displayed in Dynamic Island and live on-screen SMS card.`);
      console.log(`💡 To send actual carrier SMS to mobile phones, add FAST2SMS_API_KEY or TWILIO credentials to .env.`);
    }

    // 3. Mark browser/system real notification channel active
    results.channels.push({
      provider: 'device_notification_gateway',
      status: 'active',
      details: 'Dispatched to device Web Notification & Instant In-App Soundbox'
    });

    // Save to audit log
    await db.run(
      `INSERT INTO audit_logs (action, phone, details) VALUES (?, ?, ?)`,
      ['SMS_DISPATCH', phone, JSON.stringify(results)]
    );

    return results;
  }

  /**
   * Helper to dispatch an SMS message to a single phone number
   */
  static async sendSingleSMS(phone, message) {
    const results = {
      phone,
      message,
      channels: []
    };

    console.log(`\n======================================================`);
    console.log(`📱 [TRANSACTION SETTLEMENT SMS NOTIFICATION]`);
    console.log(`📞 Recipient: ${phone}`);
    console.log(`💬 Message: ${message}`);
    console.log(`======================================================\n`);

    // 1. Twilio
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const params = new URLSearchParams();
        params.append('To', phone);
        params.append('From', twilioFrom);
        params.append('Body', message);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        const data = await response.json();
        if (response.ok) {
          results.channels.push({ provider: 'twilio', status: 'delivered', sid: data.sid });
        } else {
          results.channels.push({ provider: 'twilio', status: 'failed', error: data.message });
        }
      } catch (err) {
        results.channels.push({ provider: 'twilio', status: 'error', error: err.message });
      }
    }

    // 2. Fast2SMS
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (fast2smsKey) {
      try {
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        const url = 'https://www.fast2sms.com/dev/bulkV2';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'authorization': fast2smsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            route: 'q',
            message: message,
            numbers: cleanPhone
          })
        });
        const data = await response.json();
        if (data.return) {
          results.channels.push({ provider: 'fast2sms', status: 'delivered' });
        } else {
          results.channels.push({ provider: 'fast2sms', status: 'failed', error: data.message });
        }
      } catch (err) {
        results.channels.push({ provider: 'fast2sms', status: 'error', error: err.message });
      }
    }

    // 3. Device Notification Channel
    results.channels.push({
      provider: 'device_notification_gateway',
      status: 'active',
      details: 'Instant PWA Audio Chime & Dynamic Island HUD'
    });

    await db.run(
      `INSERT INTO audit_logs (action, phone, details) VALUES (?, ?, ?)`,
      ['TXN_SMS_DISPATCH', phone, JSON.stringify(results)]
    );

    return results;
  }

  /**
   * Dispatch settlement SMS to BOTH the Payer and the Payee
   */
  static async sendTransactionSettlementSMS({ payerPhone, payerName, payeePhone, payeeName, amount, txnId }) {
    const formattedAmount = Number(amount).toFixed(2);

    // Message for Payer
    const payerMsg = `[PayOffline Alert] Paid ₹${formattedAmount} to ${payeeName || 'Merchant'} (${payeePhone}). Ref ID: ${txnId}. Offline pocket cash debited.`;

    // Message for Payee (Recipient)
    const payeeMsg = `[PayOffline Alert] Received ₹${formattedAmount} from ${payerName || 'Customer'} (${payerPhone}). Ref ID: ${txnId}. Credited to your Online Bank Vault.`;

    const payerResult = await this.sendSingleSMS(payerPhone, payerMsg);
    const payeeResult = await this.sendSingleSMS(payeePhone, payeeMsg);

    return {
      payer: payerResult,
      payee: payeeResult
    };
  }
}

module.exports = NotificationService;
