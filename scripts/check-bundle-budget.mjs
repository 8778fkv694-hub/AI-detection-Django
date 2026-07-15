import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = join(distDir, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
const entryMatch = indexHtml.match(/<script(?=[^>]*type="module")[^>]*src="([^"]+\.js)"/i);

if (!entryMatch) {
  throw new Error('[bundle-budget] 未在 dist/index.html 中找到入口 JavaScript');
}

const entryPath = join(dirname(indexPath), entryMatch[1].replace(/^\//, ''));
const gzipPath = `${entryPath}.gz`;
const [entryStat, gzipStat] = await Promise.all([stat(entryPath), stat(gzipPath)]);

const rawKb = entryStat.size / 1024;
const gzipKb = gzipStat.size / 1024;
const maxRawKb = Number(process.env.MAX_ENTRY_RAW_KB || 750);
const maxGzipKb = Number(process.env.MAX_ENTRY_GZIP_KB || 300);

console.log(
  `[bundle-budget] entry: ${rawKb.toFixed(2)} KB raw, `
  + `${gzipKb.toFixed(2)} KB gzip `
  + `(limits: ${maxRawKb} / ${maxGzipKb} KB)`,
);

if (rawKb > maxRawKb || gzipKb > maxGzipKb) {
  throw new Error(
    `[bundle-budget] 入口包超过预算：${rawKb.toFixed(2)} KB raw / `
    + `${gzipKb.toFixed(2)} KB gzip`,
  );
}
