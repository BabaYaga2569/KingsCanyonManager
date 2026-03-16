// smsNotificationService.js
// SMS Notification Service using Email-to-SMS via Firebase Cloud Function
// Sends ADMIN notifications when employees clock in/out, etc.

import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

/**
 * Call the Cloud Function to send notification to all admins
 */
async function sendNotification(message, type, metadata = {}) {
  try {
    console.log(`📱 Sending notification: ${type}`);
    
    const sendNotificationFn = httpsCallable(functions, 'sendNotification');
    const result = await sendNotificationFn({ message, type, metadata });
    
    console.log('✅ Notification sent:', result.data);
    return { success: true, ...result.data };
    
  } catch (error) {
    console.error('❌ Notification error:', error);
    
    // Log failure locally
    try {
      await addDoc(collection(db, 'notifications_log'), {
        message,
        type,
        status: 'failed',
        sentAt: new Date().toISOString(),
        error: error.message,
        metadata,
      });
    } catch (logErr) {
      console.error('Error logging notification:', logErr);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Log notification to Firestore
 */
async function logNotification(data) {
  try {
    await addDoc(collection(db, 'notifications_log'), data);
  } catch (error) {
    console.error('Error logging notification:', error);
  }
}

/**
 * Get notification settings from Firestore
 */
export async function getNotificationSettings() {
  try {
    const snap = await getDocs(collection(db, 'notification_settings'));
    if (snap.empty) {
      return {
        paymentReminders: { enabled: false, daysBefore: 3 },
        jobReminders: { enabled: false, daysBefore: 1 },
        clockAlerts: {
          enabled: false,
          trackAllEmployees: true,
          trackedEmployeeIds: [],
          quietHoursStart: '22:00',
          quietHoursEnd: '06:00'
        },
        adminPhones: [],
        gmailEmail: '',
        gmailAppPassword: '',
        gmailConfigured: false
      };
    }
    
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
}

/**
 * Send employee clock in notification to ADMINS
 */
export async function sendClockInNotification(employee, timestamp, job = null) {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings?.clockAlerts?.enabled) {
      console.log('⏸️ Clock alerts disabled');
      return { success: false, reason: 'disabled' };
    }
    
    if (!settings?.gmailConfigured) {
      console.log('⚠️ Gmail not configured');
      return { success: false, reason: 'not_configured' };
    }
    
    if (!settings?.adminPhones?.length) {
      console.log('⚠️ No admin phones');
      return { success: false, reason: 'no_recipients' };
    }
    
    // Check quiet hours
    if (isQuietHours(settings.clockAlerts)) {
      console.log('🔕 Quiet hours');
      return { success: false, reason: 'quiet_hours' };
    }
    
    // Check if tracking this employee
    if (!settings.clockAlerts.trackAllEmployees) {
      if (!settings.clockAlerts.trackedEmployeeIds?.includes(employee.id)) {
        console.log(`⏭️ Not tracking ${employee.name}`);
        return { success: false, reason: 'not_tracked' };
      }
    }
    
    const time = new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    let message = `CLOCK IN\n${employee.name} - ${time}`;
    
    if (job) {
      message += `\nJob: ${job.clientName || job.name || 'Unknown'}`;
    }
    
    return await sendNotification(message, 'clock_in', {
      employeeId: employee.id,
      employeeName: employee.name,
      timestamp,
      jobId: job?.id
    });
    
  } catch (error) {
    console.error('❌ Clock in error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send employee clock out notification to ADMINS
 */
export async function sendClockOutNotification(employee, clockInTime, clockOutTime, job = null) {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings?.clockAlerts?.enabled) {
      console.log('⏸️ Clock alerts disabled');
      return { success: false, reason: 'disabled' };
    }
    
    if (!settings?.gmailConfigured) {
      console.log('⚠️ Gmail not configured');
      return { success: false, reason: 'not_configured' };
    }
    
    if (!settings?.adminPhones?.length) {
      console.log('⚠️ No admin phones');
      return { success: false, reason: 'no_recipients' };
    }
    
    // Check quiet hours
    if (isQuietHours(settings.clockAlerts)) {
      console.log('🔕 Quiet hours');
      return { success: false, reason: 'quiet_hours' };
    }
    
    // Check if tracking this employee
    if (!settings.clockAlerts.trackAllEmployees) {
      if (!settings.clockAlerts.trackedEmployeeIds?.includes(employee.id)) {
        console.log(`⏭️ Not tracking ${employee.name}`);
        return { success: false, reason: 'not_tracked' };
      }
    }
    
    const time = new Date(clockOutTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const duration = calculateDuration(clockInTime, clockOutTime);
    
    let message = `CLOCK OUT\n${employee.name} - ${time}\nWorked: ${duration}`;
    
    if (job) {
      message += `\nJob: ${job.clientName || job.name || 'Unknown'}`;
    }
    
    return await sendNotification(message, 'clock_out', {
      employeeId: employee.id,
      employeeName: employee.name,
      clockInTime,
      clockOutTime,
      duration,
      jobId: job?.id
    });
    
  } catch (error) {
    console.error('❌ Clock out error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if in quiet hours
 */
function isQuietHours(clockAlertSettings) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const [startHour, startMinute] = clockAlertSettings.quietHoursStart.split(':').map(Number);
  const [endHour, endMinute] = clockAlertSettings.quietHoursEnd.split(':').map(Number);
  
  const quietStart = startHour * 60 + startMinute;
  const quietEnd = endHour * 60 + endMinute;
  
  if (quietStart > quietEnd) {
    return currentTime >= quietStart || currentTime < quietEnd;
  } else {
    return currentTime >= quietStart && currentTime < quietEnd;
  }
}

/**
 * Calculate duration between timestamps
 */
function calculateDuration(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Get notification history
 */
export async function getNotificationHistory(limit_count = 50) {
  try {
    const q = query(
      collection(db, 'notifications_log'),
      orderBy('sentAt', 'desc'),
      limit(limit_count)
    );
    
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting history:', error);
    return [];
  }
}

/**
 * Test notification - sends test to all admins via Cloud Function
 */
export async function sendTestNotification() {
  try {
    const sendTestFn = httpsCallable(functions, 'sendTestNotification');
    const result = await sendTestFn({});
    return { success: true, ...result.data };
  } catch (error) {
    console.error('Test notification error:', error);
    return { success: false, error: error.message };
  }
}