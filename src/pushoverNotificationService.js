// src/pushoverNotificationService.js
// Pushover Push Notification Service for KCL Manager
// Replaces Twilio SMS - No carrier approval needed, works instantly
// 30-day free trial, then $4.99 one-time on iOS

import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";

const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json";

// Your Pushover credentials
const PUSHOVER_TOKEN = "aka88i2ehjtm4r47d3zuqz7bhionvu"; // KCL Manager API Token
const PUSHOVER_USER = "gnh1nvir8hovia25ohsdoq2ys8x1n3";  // KCL Alerts Group Key - notifies Steve & Darren

// Priority levels
const PRIORITY = {
  LOWEST: -2,   // No sound, no vibration
  LOW: -1,      // Quiet notification
  NORMAL: 0,    // Default sound
  HIGH: 1,      // High priority, bypasses quiet hours
  EMERGENCY: 2, // Repeats until acknowledged (requires retry + expire)
};

/**
 * Core function - sends a push notification via Pushover and logs to Firestore
 */
async function sendPushoverNotification({
  title,
  message,
  priority = PRIORITY.NORMAL,
  sound = null,
  url = null,
  urlTitle = null,
  type = "general",
}) {
  let success = false;
  let errorMsg = null;

  try {
    const formData = new URLSearchParams();
    formData.append("token", PUSHOVER_TOKEN);
    formData.append("user", PUSHOVER_USER);
    formData.append("title", title);
    formData.append("message", message);
    formData.append("priority", priority);

    if (sound) formData.append("sound", sound);
    if (url) formData.append("url", url);
    if (urlTitle) formData.append("url_title", urlTitle);

    // Emergency priority requires retry and expire
    if (priority === PRIORITY.EMERGENCY) {
      formData.append("retry", 60);   // Retry every 60 seconds
      formData.append("expire", 3600); // Stop after 1 hour
    }

    const response = await fetch(PUSHOVER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await response.json();
    success = data.status === 1;
    if (!success) errorMsg = data.errors?.join(", ") || "Unknown error";

    if (success) {
      console.log(`✅ Pushover notification sent: ${title}`);
    } else {
      console.error("❌ Pushover error:", data.errors);
    }
  } catch (error) {
    console.error("❌ Pushover fetch error:", error);
    errorMsg = error.message;
  }

  // Always log to Firestore for history
  try {
    await addDoc(collection(db, "notification_log"), {
      title,
      message,
      type,
      status: success ? "sent" : "failed",
      error: errorMsg,
      sentAt: new Date().toISOString(),
    });
  } catch (logError) {
    console.warn("Failed to log notification to Firestore:", logError);
  }

  return success
    ? { success: true }
    : { success: false, error: errorMsg };
}

// ============================================================
// CREW / TIME CLOCK NOTIFICATIONS
// ============================================================

/**
 * Notify admin when a crew member clocks IN
 */
export async function notifyCrewClockIn(employeeName, location = null, gpsData = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let gpsLine = "";
  if (gpsData && gpsData.gpsDistanceFeet != null) {
    const feet = gpsData.gpsDistanceFeet;
    const miles = gpsData.gpsDistanceMiles;
    const onSite = feet <= 500;
    gpsLine = onSite
      ? `\n✅ ON SITE - ${feet} ft from job (${miles} mi)`
      : `\n⚠️ OFF SITE - ${feet.toLocaleString()} ft away (${miles} mi)`;
    if (gpsData.jobAddress) {
      gpsLine += `\n📍 ${gpsData.jobAddress}`;
    }
  } else if (gpsData && gpsData.jobAddress) {
    gpsLine = `\n⚠️ GPS unavailable\n📍 ${gpsData.jobAddress}`;
  } else {
    gpsLine = location ? `\n📍 ${location}` : "\n⚠️ No GPS data";
  }

  return sendPushoverNotification({
    type: "clock_in",
    title: "🟢 Crew Clocked In",
    message: `${employeeName} clocked in at ${time}${gpsLine}`,
    priority: PRIORITY.NORMAL,
    sound: "cashregister",
  });
}

/**
 * Notify admin when a crew member clocks OUT
 */
export async function notifyCrewClockOut(employeeName, hoursWorked = null, gpsData = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const hoursText = hoursWorked ? `\n⏱ Hours worked: ${hoursWorked}` : "";

  let gpsLine = "";
  if (gpsData && gpsData.gpsDistanceFeet != null) {
    const feet = gpsData.gpsDistanceFeet;
    const miles = gpsData.gpsDistanceMiles;
    const onSite = feet <= 500;
    gpsLine = onSite
      ? `\n✅ ON SITE - ${feet} ft from job (${miles} mi)`
      : `\n⚠️ OFF SITE - ${feet.toLocaleString()} ft away (${miles} mi)`;
    if (gpsData.jobAddress) {
      gpsLine += `\n📍 ${gpsData.jobAddress}`;
    }
  } else if (gpsData && gpsData.jobAddress) {
    gpsLine = `\n⚠️ GPS unavailable\n📍 ${gpsData.jobAddress}`;
  }

  return sendPushoverNotification({
    type: "clock_out",
    title: "🔴 Crew Clocked Out",
    message: `${employeeName} clocked out at ${time}${hoursText}${gpsLine}`,
    priority: PRIORITY.NORMAL,
  });
}

/**
 * Notify admin when a crew member clocks OUT far from the job site
 */
export async function notifyFailedClockOut(employeeName, jobName, distanceFeet, distanceMiles, jobAddress = null, hoursWorked = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const addressText = jobAddress ? `\n📍 ${jobAddress}` : "";
  const hoursText = hoursWorked ? `\n⏱ Hours worked: ${hoursWorked}` : "";

  return sendPushoverNotification({
    type: "off_site_clock_out",
    title: "⚠️ Off-Site Clock-Out",
    message: `${employeeName} clocked out at ${time}\n🔧 Job: ${jobName}\n📏 ${distanceFeet.toLocaleString()} ft away (${distanceMiles} mi) — NOT on site${hoursText}${addressText}`,
    priority: PRIORITY.HIGH,
    sound: "siren",
  });
}

/**
 * Notify admin when a crew member is BLOCKED from clocking in (too far from job site)
 */
export async function notifyFailedClockIn(employeeName, jobName, distanceFeet, distanceMiles, jobAddress = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const addressText = jobAddress ? `\n📍 ${jobAddress}` : "";

  return sendPushoverNotification({
    type: "failed_clock_in",
    title: "⛔ Failed Clock-In Attempt",
    message: `${employeeName} tried to clock in at ${time}\n🔧 Job: ${jobName}\n📏 ${distanceFeet.toLocaleString()} ft away (${distanceMiles} mi) — BLOCKED${addressText}\nRequired: within 500 ft`,
    priority: PRIORITY.HIGH,
    sound: "siren",
  });
}

// ============================================================
// LUNCH BREAK NOTIFICATIONS
// ============================================================

export async function notifyLunchStart(employeeName, jobName = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const jobText = jobName ? `\n📍 Job: ${jobName}` : "";
  return sendPushoverNotification({
    type: "lunch_start",
    title: "🍔 Lunch Break Started",
    message: `${employeeName} started lunch at ${time}${jobText}`,
    priority: PRIORITY.NORMAL,
  });
}

export async function notifyLunchEnd(employeeName, lunchMinutes = null, jobName = null) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const durationText = lunchMinutes ? `\n⏱ Lunch duration: ${lunchMinutes} min` : "";
  const jobText = jobName ? `\n📍 Job: ${jobName}` : "";
  return sendPushoverNotification({
    type: "lunch_end",
    title: "✅ Back from Lunch",
    message: `${employeeName} returned at ${time}${durationText}${jobText}`,
    priority: PRIORITY.NORMAL,
  });
}

