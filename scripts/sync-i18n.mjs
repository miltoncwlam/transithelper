#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { publicMtrLines } from '../00-required/mtr.js';
import { LRT_TERMINI } from '../00-required/lightrail.js';

const lib = await readFile(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const classic = lib
  .replace(/^export const I18N/, 'globalThis.I18N')
  .replace(/\nexport function translate[\s\S]*$/m, '\n')
  .trim()
  + '\n';
await writeFile(new URL('../public/i18n.js', import.meta.url), classic);

await writeFile(
  new URL('../public/mtr-data.js', import.meta.url),
  `globalThis.TB_MTR_LINES = ${JSON.stringify(publicMtrLines())};
globalThis.TB_LRT_TERMINI = ${JSON.stringify(LRT_TERMINI)};
`
);

console.log('ok public/i18n.js and public/mtr-data.js');
