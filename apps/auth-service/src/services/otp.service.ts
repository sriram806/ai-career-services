import * as crypto from 'node:crypto';
import type { OtpRepository, DbOtpCode } from '../repositories/otp.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { Redis } from 'ioredis';
import { ErrorFactory } from '@ai-career-os/errors';
import type { EmailService } from './email.service';

/**
 * Enterprise OTP Service.
 *
 * Security architecture:
 *   - OTPs are 6-digit numeric codes generated from crypto.randomInt (CSPRNG)
 *   - Only SHA-256 hashes are stored — plaintext OTPs exist only in transit to the user
 *   - Redis provides fast validation + rate limiting; PostgreSQL is the durable backup
 *   - Three-layer rate limiting:
 *       1. Per-request cooldown: 60 seconds between OTP requests
 *       2. Hourly limit: max 3 active OTP requests per user per purpose per hour
 *       3. Abuse suspension: temporarily suspends OTP generation after repeated abuse
 *   - Max 5 verification attempts per OTP — then the OTP is invalidated
 *   - 5-minute expiry window
 *
 * Redis key schema:
 *   otp:code:{userId}:{purpose}     → hashed OTP (TTL: 5 min)
 *   otp:attempts:{userId}:{purpose} → verification attempt counter (TTL: 5 min)
 *   otp:cooldown:{userId}:{purpose} → request cooldown lock (TTL: 60 sec)
 *   otp:hourly:{userId}:{purpose}   → hourly request counter (TTL: 1 hour)
 *   otp:suspend:{userId}:{purpose}  → abuse suspension flag (TTL: 1 hour)
 */
export class OtpService {
  private readonly maxVerificationAttempts = 5;
  private readonly expiryMinutes = 5;
  private readonly cooldownSeconds = 60;
  private readonly maxHourlyRequests = 3;

  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly userRepository: UserRepository,
    private readonly redisClient: Redis,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generates a 6-digit numeric OTP, hashes it, stores in Redis + PostgreSQL.
   * Returns the plaintext OTP (to be sent via email/SMS — never persisted).
   *
   * Rate limiting:
   *   1. 60-second cooldown between requests
   *   2. Max 3 requests per hour per user per purpose
   *   3. Abuse suspension after repeated limit violations
   */
  async generateOtp(userId: string, purpose: string): Promise<string> {
    const suspendKey = `otp:suspend:${userId}:${purpose}`;
    const cooldownKey = `otp:cooldown:${userId}:${purpose}`;
    const hourlyKey = `otp:hourly:${userId}:${purpose}`;

    // 1. Check abuse suspension
    const isSuspended = await this.redisClient.exists(suspendKey);
    if (isSuspended) {
      throw ErrorFactory.forbidden(
        'OTP generation temporarily suspended due to repeated requests. Please try again later.',
      );
    }

    // 2. Enforce per-request cooldown (60 seconds)
    const onCooldown = await this.redisClient.exists(cooldownKey);
    if (onCooldown) {
      const ttl = await this.redisClient.ttl(cooldownKey);
      throw ErrorFactory.badRequest(
        `Please wait ${ttl > 0 ? ttl : this.cooldownSeconds} seconds before requesting a new verification code`,
      );
    }

    // 3. Enforce hourly limit (max 3 requests per hour)
    const hourlyCount = Number(await this.redisClient.get(hourlyKey) ?? 0);
    if (hourlyCount >= this.maxHourlyRequests) {
      // Trigger abuse suspension for 1 hour
      await this.redisClient.set(suspendKey, '1', 'EX', 3600);
      throw ErrorFactory.forbidden(
        'Maximum OTP requests exceeded. OTP generation suspended for 1 hour.',
      );
    }

    // 4. Generate cryptographically secure 6-digit OTP
    const code = crypto.randomInt(100000, 999999).toString();
    const hash = this.hashOtp(code);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60_000);

    // 5. Invalidate any existing active codes in PostgreSQL
    await this.otpRepository.deleteAllUserOtpCodes(userId, purpose);

    // 6. Save new code to PostgreSQL (durable backup)
    await this.otpRepository.createOtpCode({
      userId,
      codeHash: hash,
      purpose,
      expiresAt,
    });

