import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { sanitizeFilename } from "./epub-utils.js";
import { buildLcpEpub, publicationLink } from "./lcp-epub.js";
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

async function main() {
  const { input, out, skipHash } = parseArgs(process.argv.slice(2));
  const license = await loadLicense(input);
  const pub = publicationLink(license);
  const defaultName = sanitizeFilename(pub.title ?? basename(input, ".lcpl"));
  const outPath = resolve(out ?? `${defaultName}.epub`);

  await buildLcpEpub(license, outPath, skipHash);
  console.error(`Wrote LCP EPUB: ${outPath}`);
  console.error(
    `Passphrase hint: ${license.encryption?.user_key?.text_hint ?? "(see Bookshop account / user key API)"}`,
  );
  console.error(`Source license: ${input}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
