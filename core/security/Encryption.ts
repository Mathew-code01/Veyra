
// core/security/Encryption.ts

/**
 * Encrypted payload produced by the Veyra encryption service.
 *
 * AES-256-GCM provides:
 * - confidentiality
 * - integrity/authentication
 * - tamper detection
 */
export interface EncryptedPayload {
  readonly version: 1;
  readonly algorithm: "AES-256-GCM";
  readonly iv: string;
  readonly ciphertext: string;
}

/**
 * Configuration options for the encryption service.
 */
export interface EncryptionOptions {
  /**
   * PBKDF2 iteration count.
   *
   * Higher values increase password-derived key computation cost.
   * The default is intentionally conservative for local desktop use.
   */
  readonly iterations?: number;
}

const MIN_ITERATIONS = 310_000;
const MIN_SALT_LENGTH = 16;
const IV_LENGTH = 12;

const AES_KEY_LENGTH = 256;
const AES_GCM_TAG_LENGTH = 128;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export class Encryption {
  private readonly iterations: number;

  public constructor(options: EncryptionOptions = {}) {
    const iterations = options.iterations ?? MIN_ITERATIONS;

    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
      throw new RangeError(
        `PBKDF2 iterations must be an integer >= ${MIN_ITERATIONS}.`,
      );
    }

    this.iterations = iterations;
  }

  /**
   * Creates cryptographically secure random salt bytes.
   */
  public createSalt(length = MIN_SALT_LENGTH): Uint8Array {
    if (!Number.isInteger(length) || length < MIN_SALT_LENGTH) {
      throw new RangeError(
        `Encryption salt must be at least ${MIN_SALT_LENGTH} bytes.`,
      );
    }

    return randomBytes(length);
  }

  /**
   * Derives an AES-256 encryption key from a password and salt.
   *
   * PBKDF2 + SHA-256 is used for password-based key derivation.
   */
  public async deriveKey(
    password: string,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Encryption password cannot be empty.");
    }

    validateSalt(salt);

    const subtle = getSubtleCrypto();

    /**
     * Web Crypto's TypeScript definitions can require an ArrayBuffer
     * specifically rather than Uint8Array<ArrayBufferLike>.
     *
     * Convert explicitly to a concrete ArrayBuffer.
     */
    const passwordBuffer = bytesToArrayBuffer(encodeText(password));
    const saltBuffer = bytesToArrayBuffer(salt);

    const material = await subtle.importKey(
      "raw",
      passwordBuffer,
      {
        name: "PBKDF2",
      },
      false,
      ["deriveKey"],
    );

    return subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: this.iterations,
        hash: "SHA-256",
      },
      material,
      {
        name: "AES-GCM",
        length: AES_KEY_LENGTH,
      },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   */
  public async encrypt(
    plaintext: string,
    key: CryptoKey,
  ): Promise<EncryptedPayload> {
    if (typeof plaintext !== "string") {
      throw new TypeError("Plaintext must be a string.");
    }

    validateEncryptionKey(key);

    const subtle = getSubtleCrypto();

    const iv = randomBytes(IV_LENGTH);

    /**
     * Convert all Web Crypto byte inputs to concrete ArrayBuffers.
     * This avoids the ArrayBufferLike / ArrayBuffer TypeScript mismatch.
     */
    const ivBuffer = bytesToArrayBuffer(iv);
    const plaintextBuffer = bytesToArrayBuffer(encodeText(plaintext));

    const encrypted = await subtle.encrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
        tagLength: AES_GCM_TAG_LENGTH,
      },
      key,
      plaintextBuffer,
    );

    return {
      version: 1,
      algorithm: "AES-256-GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    };
  }

  /**
   * Decrypts an AES-256-GCM encrypted payload.
   */
  public async decrypt(
    payload: EncryptedPayload,
    key: CryptoKey,
  ): Promise<string> {
    validatePayload(payload);
    validateEncryptionKey(key);

    const subtle = getSubtleCrypto();

    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);

    if (iv.length !== IV_LENGTH) {
      throw new Error("Encrypted payload contains an invalid IV.");
    }

    /**
     * Convert Uint8Array<ArrayBufferLike> to concrete ArrayBuffer
     * before passing values to Web Crypto.
     */
    const ivBuffer = bytesToArrayBuffer(iv);
    const ciphertextBuffer = bytesToArrayBuffer(ciphertext);

    try {
      const decrypted = await subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBuffer,
          tagLength: AES_GCM_TAG_LENGTH,
        },
        key,
        ciphertextBuffer,
      );

      return decodeText(new Uint8Array(decrypted));
    } catch {
      /**
       * Do not expose whether the failure was caused by:
       * - wrong key
       * - corrupted ciphertext
       * - invalid authentication tag
       *
       * This keeps the public error surface intentionally generic.
       */
      throw new Error(
        "Unable to decrypt payload. The key or encrypted data may be invalid.",
      );
    }
  }
}

