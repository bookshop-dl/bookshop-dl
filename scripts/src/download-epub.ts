import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BookshopClient } from "./client.js";
import { buildClearEpub } from "./clear-epub.js";
import { sanitizeFilename } from "./epub-utils.js";
import { buildLcpEpub } from "./lcp-epub.js";
import type { DigitalBook } from "./types.js";

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultContentDir = join(scriptsDir, "..", "content");

function usage(): never {
  console.error(`Usage: npm run download-epub -- <checksum> [options]

Downloads a DRM-free EPUB for a book you own.

  checksum   Book ID from \`npm run list-library\`

Options:
  --out <path>            Output EPUB path (default: ../content/<title>.epub)
  --keep-intermediates    Also save .lcpl, .passphrase.txt, and LCP .epub
  --skip-hash             Skip SHA-256 verification on encrypted download

Requires: /usr/bin/unzip and /usr/bin/zip (macOS default)`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let checksum: string | undefined;
  let out: string | undefined;
  let keepIntermediates = false;
  let skipHash = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[++i];
    } else if (arg === "--keep-intermediates") {
      keepIntermediates = true;
    } else if (arg === "--skip-hash") {
      skipHash = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (!arg.startsWith("-")) {
      checksum = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }

  if (!checksum) usage();
  return {
    checksum,
    out: out ? resolve(out) : undefined,
    keepIntermediates,
    skipHash,
  };
}

function bookTitle(book: DigitalBook): string {
  return book.product?.title ?? book.checksum;
}

function defaultOutputPath(book: DigitalBook): string {
  return join(defaultContentDir, `${sanitizeFilename(bookTitle(book))}.epub`);
}

async function downloadDrmFree(
  client: BookshopClient,
  book: DigitalBook,
  outPath: string,
): Promise<void> {
  console.error("Book is DRM-free — downloading directly...");
  await mkdir(dirname(outPath), { recursive: true });
  await client.downloadAuthenticatedUrl(client.drmFreeUrl(book.checksum), outPath);
}

async function downloadLcpBook(
  client: BookshopClient,
  book: DigitalBook,
  outPath: string,
  keepIntermediates: boolean,
  skipHash: boolean,
): Promise<void> {
  console.error("Registering or validating device...");
  const device = await client.getDeviceRegistration();

  console.error("Fetching license and user key...");
  const [license, passphrase] = await Promise.all([
    client.fetchLicense(book.checksum, device.id),
    client.fetchUserKey(book.checksum),
  ]);

  const workDir = await mkdtemp(join(tmpdir(), "bookshop-download-"));
  const lcpEpubPath = join(workDir, "book.lcp.epub");

  try {
    await buildLcpEpub(license, lcpEpubPath, skipHash);
    await mkdir(dirname(outPath), { recursive: true });
    await buildClearEpub(lcpEpubPath, outPath, passphrase);

    if (keepIntermediates) {
      const base = join(
        dirname(outPath),
        sanitizeFilename(bookTitle(book)),
      );
      await writeFile(`${base}.lcpl`, JSON.stringify(license, null, 2));
      await writeFile(`${base}.passphrase.txt`, passphrase, "utf8");
      await writeFile(`${base}.lcp.epub`, await readFile(lcpEpubPath));
      console.error(`Saved intermediates alongside ${outPath}`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const { checksum, out, keepIntermediates, skipHash } = parseArgs(
    process.argv.slice(2),
  );
  const client = new BookshopClient();

  console.error("Loading library...");
  const books = await client.listLibrary();
  const book = books.find((entry) => entry.checksum === checksum);

  if (!book) {
    throw new Error(
      `Book not found in library: ${checksum}\nRun npm run list-library to see owned books.`,
    );
  }

  const title = bookTitle(book);
  const outPath = out ?? defaultOutputPath(book);
  console.error(`Title: ${title}`);

  if (book.product?.is_drm_free) {
    await downloadDrmFree(client, book, outPath);
  } else {
    await downloadLcpBook(
      client,
      book,
      outPath,
      keepIntermediates,
      skipHash,
    );
  }

  console.log(outPath);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
