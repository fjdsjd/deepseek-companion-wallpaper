import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const out = path.join(root, 'dist');

// Refuse links before writing or pruning generated output. Rebuilding may only
// remove obsolete files in this project's dist directory.
async function listFiles(directory) {
  if ((await fs.lstat(directory)).isSymbolicLink()) {
    throw new Error(`Unexpected link: ${directory}`);
  }
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected link: ${file}`);
    if (entry.isDirectory()) files.push(...(await listFiles(file)));
    else if (entry.isFile()) files.push(file);
    else throw new Error(`Unsupported file: ${file}`);
  }
  return files.sort();
}

const sourceFiles = await listFiles(publicDir);
await fs.mkdir(out, { recursive: true });
await listFiles(out);
const expected = new Set(['app.js', 'project.json', 'integrity.json']);

for (const file of sourceFiles) {
  const relative = path.relative(publicDir, file);
  expected.add(relative);
  await fs.mkdir(path.dirname(path.join(out, relative)), { recursive: true });
  await fs.copyFile(file, path.join(out, relative));
}
for (const name of ['LICENSE', 'ASSETS.md', 'THIRD_PARTY_NOTICES.md']) {
  expected.add(name);
  await fs.copyFile(path.join(root, name), path.join(out, name));
}

await build({
  entryPoints: [path.join(root, 'src/wallpaper-app.mjs')],
  bundle: true,
  format: 'iife',
  target: 'chrome100',
  outfile: path.join(out, 'app.js'),
  minify: true,
  sourcemap: false,
});

// All runtime resources are local. Host audio uses Wallpaper Engine callbacks.
const js = await fs.readFile(path.join(out, 'app.js'), 'utf8');
if (/fetch\s*\(|EventSource|WebSocket|XMLHttpRequest/.test(js)) {
  throw new Error('Unexpected network API in the wallpaper bundle');
}
const listing = JSON.parse(await fs.readFile(path.join(root, 'wallpaper.json'), 'utf8'));
const properties = JSON.parse(
  await fs.readFile(path.join(root, 'src/wallpaper-properties.json'), 'utf8'),
);
const project = {
  title: listing.title,
  description: listing.description,
  tags: [listing.genre],
  contentrating: listing.ageRating,
  type: 'web',
  file: 'index.html',
  preview: 'preview.gif',
  visibility: 'private',
  general: { properties, supportsaudioprocessing: true },
};
await fs.writeFile(path.join(out, 'project.json'), JSON.stringify(project, null, 2) + '\n');

for (const file of await listFiles(out)) {
  const relative = path.relative(out, file);
  if (path.isAbsolute(relative) || relative.startsWith('..') || path.resolve(file) === out) {
    throw new Error('Unsafe output path');
  }
  if (!expected.has(relative)) await fs.unlink(file);
}

const files = [];
for (const file of await listFiles(out)) {
  if (path.basename(file) === 'integrity.json') continue;
  const bytes = await fs.readFile(file);
  files.push({
    file: path.relative(out, file).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await fs.writeFile(path.join(out, 'integrity.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(
  `Built ${files.length} files (${files.reduce((sum, f) => sum + f.bytes, 0)} bytes) in dist/`,
);
