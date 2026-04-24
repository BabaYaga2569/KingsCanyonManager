const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const { Resend } = require('resend');

admin.initializeApp();

// ── Resend client (used for all customer/employee emails) ──────────────────
// API key stored in Firebase Secret: RESEND_API_KEY
// From address: Kings Canyon Landscaping <noreply@getkoaops.com>
const RESEND_FROM = 'Kings Canyon Landscaping <noreply@getkoaops.com>';
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY secret not set');
  return new Resend(apiKey);
}

/**
 * Send an email via Resend
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} html - HTML body
 * @param {Array} attachments - optional [{filename, content (Buffer), contentType}]
 */
async function sendViaResend(to, subject, html, attachments = []) {
  const resend = getResendClient();
  const payload = {
    from: RESEND_FROM,
    to,
    subject,
    html,
  };
  if (attachments.length > 0) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: a.content, // Buffer or base64 string
    }));
  }
  const result = await resend.emails.send(payload);
  if (result.error) throw new Error(result.error.message || 'Resend error');
  return result;
}

// ========================= CARRIER GATEWAY MAP =========================
const CARRIER_GATEWAYS = {
  tmobile: '@tmomail.net',
  att: '@txt.att.net',
  verizon: '@vtext.com',
  cricket: '@sms.cricketwireless.net',
  mint: '@tmomail.net',       // Mint runs on T-Mobile
  metro: '@mymetropcs.com',   // Metro by T-Mobile
  boost: '@sms.myboostmobile.com',
  uscellular: '@email.uscc.net',
  visible: '@vtext.com',      // Visible runs on Verizon
};

/**
 * Get SMS gateway email address for a phone number + carrier
 */
function getSMSGateway(phone, carrier) {
  const digits = (phone || '').replace(/\D/g, '');
  const number = digits.length > 10 ? digits.slice(-10) : digits;
  const gateway = CARRIER_GATEWAYS[carrier] || CARRIER_GATEWAYS.tmobile;
  return `${number}${gateway}`;
}

/**
 * Create a Nodemailer transporter from settings
 */
function createTransporter(gmailEmail, gmailAppPassword) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailEmail, pass: gmailAppPassword },
  });
}

/**
 * Send email-to-SMS to a single recipient
 */
async function sendEmailToSMS(transporter, fromEmail, toGateway, message) {
  const mailOptions = {
    from: fromEmail,
    to: toGateway,
    subject: 'Kings Canyon',
    text: message,
  };

  return await transporter.sendMail(mailOptions);
}

/**
 * Helper: Send notification to ALL admin phones
 */
async function sendToAllAdmins(settings, message, type, metadata = {}) {
  const adminPhones = settings.adminPhones || [];

  // ── Pushover (preferred — always try first) ───────────────────────────────
  const PUSHOVER_TOKEN = 'aka88i2ehjtm4r47d3zuqz7bhionvu';
  const PUSHOVER_USER  = 'gnh1nvir8hovia25ohsdoq2ys8x1n3';

  try {
    const fetch = require('node-fetch');
    const resp = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: PUSHOVER_TOKEN,
        user:  PUSHOVER_USER,
        message,
        priority: '0',
      }).toString(),
    });
    const result = await resp.json();
    console.log('Pushover sent:', result.status === 1 ? 'OK' : JSON.stringify(result));

    await admin.firestore().collection('notifications_log').add({
      type,
      message,
      status: result.status === 1 ? 'sent' : 'failed',
      channel: 'pushover',
      sentAt: new Date().toISOString(),
      metadata,
    });

    return { success: true, channel: 'pushover' };
  } catch (err) {
    console.error('Pushover error, falling back to SMS gateway:', err.message);
  }

  // ── SMS-to-email gateway (fallback) ──────────────────────────────────────
  const transporter = createTransporter(settings.gmailEmail, settings.gmailAppPassword);
  const results = [];

  for (const adminEntry of adminPhones) {
    const gateway = getSMSGateway(adminEntry.phone, adminEntry.carrier || 'tmobile');

    try {
      await sendEmailToSMS(transporter, settings.gmailEmail, gateway, message);
      console.log(`Sent to ${adminEntry.name} (${gateway})`);

      await admin.firestore().collection('notifications_log').add({
        to: adminEntry.phone,
        toName: adminEntry.name,
        toGateway: gateway,
        message,
        type,
        status: 'sent',
        sentAt: new Date().toISOString(),
        metadata,
      });

      results.push({ name: adminEntry.name, success: true });
    } catch (error) {
      console.error(`Failed to send to ${adminEntry.name}:`, error.message);

      await admin.firestore().collection('notifications_log').add({
        to: adminEntry.phone,
        toName: adminEntry.name,
        toGateway: gateway,
        message,
        type,
        status: 'failed',
        sentAt: new Date().toISOString(),
        error: error.message,
        metadata,
      });

      results.push({ name: adminEntry.name, success: false, error: error.message });
    }
  }

  transporter.close();
  return { success: true, results };
}

/**
 * Get notification settings from Firestore
 */
