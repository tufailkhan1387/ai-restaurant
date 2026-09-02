/**
 * Load backend/.env using a path relative to this file (not process.cwd()).
 * Live hosts (pm2/systemd/docker) often start Node from a parent directory,
 * so default `import "dotenv/config"` misses backend/.env.
 *
 * Import this module first in every entrypoint before other app imports.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

const candidates = [
  path.join(backendRoot, ".env"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "backend", ".env"),
];

let loadedFrom = null;
for (const filePath of candidates) {
  if (!fs.existsSync(filePath)) continue;
  const result = dotenv.config({ path: filePath });
  if (!result.error) {
    loadedFrom = filePath;
    break;
  }
}

if (!loadedFrom) {
  console.warn(
    `[env] No .env file found. Tried:\n  - ${candidates.join("\n  - ")}\n` +
      "Relying on process environment only.",
  );
} else {
  console.log(`[env] Loaded ${loadedFrom}`);
}

export { backendRoot, loadedFrom as envFilePath };
