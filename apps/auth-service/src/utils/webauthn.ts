import * as crypto from 'node:crypto';

/**
 * Enterprise WebAuthn and Passkeys utility.
 * Handles clientDataJSON verification, authenticatorData parsing,
 * CBOR/COSE decoding of EC public keys, and signature validation.
 */
export class WebAuthn {
  /**
   * Verifies the client data JSON challenge and origin.
   */
  static verifyClientData(
    clientDataJsonBase64: string,
    expectedChallenge: string,
    expectedOrigin: string,
    expectedType: 'webauthn.create' | 'webauthn.get',
  ): { challenge: string; origin: string; type: string } {
    const rawJson = Buffer.from(clientDataJsonBase64, 'base64').toString('utf8');
    const clientData = JSON.parse(rawJson);

    // Normalize challenges (might be base64url encoded)
    const normExpected = this.normalizeChallenge(expectedChallenge);
    const normReceived = this.normalizeChallenge(clientData.challenge);

    if (normExpected !== normReceived) {
      throw new Error('WebAuthn challenge mismatch');
    }

    if (clientData.origin !== expectedOrigin) {
      throw new Error(`WebAuthn origin mismatch. Expected ${expectedOrigin}, got ${clientData.origin}`);
    }

    if (clientData.type !== expectedType) {
      throw new Error(`WebAuthn type mismatch. Expected ${expectedType}, got ${clientData.type}`);
    }

    return clientData;
  }

  /**
   * Verifies an authentication signature.
   */
  static verifySignature(
    signatureBase64: string,
    authenticatorDataBase64: string,
    clientDataJsonBase64: string,
    publicKeyPemOrJwk: string | object,
  ): boolean {
    const signature = Buffer.from(signatureBase64, 'base64');
    const authData = Buffer.from(authenticatorDataBase64, 'base64');
    const clientDataJson = Buffer.from(clientDataJsonBase64, 'base64');

    // Signature verification is performed over: authData + hash(clientDataJSON)
    const clientDataHash = crypto.createHash('sha256').update(clientDataJson).digest();
    const verifyData = Buffer.concat([authData, clientDataHash]);

    let publicKey: crypto.KeyObject;
    if (typeof publicKeyPemOrJwk === 'string') {
      publicKey = crypto.createPublicKey(publicKeyPemOrJwk);
    } else {
      publicKey = crypto.createPublicKey({
        key: publicKeyPemOrJwk as any,
        format: 'jwk',
      });
    }

    return crypto.verify(
      'sha256',
      verifyData,
      publicKey,
      signature,
    );
  }

  /**
   * Parses the WebAuthn registration attestation response.
   * Extracts credential ID and public key in JWK format.
   */
  static parseAttestation(attestationObjectBase64: string): {
    credentialId: string;
    publicKeyJwk: object;
    counter: number;
  } {
    const attestation = Buffer.from(attestationObjectBase64, 'base64');
    
    // Attestation object is CBOR encoded, we need to extract authData
    // We search for key "authData" in CBOR.
    // In typical attestation CBOR, authData is a byte string value.
    const authDataOffset = this.findAuthDataOffset(attestation);
    if (authDataOffset === -1) {
      throw new Error('Failed to find authData in attestation object');
    }

    // Read the authData buffer
    const authData = this.readCBORByteString(attestation, authDataOffset);

    // authData layout:
    // - rpIdHash: 32 bytes
    // - flags: 1 byte
    // - signCount: 4 bytes
    // - attestedCredentialData: present if flags bit 6 (0x40) is set
    if (authData.length < 37) {
      throw new Error('Invalid authData length');
    }

    const flags = authData.readUInt8(32);
    const counter = authData.readUInt32BE(33);

    const hasAttestedCredentialData = (flags & 0x40) !== 0;
    if (!hasAttestedCredentialData) {
      throw new Error('No attested credential data present in registration');
    }

    // Attested Credential Data:
    // - aaguid: 16 bytes
    // - credentialIdLength: 2 bytes
    // - credentialId: L bytes
    // - credentialPublicKey: CBOR map
    const credIdLen = authData.readUInt16BE(37 + 16);
    const credentialIdBuffer = authData.subarray(37 + 16 + 2, 37 + 16 + 2 + credIdLen);
    const credentialId = credentialIdBuffer.toString('base64url');

    const publicKeyBytes = authData.subarray(37 + 16 + 2 + credIdLen);
    const publicKeyJwk = this.decodeCosePublicKey(publicKeyBytes);

    return {
      credentialId,
      publicKeyJwk,
      counter,
    };
  }

