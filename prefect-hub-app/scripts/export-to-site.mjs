/**
 * Publish the static export into the main MathAns site.
 *
 * `next build` writes out/ with every asset prefixed by the /prefect-hub base
 * path; this copies that tree to ../prefect-hub/, which Vercel serves at
 * https://www.mathans.app/prefect-hub. The output is committed, because the
 * root project is a plain static deployment with no build step of its own.
 *
 * Run via: npm run export:site
 */
import { cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appDir, "out");
const siteDir = path.resolve(appDir, "..", "prefect-hub");

if (!existsSync(outDir)) {
  console.error("No out/ directory — run `npm run build` first.");
  process.exit(1);
}

await rm(siteDir, { recursive: true, force: true });
await cp(outDir, siteDir, { recursive: true });

const files = await readdir(siteDir);
console.log(
  `Exported ${files.length} top-level entries to ${path.relative(process.cwd(), siteDir)}/`
);
console.log("Commit that directory to publish www.mathans.app/prefect-hub");
