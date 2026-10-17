// Development preview only. Wallpaper Engine loads dist/ directly.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
};

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function createPreviewServer(directory = path.join(root, 'dist')) {
  const servedRoot = await fs.realpath(directory);
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const candidate = path.resolve(
        servedRoot,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
      if (!inside(servedRoot, candidate)) throw new Error('Outside preview directory');
      const file = await fs.realpath(candidate);
      if (!inside(servedRoot, file) || !(await fs.stat(file)).isFile()) {
        throw new Error('Not a preview file');
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else
        createReadStream(file)
          .on('error', () => res.destroy())
          .pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const validArgs = args.length === 0 || (args.length === 2 && args[0] === '--port');
  const port = args.length === 0 ? 17432 : Number(args[1]);
  if (!validArgs || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Usage: npm start -- --port 17432 (port must be 1–65535)');
  }
  try {
    await fs.access(path.join(root, 'dist/index.html'));
  } catch {
    throw new Error('Build the wallpaper first: npm run build');
  }
  const server = await createPreviewServer();
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
}
