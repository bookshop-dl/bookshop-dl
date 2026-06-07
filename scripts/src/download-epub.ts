import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BookshopClient } from "bookshop-lib/client.js";
import { downloadBookByChecksum } from "bookshop-lib/download.js";
import { loadEnv } from "bookshop-lib/load-env.js";

const contentDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "content",
);

loadEnv();

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

  const outPath = await downloadBookByChecksum(new BookshopClient(), checksum, {
    outPath: out,
    contentDir,
    keepIntermediates,
    skipHash,
    onProgress: (message) => console.error(message),
  });

  console.log(outPath);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
