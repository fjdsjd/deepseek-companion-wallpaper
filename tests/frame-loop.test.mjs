import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../src/frame-loop.mjs';
test('host-paced 15 FPS does not introduce a second delay, and repeated resumes do not duplicate loops', () => {
  const original = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
  };
  let id = 0,
    timers = 0,
    draws = 0;
  const callbacks = new Map();
  globalThis.requestAnimationFrame = (cb) => {
    callbacks.set(++id, cb);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  globalThis.setTimeout = () => {
    timers++;
    return 1;
  };
  try {
    const loop = createFrameLoop(
      () => draws++,
      () => 15,
      { pacedByHost: true },
    );
    loop.start();
    loop.start();
    for (let n = 0; n < 45; n++) {
      assert.equal(callbacks.size, 1);
      const [[id, cb]] = [...callbacks];
      callbacks.delete(id);
      cb((n * 1000) / 15);
    }
    assert.equal(draws, 45);
    assert.equal(timers, 0);
    loop.stop();
    assert.equal(callbacks.size, 0);
    loop.start();
    loop.start();
    assert.equal(callbacks.size, 1);
    loop.stop();
    assert.equal(callbacks.size, 0);
  } finally {
    Object.assign(globalThis, original);
  }
});
