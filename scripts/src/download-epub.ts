import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BookshopClient } from "./client.js";
import { buildClearEpub, buildLcpEpub, safeName } from "./epub.js";

const contentDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "content",
);

try {
  const args = process.argv.slice(2);
  const checksum = args.find((arg) => !arg.startsWith("-"));
  const outFlag = args.indexOf("--out");
  const out = outFlag >= 0 ? resolve(args[outFlag + 1]!) : undefined;
  const keepIntermediates = args.includes("--keep-intermediates");
  const skipHash = args.includes("--skip-hash");

  if (!checksum || args.includes("--help") || args.includes("-h")) {
    console.error(
      "Usage: npm run download-epub -- <checksum> [--out path] [--keep-intermediates] [--skip-hash]",
    );
    process.exit(1);
  }

  const client = new BookshopClient();
  const book = (await client.listLibrary()).find(
    (entry) => entry.checksum === checksum,
  );
  if (!book) {
    throw new Error(`Book not found: ${checksum}. Run npm run list-library.`);
  }

  const title = book.product?.title ?? book.checksum;
  const outPath = out ?? join(contentDir, `${safeName(title)}.epub`);
  console.error(`Title: ${title}`);

  if (book.product?.is_drm_free) {
    console.error("Downloading DRM-free EPUB...");
    await mkdir(dirname(outPath), { recursive: true });
    await client.download(client.drmFreeUrl(checksum), outPath);
  } else {
    const device = await client.getDevice();
    const [license, passphrase] = await Promise.all([
      client.fetchLicense(checksum, device.id),
      client.fetchUserKey(checksum),
    ]);

    const workDir = await mkdtemp(join(tmpdir(), "bookshop-"));
    const lcpPath = join(workDir, "book.lcp.epub");
    try {
      await buildLcpEpub(license, lcpPath, skipHash);
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
  }

  console.log(outPath);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
