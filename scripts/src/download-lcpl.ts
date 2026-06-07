import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { BookshopClient } from "./client.js";

function usage(): never {
  console.error(`Usage: npm run download-lcpl -- <checksum> [output.lcpl]

Fetch an LCP license (.lcpl JSON) for a book you own.

Environment (one of):
  BOOKSHOP_ID_TOKEN          Firebase ID token (Bearer value)
  BOOKSHOP_EMAIL + BOOKSHOP_PASSWORD   Sign in via Firebase REST

Options:
  --out <path>        Output file (default: ./<checksum>.lcpl)
  --with-user-key     Also write <checksum>.passphrase.txt (LCP user key)
  --list              List your library and exit (ignore checksum arg)

Device registration is cached in ~/.bookshop/device-registration.json`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let checksum: string | undefined;
  let out: string | undefined;
  let withUserKey = false;
  let list = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--with-user-key") {
      withUserKey = true;
    } else if (arg === "--list") {
      list = true;
    } else if (arg === "--out") {
      out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (!arg.startsWith("-")) {
      checksum = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }

  return { checksum, out, withUserKey, list };
}

async function main() {
  const { checksum, out, withUserKey, list } = parseArgs(process.argv.slice(2));
  const client = new BookshopClient();

  if (list) {
    const books = await client.listLibrary();
    if (books.length === 0) {
      console.log("No ebooks in library.");
      return;
    }
    for (const book of books) {
      const title = book.product?.title ?? "(untitled)";
      const drm = book.product?.is_drm_free ? "drm-free" : "lcp";
      console.log(`${book.checksum}\t${book.sku}\t[${drm}]\t${title}`);
    }
    return;
  }

  if (!checksum) usage();

  console.error("Registering or validating device...");
  const device = await client.getDeviceRegistration();
  console.error(`Device ID: ${device.id}`);

  console.error(`Fetching license for checksum ${checksum}...`);
  const license = await client.fetchLicense(checksum, device.id);

  const outPath = resolve(out ?? `${checksum}.lcpl`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(license, null, 2));
  console.log(outPath);

  if (withUserKey) {
    const key = await client.fetchUserKey(checksum);
    const keyPath = outPath.replace(/\.lcpl$/i, ".passphrase.txt");
    await writeFile(keyPath, key, "utf8");
    console.log(keyPath);
  }

  const hint = license.encryption?.user_key?.text_hint;
  if (hint) {
    console.error(`Passphrase hint from license: ${hint}`);
  }
  console.error(`Next: npm run lcpl-to-epub -- ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