// ============================================================
// CONTRACT NOTIFICATIONS
// ============================================================

/**
 * Notify when a client signs a contract
 */
export async function notifyContractSigned(customerName, amount, contractId = null) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "contract_signed",
    title: "✍️ Contract Signed!",
    message: `${customerName} just signed a contract!\n💰 Amount: ${formattedAmount}`,
    priority: PRIORITY.HIGH,
    sound: "cashregister",
  });
}

/**
 * Notify when a new contract is created
 */
export async function notifyContractCreated(customerName, amount) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "contract_created",
    title: "📋 New Contract Created",
    message: `New contract created for ${customerName}\n💰 Amount: ${formattedAmount}`,
    priority: PRIORITY.NORMAL,
  });
}

// ============================================================
// BID NOTIFICATIONS
// ============================================================

/**
 * Notify when a bid is viewed by the customer
 */
export async function notifyBidViewed(customerName, amount) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "bid_viewed",
    title: "👀 Bid Viewed",
    message: `${customerName} just viewed your bid\n💰 Amount: ${formattedAmount}\nFollow up now while it's fresh!`,
    priority: PRIORITY.NORMAL,
  });
}

/**
 * Notify when a bid is accepted
 */
export async function notifyBidAccepted(customerName, amount) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "bid_accepted",
    title: "🎉 Bid Accepted!",
    message: `${customerName} accepted your bid!\n💰 Amount: ${formattedAmount}\nTime to get to work!`,
    priority: PRIORITY.HIGH,
    sound: "cashregister",
  });
}

/**
 * Notify when a bid is declined
 */
export async function notifyBidDeclined(customerName, amount) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "bid_declined",
    title: "❌ Bid Declined",
    message: `${customerName} declined the bid\n💰 Amount: ${formattedAmount}`,
    priority: PRIORITY.LOW,
  });
}

// ============================================================
// INVOICE NOTIFICATIONS
// ============================================================

