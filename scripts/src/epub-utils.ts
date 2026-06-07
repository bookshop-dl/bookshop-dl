import { spawnSync } from "node:child_process";

export function run(cmd: string, args: string[], cwd?: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_") || "book";
}
