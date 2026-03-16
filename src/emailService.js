// emailService.js
// Customer Email Service - sends bids, contracts, invoices to customers via Cloud Function

import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

const COMPANY = {
  name: 'Kings Canyon Landscaping LLC',
  phone: '(928) 450-5733',
  email: 'kingscanyonlandscaping775@gmail.com',
  city: 'Bullhead City, AZ',
};

/**
 * Build professional HTML email template
 */
function buildEmailHTML(customerName, docType, bodyContent, amount) {
  const typeLabels = {
    bid: 'Bid / Estimate',
    contract: 'Contract',
    invoice: 'Invoice',
  };
  
  const typeLabel = typeLabels[docType] || 'Document';
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      
      <!-- Header -->
      <div style="background-color: #1565c0; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${COMPANY.name}</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${COMPANY.city} | ${COMPANY.phone}</p>
      </div>
      
      <!-- Body -->
      <div style="padding: 32px 24px;">
        <p style="font-size: 16px; color: #333;">Hi ${customerName},</p>
        
        ${bodyContent}
        
        ${amount ? `
        <div style="background-color: #f5f5f5; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #666;">Total Amount</p>
          <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: bold; color: #1565c0;">$${parseFloat(amount).toFixed(2)}</p>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; margin-top: 24px;">
          Please find the attached ${typeLabel} PDF for your records. If you have any questions, don't hesitate to reach out.
        </p>
        
        <p style="font-size: 16px; color: #333; margin-top: 24px;">
          Thank you for choosing Kings Canyon Landscaping!<br/>
          <strong>Darren Bennett</strong><br/>
          <span style="color: #666;">Owner</span>
        </p>
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f5f5f5; padding: 16px 24px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 12px; color: #999;">
          ${COMPANY.name} | ${COMPANY.phone} | ${COMPANY.city}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #999;">
          Pay via Zelle: 928-450-5733
        </p>
      </div>
    </div>
  `;
}

/**
 * Send bid email to customer
 */
export async function sendBidEmail(customerEmail, customerName, bidData, pdfBase64) {
  // Build signing link if token exists
  const signingToken = bidData.signingToken || '';
  const signingLink = signingToken 
    ? `${window.location.origin}/public/sign-bid/${bidData.id}?token=${signingToken}`
    : '';
  
  const signingButton = signingLink ? `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${signingLink}" 
         style="display: inline-block; background-color: #2e7d32; color: white; padding: 14px 32px; 
                text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
        ✅ Review & Accept Estimate
      </a>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">
        Tap the button above to review and sign on your phone
      </p>
    </div>
  ` : '';

  const bodyContent = `
    <p style="font-size: 15px; color: #333;">
      Thank you for your interest in our services! Please find attached your estimate for the following work:
    </p>
    <div style="background-color: #e3f2fd; border-left: 4px solid #1565c0; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px; color: #333;"><strong>Description:</strong> ${bidData.description || 'See attached PDF'}</p>
      ${bidData.materials ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #333;"><strong>Materials:</strong> ${bidData.materials}</p>` : ''}
    </div>
    ${signingButton}
    <p style="font-size: 15px; color: #333;">
      This estimate is valid for 30 days. ${signingLink ? 'Tap the button above to accept, or reply to this email with any questions.' : 'Please review the attached PDF and let us know if you\'d like to proceed.'}
    </p>
  `;
  
  const html = buildEmailHTML(customerName, 'bid', bodyContent, bidData.amount);
  
  const sendEmail = httpsCallable(functions, 'sendCustomerEmail');
  const result = await sendEmail({
    customerEmail,
    customerName,
    subject: `Estimate from Kings Canyon Landscaping — $${parseFloat(bidData.amount).toFixed(2)}`,
    htmlBody: html,
    pdfBase64,
    pdfFilename: `KCL_Estimate_${customerName.replace(/\s+/g, '_')}.pdf`,
    docType: 'bid',
    docId: bidData.id,
    metadata: { signingLink },
  });
  
  return result.data;
}

/**
 * Send contract email to customer
 */
export async function sendContractEmail(customerEmail, customerName, contractData, pdfBase64) {
  // Build signing link if token exists
  const signingToken = contractData.signingToken || '';
  const signingLink = signingToken
    ? `${window.location.origin}/public/sign/${contractData.id}?token=${signingToken}`
    : '';
  
  const signingButton = signingLink ? `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${signingLink}" 
         style="display: inline-block; background-color: #1565c0; color: white; padding: 14px 32px; 
                text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
        ✍️ Review & Sign Contract
      </a>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">
        Tap the button above to review and sign on your phone
      </p>
    </div>
  ` : '';

  const bodyContent = `
    <p style="font-size: 15px; color: #333;">
      Please find attached your service contract for the following work:
    </p>
    <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px; color: #333;"><strong>Scope of Work:</strong> ${contractData.description || 'See attached PDF'}</p>
    </div>
    ${signingButton}
    <p style="font-size: 15px; color: #333;">
      ${signingLink ? 'Please tap the button above to review and sign the contract. The attached PDF is for your records.' : 'Please review the attached contract PDF. If everything looks good, we\'ll get started as soon as it\'s signed.'}
    </p>
  `;
  
  const html = buildEmailHTML(customerName, 'contract', bodyContent, contractData.amount);
  
  const sendEmail = httpsCallable(functions, 'sendCustomerEmail');
  const result = await sendEmail({
    customerEmail,
    customerName,
    subject: `Contract from Kings Canyon Landscaping — ${customerName}`,
    htmlBody: html,
    pdfBase64,
    pdfFilename: `KCL_Contract_${customerName.replace(/\s+/g, '_')}.pdf`,
    docType: 'contract',
    docId: contractData.id,
    metadata: { amount: contractData.amount, signingLink },
  });
  
  return result.data;
}

/**
 * Send invoice email to customer
 */
export async function sendInvoiceEmail(customerEmail, customerName, invoiceData, pdfBase64) {
  const total = parseFloat(invoiceData.total || invoiceData.amount || 0);
  const dueDate = invoiceData.dueDate
    ? new Date(invoiceData.dueDate).toLocaleDateString()
    : 'Upon Receipt';
  
  const bodyContent = `
    <p style="font-size: 15px; color: #333;">
      Please find attached your invoice for services rendered.
    </p>
    <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px; color: #333;"><strong>Description:</strong> ${invoiceData.description || 'See attached PDF'}</p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #333;"><strong>Due Date:</strong> ${dueDate}</p>
    </div>
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 14px; color: #333; text-align: center;">
        <strong>Payment Options:</strong><br/>
        Zelle: <strong>928-450-5733</strong><br/>
        Cash or Check accepted on-site
      </p>
    </div>
  `;
  
  const html = buildEmailHTML(customerName, 'invoice', bodyContent, total);
  
  const sendEmail = httpsCallable(functions, 'sendCustomerEmail');
  const result = await sendEmail({
    customerEmail,
    customerName,
    subject: `Invoice from Kings Canyon Landscaping — $${total.toFixed(2)}`,
    htmlBody: html,
    pdfBase64,
    pdfFilename: `KCL_Invoice_${customerName.replace(/\s+/g, '_')}.pdf`,
    docType: 'invoice',
    docId: invoiceData.id,
    metadata: { amount: total, dueDate: invoiceData.dueDate },
  });
  
  return result.data;
}

/**
 * Send payment reminder email
 */
export async function sendPaymentReminderEmail(customerEmail, customerName, invoiceData) {
  const total = parseFloat(invoiceData.remainingBalance || invoiceData.total || 0);
  
  const bodyContent = `
    <p style="font-size: 15px; color: #333;">
      This is a friendly reminder that you have an outstanding balance with Kings Canyon Landscaping.
    </p>
    <div style="background-color: #ffebee; border-left: 4px solid #f44336; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px; color: #333;"><strong>Remaining Balance:</strong> $${total.toFixed(2)}</p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #333;"><strong>Description:</strong> ${invoiceData.description || 'Landscaping services'}</p>
    </div>
    <p style="font-size: 15px; color: #333;">
      Please send payment at your earliest convenience. If you've already paid, please disregard this notice.
    </p>
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 14px; color: #333; text-align: center;">
        <strong>Zelle: 928-450-5733</strong>
      </p>
    </div>
  `;
  
  const html = buildEmailHTML(customerName, 'invoice', bodyContent, total);
  
  const sendEmail = httpsCallable(functions, 'sendCustomerEmail');
  const result = await sendEmail({
    customerEmail,
    customerName,
    subject: `Payment Reminder — Kings Canyon Landscaping — $${total.toFixed(2)}`,
    htmlBody: html,
    docType: 'payment_reminder',
    docId: invoiceData.id,
  });
  
  return result.data;
}