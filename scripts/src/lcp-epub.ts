import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveIdToken } from "./auth.js";
import { AUTH_HEADER } from "./config.js";
import { run } from "./epub-utils.js";
import type { LcpLicense } from "./types.js";

export function publicationLink(license: LcpLicense) {
  const link = license.links?.find((l) => l.rel === "publication");
  if (!link?.href) {
    throw new Error("License has no links[rel=publication] URL");
  }
  return link;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (url.includes("bookshop.org")) {
    const token = await resolveIdToken();
    headers[AUTH_HEADER] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download publication (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function sha256Hex(filePath: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

export async function buildLcpEpub(
  license: LcpLicense,
  outPath: string,
  skipHash = false,
): Promise<void> {
  const pub = publicationLink(license);
  const workDir = await mkdtemp(join(tmpdir(), "bookshop-lcp-"));
  const encrypted = join(workDir, "encrypted.epub");
  const extractDir = join(workDir, "extracted");

  try {
    console.error(`Downloading encrypted publication...`);
    await downloadFile(pub.href, encrypted);

    if (pub.hash && !skipHash) {
      const actual = await sha256Hex(encrypted);
      if (actual.toLowerCase() !== pub.hash.toLowerCase()) {
        throw new Error(
          `Publication hash mismatch (expected ${pub.hash}, got ${actual})`,
        );
      }
      console.error("Publication hash verified.");
    }

    await mkdir(extractDir, { recursive: true });
    run("/usr/bin/unzip", ["-q", encrypted, "-d", extractDir]);

    const metaInf = join(extractDir, "META-INF");
    await mkdir(metaInf, { recursive: true });
    await writeFile(
      join(metaInf, "license.lcpl"),
      JSON.stringify(license, null, 2),
    );

    if (existsSync(outPath)) {
      await rm(outPath);
    }
    run("/usr/bin/zip", ["-qrX", outPath, "."], extractDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