async function getSettings() {
  const snap = await admin.firestore().collection('notification_settings').limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

// ========================= RECEIPT SCANNER (Claude Vision) =========================

/**
 * Detect image media type from base64 prefix bytes.
 * Defaults to image/jpeg if unrecognized.
 */
function detectMediaType(base64String) {
  const prefix = base64String.substring(0, 16);
  if (prefix.startsWith('/9j/'))        return 'image/jpeg';
  if (prefix.startsWith('iVBORw0KGgo')) return 'image/png';
  if (prefix.startsWith('UklGR'))       return 'image/webp';
  if (prefix.startsWith('R0lGOD'))      return 'image/gif';
  return 'image/jpeg'; // safe default for phone camera shots
}

// ========================= RECEIPT SCANNER (Claude Vision - Multi-Image) =========================

exports.scanReceipt = functions.runWith({ secrets: ['ANTHROPIC_API_KEY'] }).https.onCall(async (data, context) => {
  console.log('>>> SCAN STARTED (Claude Vision - Multi-Image)');

  try {
    // Accept images[] array (new multi-scan) OR single image string (legacy fallback)
    const images = data.images
      ? data.images
      : data.image
        ? [data.image]
        : null;

    if (!images || images.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'At least one image is required');
    }

    console.log(`>>> Image count: ${images.length}`);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Add ANTHROPIC_API_KEY to functions/.env'
      );
    }

    const prompt = `You are a receipt scanner for a landscaping company. Analyze ${images.length > 1 ? `these ${images.length} photos of the SAME receipt (provided in order from top to bottom — treat them as one continuous receipt)` : 'this receipt image'} carefully and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

Use this exact structure:
{
  "vendor": "store name",
  "amount": 0.00,
  "subtotal": 0.00,
  "tax": 0.00,
  "date": "YYYY-MM-DD",
  "receiptNumber": "",
  "category": "materials",
  "lineItems": [
    { "item": "item name", "quantity": "1", "price": 0.00 }
  ],
  "description": "short comma-separated summary of top items",
  "rawText": "full text you read from the receipt"
}

Rules:
- amount = the final total the customer paid (after tax)
- subtotal = pre-tax total (0 if not shown)
- tax = tax amount (0 if not shown)
- date must be YYYY-MM-DD format; use today's date if not found
- receiptNumber = transaction/receipt number if visible, otherwise ""
- category: choose the best fit from: materials, fuel, equipment, food, other
- lineItems: list every individual item purchased with its price; quantity as a string
- description: comma-separated list of the first 5 item names
- rawText: transcribe all text you can read from the receipt
- Return ONLY the JSON object, absolutely nothing else`;

    // Build content blocks — one image block per photo, then the text prompt at the end
    const contentBlocks = images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: detectMediaType(img),
        data: img,
      },
    }));
    contentBlocks.push({ type: 'text', text: prompt });

    console.log('>>> Calling Anthropic API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('>>> Anthropic API HTTP error:', response.status, errText);
      throw new functions.https.HttpsError('internal', `Claude API error ${response.status}: ${errText}`);
    }

    const claudeResult = await response.json();
    console.log('>>> Anthropic response received, stop_reason:', claudeResult.stop_reason);

    const rawOutput = claudeResult.content?.[0]?.text || '';
    console.log('>>> Claude raw output:');
    console.log(rawOutput);
    console.log('-'.repeat(80));

    let parsed;
    try {
      parsed = JSON.parse(rawOutput.trim());
    } catch (parseErr) {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error('>>> JSON parse failed. Raw output was:', rawOutput);
        throw new Error('Claude did not return valid JSON. Raw: ' + rawOutput.substring(0, 200));
      }
    }

    // Ensure numeric fields are actually numbers (defensive)
    parsed.amount    = parseFloat(parsed.amount)    || 0;
    parsed.subtotal  = parseFloat(parsed.subtotal)  || 0;
    parsed.tax       = parseFloat(parsed.tax)       || 0;
    parsed.lineItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];

    console.log(`>>> SUCCESS: vendor=${parsed.vendor}, total=${parsed.amount}, items=${parsed.lineItems.length}`);
    return { success: true, ...parsed };

  } catch (error) {
    console.error('>>> SCAN FAILED:', error.message);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.testFunction = functions.https.onCall(async () => {
  return { success: true, message: 'Working v14!', timestamp: new Date().toISOString() };
});

// ========================= EMPLOYEE INVITE SYSTEM =========================

/**
 * Generate a cryptographically random token
 */
function generateInviteToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * sendEmployeeInvite
 * Creates an invite token in Firestore and emails the employee a signup link.
 * Called by admin from EmployeeAccountManager.
 */
exports.sendEmployeeInvite = functions.runWith({ secrets: ["RESEND_API_KEY"] }).https.onCall(async (data, context) => {
  console.log('>>> sendEmployeeInvite called for:', data.email);

  try {
    // Must be called by an authenticated admin or god
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const {
      name, email, role, jobTitle, phoneNumber,
      employmentType, hourlyRate, annualSalary, paySchedule,
      requireGps, invitedBy, resend,
    } = data;

    if (!name || !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Name and email are required');
    }

    // Check if user already exists in Firebase Auth
    try {
      const existing = await admin.auth().getUserByEmail(email.toLowerCase());
      if (existing && !resend) {
        throw new functions.https.HttpsError(
          'already-exists',
          'An account with this email already exists. Use Resend Invite if they need a new link.'
        );
      }
    } catch (authErr) {
      if (authErr.code === 'auth/user-not-found') {
        // Good — no account yet, proceed
      } else if (authErr instanceof functions.https.HttpsError) {
        throw authErr;
      }
      // Other errors — proceed anyway
    }

    // Invalidate any existing unused invites for this email
    const existingInvites = await admin.firestore()
      .collection('invites')
      .where('email', '==', email.toLowerCase())
      .where('used', '==', false)
      .get();

    for (const inviteDoc of existingInvites.docs) {
      await inviteDoc.ref.update({ used: true, invalidatedAt: new Date().toISOString() });
    }

    // Create new invite token
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

    await admin.firestore().collection('invites').doc(token).set({
      token,
      name,
      email: email.toLowerCase(),
      role: role || 'crew',
      jobTitle: jobTitle || 'Crew Member',
      phoneNumber: phoneNumber || '',
      employmentType: employmentType || 'hourly',
      hourlyRate: hourlyRate || 0,
      annualSalary: annualSalary || 0,
      paySchedule: paySchedule || 'semi-monthly',
      requireGps: requireGps !== false,
      invitedBy: invitedBy || context.auth.uid,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    console.log('>>> Invite token created:', token.substring(0, 8) + '...');

    // Get company settings for the email
    const settings = await getSettings();
    const appUrl = 'https://landscape-manager-8dad0.web.app';
    const inviteUrl = `${appUrl}/public/invite/${token}`;

    // Send invite email via Resend
    try {
      await sendViaResend(
        email,
        `You're invited to join Kings Canyon Landscaping`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2e7d32; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0;">KCL Manager</h1>
              <p style="color: #c8e6c9; margin: 8px 0 0;">Kings Canyon Landscaping</p>
            </div>
            <div style="padding: 32px 24px;">
              <h2 style="color: #212121;">Hi ${name},</h2>
              <p style="color: #546e7a; font-size: 16px;">
                You've been invited to join the Kings Canyon Landscaping team on KCL Manager.
              </p>
              <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 4px 0;"><strong>Role:</strong> ${role === 'admin' ? 'Admin' : 'Crew Member'}</p>
                <p style="margin: 4px 0;"><strong>Job Title:</strong> ${jobTitle || 'Crew Member'}</p>
                <p style="margin: 4px 0;"><strong>Pay Type:</strong> ${employmentType === 'salary' ? 'Salary' : 'Hourly'}</p>
              </div>
              <p style="color: #546e7a;">
                Click the button below to create your password and set up your account.
                This link expires in <strong>72 hours</strong>.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}"
                   style="background: #2e7d32; color: white; padding: 14px 32px; border-radius: 6px;
                          text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
                  Set Up My Account
                </a>
              </div>
              <p style="color: #9e9e9e; font-size: 13px;">
                If the button doesn't work, copy this link into your browser:<br/>
                <a href="${inviteUrl}" style="color: #2e7d32;">${inviteUrl}</a>
              </p>
              <p style="color: #9e9e9e; font-size: 13px;">
                After setting your password, you will be asked to sign a company NDA before accessing the app.
              </p>
            </div>
            <div style="background: #f5f5f5; padding: 16px; text-align: center;">
              <p style="color: #9e9e9e; font-size: 12px; margin: 0;">
                Kings Canyon Landscaping LLC — Bullhead City, AZ
              </p>
            </div>
          </div>
        `
      );
      console.log('>>> Invite email sent via Resend to:', email);
    } catch (emailErr) {
      console.error('>>> Resend invite email failed:', emailErr.message);
      // Don't throw — token was created successfully, log the failure
    }

    // Log the invite
    await admin.firestore().collection('notifications_log').add({
      type: 'employee_invite',
      to: email,
      toName: name,
      status: settings?.gmailConfigured ? 'sent' : 'token_only',
      sentAt: new Date().toISOString(),
      inviteToken: token.substring(0, 8) + '...',
    });

    return {
      success: true,
      message: settings?.gmailConfigured
        ? `Invite email sent to ${email}`
        : `Invite token created but Gmail not configured — share this link manually: ${inviteUrl}`,
      inviteUrl,
    };
  } catch (error) {
    console.error('>>> sendEmployeeInvite error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * createEmployeeManually
 * Creates a Firebase Auth account + Firestore user doc via Admin SDK.
 * Does NOT sign out the calling user. Sends a welcome email with temp credentials.
 * Sets mustChangePassword: true so they are forced to change on first login.
 */
exports.createEmployeeManually = functions.runWith({ secrets: ["RESEND_API_KEY"] }).https.onCall(async (data, context) => {
  console.log('>>> createEmployeeManually called for:', data.email);

  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    // Only god or admin can create employees manually
    const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (!['god', 'admin'].includes(callerRole)) {
      throw new functions.https.HttpsError('permission-denied', 'Only god or admin can create employees');
    }

    const {
      name, email, tempPassword, role, jobTitle, phoneNumber,
      employmentType, hourlyRate, annualSalary, paySchedule, requireGps,
    } = data;

    if (!name || !email || !tempPassword) {
      throw new functions.https.HttpsError('invalid-argument', 'Name, email, and temp password are required');
    }
    if (tempPassword.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Temp password must be at least 6 characters');
    }

    // Create Firebase Auth account via Admin SDK — does NOT affect current user session
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: email.toLowerCase(),
        password: tempPassword,
        displayName: name,
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-in-use') {
        throw new functions.https.HttpsError('already-exists', 'An account with this email already exists.');
      }
      throw authErr;
    }

    // Create Firestore user doc
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      name,
      email: email.toLowerCase(),
      role: role || 'crew',
      jobTitle: jobTitle || 'Crew Member',
      phoneNumber: phoneNumber || '',
      employmentType: employmentType || 'hourly',
      hourlyRate: employmentType === 'hourly' ? parseFloat(hourlyRate) || 0 : 0,
      annualSalary: employmentType === 'salary' ? parseFloat(annualSalary) || 0 : 0,
      paySchedule: paySchedule || 'semi-monthly',
      requireGps: requireGps !== false,
      createdAt: new Date().toISOString(),
      createdBy: context.auth.uid,
      active: true,
      firstLogin: true,
      mustChangePassword: true,
      ndaSigned: false,
      ndaSignedDate: null,
      ndaSignatureUrl: null,
      startDate: new Date().toISOString(),
    });

    console.log('>>> User doc created for:', userRecord.uid);

    // Send welcome email with temp credentials via Resend
    const appUrl = 'https://landscape-manager-8dad0.web.app';
    let emailSent = false;
    try {
      await sendViaResend(
        email,
        `Your KCL Manager Account is Ready`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2e7d32; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0;">KCL Manager</h1>
              <p style="color: #c8e6c9; margin: 8px 0 0;">Kings Canyon Landscaping</p>
            </div>
            <div style="padding: 32px 24px;">
              <h2 style="color: #212121;">Hi ${name},</h2>
              <p style="color: #546e7a; font-size: 16px;">
                Your KCL Manager account has been created. Use the credentials below to log in.
              </p>
              <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #2e7d32;">
                <p style="margin: 6px 0; font-size: 15px;"><strong>Login Link:</strong> <a href="${appUrl}" style="color: #2e7d32;">${appUrl}</a></p>
                <p style="margin: 6px 0; font-size: 15px;"><strong>Email:</strong> ${email.toLowerCase()}</p>
                <p style="margin: 6px 0; font-size: 15px;"><strong>Temporary Password:</strong> <code style="background:#e8f5e9;padding:2px 6px;border-radius:4px;font-size:15px;">${tempPassword}</code></p>
              </div>
              <div style="background: #fff3e0; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #f57c00;">
                <p style="margin: 0; color: #e65100; font-weight: bold;">⚠️ You will be asked to create a new password on your first login.</p>
              </div>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}"
                   style="background: #2e7d32; color: white; padding: 14px 32px; border-radius: 6px;
                          text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
                  Go to KCL Manager
                </a>
              </div>
              <p style="color: #9e9e9e; font-size: 13px;">
                After changing your password, you will be asked to sign a company NDA before accessing the app.
              </p>
            </div>
            <div style="background: #f5f5f5; padding: 16px; text-align: center;">
              <p style="color: #9e9e9e; font-size: 12px; margin: 0;">
                Kings Canyon Landscaping LLC — Bullhead City, AZ
              </p>
            </div>
          </div>
        `
      );
      emailSent = true;
      console.log('>>> Welcome email sent via Resend to:', email);
    } catch (emailErr) {
      console.error('>>> Resend welcome email failed:', emailErr.message);
    }

    return {
      success: true,
      uid: userRecord.uid,
      emailSent,
    };

  } catch (error) {
    console.error('>>> createEmployeeManually error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * acceptEmployeeInvite
 * Validates the invite token, creates the Firebase Auth user (via Admin SDK),
 * creates the Firestore user document, and marks the invite as used.
 * Called from the public InviteSignup page.
 */
exports.acceptEmployeeInvite = functions.https.onCall(async (data) => {
  console.log('>>> acceptEmployeeInvite called');

  try {
    const { token, password } = data;

    if (!token || !password) {
      throw new functions.https.HttpsError('invalid-argument', 'Token and password are required');
    }

    if (password.length < 8) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters');
    }

    // Load and validate the invite
    const inviteRef = admin.firestore().collection('invites').doc(token);
    const inviteSnap = await inviteRef.get();

    if (!inviteSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Invalid invite link');
    }

    const invite = inviteSnap.data();

    if (invite.used) {
      throw new functions.https.HttpsError('failed-precondition', 'This invite has already been used');
    }

    if (new Date(invite.expiresAt) < new Date()) {
      throw new functions.https.HttpsError('failed-precondition', 'This invite link has expired. Ask your manager to send a new one.');
    }

    console.log('>>> Creating Firebase Auth user for:', invite.email);

    // Create Firebase Auth user using Admin SDK (no re-auth issue)
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: invite.email,
        password,
        displayName: invite.name,
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        // Account exists — just update password and get the record
        userRecord = await admin.auth().getUserByEmail(invite.email);
        await admin.auth().updateUser(userRecord.uid, { password });
        console.log('>>> Updated password for existing user:', invite.email);
      } else {
        throw authErr;
      }
    }

    console.log('>>> Firebase Auth user created/updated:', userRecord.uid);

    // Create Firestore user document
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      name: invite.name,
      email: invite.email,
      role: invite.role || 'crew',
      jobTitle: invite.jobTitle || 'Crew Member',
      phoneNumber: invite.phoneNumber || '',
      employmentType: invite.employmentType || 'hourly',
      hourlyRate: invite.hourlyRate || 0,
      annualSalary: invite.annualSalary || 0,
      paySchedule: invite.paySchedule || 'semi-monthly',
      requireGps: invite.requireGps !== false,
      active: true,
      firstLogin: true,
      ndaSigned: false,
      ndaSignedDate: null,
      invitedBy: invite.invitedBy || null,
      createdAt: new Date().toISOString(),
      createdViaInvite: true,
    }, { merge: true }); // merge:true so re-invites don't wipe existing data

    console.log('>>> Firestore user document created for UID:', userRecord.uid);

    // Mark invite as used
    await inviteRef.update({
      used: true,
      usedAt: new Date().toISOString(),
      createdUserId: userRecord.uid,
    });

    return { success: true, message: 'Account created successfully' };
  } catch (error) {
    console.error('>>> acceptEmployeeInvite error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========================= ADMIN EMPLOYEE MANAGEMENT =========================

/**
 * adminResetPassword
 * Sends a password reset email via your Gmail (not Firebase's spam-prone address)
 * Called from EmployeeAccountManager Reset Password button
 */
exports.adminResetPassword = functions.runWith({ secrets: ["RESEND_API_KEY"] }).https.onCall(async (data, context) => {
  console.log('>>> adminResetPassword called');

  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { email, employeeName } = data;
    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Email is required');
    }

    // Verify employee exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email.toLowerCase());
    } catch (err) {
      throw new functions.https.HttpsError('not-found', 'No account found for this email address');
    }

    // Generate a password reset link via Admin SDK
    const resetLink = await admin.auth().generatePasswordResetLink(email.toLowerCase());

    // Send password reset email via Resend
    try {
      await sendViaResend(
        email,
        'Reset Your KCL Manager Password',
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2e7d32; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">KCL Manager</h1>
            <p style="color: #c8e6c9; margin: 8px 0 0;">Kings Canyon Landscaping</p>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #212121;">Hi ${employeeName || 'there'},</h2>
            <p style="color: #546e7a; font-size: 16px;">
              Your manager has requested a password reset for your KCL Manager account.
            </p>
            <p style="color: #546e7a;">
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}"
                 style="background: #2e7d32; color: white; padding: 14px 32px; border-radius: 6px;
                        text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
                Reset My Password
              </a>
            </div>
            <p style="color: #9e9e9e; font-size: 13px;">
              If the button doesn't work, copy this link into your browser:<br/>
              <a href="${resetLink}" style="color: #2e7d32;">${resetLink}</a>
            </p>
            <p style="color: #9e9e9e; font-size: 13px;">
              If you didn't request this, please contact your manager.
            </p>
          </div>
          <div style="background: #f5f5f5; padding: 16px; text-align: center;">
            <p style="color: #9e9e9e; font-size: 12px; margin: 0;">
              Kings Canyon Landscaping LLC — Bullhead City, AZ
            </p>
          </div>
        </div>
        `
      );
      console.log('>>> Password reset email sent via Resend to:', email);
    } catch (emailErr) {
      throw new functions.https.HttpsError('internal', 'Failed to send reset email: ' + emailErr.message);
    }

    return { success: true, message: `Password reset email sent to ${email}` };
  } catch (error) {
    console.error('>>> adminResetPassword error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * adminDeleteAndReinvite
 * Cleanly removes employee from Firebase Auth + marks old invites used,
 * then creates a fresh invite and sends the email.
 * Use when an employee is stuck in a broken state.
 */
exports.adminDeleteAndReinvite = functions.runWith({ secrets: ["RESEND_API_KEY"] }).https.onCall(async (data, context) => {
  console.log('>>> adminDeleteAndReinvite called');

  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { email, name, role, jobTitle, phoneNumber, employmentType, hourlyRate, annualSalary, paySchedule, requireGps } = data;
    if (!email || !name) {
      throw new functions.https.HttpsError('invalid-argument', 'Email and name are required');
    }

    // Step 1: Delete Firebase Auth account if it exists
    try {
      const existingUser = await admin.auth().getUserByEmail(email.toLowerCase());
      await admin.auth().deleteUser(existingUser.uid);
      // Also delete Firestore user doc
      await admin.firestore().collection('users').doc(existingUser.uid).delete();
      console.log('>>> Deleted existing auth user:', email);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        console.warn('>>> Could not delete auth user (may not exist):', err.message);
      }
    }

    // Step 2: Mark all existing invites for this email as used
    const existingInvites = await admin.firestore()
      .collection('invites')
      .where('email', '==', email.toLowerCase())
      .get();

    for (const inviteDoc of existingInvites.docs) {
      await inviteDoc.ref.update({ used: true, invalidatedAt: new Date().toISOString(), invalidatedReason: 'adminDeleteAndReinvite' });
    }
    console.log('>>> Invalidated', existingInvites.size, 'existing invites for:', email);

    // Step 3: Create fresh invite token
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await admin.firestore().collection('invites').doc(token).set({
      token,
      name,
      email: email.toLowerCase(),
      role: role || 'crew',
      jobTitle: jobTitle || 'Crew Member',
      phoneNumber: phoneNumber || '',
      employmentType: employmentType || 'hourly',
      hourlyRate: hourlyRate || 0,
      annualSalary: annualSalary || 0,
      paySchedule: paySchedule || 'semi-monthly',
      requireGps: requireGps !== false,
      invitedBy: context.auth.uid,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt,
      isReinvite: true,
    });

    // Step 4: Send fresh invite email via Resend
    const settings = await getSettings();
    const appUrl = 'https://landscape-manager-8dad0.web.app';
    const inviteUrl = `${appUrl}/public/invite/${token}`;

    try {
      await sendViaResend(
        email,
        `Your KCL Manager account has been reset — new invite inside`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2e7d32; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0;">KCL Manager</h1>
              <p style="color: #c8e6c9; margin: 8px 0 0;">Kings Canyon Landscaping</p>
            </div>
            <div style="padding: 32px 24px;">
              <h2 style="color: #212121;">Hi ${name},</h2>
              <p style="color: #546e7a; font-size: 16px;">
                Your account has been reset. Use the button below to create a fresh account.
                This link expires in <strong>72 hours</strong>.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}"
                   style="background: #2e7d32; color: white; padding: 14px 32px; border-radius: 6px;
                          text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
                  Set Up My Account
                </a>
              </div>
              <p style="color: #9e9e9e; font-size: 13px;">
                If the button doesn't work, copy this link into your browser:<br/>
                <a href="${inviteUrl}" style="color: #2e7d32;">${inviteUrl}</a>
              </p>
            </div>
            <div style="background: #f5f5f5; padding: 16px; text-align: center;">
              <p style="color: #9e9e9e; font-size: 12px; margin: 0;">
                Kings Canyon Landscaping LLC — Bullhead City, AZ
              </p>
            </div>
          </div>
        `
      );
      console.log('>>> Reinvite email sent via Resend to:', email);
    } catch (emailErr) {
      console.error('>>> Resend reinvite email failed:', emailErr.message);
    }

    return { success: true, message: `Account reset and fresh invite sent to ${email}`, inviteUrl };
  } catch (error) {
    console.error('>>> adminDeleteAndReinvite error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========================= SET EMPLOYEE AUTH STATUS =========================

exports.setEmployeeAuthStatus = functions.https.onCall(async (data, context) => {
  console.log('>>> setEmployeeAuthStatus called');
  try {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const callerRole = callerDoc.exists ? callerDoc.data().role : null;
    if (!['god', 'admin'].includes(callerRole)) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const { uid, disabled } = data;
    if (!uid || typeof disabled !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'uid and disabled (boolean) required');
    }

    // Disable/enable the Firebase Auth account
    await admin.auth().updateUser(uid, { disabled });

    // If disabling, revoke all refresh tokens so any active sessions are immediately invalidated
    if (disabled) {
      await admin.auth().revokeRefreshTokens(uid);
      console.log('>>> Refresh tokens revoked for ' + uid);
    }

    console.log('>>> Auth account ' + uid + ' set to disabled=' + disabled);
    return { success: true };
  } catch (error) {
    console.error('>>> setEmployeeAuthStatus error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========================= NOTIFICATION FUNCTIONS (EMAIL-TO-SMS) =========================

exports.sendNotification = functions.https.onCall(async (data, context) => {
  console.log('>>> sendNotification called');

  try {
    const { message, type, metadata } = data;
    if (!message) throw new functions.https.HttpsError('invalid-argument', 'Message is required');

    const settings = await getSettings();
    if (!settings) throw new functions.https.HttpsError('failed-precondition', 'Notification settings not found');

    if (!settings.gmailConfigured || !settings.gmailEmail || !settings.gmailAppPassword) {
      throw new functions.https.HttpsError('failed-precondition', 'Gmail not configured. Go to SMS Settings to set up.');
    }

    const result = await sendToAllAdmins(settings, message, type || 'general', metadata || {});
    return result;
  } catch (error) {
    console.error('>>> sendNotification error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.sendTestNotification = functions.https.onCall(async () => {
  console.log('>>> sendTestNotification called');

  try {
    const settings = await getSettings();
    if (!settings || !settings.gmailConfigured) throw new functions.https.HttpsError('failed-precondition', 'Gmail not configured');

    const adminPhones = settings.adminPhones || [];
    if (adminPhones.length === 0) throw new functions.https.HttpsError('failed-precondition', 'No admin phones configured');

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' });
    const message = `KCL Manager\nTest notification working!\n${now}`;
    return await sendToAllAdmins(settings, message, 'test', { test: true });
  } catch (error) {
    console.error('>>> sendTestNotification error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========================= DAILY CRON JOBS =========================

exports.dailyNotifications = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Phoenix')
  .onRun(async () => {
    console.log('Running daily notifications check...');

    try {
      const settings = await getSettings();
      if (!settings || !settings.gmailConfigured) return null;

      const messages = [];

      if (settings.paymentReminders?.enabled) {
        const daysBefore = settings.paymentReminders.daysBefore || 3;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        try {
          const invoicesSnap = await admin.firestore()
            .collection('invoices')
            .where('dueDate', '==', targetDateStr)
            .get();

          for (const invoiceDoc of invoicesSnap.docs) {
            const inv = invoiceDoc.data();
            const status = (inv.status || '').toLowerCase();
            if (status !== 'paid') {
              messages.push({
                text: `INVOICE DUE\n${inv.clientName || inv.customerName} - $${inv.total}\nDue: ${targetDateStr}`,
                type: 'payment_reminder',
                metadata: { invoiceId: invoiceDoc.id },
              });
            }
          }
        } catch (err) {
          console.error('Error checking payment reminders:', err);
        }

        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const overdueSnap = await admin.firestore()
            .collection('invoices')
            .where('dueDate', '<', todayStr)
            .get();

          for (const invoiceDoc of overdueSnap.docs) {
            const inv = invoiceDoc.data();
            const status = (inv.status || '').toLowerCase();
            if (status !== 'paid') {
              const daysOverdue = Math.floor((new Date() - new Date(inv.dueDate)) / 86400000);
              messages.push({
                text: `OVERDUE\n${inv.clientName || inv.customerName} - $${inv.total}\n${daysOverdue} days past due`,
                type: 'overdue_invoice',
                metadata: { invoiceId: invoiceDoc.id },
              });
            }
          }
        } catch (err) {
          console.error('Error checking overdue invoices:', err);
        }
      }

      if (settings.jobReminders?.enabled) {
        const daysBefore = settings.jobReminders.daysBefore || 1;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        try {
          const schedulesSnap = await admin.firestore()
            .collection('schedules')
            .where('startDate', '==', targetDateStr)
            .where('status', '==', 'scheduled')
            .get();

          for (const schedDoc of schedulesSnap.docs) {
            const sched = schedDoc.data();
            messages.push({
              text: `JOB TOMORROW\n${sched.clientName || 'Unknown'}\n${sched.startTime || '8:00 AM'}${sched.notes ? '\n' + sched.notes.substring(0, 40) : ''}`,
              type: 'job_reminder',
              metadata: { scheduleId: schedDoc.id },
            });
          }
        } catch (err) {
          console.error('Error checking job reminders:', err);
        }
      }

      for (const msg of messages) {
        await sendToAllAdmins(settings, msg.text, msg.type, msg.metadata);
      }

      return null;
    } catch (error) {
      console.error('Error in dailyNotifications:', error);
      return null;
    }
  });

exports.eveningJobReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('America/Phoenix')
  .onRun(async () => {
    console.log('Running evening job reminder...');

    try {
      const settings = await getSettings();
      if (!settings || !settings.gmailConfigured || !settings.jobReminders?.enabled) return null;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const schedulesSnap = await admin.firestore()
        .collection('schedules')
        .where('startDate', '==', tomorrowStr)
        .where('status', '==', 'scheduled')
        .get();

      if (schedulesSnap.empty) return null;

      const jobs = schedulesSnap.docs.map(d => d.data());
      let message = `TOMORROW (${jobs.length} job${jobs.length > 1 ? 's' : ''}):\n`;
      jobs.forEach(j => { message += `- ${j.clientName || 'Unknown'} ${j.startTime || ''}\n`; });

      await sendToAllAdmins(settings, message.trim(), 'evening_reminder', {
        date: tomorrowStr,
        jobCount: jobs.length,
      });

      return null;
    } catch (error) {
      console.error('Error in eveningJobReminder:', error);
      return null;
    }
  });

// ========================= CUSTOMER EMAIL FUNCTIONS =========================

exports.sendCustomerEmail = functions.runWith({ secrets: ["RESEND_API_KEY"], memory: "512MB" }).https.onCall(async (data, context) => {
  console.log('>>> sendCustomerEmail called');

  try {
    const {
      customerEmail,
      customerName,
      subject,
      htmlBody,
      pdfBase64,
      pdfFilename,
      docType,
      docId,
      metadata,
    } = data;

    if (!customerEmail || !subject) {
      throw new functions.https.HttpsError('invalid-argument', 'Email and subject are required');
    }

    // Build attachments array for Resend
    const attachments = [];
    if (pdfBase64 && pdfFilename) {
      attachments.push({
        filename: pdfFilename,
        content: Buffer.from(pdfBase64, 'base64'),
      });
    }

    // Send via Resend
    await sendViaResend(customerEmail, subject, htmlBody, attachments);

    await admin.firestore().collection('email_log').add({
      to: customerEmail,
      toName: customerName,
      subject,
      docType: docType || 'general',
      docId: docId || null,
      status: 'sent',
      sentAt: new Date().toISOString(),
      sentBy: context.auth?.uid || 'unknown',
      metadata: metadata || {},
    });

    const settings = await getSettings();
    if (settings?.adminPhones?.length > 0) {
      const adminMsg = `EMAIL SENT\n${docType?.toUpperCase() || 'Doc'} => ${customerName}\n${customerEmail}`;
      sendToAllAdmins(settings, adminMsg, 'email_sent', { docType, docId, customerEmail })
        .catch(err => console.error('Admin notify error:', err));
    }

    return { success: true, message: `Email sent to ${customerEmail}` };
  } catch (error) {
    console.error('>>> sendCustomerEmail error:', error);

    try {
      await admin.firestore().collection('email_log').add({
        to: data.customerEmail,
        toName: data.customerName,
        subject: data.subject,
        docType: data.docType || 'general',
        docId: data.docId || null,
        status: 'failed',
        error: error.message,
        sentAt: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error('Error logging email failure:', logErr);
    }

    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.notifySignature = functions.https.onCall(async (data) => {
  console.log('>>> notifySignature called');

  try {
    const { docType, docId, customerName, amount } = data;
    if (!docType || !docId || !customerName) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const settings = await getSettings();

    const typeLabel = docType === 'bid' ? 'BID ACCEPTED' : 'CONTRACT SIGNED';
    const amountStr = amount ? `\n$${parseFloat(amount).toFixed(2)}` : '';
    const message = `${typeLabel}\n${customerName}${amountStr}\nCheck the app for details`;

    await sendToAllAdmins(settings || {}, message, 'signature_received', { docType, docId, customerName });

    await admin.firestore().collection('notifications_log').add({
      type: 'signature_received',
      docType,
      docId,
      customerName,
      message,
      sentAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error('>>> notifySignature error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========================= BID AUTO-ARCHIVE =========================
// Runs daily at 9 AM Arizona time
// - Archives bids not edited in 30+ days (if not signed)
// - Sends Pushover warning at 23 days (7 days before auto-archive)

exports.autoBidArchive = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('America/Phoenix')
  .onRun(async (context) => {
    console.log('>>> autoBidArchive running');

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const twentyThreeDaysAgo = new Date(now.getTime() - 23 * 86400000);

      const bidsSnap = await admin.firestore().collection('bids').get();
      let archived = 0;
      let warned = 0;

      // Load Pushover settings
      const settingsSnap = await admin.firestore()
        .collection('notification_settings').limit(1).get();
      const settings = settingsSnap.empty ? null : settingsSnap.docs[0].data();

      const sendPushover = async (message) => {
        if (!settings || !settings.pushoverEnabled || !settings.pushoverApiKey || !settings.pushoverUserKey) return;
        try {
          const fetch = require('node-fetch');
          await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: settings.pushoverApiKey,
              user: settings.pushoverUserKey,
              title: 'KCL Bid Archive Notice',
              message,
              priority: 0,
            }),
          });
        } catch (e) {
          console.error('Pushover error:', e.message);
        }
      };

      for (const bidDoc of bidsSnap.docs) {
        const bid = bidDoc.data();

        // Skip already archived, signed, or cancelled bids
        if (bid.status === 'archived' || bid.status === 'cancelled') continue;
        if (bid.clientSignature && bid.contractorSignature) continue;
        if (bid.warningSent30) continue; // already warned, waiting for archive

        // Determine reference date (last edited or created)
        const refDate = bid.updatedAt
          ? new Date(bid.updatedAt)
          : bid.createdAt
          ? new Date(bid.createdAt)
          : null;

        if (!refDate) continue;

        // Archive at 30 days
        if (refDate <= thirtyDaysAgo) {
          await bidDoc.ref.update({
            status: 'archived',
            archivedAt: now.toISOString(),
            archivedBy: 'auto',
          });
          archived++;
          console.log(`Archived bid for ${bid.customerName} (${bidDoc.id})`);

          await sendPushover(
            `📁 Bid AUTO-ARCHIVED\n${bid.customerName} — $${parseFloat(bid.amount || 0).toFixed(2)}\nNot edited in 30 days. View archive in the Bids page.`
          );

          // Log to notifications
          await admin.firestore().collection('notifications_log').add({
            type: 'bid_archived',
            bidId: bidDoc.id,
            customerName: bid.customerName,
            message: `Bid for ${bid.customerName} auto-archived after 30 days`,
            sentAt: now.toISOString(),
          });

        // Warn at 23 days (7 days before archive)
        } else if (refDate <= twentyThreeDaysAgo && !bid.warningSent30) {
          const daysLeft = Math.ceil((refDate.getTime() + 30 * 86400000 - now.getTime()) / 86400000);

          await sendPushover(
            `⚠️ Bid Expiring Soon\n${bid.customerName} — $${parseFloat(bid.amount || 0).toFixed(2)}\nArchives in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} if not accepted or edited.`
          );

          // Mark warning sent so we don't spam daily
          await bidDoc.ref.update({ warningSent30: true });
          warned++;
          console.log(`Warning sent for ${bid.customerName} (${daysLeft} days left)`);
        }
      }

      console.log(`autoBidArchive complete: ${archived} archived, ${warned} warnings sent`);
      return null;
    } catch (error) {
      console.error('Error in autoBidArchive:', error);
      return null;
    }
  });

// ─────────────────────────────────────────────────────────────
// AI BID ASSISTANT PROXY
// Proxies Claude API calls from the browser (avoids CORS)
// ─────────────────────────────────────────────────────────────
exports.bidAssistant = functions.runWith({ secrets: ['ANTHROPIC_API_KEY'] }).https.onCall(async (data, context) => {
  const { messages, photos } = data;

  if (!messages || !Array.isArray(messages)) {
    throw new functions.https.HttpsError('invalid-argument', 'Messages array required');
  }

  const fetch = require('node-fetch');

  const SYSTEM_PROMPT = `You are an expert bid assistant for Kings Canyon Landscaping LLC, a full-service contractor based in Bullhead City, Arizona serving Bullhead City, Fort Mohave, Mohave Valley, and Laughlin NV.

CRITICAL: KCL takes on ALL types of work — not just landscaping. Never refuse or redirect a job. Price everything.

Services include but are not limited to:
- Desert landscaping, rock/gravel, weed removal, yard cleanup, grading, drainage
- Irrigation systems, sprinkler repair and installation
- Tree and shrub trimming, hauling, debris removal
- Concrete, pavers, patios, walkways, driveways
- Fencing, block walls, retaining walls
- Outdoor structures: pergolas, shade structures, ramadas
- Interior/exterior repairs: flooring, drywall, stucco, plywood, ceilings, roofing
- Painting interior and exterior
- General handyman and construction work of any kind

Labor rate: $60/hour for all work types.

RULES — follow these strictly:
1. NEVER say any job is outside KCL services. Price it.
2. NEVER ask for more details or photos. Make reasonable assumptions and give a number.
3. If photos are provided, analyze them to improve accuracy.
4. Always give a concrete bid. If uncertain, state your assumptions in reasoning.
5. For any job description respond ONLY with this JSON (no markdown, no code fences, no extra text):
{
  "description": "Full professional scope of work ready to paste into the bid",
  "materials": "Itemized materials list with quantities",
  "estimatedHours": 8,
  "laborCost": 480,
  "materialsCost": 600,
  "recommendedAmount": 1200,
  "reasoning": "How you arrived at the numbers and any assumptions made"
}

Only respond in plain text if the user asks a general non-job question. Otherwise always return JSON.`;

  // Build image blocks once — inject into every user message so AI always has context
  const imageBlocks = (photos && photos.length > 0) ? photos.map(base64 => {
    let mediaType = 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgo')) mediaType = 'image/png';
    else if (base64.startsWith('UklGR')) mediaType = 'image/webp';
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    };
  }) : [];

  let apiMessages = messages.map((msg) => {
    if (msg.role === 'user' && imageBlocks.length > 0) {
      // Attach photos to every user message so AI never loses sight of them
      const textContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: textContent },
        ],
      };
    }
    // For assistant messages, ensure content is a string
    if (msg.role === 'assistant') {
      return { role: 'assistant', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) };
    }
    return msg;
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', result);
      throw new functions.https.HttpsError('internal', 'AI service error');
    }

    return { text: result.content?.[0]?.text || '' };
  } catch (error) {
    console.error('bidAssistant error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
// ========================= MAINTENANCE CONTRACT AUTO-ACTIVATION =========================
// Firestore trigger: fires whenever a contract document is written.
// When both client AND contractor signatures are present on a maintenance_agreement,
// automatically activates the linked maintenance_contracts doc and creates schedules.

exports.onContractSigned = functions.runWith({ secrets: ["RESEND_API_KEY"] }).firestore
  .document('contracts/{contractId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) return null; // Document deleted — ignore

    // Only handle maintenance agreements
    if (after.type !== 'maintenance_agreement') return null;

    const hadBothSigs = before && before.clientSignature && before.contractorSignature;
    const hasBothSigs = after.clientSignature && after.contractorSignature;

    // Only fire when transitioning TO both-signed (not on every write)
    if (hadBothSigs || !hasBothSigs) return null;

    const maintenanceContractId = after.maintenanceContractId;
    if (!maintenanceContractId) {
      console.warn('>>> onContractSigned: no maintenanceContractId on contract', context.params.contractId);
      return null;
    }

    console.log('>>> onContractSigned: maintenance agreement fully signed, activating:', maintenanceContractId);

    try {
      // 1. Load the maintenance contract
      const mcRef = admin.firestore().collection('maintenance_contracts').doc(maintenanceContractId);
      const mcSnap = await mcRef.get();
      if (!mcSnap.exists) {
        console.warn('>>> onContractSigned: maintenance_contracts doc not found:', maintenanceContractId);
        return null;
      }

      const mc = mcSnap.data();

      // Only activate if still pending — don't re-activate paused/cancelled contracts
      if (mc.status !== 'pending_signature') {
        console.log('>>> onContractSigned: contract already in status:', mc.status, '— skipping');
        return null;
      }

      // 2. Activate the maintenance contract
      await mcRef.update({
        status: 'active',
        activatedAt: new Date().toISOString(),
        activatedByContractId: context.params.contractId,
      });

      console.log('>>> onContractSigned: maintenance contract activated');

      // 3. Create schedules (inline — can't import frontend maintenanceScheduler here)
      const startDate = mc.startDate || new Date().toISOString().split('T')[0];
      const frequency = mc.frequency || 'biweekly';
      const monthsAhead = mc.monthsAhead || 3;

      let visitsToCreate;
      switch (frequency) {
        case 'weekly':    visitsToCreate = monthsAhead * 4; break;
        case 'biweekly':  visitsToCreate = monthsAhead * 2; break;
        case 'monthly':   visitsToCreate = monthsAhead;     break;
        default:          visitsToCreate = monthsAhead * 2;
      }

      const today = new Date().toISOString().split('T')[0];
      const scheduleStart = startDate > today ? startDate : today;

      // Calculate visit dates
      const visitDates = [];
      let current = new Date(scheduleStart + 'T00:00:00');
      for (let i = 0; i < visitsToCreate; i++) {
        visitDates.push(current.toISOString().split('T')[0]);
        if (frequency === 'monthly') {
          current.setMonth(current.getMonth() + 1);
        } else if (frequency === 'weekly') {
          current.setDate(current.getDate() + 7);
        } else {
          current.setDate(current.getDate() + 14);
        }
      }

      // Check for existing schedules to avoid duplicates
      const existingSnap = await admin.firestore()
        .collection('schedules')
        .where('maintenanceContractId', '==', maintenanceContractId)
        .get();
      const existingDates = existingSnap.docs.map(d => d.data().startDate);
      const datesToCreate = visitDates.filter(d => !existingDates.includes(d));

      // Create schedule entries
      const batch = admin.firestore().batch();
      for (const date of datesToCreate) {
        const schedRef = admin.firestore().collection('schedules').doc();
        batch.set(schedRef, {
          clientName: mc.customerName || '',
          customerId: mc.customerId || '',
          maintenanceContractId,
          startDate: date,
          endDate: date,
          startTime: '08:00',
          endTime: '17:00',
          selectedCrews: [],
          assignedEmployees: [],
          status: 'scheduled',
          type: 'maintenance',
          notes: `Maintenance visit — ${frequency}`,
          servicesIncluded: mc.servicesIncluded || '',
          monthlyRate: mc.monthlyRate || 0,
          createdAt: new Date().toISOString(),
          autoGenerated: true,
        });
      }
      await batch.commit();

      console.log(`>>> onContractSigned: created ${datesToCreate.length} schedule entries`);

      // 4. Send Pushover notification to Darren
      const settings = await getSettings();
      if (settings?.adminPhones?.length) {
        const message = `✅ MAINTENANCE SIGNED\n${after.clientName || mc.customerName}\n$${mc.monthlyRate}/mo — ${frequency}\n${datesToCreate.length} visits scheduled`;
        await sendToAllAdmins(settings, message, 'maintenance_activated', {
          maintenanceContractId,
          customerName: after.clientName || mc.customerName,
        });
      }

      // 5. Log it
      await admin.firestore().collection('notifications_log').add({
        type: 'maintenance_contract_activated',
        maintenanceContractId,
        contractId: context.params.contractId,
        customerName: after.clientName || mc.customerName,
        schedulesCreated: datesToCreate.length,
        activatedAt: new Date().toISOString(),
      });

      return null;

    } catch (error) {
      console.error('>>> onContractSigned error:', error);
      return null; // Never throw in Firestore triggers — it retries forever
    }
  });
// resend-secret-deploy