import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatFileSize,
  getVersionStateColor,
  getRiskTierColor,
  truncateText,
  debounce,
  generateId,
} from '../index';

describe('Utility Functions', () => {
  describe('formatDate', () => {
    it('formats date correctly', () => {
      const date = '2023-01-15T10:30:00Z';
      const result = formatDate(date);
      expect(result).toBe('Jan 15, 2023');
    });
  });

  describe('formatDateTime', () => {
    it('formats date and time correctly', () => {
      const date = '2023-01-15T10:30:00Z';
      const result = formatDateTime(date);
      expect(result).toBe('Jan 15, 2023 10:30');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });

    it('formats with decimals for non-round numbers', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2621440)).toBe('2.5 MB');
    });
  });

  describe('getVersionStateColor', () => {
    it('returns correct colors for different states', () => {
      expect(getVersionStateColor('draft')).toBe('default');
      expect(getVersionStateColor('submitted')).toBe('info');
      expect(getVersionStateColor('production')).toBe('success');
      expect(getVersionStateColor('deprecated')).toBe('warning');
      expect(getVersionStateColor('retired')).toBe('error');
      expect(getVersionStateColor('unknown')).toBe('default');
    });
  });

  describe('getRiskTierColor', () => {
    it('returns correct colors for risk tiers', () => {
      expect(getRiskTierColor('Low')).toBe('success');
      expect(getRiskTierColor('Medium')).toBe('warning');
      expect(getRiskTierColor('High')).toBe('error');
      expect(getRiskTierColor('Unknown')).toBe('success');
    });
  });

  describe('truncateText', () => {
    it('truncates text when longer than max length', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateText(text, 20);
      expect(result).toBe('This is a very long ...');
    });

    it('returns original text when shorter than max length', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);
      expect(result).toBe('Short text');
    });

    it('returns original text when exactly max length', () => {
      const text = 'Exactly twenty chars';
      const result = truncateText(text, 20);
      expect(result).toBe('Exactly twenty chars');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('delays function execution', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('test');
      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith('test');
    });

    it('cancels previous calls when called multiple times', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('third');
    });
  });

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('generates string IDs', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
    });
  });
});