import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
cpSync(join(root, "renderer"), join(root, "dist", "renderer"), {
  recursive: true,
});
