import { describe, it, expect } from 'vitest';
import { hasInjectionSignature, validateRequestSecurity } from '../../src/middlewares/validation';

describe('Validation and Security Middleware', () => {
  describe('hasInjectionSignature', () => {
    it('should pass safe strings and structures', () => {
      expect(hasInjectionSignature('hello world')).toBe(false);
      expect(hasInjectionSignature(12345)).toBe(false);
      expect(hasInjectionSignature({ name: 'Alice', age: 30 })).toBe(false);
      expect(hasInjectionSignature(['safe string 1', 'safe string 2'])).toBe(false);
    });

    it('should detect SQL injection patterns in strings', () => {
      expect(hasInjectionSignature("1' OR '1'='1")).toBe(true);
      expect(hasInjectionSignature('SELECT * FROM users')).toBe(true);
      expect(hasInjectionSignature('UNION ALL SELECT username, password FROM users')).toBe(true);
      expect(hasInjectionSignature('DROP TABLE posts')).toBe(true);
    });

    it('should detect NoSQL injection operators in object keys', () => {
      expect(hasInjectionSignature({ username: { $ne: null } })).toBe(true);
      expect(hasInjectionSignature({ email: { $gt: '' } })).toBe(true);
      expect(hasInjectionSignature({ '$regex': '.*' })).toBe(true);
    });

    it('should detect injection recursively in nested arrays/objects', () => {
      expect(hasInjectionSignature([{ name: 'safe' }, { query: "UNION SELECT 1" }])).toBe(true);
      expect(
        hasInjectionSignature({
          filters: {
            user: {
              id: "1' OR 1=1",
            },
          },
        }),
      ).toBe(true);
    });
  });

  describe('validateRequestSecurity', () => {
    it('should allow valid write requests', async () => {
      const mockReq = {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        params: {},
        query: {},
        body: { username: 'john_doe' },
      } as any;

      await expect(validateRequestSecurity(mockReq, {} as any)).resolves.not.toThrow();
    });

    it('should throw badRequest if Content-Type is missing on POST', async () => {
      const mockReq = {
        method: 'POST',
        headers: {},
        params: {},
        query: {},
        body: {},
      } as any;

      await expect(validateRequestSecurity(mockReq, {} as any)).rejects.toThrowError(
        /Missing Content-Type header/,
      );
    });

    it('should throw badRequest for unsupported Content-Type', async () => {
      const mockReq = {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
        },
        params: {},
        query: {},
        body: {},
      } as any;

      await expect(validateRequestSecurity(mockReq, {} as any)).rejects.toThrowError(
        /Unsupported Content-Type/,
      );
    });

    it('should throw badRequest if SQL injection is present in query parameters', async () => {
      const mockReq = {
        method: 'GET',
        headers: {},
        params: {},
        query: { search: "test' UNION SELECT username FROM users--" },
        body: {},
      } as any;

      await expect(validateRequestSecurity(mockReq, {} as any)).rejects.toThrowError(
        /Security Validation Failed: Malicious query parameters or path/,
      );
    });
  });
});
