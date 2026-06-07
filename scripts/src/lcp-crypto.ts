import { createDecipheriv, createHash } from "node:crypto";

import type { LcpLicense } from "./types.js";

export const LCP_BASIC_PROFILE = "http://readium.org/lcp/basic-profile";
export const SHA256_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#sha256";
export const AES256_CBC_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#aes256-cbc";

const AES_BLOCK_SIZE = 16;

export function deriveUserKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase, "utf8").digest();
}

export function decryptAes256Cbc(key: Buffer, encrypted: Buffer): Buffer {
  if (encrypted.length < AES_BLOCK_SIZE) {
    throw new Error("Encrypted data is too short for AES-256-CBC");
  }

  const iv = encrypted.subarray(0, AES_BLOCK_SIZE);
  const ciphertext = encrypted.subarray(AES_BLOCK_SIZE);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const paddingBytes = decrypted[decrypted.length - 1];
  if (paddingBytes < 1 || paddingBytes > AES_BLOCK_SIZE) {
    throw new Error("Invalid PKCS#7 padding in decrypted data");
  }

  return decrypted.subarray(0, decrypted.length - paddingBytes);
}

export function verifyUserKey(license: LcpLicense, userKey: Buffer): void {
  const licenseId = license.id;
  const keyCheckB64 = license.encryption?.user_key?.key_check;
  if (!licenseId || !keyCheckB64) {
    throw new Error("License is missing id or encryption.user_key.key_check");
  }

  const keyCheck = Buffer.from(keyCheckB64, "base64");
  const decryptedId = decryptAes256Cbc(userKey, keyCheck).toString("utf8");
  if (decryptedId !== licenseId) {
    throw new Error("Passphrase is incorrect (key_check failed)");
  }
}

export function decryptContentKey(license: LcpLicense, userKey: Buffer): Buffer {
  const encryption = license.encryption;
  if (encryption?.profile !== LCP_BASIC_PROFILE) {
    throw new Error(
      `Unsupported LCP profile: ${encryption?.profile ?? "(missing)"}. Only basic-profile is supported.`,
    );
  }
  if (encryption.user_key?.algorithm !== SHA256_ALGORITHM) {
    throw new Error(
      `Unsupported user key algorithm: ${encryption.user_key?.algorithm ?? "(missing)"}`,
    );
  }
  if (encryption.content_key?.algorithm !== AES256_CBC_ALGORITHM) {
    throw new Error(
      `Unsupported content key algorithm: ${encryption.content_key?.algorithm ?? "(missing)"}`,
    );
  }

  const encryptedValue = encryption.content_key.encrypted_value;
  if (!encryptedValue) {
    throw new Error("License is missing encryption.content_key.encrypted_value");
  }

  verifyUserKey(license, userKey);
  return decryptAes256Cbc(userKey, Buffer.from(encryptedValue, "base64"));
}

export function unlockContentKey(
  license: LcpLicense,
  passphrase: string,
): Buffer {
  const userKey = deriveUserKey(passphrase);
  return decryptContentKey(license, userKey);
}
