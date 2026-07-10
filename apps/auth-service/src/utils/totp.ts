import * as crypto from 'node:crypto';

/**
 * Enterprise time-based one-time password (TOTP) utility.
 * Implements RFC 6238 using native Node.js crypto.
 * Supports Base32 encoding/decoding, QR code URI generation,
 * and clock-drift verification windows.
 */
export class Totp {
  private static readonly BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /**
   * Generates a cryptographically secure random Base32 TOTP secret.
   */
  static generateSecret(length = 20): string {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      const index = bytes.readUInt8(i) % this.BASE32_CHARS.length;
      result += this.BASE32_CHARS.charAt(index);
    }
    return result;
  }

  /**
   * Generates a standard otpauth URL for QR codes.
   */
  static getQrCodeUri(secret: string, email: string, issuer = 'AICareerOS'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Verifies a 6-digit TOTP token against a secret, accounting for clock drift.
   */
  static verifyToken(secret: string, token: string, window = 1): boolean {
    if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
      return false;
    }

    const key = this.decodeBase32(secret);
    const counter = Math.floor(Date.now() / 30000);

    // Check current counter, plus/minus the window size
    for (let i = -window; i <= window; i++) {
      const step = counter + i;
      const expectedToken = this.generateTokenForCounter(key, step);
      if (expectedToken === token) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper to generate a TOTP token for a specific 30-second time counter step.
   */
  private static generateTokenForCounter(key: Buffer, counter: number): string {
    // 1. Convert counter step to 8-byte buffer
    const buffer = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      buffer[i] = counter & 0xff;
      counter = counter >> 8;
    }

    // 2. Perform HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const hash = hmac.digest();

    // 3. Dynamic truncation (RFC 4226)
    const offset = hash.readUInt8(hash.length - 1) & 0xf;
    const binary =
      ((hash.readUInt8(offset) & 0x7f) << 24) |
      ((hash.readUInt8(offset + 1) & 0xff) << 16) |
      ((hash.readUInt8(offset + 2) & 0xff) << 8) |
      (hash.readUInt8(offset + 3) & 0xff);

    // 4. Extract last 6 digits
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Decodes a Base32 string into a Buffer.
   */
  private static decodeBase32(base32: string): Buffer {
    const cleaned = base32.toUpperCase().replace(/=+$/, '');
    const length = cleaned.length;
    const buffer = Buffer.alloc(Math.floor((length * 5) / 8));

    let bits = 0;
    let value = 0;
    let index = 0;

    for (let i = 0; i < length; i++) {
      const charCode = cleaned.charCodeAt(i);
      const val = this.BASE32_CHARS.indexOf(String.fromCharCode(charCode));
      if (val === -1) {
        throw new Error('Invalid Base32 character');
      }

      value = (value << 5) | val;
      bits += 5;

      if (bits >= 8) {
        buffer[index++] = (value >> (bits - 8)) & 0xff;
        bits -= 8;
      }
    }

    return buffer;
  }
}
