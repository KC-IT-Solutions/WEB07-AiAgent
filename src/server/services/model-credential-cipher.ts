import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const BASE64_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface EncryptedModelCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export type ModelCredentialCipherErrorCode =
  | 'MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING'
  | 'MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID';

export class ModelCredentialCipherError extends Error {
  constructor(readonly code: ModelCredentialCipherErrorCode) {
    super('MODEL_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key');
    this.name = 'ModelCredentialCipherError';
  }
}

export class ModelCredentialCipher {
  constructor(private readonly encodedKey: string | undefined) {}

  encrypt(apiKey: string): EncryptedModelCredential {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(credential: EncryptedModelCredential): string {
    const key = this.getKey();

    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(credential.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(credential.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(credential.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Model connection credential decryption failed');
    }
  }

  private getKey(): Buffer {
    if (!this.encodedKey) {
      throw new ModelCredentialCipherError('MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING');
    }
    if (!BASE64_KEY_PATTERN.test(this.encodedKey)) {
      throw new ModelCredentialCipherError('MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID');
    }

    const key = Buffer.from(this.encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== this.encodedKey) {
      throw new ModelCredentialCipherError('MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID');
    }
    return key;
  }
}
