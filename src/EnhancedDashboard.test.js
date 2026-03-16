/**
 * Unit tests for EnhancedDashboard date parsing functionality
 * These tests verify that the universal date parser can handle:
 * - Firestore Timestamp objects
 * - ISO string dates
 * - Date objects
 * - Various field names (date, paymentDate, invoiceDate, startDate, etc.)
 */

describe('EnhancedDashboard Date Parsing Logic', () => {
  // Universal date parser function (copied from EnhancedDashboard for testing)
  const parseDate = (doc, fieldNames = ['date', 'createdAt', 'paymentDate', 'invoiceDate', 'startDate', 'contractDate']) => {
    const data = doc.data ? doc.data() : doc;
    // Try multiple field names
    for (const field of fieldNames) {
      const val = data[field];
      if (!val) continue;
      // Firestore Timestamp
      if (val.toDate) return val.toDate();
      // String or Date
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  it('should parse Firestore Timestamp objects', () => {
    const mockTimestamp = {
      toDate: () => new Date('2026-02-10T12:00:00Z')
    };
    
    const mockDoc = {
      data: () => ({ date: mockTimestamp })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-02-10T12:00:00.000Z');
  });

  it('should parse ISO string dates', () => {
    const mockDoc = {
      data: () => ({ date: '2026-02-10' })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // February (0-indexed)
    expect(result.getDate()).toBe(10);
  });

  it('should parse Date objects', () => {
    const testDate = new Date('2026-02-10');
    const mockDoc = {
      data: () => ({ date: testDate })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(testDate.getTime());
  });

  it('should handle various date field names', () => {
    const testCases = [
      { fieldName: 'date', value: '2026-02-10' },
      { fieldName: 'paymentDate', value: '2026-02-11' },
      { fieldName: 'invoiceDate', value: '2026-02-12' },
      { fieldName: 'startDate', value: '2026-02-13' },
      { fieldName: 'contractDate', value: '2026-02-14' },
      { fieldName: 'createdAt', value: '2026-02-15' },
    ];

    testCases.forEach(testCase => {
      const mockDoc = {
        data: () => ({ [testCase.fieldName]: testCase.value })
      };
      
      const result = parseDate(mockDoc);
      expect(result).toBeInstanceOf(Date);
      expect(result).not.toBeNull();
    });
  });

  it('should return null for documents without parseable dates', () => {
    const mockDoc = {
      data: () => ({ amount: 100, description: 'test' })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeNull();
  });

  it('should return null for invalid date strings', () => {
    const mockDoc = {
      data: () => ({ date: 'invalid-date-string' })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeNull();
  });

  it('should prioritize earlier field names in the list', () => {
    const mockDoc = {
      data: () => ({ 
        date: '2026-02-10',
        createdAt: '2026-02-15' // Should be ignored since 'date' comes first
      })
    };

    const result = parseDate(mockDoc);
    expect(result).toBeInstanceOf(Date);
    expect(result.getDate()).toBe(10); // Should use 'date' field, not 'createdAt'
  });

  it('should work with plain objects (not just Firestore docs)', () => {
    const plainObject = { paymentDate: '2026-02-10' };

    const result = parseDate(plainObject);
    expect(result).toBeInstanceOf(Date);
    expect(result.getDate()).toBe(10);
  });
});