/**
 * Returns the Web Crypto SubtleCrypto implementation.
 *
 * Veyra uses the standard Web Crypto API rather than Node's legacy
 * crypto APIs so the same encryption abstraction can be shared safely
 * across compatible desktop/runtime environments.
 */
function getSubtleCrypto(): SubtleCrypto {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi || !cryptoApi.subtle) {
    throw new Error("Web Crypto API is unavailable.");
  }

  return cryptoApi.subtle;
}

/**
 * Generates cryptographically secure random bytes.
 */
function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError("Random byte length must be positive.");
  }

  const bytes = new Uint8Array(length);

  globalThis.crypto.getRandomValues(bytes);

  return bytes;
}

/**
 * Encodes UTF-8 text.
 */
function encodeText(value: string): Uint8Array {
  return TEXT_ENCODER.encode(value);
}

/**
 * Decodes UTF-8 bytes.
 */
function decodeText(value: Uint8Array): string {
  return TEXT_DECODER.decode(value);
}

/**
 * Converts Uint8Array bytes into a concrete ArrayBuffer.
 *
 * This helper is important for the current TypeScript DOM typings.
 *
 * Uint8Array may be represented as:
 *
 *     Uint8Array<ArrayBufferLike>
 *
 * while Web Crypto expects:
 *
 *     ArrayBufferView<ArrayBuffer>
 *
 * Creating a new ArrayBuffer and copying the bytes guarantees that
 * the returned value is backed by a real ArrayBuffer rather than a
 * potentially SharedArrayBuffer-compatible ArrayBufferLike.
 */
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

/**
 * Converts bytes to base64 without using spread on the entire array.
 *
 * Chunking prevents "Maximum call stack size exceeded" for larger
 * payloads.
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }

  let binary = "";

  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length),
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * Converts a base64 string into bytes.
 */
function base64ToBytes(value: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid base64 value.");
  }

  let binary: string;

  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid base64 value.");
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Validates an encryption salt.
 */
function validateSalt(salt: Uint8Array): void {
  if (!(salt instanceof Uint8Array)) {
    throw new TypeError("Encryption salt must be a Uint8Array.");
  }

  if (salt.length < MIN_SALT_LENGTH) {
    throw new RangeError(
      `Encryption salt must be at least ${MIN_SALT_LENGTH} bytes.`,
    );
  }
}

/**
 * Validates an encrypted payload before decryption.
 */
function validatePayload(payload: EncryptedPayload): void {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Invalid encrypted payload.");
  }

  if (payload.version !== 1) {
    throw new Error("Unsupported encrypted payload version.");
  }

  if (payload.algorithm !== "AES-256-GCM") {
    throw new Error("Unsupported encryption algorithm.");
  }

  if (
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string"
  ) {
    throw new TypeError("Encrypted payload is malformed.");
  }
}

/**
 * Validates that the supplied key is an AES-GCM key.
 */
function validateEncryptionKey(key: CryptoKey): void {
  if (!key) {
    throw new TypeError("Encryption key is required.");
  }

  if (!key.algorithm || key.algorithm.name !== "AES-GCM") {
    throw new TypeError("Encryption key must use AES-GCM.");
  }

  if (key.type !== "secret") {
    throw new TypeError("Encryption key must be a secret key.");
  }
}
