const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const HEAD_LIMIT = Object.freeze([0.05, 0.024]);
export const NECK = Object.freeze([0.515, 0.605]);
export const HIPS = Object.freeze([0.515, 0.96]);

export function headTarget(drag, look, motion) {
  const amount = clamp(motion, 0, 1);
  if (drag?.kind === 'head') {
    // Ease into the limit: long mouse strokes should not keep stretching the neck.
    return [
      HEAD_LIMIT[0] * Math.tanh((drag.dx * 0.65) / HEAD_LIMIT[0]) * amount,
      HEAD_LIMIT[1] * Math.tanh((drag.dy * 0.5) / HEAD_LIMIT[1]) * amount,
    ];
  }
  return [look[0] * 0.004 * amount, look[1] * 0.002 * amount];
}

export function settleHead(value, velocity, target, dt) {
  // Exact critically damped response, stable at 15/30/60 FPS without bounce.
  const frequency = 14,
    offset = value - target,
    j = velocity + frequency * offset;
  const decay = Math.exp(-frequency * dt);
  return [target + (offset + j * dt) * decay, (velocity - frequency * j * dt) * decay];
}

export function bodyPose(head, look, motion, time) {
  return {
    bodyAngle: clamp(
      -head[0] * 0.25 - look[0] * 0.001 * motion + Math.sin(time * 0.75) * 0.0007 * motion,
      -0.014,
      0.014,
    ),
    headAngle: clamp(-head[0] * 0.7 - look[0] * 0.0015 * motion, -0.036, 0.036),
    headShift: [head[0] * 0.12, head[1] * 0.35],
    // Tiny neck carry only. Chest expansion and delayed hair motion are local
    // mesh deformations; the waist, hands and held objects no longer float.
    breath: Math.sin(time * 1.35) * 0.0009 * motion,
  };
}

function rotate(point, pivot, angle) {
  const x = point.x - pivot[0],
    y = point.y - pivot[1],
    c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: pivot[0] + x * c - y * s, y: pivot[1] + x * s + y * c };
}

export function unposeHead(point, pose) {
  // Hit areas follow the displayed face instead of the old large translation.
  const torso = rotate(point, HIPS, -pose.bodyAngle);
  const head = rotate(
    { x: torso.x - pose.headShift[0], y: torso.y - pose.headShift[1] },
    NECK,
    -pose.headAngle,
  );
  return { x: head.x, y: head.y + pose.breath };
}
