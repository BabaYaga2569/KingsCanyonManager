import {
  generateSecureToken,
  generateSigningUrl,
  generatePaymentUrl,
  getTokenFromUrl,
} from './tokenUtils';

describe('tokenUtils', () => {
  describe('generateSecureToken', () => {
    it('should generate a 32-character token', () => {
      const token = generateSecureToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(32);
    });

    it('should generate unique tokens', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateSigningUrl', () => {
    it('should generate correct bid signing URL', () => {
      const url = generateSigningUrl('https://example.com', 'bid', 'bid123', 'token456');
      expect(url).toBe('https://example.com/public/sign-bid/bid123?token=token456');
    });

    it('should generate correct contract signing URL', () => {
      const url = generateSigningUrl('https://example.com', 'contract', 'contract123', 'token456');
      expect(url).toBe('https://example.com/sign-contract/contract123?token=token456');
    });

    it('should throw error for invalid document type', () => {
      expect(() => {
        generateSigningUrl('https://example.com', 'invalid', 'doc123', 'token456');
      }).toThrow('Invalid document type: invalid');
    });
  });

  describe('generatePaymentUrl', () => {
    it('should generate correct payment URL', () => {
      const url = generatePaymentUrl('https://example.com', 'invoice123', 'token789');
      expect(url).toBe('https://example.com/pay-invoice/invoice123?token=token789');
    });
  });

  describe('getTokenFromUrl', () => {
    it('should extract token from URL', () => {
      // Mock window.location.search using Object.defineProperty
      const originalLocation = window.location;
      delete window.location;
      window.location = { ...originalLocation, search: '?token=abc123' };
      
      const token = getTokenFromUrl();
      expect(token).toBe('abc123');
      
      // Restore original location
      window.location = originalLocation;
    });

    it('should return null when no token in URL', () => {
      // Mock window.location.search using Object.defineProperty
      const originalLocation = window.location;
      delete window.location;
      window.location = { ...originalLocation, search: '' };
      
      const token = getTokenFromUrl();
      expect(token).toBeNull();
      
      // Restore original location
      window.location = originalLocation;
    });
  });
});
