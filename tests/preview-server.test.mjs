import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/server.mjs';

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'deepseek-preview-'));
  const served = path.join(folder, 'dist');
  await fs.mkdir(served);
  await fs.writeFile(path.join(served, 'index.html'), '<h1>鲸鲸</h1>');
  await fs.writeFile(path.join(folder, 'private.txt'), 'outside preview');
  const server = await createPreviewServer(served);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    // Cleanup only the exact temporary fixture created by this test.
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('deepseek-preview-'));
    await fs.rm(folder, { recursive: true, force: true });
  });
  const request = (url, method = 'GET') =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: server.address().port, path: url, method },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  return { folder, served, request };
}

test('preview serves UTF-8 files and HEAD, refuses writes', async (t) => {
  const { request } = await fixture(t);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.equal(page.body, '<h1>鲸鲸</h1>');
  assert.match(page.headers['content-type'], /text\/html; charset=utf-8/);
  assert.equal((await request('/', 'HEAD')).body, '');
  assert.equal((await request('/', 'POST')).status, 405);
});

test('preview cannot expose outside paths or malformed URLs', async (t) => {
  const { request } = await fixture(t);
  for (const url of [
    '/%2e%2e%2fprivate.txt',
    '/%2e%2e%5cprivate.txt',
    '/%00',
    '/%zz',
    '/missing.png',
  ]) {
    assert.equal((await request(url)).status, 404, url);
  }
});

test('preview rejects links to files outside its served directory', async (t) => {
  const { folder, served, request } = await fixture(t);
  const outside = path.join(folder, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.txt'), 'outside preview');
  try {
    await fs.symlink(
      outside,
      path.join(served, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Host does not allow test links');
      return;
    }
    throw error;
  }
  assert.equal((await request('/linked/secret.txt')).status, 404);
});
