import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Load scripts/.env when running CLI from the repo. */
export function loadEnv() {
  const scriptsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "scripts",
  );
  config({ path: join(scriptsDir, ".env"), quiet: true });
}
