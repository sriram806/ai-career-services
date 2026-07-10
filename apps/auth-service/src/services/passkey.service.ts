import * as crypto from 'node:crypto';
import type { PasskeyRepository, DbPasskey } from '../repositories/passkey.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import type { Redis } from 'ioredis';
import { WebAuthn } from '../utils/webauthn';
import { ErrorFactory } from '@ai-career-os/errors';
import { getConfig } from '@ai-career-os/config';

export class PasskeyService {
  private readonly CHALLENGE_TTL = 300; // 5 minutes

  constructor(
    private readonly passkeyRepository: PasskeyRepository,
    private readonly userRepository: UserRepository,
    private readonly auditRepository: AuditRepository,
    private readonly redisClient: Redis,
  ) {}

  /**
   * Generates WebAuthn registration options.
   */
  async generateRegisterOptions(userId: string, email: string): Promise<any> {
    const challenge = crypto.randomBytes(32).toString('base64url');
    await this.redisClient.set(`webauthn:challenge:register:${userId}`, challenge, 'EX', this.CHALLENGE_TTL);

    const existingKeys = await this.passkeyRepository.findAllForUser(userId);

    const config = getConfig();
    const rpId = new URL(config.CORS_ORIGIN).hostname;

    return {
      challenge,
      rp: {
        name: 'AI Career OS',
        id: rpId === 'localhost' ? 'localhost' : rpId,
      },
      user: {
        id: Buffer.from(userId).toString('base64url'),
        name: email,
        displayName: email.split('@')[0],
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
      ],
      excludeCredentials: existingKeys.map((k) => ({
        id: k.credentialId,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      timeout: 60000,
    };
  }

  /**
   * Verifies the WebAuthn registration response and registers the passkey.
   */
  async verifyAndRegister(
    userId: string,
    response: {
      id: string;
      rawId: string;
      response: {
        clientDataJSON: string;
        attestationObject: string;
        transports?: string[];
      };
      type: string;
    },
    nickname: string,
    ctx: { ipAddress: string | null; userAgent: string | null },
  ): Promise<DbPasskey> {
    const savedChallenge = await this.redisClient.get(`webauthn:challenge:register:${userId}`);
    if (!savedChallenge) {
      throw ErrorFactory.badRequest('Registration challenge expired or missing');
    }

    const config = getConfig();
    const expectedOrigin = config.CORS_ORIGIN;

    // 1. Verify client data JSON
    WebAuthn.verifyClientData(
      response.response.clientDataJSON,
      savedChallenge,
      expectedOrigin,
      'webauthn.create',
    );

    // 2. Parse attestation
    const { credentialId, publicKeyJwk, counter } = WebAuthn.parseAttestation(
      response.response.attestationObject,
    );

    // Check if key already registered
    const existing = await this.passkeyRepository.findByCredentialId(credentialId);
    if (existing) {
      throw ErrorFactory.conflict('This passkey is already registered');
    }

    // 3. Save passkey
    const passkey = await this.passkeyRepository.createPasskey({
      userId,
      credentialId,
      publicKey: JSON.stringify(publicKeyJwk),
      counter,
      transports: response.response.transports || ['internal'],
      nickname,
    });

    // Clean up challenge
    await this.redisClient.del(`webauthn:challenge:register:${userId}`);

    // Audit
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'passkey.created',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { nickname, credentialId },
    });

    return passkey;
  }

  /**
   * Generates WebAuthn authentication options.
   */
  async generateLoginOptions(email: string): Promise<any> {
    const user = await this.userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw ErrorFactory.notFound('User', email);
    }

    const challenge = crypto.randomBytes(32).toString('base64url');
    // Store challenge by user ID
    await this.redisClient.set(`webauthn:challenge:login:${user.id}`, challenge, 'EX', this.CHALLENGE_TTL);

    const existingKeys = await this.passkeyRepository.findAllForUser(user.id);
    const config = getConfig();
    const rpId = new URL(config.CORS_ORIGIN).hostname;

    return {
      challenge,
      rpId: rpId === 'localhost' ? 'localhost' : rpId,
      allowCredentials: existingKeys.map((k) => ({
        id: k.credentialId,
        type: 'public-key',
        transports: k.transports,
      })),
      userVerification: 'preferred',
      timeout: 60000,
    };
  }

  /**
   * Verifies WebAuthn assertion signature and returns the user.
   */
  async verifyAndAuthenticate(
    email: string,
    response: {
      id: string;
      rawId: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
      };
      type: string;
    },
    ctx: { ipAddress: string | null; userAgent: string | null },
  ): Promise<{ user: any; passkey: DbPasskey }> {
    const user = await this.userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw ErrorFactory.notFound('User', email);
    }

    const savedChallenge = await this.redisClient.get(`webauthn:challenge:login:${user.id}`);
    if (!savedChallenge) {
      throw ErrorFactory.badRequest('Authentication challenge expired or missing');
    }

    const passkey = await this.passkeyRepository.findByCredentialId(response.id);
    if (!passkey || passkey.userId !== user.id) {
      throw ErrorFactory.unauthorized('Passkey not registered on this account');
    }

    const config = getConfig();
    const expectedOrigin = config.CORS_ORIGIN;

    // 1. Verify client data
    WebAuthn.verifyClientData(
      response.response.clientDataJSON,
      savedChallenge,
      expectedOrigin,
      'webauthn.get',
    );

    // 2. Parse JWK public key
    const publicKeyJwk = JSON.parse(passkey.publicKey);

    // 3. Verify signature
    const isValidSignature = WebAuthn.verifySignature(
      response.response.signature,
      response.response.authenticatorData,
      response.response.clientDataJSON,
      publicKeyJwk,
    );

    if (!isValidSignature) {
      throw ErrorFactory.unauthorized('Invalid passkey cryptographic signature');
    }

    // 4. Counter verification (Replay attack protection)
    const rawAuthData = Buffer.from(response.response.authenticatorData, 'base64');
    const counter = rawAuthData.readUInt32BE(33);

    // Authenticators sometimes do not increment counter (e.g. mock authenticators or some platform keys)
    // We enforce that the incoming counter is greater than stored counter if it is non-zero
    if (counter > 0 && counter <= passkey.counter) {
      throw ErrorFactory.unauthorized('Replay attack detected: verification counter check failed.');
    }

    // Update counter
    await this.passkeyRepository.updateCounter(passkey.id, counter);

    // Cleanup challenge
    await this.redisClient.del(`webauthn:challenge:login:${user.id}`);

    // Audit
    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'passkey.authenticated',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { credentialId: passkey.credentialId },
    });

    return { user, passkey };
  }

  async getPasskeysForUser(userId: string): Promise<DbPasskey[]> {
    return this.passkeyRepository.findAllForUser(userId);
  }

  async renamePasskey(id: string, userId: string, nickname: string): Promise<void> {
    const passkey = await this.passkeyRepository.findById(id);
    if (!passkey || passkey.userId !== userId) {
      throw ErrorFactory.notFound('Passkey', id);
    }
    await this.passkeyRepository.updateNickname(id, userId, nickname);
  }

  async deletePasskey(id: string, userId: string, ctx: { ipAddress: string | null; userAgent: string | null }): Promise<void> {
    const passkey = await this.passkeyRepository.findById(id);
    if (!passkey || passkey.userId !== userId) {
      throw ErrorFactory.notFound('Passkey', id);
    }
    await this.passkeyRepository.deletePasskey(id, userId);

    // Audit
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'passkey.deleted',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { nickname: passkey.nickname, credentialId: passkey.credentialId },
    });
  }
}
