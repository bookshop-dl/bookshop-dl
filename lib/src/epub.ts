import AdmZip from "adm-zip";
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import type { LcpLicense } from "./client.js";

const AES_BLOCK = 16;
const BASIC_PROFILE = "http://readium.org/lcp/basic-profile";

function extractZip(archivePath: string, destDir: string) {
  new AdmZip(archivePath).extractAllTo(destDir, true);
}

function createZip(sourceDir: string, destPath: string) {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(destPath);
}

export async function assertEpubFile(path: string) {
  const header = await readFile(path);
  if (
    header.length < 4 ||
    header[0] !== 0x50 ||
    header[1] !== 0x4b
  ) {
    throw new Error(
      "Downloaded file does not look like an EPUB (expected a ZIP archive)",
    );
  }
}

export function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_") || "book";
}

function decryptAes(key: Buffer, data: Buffer) {
  const iv = data.subarray(0, AES_BLOCK);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const out = Buffer.concat([
    decipher.update(data.subarray(AES_BLOCK)),
    decipher.final(),
  ]);
  const pad = out[out.length - 1]!;
  return out.subarray(0, out.length - pad);
}

function contentKey(license: LcpLicense, passphrase: string) {
  const enc = license.encryption;
  if (enc?.profile !== BASIC_PROFILE) {
    throw new Error(`Unsupported LCP profile: ${enc?.profile ?? "missing"}`);
  }

  const userKey = createHash("sha256").update(passphrase, "utf8").digest();
  const check = Buffer.from(enc!.user_key!.key_check!, "base64");
  if (decryptAes(userKey, check).toString("utf8") !== license.id) {
    throw new Error("Passphrase is incorrect");
  }

  return decryptAes(
    userKey,
    Buffer.from(enc!.content_key!.encrypted_value!, "base64"),
  );
}

function parseEncryptionXml(xml: string) {
  return [...xml.matchAll(/<EncryptedData[\s\S]*?<\/EncryptedData>/g)].flatMap(
    (match) => {
      const block = match[0];
      const uri = block.match(/<CipherReference[^>]*URI="([^"]+)"/)?.[1];
      if (!uri) return [];
      const method = Number(block.match(/Method="(\d+)"/)?.[1] ?? 0);
      const length = block.match(/OriginalLength="(\d+)"/)?.[1];
      return [{ uri, method, length: length ? Number(length) : undefined }];
    },
  );
}

function decryptResource(
  key: Buffer,
  data: Buffer,
  method: number,
  length?: number,
) {
  const plain = decryptAes(key, data);
  const out = method === 8 ? inflateRawSync(plain) : plain;
  if (length !== undefined && out.length !== length) {
    throw new Error("Length mismatch for decrypted resource");
  }
  return out;
}

function publicationHash(license: LcpLicense) {
  return license.links?.find((entry) => entry.rel === "publication")?.hash;
}

export async function buildLcpEpub(
  license: LcpLicense,
  encryptedPath: string,
  outPath: string,
  skipHash = false,
) {
  const hash = publicationHash(license);
  if (hash && !skipHash) {
    const digest = createHash("sha256")
      .update(await readFile(encryptedPath))
      .digest("hex");
    if (digest.toLowerCase() !== hash.toLowerCase()) {
      throw new Error("Publication hash mismatch");
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), "bookshop-lcp-"));
  const extractDir = join(workDir, "extracted");

  try {
    await mkdir(extractDir, { recursive: true });
    extractZip(encryptedPath, extractDir);
    await mkdir(join(extractDir, "META-INF"), { recursive: true });
    await writeFile(
      join(extractDir, "META-INF", "license.lcpl"),
      JSON.stringify(license, null, 2),
    );
    if (existsSync(outPath)) await rm(outPath);
    createZip(extractDir, outPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function buildClearEpub(
  inputPath: string,
  outPath: string,
  passphrase: string,
) {
  const workDir = await mkdtemp(join(tmpdir(), "bookshop-clear-"));
  const extractDir = join(workDir, "extracted");

  try {
    await mkdir(extractDir, { recursive: true });
    extractZip(inputPath, extractDir);

    const license = JSON.parse(
      await readFile(join(extractDir, "META-INF", "license.lcpl"), "utf8"),
    ) as LcpLicense;
    const resources = parseEncryptionXml(
      await readFile(join(extractDir, "META-INF", "encryption.xml"), "utf8"),
    );
    const key = contentKey(license, passphrase);

    for (const resource of resources) {
      const path = join(extractDir, resource.uri);
      await writeFile(
        path,
        decryptResource(
          key,
          await readFile(path),
          resource.method,
          resource.length,
        ),
      );
    }

    await unlink(join(extractDir, "META-INF", "encryption.xml"));
    await unlink(join(extractDir, "META-INF", "license.lcpl"));
    if (existsSync(outPath)) await unlink(outPath);
    createZip(extractDir, outPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
