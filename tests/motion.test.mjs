import test from 'node:test';
import assert from 'node:assert/strict';
import { headTarget, settleHead, bodyPose } from '../src/motion.mjs';

test('head drag remains responsive with a bounded displacement at maximum motion', () => {
  const small = headTarget({ kind: 'head', dx: 0.01, dy: 0.01 }, [0, 0], 1);
  const large = headTarget({ kind: 'head', dx: 100, dy: 100 }, [1, 1], 1);
  assert.ok(small[0] > 0.003 && small[1] > 0.002);
  assert.ok(large[0] <= 0.05 && large[1] <= 0.024);
  assert.deepEqual(headTarget({ kind: 'head', dx: 100, dy: 100 }, [1, 1], 0), [0, 0]);
});

test('head releases settle without crossing the baseline at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    let x = 0.05,
      v = 0,
      last = x;
    for (let frame = 0; frame < fps; frame++) {
      [x, v] = settleHead(x, v, 0, 1 / fps);
      assert.ok(x >= 0 && x <= last, 'return must be monotone without a spring bounce');
      last = x;
    }
    assert.ok(x < 0.0001);
  }
});

test('rapid target reversals remain bounded and chest lean stays below one degree', () => {
  for (const fps of [15, 30, 60]) {
    let x = 0,
      v = 0;
    for (let frame = 0; frame < fps * 4; frame++) {
      const target = frame % (fps / 2) < fps / 4 ? 0.05 : -0.05;
      [x, v] = settleHead(x, v, target, 1 / fps);
      const pose = bodyPose([x, 0.024], [1, 1], 1, frame / fps);
      assert.ok(Math.abs(x) <= 0.05001);
      assert.ok(Math.abs(pose.bodyAngle) < Math.PI / 180);
      assert.ok(Math.abs(pose.headAngle) < (2.1 * Math.PI) / 180);
      assert.ok(Math.abs(pose.headShift[0]) <= 0.0061 && Math.abs(pose.headShift[1]) <= 0.0085);
    }
  }
});
