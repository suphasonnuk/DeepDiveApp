/**
 * Key Derivation Functions using Web Crypto API.
 *
 * Derives two independent keys from a single passphrase:
 * - Auth key: used server-side to verify identity (sent as hash)
 * - Encryption key: used client-side to encrypt/decrypt IndexedDB data (never leaves browser)
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const AUTH_INFO = new TextEncoder().encode("deepdive-auth-key");
const ENCRYPT_INFO = new TextEncoder().encode("deepdive-encrypt-key");

export interface DerivedKeys {
  /** Hex-encoded auth key hash — safe to send to server */
  authKeyHex: string;
  /** CryptoKey for AES-256-GCM — never leaves the browser */
  encryptionKey: CryptoKey;
  /** Base64-encoded salt — stored alongside the auth hash */
  saltBase64: string;
}

/** Generate a random salt for first-time setup */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/** Derive a master key from passphrase + salt using PBKDF2 */
async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const masterBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    512, // 64 bytes — split into two 32-byte keys
  );

  return crypto.subtle.importKey("raw", masterBits, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
}

/** Derive both auth and encryption keys from a passphrase */
export async function deriveKeys(
  passphrase: string,
  salt: Uint8Array,
): Promise<DerivedKeys> {
  const masterKey = await deriveMasterKey(passphrase, salt);

  // Derive auth key (exportable — we need to send the hash to the server)
  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: AUTH_INFO },
    masterKey,
    256,
  );
  const authKeyHex = bytesToHex(new Uint8Array(authBits));

  // Derive encryption key (non-extractable — stays in browser memory)
  const encryptionKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: ENCRYPT_INFO },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );

  return {
    authKeyHex,
    encryptionKey,
    saltBase64: bytesToBase64(salt),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
