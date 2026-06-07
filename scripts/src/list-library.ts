import { BookshopClient } from "./client.js";

async function main() {
  const client = new BookshopClient();
  const books = await client.listLibrary();

  if (books.length === 0) {
    console.log("No ebooks in library.");
    return;
  }

  console.log("checksum\tsku\ttype\ttitle");
  for (const book of books) {
    const title = book.product?.title ?? "(untitled)";
    const type = book.product?.is_drm_free ? "drm-free" : "lcp";
    console.log(`${book.checksum}\t${book.sku}\t${type}\t${title}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
