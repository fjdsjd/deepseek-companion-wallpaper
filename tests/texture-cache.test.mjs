import test from 'node:test';
import assert from 'node:assert/strict';
import { TextureCache } from '../src/texture-cache.mjs';
const fixture = (options) => {
  let created = 0;
  const deleted = [];
  const gl = {
    createTexture: () => ({ id: ++created }),
    bindTexture() {},
    texParameteri() {},
    texImage2D() {},
    deleteTexture: (t) => deleted.push(t.id),
  };
  const cache = new TextureCache(gl, {
    limit: 3,
    ttl: 1000,
    loadImage: async () => ({ width: 1254, height: 1254 }),
    ...options,
  });
  return { cache, deleted };
};
test('loading a local image does not allocate a GPU texture until it is used', async () => {
  const { cache } = fixture();
  await cache.request('idle');
  assert.equal(cache.stats.textureBytes, 0);
  const a = cache.texture('idle');
  assert.equal(cache.texture('idle'), a);
  assert.equal(cache.stats.textureBytes, 1254 * 1254 * 4);
});
test('LRU evicts both bitmap and texture but protects the crossfading faces', async () => {
  const { cache, deleted } = fixture();
  for (const [i, name] of ['idle', 'crying', 'petting', 'asking_hug'].entries()) {
    await cache.request(name);
    cache.entries.get(name).touched = i;
    cache.texture(name);
  }
  cache.protected = new Set(['crying', 'petting']);
  cache.trim(100, true);
  assert.deepEqual(cache.stats.resident, ['crying', 'petting']);
  assert.deepEqual(cache.stats.decoded, ['crying', 'petting']);
  assert.deepEqual(deleted, [1, 4]);
  await cache.request('idle');
  assert.equal(cache.stats.resident.includes('idle'), false);
  assert.ok(cache.texture('idle'));
});
test('long idle releases all unrelated images and textures without losing active ones', async () => {
  const { cache } = fixture();
  await Promise.all(['idle', 'blink', 'study'].map((n) => cache.request(n)));
  cache.protected = new Set(['idle', 'blink']);
  for (const n of ['idle', 'blink', 'study']) cache.texture(n);
  cache.trim(performance.now() + 2000);
  assert.deepEqual(cache.stats.decoded, ['idle', 'blink']);
  assert.equal(cache.stats.textureBytes, 2 * 1254 * 1254 * 4);
});
test('concurrent requests share one decode; failure is recorded without a retry loop', async () => {
  let calls = 0;
  const { cache } = fixture({
    loadImage: async () => {
      calls++;
      throw Error('missing');
    },
  });
  await Promise.allSettled([cache.request('missing'), cache.request('missing')]);
  for (let i = 0; i < 20; i++) assert.equal(cache.prepare(['missing'], i), false);
  assert.equal(calls, 1);
  assert.equal(cache.stats.errors.length, 1);
  assert.equal(cache.stats.textureBytes, 0);
});
