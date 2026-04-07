// auditLog.js
// Central audit logging utility for KCL Manager
// Usage: import { logAction } from './utils/auditLog';
//        await logAction('bid_created', { bidId, clientName, amount }, user, userRole);

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Log an action to the audit_log Firestore collection
 * @param {string} action - Action identifier e.g. 'bid_created', 'expense_deleted'
 * @param {object} details - Relevant details about the action
 * @param {object} user - Firebase auth user object
 * @param {string} userRole - User's role (god/admin/crew)
 */
export async function logAction(action, details = {}, user = null, userRole = null) {
  try {
    await addDoc(collection(db, 'audit_log'), {
      action,
      userId: user?.uid || null,
      userName: user?.displayName || user?.email?.split('@')[0] || 'Unknown',
      userEmail: user?.email || null,
      userRole: userRole || null,
      timestamp: new Date().toISOString(),
      details,
    });
  } catch (err) {
    // Never let audit logging break the main flow
    console.warn('Audit log failed (non-critical):', err);
  }
}

// ── Action constants ─────────────────────────────────────────────────────────
// Use these to keep action names consistent across the app

export const AUDIT_ACTIONS = {
  // Bids
  BID_CREATED:          'bid_created',
  BID_UPDATED:          'bid_updated',
  BID_ARCHIVED:         'bid_archived',
  BID_RESTORED:         'bid_restored',
  BID_DELETED:          'bid_deleted',
  BID_CONTRACT_CREATED: 'bid_contract_created',
  BID_EMAIL_SENT:       'bid_email_sent',

  // Contracts
  CONTRACT_UPDATED:     'contract_updated',
  CONTRACT_SIGNED:      'contract_signed',
  CONTRACT_CANCELLED:   'contract_cancelled',
  CONTRACT_EMAIL_SENT:  'contract_email_sent',

  // Jobs
  JOB_STATUS_CHANGED:   'job_status_changed',
  JOB_TYPE_CHANGED:     'job_type_changed',
  JOB_UPDATED:          'job_updated',
  JOB_DELETED:          'job_deleted',
  JOB_COMPLETED:        'job_completed',

  // Expenses
  EXPENSE_CREATED:      'expense_created',
  EXPENSE_UPDATED:      'expense_updated',
  EXPENSE_DELETED:      'expense_deleted',

  // Payments
  PAYMENT_CREATED:      'payment_created',
  PAYMENT_DELETED:      'payment_deleted',

  // Employees
  EMPLOYEE_INVITED:     'employee_invited',
  EMPLOYEE_UPDATED:     'employee_updated',
  EMPLOYEE_DEACTIVATED: 'employee_deactivated',
  EMPLOYEE_ACTIVATED:   'employee_activated',
  EMPLOYEE_DELETED:     'employee_deleted',
  INVITE_CANCELLED:     'invite_cancelled',

  // Invoices
  INVOICE_EMAIL_SENT:   'invoice_email_sent',
  INVOICE_STATUS_CHANGED: 'invoice_status_changed',
};