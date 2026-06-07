import Table from "cli-table3";

import { BookshopClient } from "./client.js";
import type { DigitalBook } from "./types.js";

function bookType(book: DigitalBook): string {
  return book.product?.is_drm_free ? "drm-free" : "lcp";
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

async function main() {
  const client = new BookshopClient();
  const books = await client.listLibrary();

  if (books.length === 0) {
    console.log("No ebooks in library.");
    return;
  }

  const table = new Table({
    head: ["Title", "Type", "SKU", "Checksum"],
    colWidths: [42, 10, 15, 38],
    wordWrap: true,
  });

  for (const book of books) {
    table.push([
      truncate(book.product?.title ?? "(untitled)", 40),
      bookType(book),
      book.sku,
      book.checksum,
    ]);
  }

  console.log(table.toString());
  console.log(`\n${books.length} ${books.length === 1 ? "book" : "books"}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
