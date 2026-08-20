#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUAL } from '../lib/guide.js';

function sectionHtml(lang) {
  const g = MANUAL[lang];
  return `
    <section class="lang">
      <h1>${g.title}</h1>
      <p class="lead">${g.lead}</p>
      <p class="honesty">${g.honesty}</p>
      <h2>營辦商 / Operators</h2>
      <ul>
        <li>九巴 KMB、龍運 LWB</li>
        <li>城巴 Citybus</li>
        <li>新大嶼山巴士 NLB</li>
        <li>專線小巴 GMB（港島／九龍／新界）</li>
        <li>港鐵 MTR 及輕鐵 Light Rail</li>
      </ul>
      ${g.sections.map((s) => `
        <h2>${s.h}</h2>
        ${s.p.map((p) => `<p>${p}</p>`).join('')}
      `).join('')}
    </section>`;
}

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>TransitBuddy 使用手冊</title>
  <style>
    @page { size: A4; margin: 16mm 15mm; }
    body { font-family: "PingFang HK", "Noto Sans CJK TC", "Hiragino Sans GB", sans-serif; color: #172033; line-height: 1.5; font-size: 12px; }
    h1 { font-size: 20px; color: #17675f; page-break-before: always; margin-top: 0; }
    .lang:first-of-type h1 { page-break-before: avoid; }
    h2 { font-size: 14px; margin-top: 1.15em; color: #1d4f4a; page-break-after: avoid; }
    p { margin: 0.45em 0 0.7em; }
    .lead { font-size: 13px; }
    .honesty { background: #eef6f5; padding: 8px 10px; border-radius: 6px; }
    .muted { color: #64748b; }
    ul { padding-left: 1.2em; margin-top: 0.3em; }
    .cover { margin-bottom: 1.2em; }
  </style>
</head>
<body>
  <div class="cover">
    <h1 style="page-break-before:avoid">TransitBuddy 使用手冊</h1>
    <p class="lead">香港巴士、專線小巴、嶼巴、港鐵及輕鐵實時到站與轉乘。預設繁體中文。本 PDF 有完整中文及英文。</p>
    <p class="honesty">無需登入。只顯示營辦商公布的實時班次；沒有就會寫沒有，不會編造到站時間或車費。</p>
    <p class="muted">應用程式內「使用說明」是精簡版；本檔為完整手冊。畫面右上角可切換 English。</p>
  </div>
  ${sectionHtml('zh')}
  ${sectionHtml('en')}
</body>
</html>
`;

const root = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(root, '../public/user-manual.html');
const pdfPath = path.join(root, '../public/user-manual.pdf');
await writeFile(htmlPath, html);

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const result = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  `--print-to-pdf=${pdfPath}`,
  `--print-to-pdf-no-header`,
  `file://${htmlPath}`
], { encoding: 'utf8' });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'chrome print failed');
  process.exit(result.status || 1);
}
console.log('ok user-manual.pdf');
