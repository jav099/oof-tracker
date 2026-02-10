#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const yearArg = process.argv[2];
const year = Number(yearArg);

if (!Number.isInteger(year) || year < 1970 || year > 2100) {
  console.error("Usage: node scripts/set-year.mjs <year>");
  console.error("Example: node scripts/set-year.mjs 2027");
  process.exit(1);
}

const configPath = resolve(process.cwd(), "config.js");
const content = `window.OOF_TRACKER_CONFIG = {\n  year: ${year}\n};\n`;

writeFileSync(configPath, content, "utf8");
console.log(`Updated ${configPath} to year ${year}.`);
