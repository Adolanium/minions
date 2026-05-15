#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, '..', 'dist', 'server', 'server', 'index.js');

if (!existsSync(serverEntry)) {
  console.error(
    `minions: built server entry not found at ${serverEntry}.\n` +
      `If you are running from a source checkout, use "npm run dev" or "npm run prod" instead.`,
  );
  process.exit(1);
}

await import(pathToFileURL(serverEntry).href);
