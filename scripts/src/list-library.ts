import Table from "cli-table3";

import { BookshopClient } from "./client.js";

try {
  const books = await new BookshopClient().listLibrary();
  if (books.length === 0) {
    console.log("No ebooks in library.");
    process.exit(0);
  }

  const table = new Table({
    head: ["Title", "Type", "SKU", "Checksum"],
    colWidths: [42, 10, 15, 38],
  });

  for (const book of books) {
    const title = book.product?.title ?? "(untitled)";
    table.push([
      title.length > 40 ? `${title.slice(0, 39)}…` : title,
      book.product?.is_drm_free ? "drm-free" : "lcp",
      book.sku,
      book.checksum,
    ]);
  }

  console.log(table.toString());
  console.log(`\n${books.length} ${books.length === 1 ? "book" : "books"}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
