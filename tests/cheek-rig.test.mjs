import test from 'node:test';
import assert from 'node:assert/strict';
import { cheekSample, CHEEK_RANGE } from '../src/cheek-rig.mjs';

test('layered cheeks allow a visible outward stretch on both sides', () => {
  for (const [x, left] of [
    [0.39, true],
    [0.65, false],
  ]) {
    const sign = left ? -1 : 1,
      pin = [x, 0.52, sign * 0.09, 0];
    const source = cheekSample(x + sign * 0.05, 0.52, pin);
    assert.ok(Math.abs(source.x - x) < 0.025);
    assert.ok(source.scale > 1.65);
  }
  assert.ok(CHEEK_RANGE.outward >= 0.08);
});
test('inverse face mapping stays finite during large drags and does not invert horizontal skin', () => {
  for (const left of [true, false])
    for (const dx of [-1, -0.09, 0, 0.09, 1])
      for (const dy of [-1, 0, 1]) {
        const pin = [left ? 0.39 : 0.65, 0.52, dx, dy];
        for (let y = 0.46; y <= 0.61; y += 0.01)
          for (let x = 0.28; x <= 0.78; x += 0.01) {
            const a = cheekSample(x, y, pin),
              b = cheekSample(x + 0.001, y, pin);
            assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && a.scale >= 0.8);
            assert.ok(b.x > a.x);
          }
      }
});
test('zero drag and upper hair / lower body coordinates retain their original sampling', () => {
  for (const pin of [
    [0.39, 0.52, 0, 0],
    [0.65, 0.52, 0, 0],
  ]) {
    const p = cheekSample(0.43, 0.52, pin);
    assert.ok(Math.abs(p.x - 0.43) < 1e-9);
    assert.equal(p.y, 0.52);
  }
  for (const y of [0.1, 0.35, 0.47, 0.6, 0.85]) {
    const p = cheekSample(0.43, y, [0.39, 0.52, -0.09, 0.026]);
    assert.ok(Math.abs(p.x - 0.43) < 1e-9);
    assert.equal(p.y, y);
  }
});
