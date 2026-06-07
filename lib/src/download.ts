import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { BookshopClient, type DigitalBook } from "./client.js";
import { buildClearEpub, buildLcpEpub, safeName } from "./epub.js";

export interface DownloadOptions {
  outPath?: string;
  contentDir?: string;
  keepIntermediates?: boolean;
  skipHash?: boolean;
  onProgress?: (message: string) => void;
}

export function bookTitle(book: DigitalBook) {
  return book.product?.title ?? book.checksum;
}

export async function downloadBook(
  client: BookshopClient,
  book: DigitalBook,
  options: DownloadOptions = {},
): Promise<string> {
  const {
    keepIntermediates = false,
    skipHash = false,
    onProgress,
  } = options;

  const title = bookTitle(book);
  const outPath =
    options.outPath ??
    join(options.contentDir ?? process.cwd(), `${safeName(title)}.epub`);

  onProgress?.(`Downloading ${title}...`);

  if (book.product?.is_drm_free) {
    await mkdir(dirname(outPath), { recursive: true });
    await client.download(client.drmFreeUrl(book.checksum), outPath);
    return outPath;
  }

  onProgress?.("Fetching license...");
  const device = await client.getDevice();
  const [license, passphrase] = await Promise.all([
    client.fetchLicense(book.checksum, device.id),
    client.fetchUserKey(book.checksum),
  ]);

  const workDir = await mkdtemp(join(tmpdir(), "bookshop-"));
  const lcpPath = join(workDir, "book.lcp.epub");
  try {
    onProgress?.("Downloading encrypted EPUB...");
    await buildLcpEpub(license, lcpPath, skipHash);
    onProgress?.("Decrypting...");
    await mkdir(dirname(outPath), { recursive: true });
    await buildClearEpub(lcpPath, outPath, passphrase);

    if (keepIntermediates) {
      const base = join(dirname(outPath), safeName(title));
      await writeFile(`${base}.lcpl`, JSON.stringify(license, null, 2));
      await writeFile(`${base}.passphrase.txt`, passphrase);
      await writeFile(`${base}.lcp.epub`, await readFile(lcpPath));
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  return outPath;
}

export async function downloadBookByChecksum(
  client: BookshopClient,
  checksum: string,
  options: DownloadOptions = {},
): Promise<string> {
  const book = (await client.listLibrary()).find(
    (entry) => entry.checksum === checksum,
  );
  if (!book) {
    throw new Error(`Book not found: ${checksum}`);
  }
  return downloadBook(client, book, options);
}
