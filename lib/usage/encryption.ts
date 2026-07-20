import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function keyBytes(key: Uint8Array): Buffer {
  const bytes = Buffer.from(key);
  if (bytes.length !== 32) throw new Error("RECONCILIATION_KEY_INVALID");
  return bytes;
}

export function encryptProviderRequestId(requestId: string, key: Uint8Array): Uint8Array {
  if (!requestId || Buffer.byteLength(requestId, "utf8") > 1024) throw new Error("PROVIDER_REQUEST_ID_INVALID");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), nonce);
  cipher.setAAD(Buffer.from("bomti-provider-request-id-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(requestId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), nonce, tag, ciphertext]);
}

export function decryptProviderRequestId(payload: Uint8Array, key: Uint8Array): string {
  const bytes = Buffer.from(payload);
  if (bytes.length <= 1 + NONCE_BYTES + TAG_BYTES || bytes[0] !== VERSION) {
    throw new Error("PROVIDER_REQUEST_ID_CIPHERTEXT_INVALID");
  }
  const nonce = bytes.subarray(1, 1 + NONCE_BYTES);
  const tag = bytes.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES);
  const ciphertext = bytes.subarray(1 + NONCE_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), nonce);
    decipher.setAAD(Buffer.from("bomti-provider-request-id-v1", "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("PROVIDER_REQUEST_ID_CIPHERTEXT_INVALID");
  }
}
