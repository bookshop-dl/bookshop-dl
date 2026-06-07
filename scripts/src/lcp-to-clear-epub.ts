import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

import { parseEncryptionXml } from "./encryption-xml.js";
import { decryptAes256Cbc, unlockContentKey } from "./lcp-crypto.js";
import type { LcpLicense } from "./types.js";

function usage(): never {
  console.error(`Usage: npm run lcp-to-clear-epub -- <input.epub> [options]

Decrypts an LCP-protected EPUB (Readium basic-profile) into a DRM-free EPUB.

Options:
  --passphrase <text>       LCP user passphrase
  --passphrase-file <path>  Read passphrase from file (default: <input>.passphrase.txt)
  --out <path>              Output EPUB path (default: <input>.clear.epub)
  --lcpl <path>             License file (default: META-INF/license.lcpl inside EPUB)

Requires: /usr/bin/unzip and /usr/bin/zip (macOS default)`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let input: string | undefined;
  let out: string | undefined;
  let passphrase: string | undefined;
  let passphraseFile: string | undefined;
  let lcpl: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[++i];
    } else if (arg === "--passphrase") {
      passphrase = argv[++i];
    } else if (arg === "--passphrase-file") {
      passphraseFile = argv[++i];
    } else if (arg === "--lcpl") {
      lcpl = argv[++i];
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
  return {
    input: resolve(input),
    out: out ? resolve(out) : undefined,
    passphrase,
    passphraseFile: passphraseFile ? resolve(passphraseFile) : undefined,
    lcpl: lcpl ? resolve(lcpl) : undefined,
  };
}

function run(cmd: string, args: string[], cwd?: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

async function loadPassphrase(
  inputPath: string,
  passphrase?: string,
  passphraseFile?: string,
): Promise<string> {
  if (passphrase !== undefined) {
    return passphrase;
  }

  const defaultFile =
    passphraseFile ??
    join(
      dirname(inputPath),
      `${basename(inputPath, ".epub")}.passphrase.txt`,
    );

  try {
    return (await readFile(defaultFile, "utf8")).trim();
  } catch {
    throw new Error(
      `Passphrase required. Use --passphrase, --passphrase-file, or create ${defaultFile}`,
    );
  }
}

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

async function buildClearEpub(
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

    console.error(`Unlocking content key (${encryptedResources.length} encrypted resources)...`);
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

    run("/usr/bin/zip", ["-qrX", outPath, "."], extractDir);
    console.error(`Wrote DRM-free EPUB: ${outPath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const { input, out, passphrase, passphraseFile, lcpl } = parseArgs(
    process.argv.slice(2),
  );
  const resolvedPassphrase = await loadPassphrase(
    input,
    passphrase,
    passphraseFile,
  );
  const outPath =
    out ?? join(dirname(input), `${basename(input, ".epub")}.clear.epub`);

  await buildClearEpub(input, outPath, resolvedPassphrase, lcpl);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
