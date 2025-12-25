/**
 * End-to-End Encryption utilities using Web Crypto API
 * Uses AES-GCM for symmetric encryption with keys derived from room ID
 */

const SALT = "nextjs-realtime-e2ee-v1"; // Static salt for key derivation

/**
 * Derive an AES-GCM encryption key from a room ID
 */
async function deriveKey(roomId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(roomId),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext message
 * Returns base64-encoded string in format: iv:ciphertext
 */
export async function encryptMessage(
  plaintext: string,
  roomId: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await deriveKey(roomId);

  // Generate random IV (Initialization Vector)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the message
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV and ciphertext, then encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an encrypted message
 * Expects base64-encoded string in format: iv:ciphertext
 */
export async function decryptMessage(
  encrypted: string,
  roomId: string
): Promise<string> {
  try {
    const decoder = new TextDecoder();
    const key = await deriveKey(roomId);

    // Decode base64
    const combined = new Uint8Array(
      atob(encrypted)
        .split("")
        .map((char) => char.charCodeAt(0))
    );

    // Extract IV and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt the message
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return decoder.decode(plaintext);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Decryption failed]";
  }
}

/**
 * Check if encryption is supported in the current environment
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.subtle.encrypt === "function"
  );
}
