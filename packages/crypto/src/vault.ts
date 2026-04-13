/**
 * Encrypted vault — encrypt/decrypt arbitrary data using AES-256-GCM.
 *
 * All sensitive data in IndexedDB flows through this module.
 * The encryption key is a non-extractable CryptoKey derived from the user's passphrase.
 */

const IV_BYTES = 12; // 96-bit IV for AES-GCM (NIST recommended)

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ct: string;
  /** Base64-encoded IV (unique per record) */
  iv: string;
}

/** Encrypt a JavaScript value to an EncryptedPayload */
export async function encrypt(
  key: CryptoKey,
  data: unknown,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext,
  );

  return {
    ct: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  };
}

/** Decrypt an EncryptedPayload back to a JavaScript value */
export async function decrypt<T = unknown>(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<T> {
  const iv = base64ToArrayBuffer(payload.iv);
  const ciphertext = base64ToArrayBuffer(payload.ct);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
