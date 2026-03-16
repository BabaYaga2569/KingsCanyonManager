import { nanoid } from 'nanoid';

/**
 * Generates a secure random token for document access
 * @returns {string} A 32-character random token
 */
export function generateSecureToken() {
  return nanoid(32);
}

/**
 * Builds a signing URL with token for contracts or bids
 * @param {string} baseUrl - The base URL (e.g., window.location.origin)
 * @param {string} documentType - Type of document ('bid' or 'contract')
 * @param {string} documentId - The document ID
 * @param {string} token - The security token
 * @returns {string} The complete signing URL
 */
export function generateSigningUrl(baseUrl, documentType, documentId, token) {
  if (documentType === 'bid') {
    return `${baseUrl}/public/sign-bid/${documentId}?token=${token}`;
  } else if (documentType === 'contract') {
    return `${baseUrl}/sign-contract/${documentId}?token=${token}`;
  }
  throw new Error(`Invalid document type: ${documentType}`);
}

/**
 * Builds a payment URL with token for invoices
 * @param {string} baseUrl - The base URL (e.g., window.location.origin)
 * @param {string} invoiceId - The invoice ID
 * @param {string} token - The security token
 * @returns {string} The complete payment URL
 */
export function generatePaymentUrl(baseUrl, invoiceId, token) {
  return `${baseUrl}/pay-invoice/${invoiceId}?token=${token}`;
}

/**
 * Extracts token from URL query parameters
 * @returns {string|null} The token if found, null otherwise
 */
export function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}
