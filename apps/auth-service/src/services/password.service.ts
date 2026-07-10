import * as argon2 from 'argon2';

/**
 * Comprehensive list of common/weak passwords that must be rejected.
 * In production, this would be backed by a 100K+ entry list from
 * the Have I Been Pwned password dictionary or NCSC top passwords.
 *
 * This set is loaded once into memory and checked with O(1) lookups.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  '12345678', '123456789', '1234567890', '12345678901', '123456789012',
  'admin123', 'admin1234', 'administrator', 'welcome123', 'welcome1234',
  'letmein123', 'letmein1234', 'qwerty12345', 'qwerty123456', 'qwertyuiop',
  'iloveyou123', 'monkey12345', 'dragon12345', 'master12345', 'trustno1234',
  'abc123456789', 'changeme1234', 'football1234', 'baseball1234', 'soccer12345',
  'shadow12345', 'michael12345', 'jennifer1234', 'jordan12345', 'thomas12345',
  'charlie12345', 'andrew12345', 'jessica12345', 'sunshine1234', 'princess1234',
  'computer1234', 'michelle1234', 'password12345', 'qwerty1234567',
  'pass@word123', 'p@ssw0rd1234', 'p@$$w0rd1234', 'passw0rd1234',
  'welcome@1234', 'admin@12345', 'test12345678', 'default12345',
  'letmein12345', 'trustno12345', 'access123456', 'master123456',
  'hello1234567', 'charlie123456', 'donald123456', 'batman123456',
  'qazwsx123456', 'starwars12345', 'dragon123456', 'monkey123456',
  'login1234567', 'abc1234567890', 'admin12345678', 'root12345678',
  'toor12345678', 'pass12345678', 'test@1234567', 'user12345678',
  'guest1234567', 'info12345678', 'mysql1234567', 'oracle123456',
  'sysadmin12345', 'supervisor123', 'manager12345', 'secret123456',
  'freedom12345', 'whatever12345', 'qwert1234567', 'zxcvbn123456',
  'assword12345', 'killer123456', 'pepper123456', 'george123456',
  'zaq12wsx3edc', 'summer123456', 'winter123456', 'spring123456',
]);

/**
 * Service responsible for all password operations.
 *
 * Security decisions:
 *   - Argon2id: Chosen over bcrypt/scrypt because it's the OWASP-recommended
 *     algorithm and provides resistance to both side-channel and GPU attacks.
 *   - Memory cost 19456 KB (19 MB): Prevents GPU-based brute force while
 *     keeping per-request latency under 500ms on a 2-core server.
 *   - Time cost 2: Two passes provides strong security without excessive latency.
 *   - Parallelism 1: Prevents multi-threaded attacks from reducing effective cost.
 *   - Minimum 12 characters: NIST SP 800-63B and OWASP ASVS §2.1.1 recommendation.
 */
export class PasswordService {
  private static readonly MIN_LENGTH = 12;
  private static readonly MAX_LENGTH = 128;

  /**
   * Hashes password using Argon2id with OWASP-recommended configuration.
   * Returns the full Argon2 encoded string (includes salt, params, hash).
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  /**
   * Constant-time comparison of plain password against stored hash.
   * Argon2's verify function is inherently constant-time.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Validates password against the full enterprise password policy.
   *
   * Policy (OWASP ASVS §2.1):
   *   - Minimum 12 characters
   *   - Maximum 128 characters (prevents Argon2 DoS with mega-strings)
   *   - At least one uppercase letter
   *   - At least one lowercase letter
   *   - At least one digit
   *   - At least one special character
   *   - Not in common passwords list
   *   - Not containing username or email
   */
  validatePasswordPolicy(
    password: string,
    context?: { username?: string; email?: string },
  ): { isValid: boolean; reason?: string } {
    if (password.length < PasswordService.MIN_LENGTH) {
      return { isValid: false, reason: `Password must be at least ${PasswordService.MIN_LENGTH} characters long` };
    }

    if (password.length > PasswordService.MAX_LENGTH) {
      return { isValid: false, reason: `Password must not exceed ${PasswordService.MAX_LENGTH} characters` };
    }

    // Common password check (case-insensitive)
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      return { isValid: false, reason: 'Password is too common or easily guessable' };
    }

    // Leaked password placeholder — in production, integrate with Have I Been Pwned API
    // or a local k-anonymity hash prefix check against the HIBP dataset.
    // const isLeaked = await this.checkLeakedPassword(password);
    // if (isLeaked) return { isValid: false, reason: 'This password has appeared in a data breach' };

    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
      return {
        isValid: false,
        reason: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      };
    }

    // Username/email containment check
    if (context?.username && password.toLowerCase().includes(context.username.toLowerCase())) {
      return { isValid: false, reason: 'Password must not contain your username' };
    }
    if (context?.email) {
      const emailLocal = context.email.split('@')[0];
      if (emailLocal && password.toLowerCase().includes(emailLocal.toLowerCase())) {
        return { isValid: false, reason: 'Password must not contain your email address' };
      }
    }

    return { isValid: true };
  }

  /**
   * Checks whether the new password matches any of the previous N hashes.
   * This prevents password reuse attacks (OWASP ASVS §2.1.10).
   *
   * Note: This is computationally expensive (N × Argon2 verify calls).
   * The service layer limits N to 5 to keep latency acceptable.
   */
  async isPasswordInHistory(newPassword: string, previousHashes: string[]): Promise<boolean> {
    for (const hash of previousHashes) {
      const isMatch = await this.verifyPassword(newPassword, hash);
      if (isMatch) {
        return true;
      }
    }
    return false;
  }
}
