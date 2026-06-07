import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { buildClearEpub } from "./clear-epub.js";

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
  console.error(`Wrote DRM-free EPUB: ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
