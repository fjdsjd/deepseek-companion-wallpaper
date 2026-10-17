import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyPose, unposeHead, NECK, HIPS } from '../src/motion.mjs';
import {
  BREATH_RATE,
  buildAvatarMesh,
  RIG_STRIDE,
  respirationSignals,
  respirationOffset,
  propProtection,
} from '../src/respiration.mjs';
const point = (x, y) => ({ x, y });
const offset = (p, t, amount = 1, frame = 'idle') =>
  respirationOffset(
    p,
    respirationSignals(t, amount),
    bodyPose([0, 0], [0, 0], amount, t).breath,
    propProtection(frame),
  );

test('breathing expands the chest locally while the face barely moves and waist/hands stay anchored', () => {
  const inhale = Math.PI / 2 / BREATH_RATE,
    exhale = (3 * Math.PI) / 2 / BREATH_RATE;
  const excursion = (p) => {
    const a = offset(p, inhale, 0.8),
      b = offset(p, exhale, 0.8);
    return { x: a.x - b.x, y: a.y - b.y };
  };
  const chest = excursion(point(0.515, 0.745)),
    face = excursion(point(0.515, 0.48)),
    hands = excursion(point(0.515, 0.965));
  assert.ok(Math.abs(chest.y) * 1080 > 7 && Math.abs(chest.y) * 1080 < 12);
  assert.ok(Math.abs(face.y) * 1080 < 2 && Math.abs(chest.y) > 4 * Math.abs(face.y));
  assert.ok(Math.hypot(hands.x, hands.y) < 1e-8);
  assert.ok(excursion(point(0.4, 0.745)).x < -0.002);
  assert.ok(excursion(point(0.63, 0.745)).x > 0.002);
});

test('long hair flows independently on both sides while eyes and hair roots stay rigid', () => {
  const series = (p) => Array.from({ length: 120 }, (_, i) => offset(p, i / 12).x);
  const range = (values) => Math.max(...values) - Math.min(...values);
  const left = series(point(0.12, 0.84)),
    right = series(point(0.9, 0.84));
  assert.ok(range(left) > 0.01 && range(right) > 0.01, 'visible tip travel on both sides');
  assert.ok(
    left.some((v, i) => Math.abs(v - right[i]) > 0.003),
    'sides must not sway as a single sheet',
  );
  assert.ok(range(series(point(0.32, 0.2))) < 0.0001, 'hair root is anchored');
  assert.ok(range(series(point(0.435, 0.446))) < 0.0001, 'painted left eye is rigid');
  assert.ok(range(series(point(0.604, 0.43))) < 0.0001, 'painted right eye is rigid');
});

test('book/pages/hands and meal props are protected, including state transitions', () => {
  for (const frame of ['study', 'study_tired'])
    for (const p of [
      point(0.27, 0.74),
      point(0.52, 0.82),
      point(0.76, 0.74),
      point(0.32, 0.87),
      point(0.72, 0.87),
    ]) {
      for (let t = 0; t < 10; t += 0.5) {
        const d = offset(p, t, 1, frame);
        assert.ok(Math.hypot(d.x, d.y) < 1e-8, `${frame} at ${p.x},${p.y}`);
      }
    }
  for (const p of [point(0.4, 0.65), point(0.52, 0.78), point(0.6, 0.85)]) {
    const d = offset(p, 1, 1, 'feeding_ready');
    assert.ok(Math.hypot(d.x, d.y) < 1e-8);
  }
  const p = point(0.52, 0.82),
    s = respirationSignals(1, 1),
    carry = bodyPose([0, 0], [0, 0], 1, 1).breath;
  const a = respirationOffset(p, s, carry, [0, 0]),
    b = respirationOffset(p, s, carry, [0.5, 0]);
  assert.ok(Math.abs(b.y - a.y * 0.5) < 1e-10, 'crossfade protects props gradually');
});

test('motion disabled removes all chest and hair deformation', () => {
  for (let y = 0; y <= 1; y += 0.1)
    for (let x = 0; x <= 1; x += 0.1) {
      const d = offset(point(x, y), 2, 0);
      assert.equal(Math.hypot(d.x, d.y), 0);
    }
});

test('full-strength breaths keep mesh triangles unfolded across idle, book and meal poses', () => {
  const mesh = buildAvatarMesh(),
    count = mesh.vertices.length / RIG_STRIDE;
  assert.equal(count, 65 * 65);
  assert.equal(mesh.indices.length, 64 * 64 * 6);
  for (const frame of ['idle', 'study', 'feeding_ready'])
    for (let step = 0; step < 96; step++) {
      const t = step * 0.15,
        vertices = [];
      for (let i = 0; i < count; i++) {
        const p = point(mesh.vertices[i * RIG_STRIDE], mesh.vertices[i * RIG_STRIDE + 1]),
          d = offset(p, t, 1, frame);
        vertices.push(point(p.x + d.x, p.y + d.y));
      }
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = [
          vertices[mesh.indices[i]],
          vertices[mesh.indices[i + 1]],
          vertices[mesh.indices[i + 2]],
        ];
        const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 64 * 64;
        assert.ok(area > 0.55 && area < 1.45, `${frame} triangle ${i / 3}, area ratio ${area}`);
      }
    }
});

test('head hit mapping inverts the displayed neck carry and rotations', () => {
  const rotate = (p, pivot, a) => ({
    x: pivot[0] + (p.x - pivot[0]) * Math.cos(a) - (p.y - pivot[1]) * Math.sin(a),
    y: pivot[1] + (p.x - pivot[0]) * Math.sin(a) + (p.y - pivot[1]) * Math.cos(a),
  });
  for (const source of [point(0.51, 0.2), point(0.405, 0.51), point(0.64, 0.51)]) {
    const pose = bodyPose([0.04, 0.02], [1, 1], 1, 1);
    let p = rotate(point(source.x, source.y - pose.breath), NECK, pose.headAngle);
    p = rotate(point(p.x + pose.headShift[0], p.y + pose.headShift[1]), HIPS, pose.bodyAngle);
    const restored = unposeHead(p, pose);
    assert.ok(Math.hypot(restored.x - source.x, restored.y - source.y) < 1e-10);
  }
});
