import { createRequire } from "node:module";
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const rendererDist = join(root, "dist", "renderer");

cpSync(join(root, "renderer"), rendererDist, { recursive: true });

cpSync(
  join(dirname(require.resolve("petite-vue")), "petite-vue.es.js"),
  join(rendererDist, "petite-vue.es.js"),
);
