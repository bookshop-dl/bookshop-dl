import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { existsSync } from "node:fs";

import { parseEncryptionXml } from "./encryption-xml.js";
import { run } from "./epub-utils.js";
import { decryptAes256Cbc, unlockContentKey } from "./lcp-crypto.js";
import type { LcpLicense } from "./types.js";

function decryptResource(
  contentKey: Buffer,
  encrypted: Buffer,
  compressionMethod: number,
  originalLength?: number,
): Buffer {
  const decrypted = decryptAes256Cbc(contentKey, encrypted);

  if (compressionMethod === 0) {
    if (originalLength !== undefined && decrypted.length !== originalLength) {
      throw new Error(
        `Decrypted length ${decrypted.length} does not match OriginalLength ${originalLength}`,
      );
    }
    return decrypted;
  }

  if (compressionMethod === 8) {
    const inflated = inflateRawSync(decrypted);
    if (originalLength !== undefined && inflated.length !== originalLength) {
      throw new Error(
        `Inflated length ${inflated.length} does not match OriginalLength ${originalLength}`,
      );
    }
    return inflated;
  }

  throw new Error(`Unsupported compression method: ${compressionMethod}`);
}

export async function buildClearEpub(
  inputPath: string,
  outPath: string,
  passphrase: string,
  externalLcpl?: string,
): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "bookshop-clear-"));
  const extractDir = join(workDir, "extracted");

  try {
    await mkdir(extractDir, { recursive: true });
    run("/usr/bin/unzip", ["-q", inputPath, "-d", extractDir]);

    const licensePath =
      externalLcpl ?? join(extractDir, "META-INF", "license.lcpl");
    const licenseRaw = await readFile(licensePath, "utf8");
    const license = JSON.parse(licenseRaw) as LcpLicense;

    const encryptionPath = join(extractDir, "META-INF", "encryption.xml");
    const encryptionXml = await readFile(encryptionPath, "utf8");
    const encryptedResources = parseEncryptionXml(encryptionXml);

    if (encryptedResources.length === 0) {
      throw new Error("No encrypted resources found in META-INF/encryption.xml");
    }

    console.error(
      `Decrypting ${encryptedResources.length} encrypted resources...`,
    );
    const contentKey = unlockContentKey(license, passphrase);

    for (const resource of encryptedResources) {
      const resourcePath = join(extractDir, resource.uri);
      const encrypted = await readFile(resourcePath);
      const clear = decryptResource(
        contentKey,
        encrypted,
        resource.compressionMethod,
        resource.originalLength,
      );
      await writeFile(resourcePath, clear);
    }

    await unlink(encryptionPath);
    await unlink(licensePath);

    if (existsSync(outPath)) {
      await unlink(outPath);
    }
    run("/usr/bin/zip", ["-qrX", outPath, "."], extractDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
