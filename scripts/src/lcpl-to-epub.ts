import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveIdToken } from "./auth.js";
import { AUTH_HEADER } from "./config.js";
import type { LcpLicense } from "./types.js";

function usage(): never {
  console.error(`Usage: npm run lcpl-to-epub -- <input.lcpl> [output.epub]

Builds an LCP-protected EPUB:
  1. Read the .lcpl license JSON
  2. Download the encrypted publication from links[rel=publication]
  3. Insert META-INF/license.lcpl and re-zip

Options:
  --out <path>     Output EPUB path (default: <title>.epub or book.epub)
  --skip-hash      Skip SHA-256 verification when hash is present in license

Requires: /usr/bin/unzip and /usr/bin/zip (macOS default)`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let input: string | undefined;
  let out: string | undefined;
  let skipHash = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-hash") {
      skipHash = true;
    } else if (arg === "--out") {
      out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (!arg.startsWith("-")) {
      input = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }

  if (!input) usage();
  return { input: resolve(input), out, skipHash };
}

async function loadLicense(path: string): Promise<LcpLicense> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as LcpLicense;
}

function publicationLink(license: LcpLicense) {
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

function run(cmd: string, args: string[], cwd?: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_") || "book";
}

async function buildLcpEpub(
  license: LcpLicense,
  licensePath: string,
  outPath: string,
  skipHash: boolean,
): Promise<void> {
  const pub = publicationLink(license);
  const workDir = await mkdtemp(join(tmpdir(), "bookshop-lcp-"));
  const encrypted = join(workDir, "encrypted.epub");
  const extractDir = join(workDir, "extracted");

  try {
    console.error(`Downloading publication from ${pub.href}`);
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
    const licenseDest = join(metaInf, "license.lcpl");
    await writeFile(licenseDest, JSON.stringify(license, null, 2));

    // zip from inside extractDir so paths are EPUB-relative
    run("/usr/bin/zip", ["-qrX", outPath, "."], extractDir);

    console.error(`Wrote LCP EPUB: ${outPath}`);
    console.error(
      `Passphrase hint: ${license.encryption?.user_key?.text_hint ?? "(see Bookshop account / user key API)"}`,
    );
    console.error(`Source license: ${licensePath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const { input, out, skipHash } = parseArgs(process.argv.slice(2));
  const license = await loadLicense(input);
  const pub = publicationLink(license);
  const defaultName = sanitizeFilename(pub.title ?? basename(input, ".lcpl"));
  const outPath = resolve(out ?? `${defaultName}.epub`);
  await buildLcpEpub(license, input, outPath, skipHash);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
