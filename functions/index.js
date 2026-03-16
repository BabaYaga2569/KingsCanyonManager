const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

admin.initializeApp();

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

  if (adminPhones.length === 0) {
    console.log('No admin phones configured');
    return { success: false, reason: 'no_admins' };
  }

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

exports.scanReceipt = functions.runWith({ secrets: ['ANTHROPIC_API_KEY'] }).https.onCall(async (data, context) => {
  console.log('>>> SCAN STARTED (Claude Vision)');

  try {
    if (!data.image) {
      throw new functions.https.HttpsError('invalid-argument', 'Image required');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Add ANTHROPIC_API_KEY to functions/.env'
      );
    }

    const mediaType = detectMediaType(data.image);
    console.log('>>> Detected media type:', mediaType);

    const prompt = `You are a receipt scanner for a landscaping company. Analyze this receipt image carefully and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

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
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: data.image,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
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
      // If Claude wrapped the JSON in anything, extract it
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error('>>> JSON parse failed. Raw output was:', rawOutput);
        throw new Error('Claude did not return valid JSON. Raw: ' + rawOutput.substring(0, 200));
      }
    }

    // Ensure numeric fields are actually numbers (defensive)
    parsed.amount   = parseFloat(parsed.amount)   || 0;
    parsed.subtotal = parseFloat(parsed.subtotal) || 0;
    parsed.tax      = parseFloat(parsed.tax)      || 0;
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
exports.sendEmployeeInvite = functions.https.onCall(async (data, context) => {
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
    const appUrl = 'https://kcl-manager-test.web.app'; // Update for production
    const inviteUrl = `${appUrl}/public/invite/${token}`;

    // Send invite email
    if (settings?.gmailConfigured && settings?.gmailEmail && settings?.gmailAppPassword) {
      const transporter = createTransporter(settings.gmailEmail, settings.gmailAppPassword);

      const mailOptions = {
        from: `"Kings Canyon Landscaping" <${settings.gmailEmail}>`,
        to: email,
        subject: `You're invited to join Kings Canyon Landscaping`,
        html: `
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
        `,
      };

      await transporter.sendMail(mailOptions);
      transporter.close();
      console.log('>>> Invite email sent to:', email);
    } else {
      console.warn('>>> Gmail not configured — invite token created but email not sent');
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

exports.sendCustomerEmail = functions.https.onCall(async (data, context) => {
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

    const settings = await getSettings();
    if (!settings || !settings.gmailConfigured || !settings.gmailEmail || !settings.gmailAppPassword) {
      throw new functions.https.HttpsError('failed-precondition', 'Gmail not configured. Go to SMS Settings to set up Gmail.');
    }

    const transporter = createTransporter(settings.gmailEmail, settings.gmailAppPassword);

    const mailOptions = {
      from: `"Kings Canyon Landscaping" <${settings.gmailEmail}>`,
      to: customerEmail,
      subject,
      html: htmlBody,
    };

    if (pdfBase64 && pdfFilename) {
      mailOptions.attachments = [{
        filename: pdfFilename,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      }];
    }

    await transporter.sendMail(mailOptions);
    transporter.close();

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

    if (settings.adminPhones?.length > 0) {
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
    if (!settings || !settings.adminPhones?.length) {
      return { success: true, message: 'No admins to notify' };
    }

    const typeLabel = docType === 'bid' ? 'BID ACCEPTED' : 'CONTRACT SIGNED';
    const amountStr = amount ? `\n$${parseFloat(amount).toFixed(2)}` : '';
    const message = `${typeLabel}\n${customerName}${amountStr}\nCheck the app for details`;

    await sendToAllAdmins(settings, message, 'signature_received', { docType, docId, customerName });

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