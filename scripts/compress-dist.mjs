import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.wasm',
]);
const minimumSizeBytes = 1024;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

const files = await walk(distDir);
let sourceBytes = 0;
let compressedBytes = 0;
let compressedFiles = 0;

for (const path of files) {
  if (!compressibleExtensions.has(extname(path)) || path.endsWith('.map')) {
    continue;
  }

  const fileStat = await stat(path);
  if (fileStat.size < minimumSizeBytes) {
    continue;
  }

  const source = await readFile(path);
  const compressed = await gzipAsync(source, { level: 9 });

  // 仅保留有实际传输收益的预压缩文件。
  if (compressed.length >= source.length * 0.95) {
    continue;
  }

  await writeFile(`${path}.gz`, compressed);
  sourceBytes += source.length;
  compressedBytes += compressed.length;
  compressedFiles += 1;
}

const savedPercent = sourceBytes
  ? ((1 - compressedBytes / sourceBytes) * 100).toFixed(1)
  : '0.0';

console.log(
  `[compress-dist] ${compressedFiles} files: `
  + `${(sourceBytes / 1024 / 1024).toFixed(2)} MB -> `
  + `${(compressedBytes / 1024 / 1024).toFixed(2)} MB (${savedPercent}% saved)`,
);

if (compressedFiles) {
  console.log(`[compress-dist] output: ${relative(process.cwd(), distDir) || 'dist'}`);
}
