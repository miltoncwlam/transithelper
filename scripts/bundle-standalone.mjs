#!/usr/bin/env node
/**
 * Build a single-file public/standalone.html for OneCompiler / paste-anywhere.
 * Template: public/standalone.src.html
 * Scripts: public/styles.css, public/i18n.js, public/mtr-data.js, public/standalone.js
 */
import { readFile, writeFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../public/i18n.js', import.meta.url), 'utf8');
const mtr = await readFile(new URL('../public/mtr-data.js', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/standalone.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/standalone.src.html', import.meta.url), 'utf8');

const start = html.indexOf('<!-- standalone-bundle -->');
const end = html.indexOf('<!-- /standalone-bundle -->');
if (start < 0 || end < 0) {
  console.error('standalone.src.html is missing bundle markers');
  process.exit(1);
}

const head = html.slice(0, start);
const tail = html.slice(end + '<!-- /standalone-bundle -->'.length);
const bundled = `${head}<!-- standalone-bundle -->
  <style>
${css}
  </style>
  <script>
${i18n}
${mtr}
${js}
  </script>
  <!-- /standalone-bundle -->${tail}`;

await writeFile(new URL('../public/standalone.html', import.meta.url), bundled);
console.log('ok bundled standalone.html', bundled.length, 'bytes');