    // 7. Store in Redis for fast validation
    const redisKey = `otp:code:${userId}:${purpose}`;
    const attemptsKey = `otp:attempts:${userId}:${purpose}`;
    await this.redisClient.set(redisKey, hash, 'EX', this.expiryMinutes * 60);
    await this.redisClient.set(attemptsKey, '0', 'EX', this.expiryMinutes * 60);

    // 8. Set cooldown and increment hourly counter
    await this.redisClient.set(cooldownKey, '1', 'EX', this.cooldownSeconds);
    const newHourlyCount = await this.redisClient.incr(hourlyKey);
    if (newHourlyCount === 1) {
      await this.redisClient.expire(hourlyKey, 3600);
    }

    // Send OTP email asynchronously
    const user = await this.userRepository.findById(userId);
    if (user) {
      this.emailService.sendOtpEmail(user.email, purpose, code).catch((err) => {
        console.error(`Failed to send OTP email to ${user.email}:`, err);
      });
    }

    return code;
  }

  /**
   * Verifies the provided OTP against the stored hash.
   * Enforces max verification attempts and invalidates on success or limit exceeded.
   *
   * Returns true on valid match, false on mismatch.
   * Throws on attempts exceeded or expired OTP.
   */
  async verifyOtp(userId: string, purpose: string, code: string): Promise<boolean> {
    const redisKey = `otp:code:${userId}:${purpose}`;
    const attemptsKey = `otp:attempts:${userId}:${purpose}`;

    // 1. Fetch active hash from Redis (fast path) or PostgreSQL (fallback)
    let cachedHash = await this.redisClient.get(redisKey);
    let attempts = Number(await this.redisClient.get(attemptsKey) ?? 0);
    let dbCode: DbOtpCode | null = null;

    if (!cachedHash) {
      // Redis cache miss — check PostgreSQL backup
      dbCode = await this.otpRepository.findLatestActiveCode(userId, purpose);
      if (!dbCode || dbCode.expiresAt.getTime() < Date.now() || dbCode.isUsed) {
        // Return false instead of throwing — prevents OTP enumeration
        return false;
      }
      cachedHash = dbCode.codeHash;
      attempts = dbCode.attempts;
    }

    // 2. Check verification attempts limit
    if (attempts >= this.maxVerificationAttempts) {
      await this.invalidateOtp(userId, purpose, dbCode?.id);
      throw ErrorFactory.badRequest(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // 3. Constant-time hash comparison
    const inputHash = this.hashOtp(code);
    if (!crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(cachedHash))) {
      // Increment attempts counter
      attempts += 1;
      await this.redisClient.set(attemptsKey, String(attempts), 'KEEPTTL');

      // Also update PostgreSQL backup
      if (dbCode) {
        await this.otpRepository.incrementAttempts(dbCode.id);
      } else {
        const backup = await this.otpRepository.findLatestActiveCode(userId, purpose);
        if (backup) {
          await this.otpRepository.incrementAttempts(backup.id);
        }
      }

      // Check if limit reached after increment
      if (attempts >= this.maxVerificationAttempts) {
        await this.invalidateOtp(userId, purpose, dbCode?.id);
        throw ErrorFactory.badRequest(
          'Maximum verification attempts exceeded. Please request a new code.',
        );
      }

      return false;
    }

    // 4. Verification successful — invalidate the OTP (single-use)
    await this.invalidateOtp(userId, purpose, dbCode?.id);
    return true;
  }

  /**
   * Invalidates OTP in both Redis and PostgreSQL.
   * Called on successful verification or when max attempts are exceeded.
   */
  private async invalidateOtp(userId: string, purpose: string, dbId?: string): Promise<void> {
    const redisKey = `otp:code:${userId}:${purpose}`;
    const attemptsKey = `otp:attempts:${userId}:${purpose}`;

    await this.redisClient.del(redisKey);
    await this.redisClient.del(attemptsKey);

    if (dbId) {
      await this.otpRepository.deleteOtpCode(dbId);
    } else {
      await this.otpRepository.deleteAllUserOtpCodes(userId, purpose);
    }
  }

  /**
   * Hashes the numeric OTP code using SHA-256.
   */
  private hashOtp(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}
