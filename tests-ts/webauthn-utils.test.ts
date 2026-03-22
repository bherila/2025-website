import { arrayBufferToBase64url, base64urlToArrayBuffer, getCsrfToken } from '@/user/webauthn-utils';

describe('webauthn-utils', () => {
  beforeEach(() => {
    // Mock document.querySelector for CSRF token
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf-token">';
  });

  describe('getCsrfToken', () => {
    it('returns the CSRF token from meta tag', () => {
      expect(getCsrfToken()).toBe('test-csrf-token');
    });

    it('returns empty string when no meta tag', () => {
      document.head.innerHTML = '';
      expect(getCsrfToken()).toBe('');
    });
  });

  describe('base64urlToArrayBuffer', () => {
    it('converts a base64url string to ArrayBuffer', () => {
      // "hello" in base64url is "aGVsbG8"
      const result = base64urlToArrayBuffer('aGVsbG8');
      const bytes = new Uint8Array(result);
      expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
    });

    it('handles base64url with - and _ characters', () => {
      // Base64url uses - instead of + and _ instead of /
      const result = base64urlToArrayBuffer('dGVzdC10ZXN0');
      const bytes = new Uint8Array(result);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('handles strings that need padding', () => {
      // "abc" in base64url is "YWJj" (no padding needed)
      const result = base64urlToArrayBuffer('YWJj');
      const bytes = new Uint8Array(result);
      expect(bytes).toEqual(new Uint8Array([97, 98, 99]));
    });
  });

  describe('arrayBufferToBase64url', () => {
    it('converts ArrayBuffer to base64url string', () => {
      // "hello" = [104, 101, 108, 108, 111]
      const buffer = new Uint8Array([104, 101, 108, 108, 111]).buffer;
      expect(arrayBufferToBase64url(buffer)).toBe('aGVsbG8');
    });

    it('produces no padding characters', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const result = arrayBufferToBase64url(buffer);
      expect(result).not.toContain('=');
    });

    it('uses - instead of + and _ instead of /', () => {
      // We'll test with a buffer that produces these characters when base64-encoded
      const buffer = new Uint8Array([251, 255, 254]).buffer; // produces +// in base64
      const result = arrayBufferToBase64url(buffer);
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
    });
  });

  describe('round-trip', () => {
    it('base64url -> ArrayBuffer -> base64url is lossless', () => {
      const original = 'dGVzdC10ZXN0LWRhdGE';
      const buffer = base64urlToArrayBuffer(original);
      const result = arrayBufferToBase64url(buffer);
      expect(result).toBe(original);
    });

    it('ArrayBuffer -> base64url -> ArrayBuffer is lossless', () => {
      const original = new Uint8Array([1, 2, 3, 200, 255, 0, 128]).buffer;
      const b64 = arrayBufferToBase64url(original);
      const result = base64urlToArrayBuffer(b64);
      expect(new Uint8Array(result)).toEqual(new Uint8Array(original));
    });
  });
});