/**
 * Notify when an invoice is paid
 */
export async function notifyInvoicePaid(customerName, amount, paymentMethod = null) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const methodText = paymentMethod ? `\n💳 Method: ${paymentMethod}` : "";

  return sendPushoverNotification({
    type: "invoice_paid",
    title: "💰 Payment Received!",
    message: `${customerName} paid ${formattedAmount}${methodText}`,
    priority: PRIORITY.HIGH,
    sound: "cashregister",
  });
}

/**
 * Notify when an invoice is coming due (reminder)
 */
export async function notifyInvoiceDueSoon(customerName, amount, daysUntilDue) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const urgency = daysUntilDue <= 1 ? PRIORITY.HIGH : PRIORITY.NORMAL;
  const dueText = daysUntilDue === 0 ? "TODAY" : daysUntilDue === 1 ? "TOMORROW" : `in ${daysUntilDue} days`;

  return sendPushoverNotification({
    type: "invoice_due",
    title: "⏰ Invoice Due Soon",
    message: `Invoice for ${customerName} is due ${dueText}\n💰 Amount: ${formattedAmount}`,
    priority: urgency,
  });
}

/**
 * Notify when an invoice is overdue
 */
export async function notifyInvoiceOverdue(customerName, amount, daysOverdue) {
  const formattedAmount = parseFloat(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return sendPushoverNotification({
    type: "invoice_overdue",
    title: "🚨 Invoice Overdue!",
    message: `${customerName} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue\n💰 Amount: ${formattedAmount}\nConsider sending a reminder.`,
    priority: PRIORITY.HIGH,
  });
}

// ============================================================
// JOB / SCHEDULE NOTIFICATIONS
// ============================================================

/**
 * Notify when a job is coming up (day before reminder)
 */
export async function notifyJobUpcoming(customerName, jobDescription, scheduledDate, address = null) {
  const dateStr = new Date(scheduledDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const addressText = address ? `\n📍 ${address}` : "";

  return sendPushoverNotification({
    type: "job_upcoming",
    title: "📅 Job Tomorrow",
    message: `Job scheduled for ${dateStr}\n👤 ${customerName}\n🔧 ${jobDescription}${addressText}`,
    priority: PRIORITY.NORMAL,
  });
}

/**
 * Notify when a job is completed
 */
export async function notifyJobCompleted(customerName, jobDescription, amount = null) {
  const amountText = amount
    ? `\n💰 Invoice amount: ${parseFloat(amount).toLocaleString("en-US", { style: "currency", currency: "USD" })}`
    : "";

  return sendPushoverNotification({
    type: "job_completed",
    title: "✅ Job Completed",
    message: `Job completed for ${customerName}\n🔧 ${jobDescription}${amountText}`,
    priority: PRIORITY.NORMAL,
    sound: "cashregister",
  });
}

/**
 * Notify when a new job is scheduled
 */
export async function notifyJobScheduled(customerName, jobDescription, scheduledDate) {
  const dateStr = new Date(scheduledDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return sendPushoverNotification({
    type: "job_scheduled",
    title: "📆 New Job Scheduled",
    message: `New job booked!\n👤 ${customerName}\n🔧 ${jobDescription}\n📅 ${dateStr}`,
    priority: PRIORITY.NORMAL,
  });
}

// ============================================================
// CUSTOMER NOTIFICATIONS
// ============================================================

/**
 * Notify when a new customer is added
 */
export async function notifyNewCustomer(customerName, phone = null) {
  const phoneText = phone ? `\n📞 ${phone}` : "";

  return sendPushoverNotification({
    type: "new_customer",
    title: "🆕 New Customer",
    message: `New customer added: ${customerName}${phoneText}`,
    priority: PRIORITY.NORMAL,
  });
}

// ============================================================
// GENERAL / UTILITY
// ============================================================

/**
 * Send a custom notification - use for anything not covered above
 */
export async function sendCustomNotification(title, message, priority = PRIORITY.NORMAL) {
  return sendPushoverNotification({ title, message, priority });
}

/**
 * Test notification - use to verify setup is working
 */
export async function sendTestNotification() {
  return sendPushoverNotification({
    type: "test",
    title: "🦁 KCL Manager",
    message: "Push notifications are working! Kings Canyon Landscaping is ready to roll. 🌵",
    priority: PRIORITY.NORMAL,
    sound: "cashregister",
  });
}

/**
 * Notify when a bid appointment is scheduled
 */
export async function notifyBidAppointmentScheduled(customerName, date, time, address = null) {
  const addressText = address ? `\n📍 ${address}` : "";
  return sendPushoverNotification({
    type: "bid_appointment",
    title: "📅 Bid Appointment Scheduled",
    message: `New bid appointment!\n👤 ${customerName}\n📅 ${date} at ${time}${addressText}`,
    priority: PRIORITY.HIGH,
    sound: "cashregister",
  });
}

export { PRIORITY };