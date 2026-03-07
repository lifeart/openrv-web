#!/usr/bin/env node
/**
 * Screenshot staleness detection.
 *
 * Compares the modification dates of screenshot files against the last git
 * commit that touched `src/ui/` or `e2e/screenshots/`.  If any screenshot is
 * older than the most recent source change, it is flagged as stale.
 *
 * Exit codes:
 *   0 -- all screenshots are fresh (or no screenshots exist yet)
 *   1 -- one or more screenshots are stale
 */

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const SCREENSHOT_DIR = path.join(ROOT, 'docs/assets/screenshots');

/**
 * Get the unix timestamp of the last git commit touching the given paths.
 */
function getLastSourceCommitTime(paths) {
  try {
    const pathArgs = paths.map((p) => `-- ${p}`).join(' ');
    const output = execSync(
      `git log -1 --format=%ct ${pathArgs}`,
      { cwd: ROOT, encoding: 'utf-8' },
    ).trim();
    return output ? parseInt(output, 10) : 0;
  } catch {
    return 0;
  }
}

function main() {
  // Determine last commit time for relevant source files
  const lastSourceTime = getLastSourceCommitTime([
    'src/ui/',
    'e2e/screenshots/',
  ]);

  if (lastSourceTime === 0) {
    console.log('No git history found for source paths. Skipping staleness check.');
    process.exit(0);
  }

  const lastSourceDate = new Date(lastSourceTime * 1000);

  // Scan screenshot files
  let files;
  try {
    files = readdirSync(SCREENSHOT_DIR).filter((f) => f.endsWith('.png'));
  } catch {
    console.log('No screenshot directory found. Nothing to check.');
    process.exit(0);
  }

  if (files.length === 0) {
    console.log('No screenshots found. Run `pnpm screenshots` to generate them.');
    process.exit(0);
  }

  const stale = [];

  for (const file of files) {
    const filePath = path.join(SCREENSHOT_DIR, file);
    const stat = statSync(filePath);
    const fileTime = Math.floor(stat.mtimeMs / 1000);

    if (fileTime < lastSourceTime) {
      stale.push({
        file,
        screenshotDate: new Date(fileTime * 1000).toISOString(),
      });
    }
  }

  if (stale.length === 0) {
    console.log(
      `All ${files.length} screenshots are up to date (source last changed: ${lastSourceDate.toISOString()}).`,
    );
    process.exit(0);
  }

  console.error(
    `${stale.length} screenshot(s) are stale (source last changed: ${lastSourceDate.toISOString()}):`,
  );
  for (const s of stale) {
    console.error(`  - ${s.file}  (last updated: ${s.screenshotDate})`);
  }
  console.error('\nRun `pnpm screenshots` to regenerate.');
  process.exit(1);
}

main();