  /**
   * Helper to normalize base64url padding differences.
   */
  private static normalizeChallenge(challenge: string): string {
    return challenge.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  /**
   * Minimal search for "authData" tag in CBOR attestation object.
   */
  private static findAuthDataOffset(attestation: Buffer): number {
    // "authData" string search
    const needle = Buffer.from('authData');
    return attestation.indexOf(needle);
  }

  /**
   * Read a byte string from CBOR starting at key offset.
   */
  private static readCBORByteString(cbor: Buffer, keyOffset: number): Buffer {
    // In CBOR key-value maps: key is followed by value.
    // The key is "authData" (major type 3 - text string, length 8: 0x68 'a' 'u' 't' 'h' 'D' 'a' 't' 'a').
    // Immediately after 'a' (keyOffset + 8), should be the value.
    // The value is major type 2 (byte string).
    let valOffset = keyOffset + 8;
    const typeByte = cbor.readUInt8(valOffset);
    const majorType = typeByte >> 5;
    const info = typeByte & 0x1f;

    if (majorType !== 2) {
      throw new Error('Expected CBOR byte string for authData');
    }

    let length = 0;
    let headerLength = 1;

    if (info < 24) {
      length = info;
    } else if (info === 24) {
      length = cbor.readUInt8(valOffset + 1);
      headerLength = 2;
    } else if (info === 25) {
      length = cbor.readUInt16BE(valOffset + 1);
      headerLength = 3;
    } else if (info === 26) {
      length = cbor.readUInt32BE(valOffset + 1);
      headerLength = 5;
    } else {
      throw new Error('Unsupported CBOR byte string size');
    }

    return cbor.subarray(valOffset + headerLength, valOffset + headerLength + length);
  }

  /**
   * Parses CBOR COSE key format into a JWK structure for Node's crypto library.
   * Assumes ES256 (EC key over P-256 curve, alg -7).
   */
  private static decodeCosePublicKey(cose: Buffer): object {
    // COSE Key is a map:
    // Key type (1): 2 (EC2)
    // Algorithm (3): -7 (ES256)
    // Curve (-1): 1 (P-256)
    // X (-2): Byte String (32 bytes)
    // Y (-3): Byte String (32 bytes)
    
    // We scan the buffer sequentially for coordinates X and Y.
    // In P-256, X and Y coordinates are 32-byte buffers.
    // We look for CBOR keys:
    // - Curve parameter key: 0x20 (-1 curves) or 0x01 (kty)
    // - Coordinate X key is -2: 0x21
    // - Coordinate Y key is -3: 0x22
    
    let xBuffer: Buffer | null = null;
    let yBuffer: Buffer | null = null;

    // Scan for 0x21 followed by 0x58 0x20 (32-byte string tag)
    const xIdx = cose.indexOf(Buffer.from([0x21, 0x58, 0x20]));
    if (xIdx !== -1) {
      xBuffer = cose.subarray(xIdx + 3, xIdx + 3 + 32);
    }

    // Scan for 0x22 followed by 0x58 0x20 (32-byte string tag)
    const yIdx = cose.indexOf(Buffer.from([0x22, 0x58, 0x20]));
    if (yIdx !== -1) {
      yBuffer = cose.subarray(yIdx + 3, yIdx + 3 + 32);
    }

    if (!xBuffer || xBuffer.length !== 32 || !yBuffer || yBuffer.length !== 32) {
      throw new Error('Invalid COSE public key coordinate formats');
    }

    return {
      kty: 'EC',
      crv: 'P-256',
      x: xBuffer.toString('base64url'),
      y: yBuffer.toString('base64url'),
    };
  }
}
