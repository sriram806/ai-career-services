import { describe, it, expect } from 'vitest';
import { PasswordService } from '../../src/services/password.service';

describe('PasswordService Unit Tests', () => {
  const service = new PasswordService();

  it('should validate password policy correctly', () => {
    // Weak passwords
    expect(service.validatePasswordPolicy('short').isValid).toBe(false);
    expect(service.validatePasswordPolicy('OnlyLettersAndLonger').isValid).toBe(false);
    expect(service.validatePasswordPolicy('NoSpecialChar123').isValid).toBe(false);
    expect(service.validatePasswordPolicy('password123!').isValid).toBe(false); // Common password list check

    // Strong passwords
    expect(service.validatePasswordPolicy('SecureP@ss123').isValid).toBe(true);
    expect(service.validatePasswordPolicy('Strong_P4ssword!').isValid).toBe(true);
  });

  it('should hash and verify passwords using Argon2id', async () => {
    const password = 'SecureP@ss123';
    const hash = await service.hashPassword(password);

    expect(hash).toContain('$argon2id$');

    const isMatch = await service.verifyPassword(password, hash);
    expect(isMatch).toBe(true);

    const isInvalidMatch = await service.verifyPassword('wrongpassword', hash);
    expect(isInvalidMatch).toBe(false);
  });
});
