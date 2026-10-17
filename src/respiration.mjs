// Rest-space weights for the aligned portraits. Built once, not sampled from
// images or recalculated on the CPU every frame.
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ellipse = (x, y, cx, cy, rx, ry) => Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
export const BREATH_RATE = 1.35;
export const RIG_STRIDE = 11;
export const FLOW_AMPLITUDES = Object.freeze([0.007, 0.002, 0.0015]);

export function respirationWeights(x, y) {
  const center = 0.515,
    distance = Math.abs(x - center);
  const torso = smooth(0.575, 0.63, y) * (1 - smooth(0.82, 0.915, y));
  const chest = ellipse(x, y, center, 0.745, 0.205, 0.125) * torso;
  const shoulders =
    (ellipse(x, y, 0.345, 0.68, 0.11, 0.065) + ellipse(x, y, 0.685, 0.68, 0.11, 0.065)) * torso;
  // The waist and resting hands are anchors. Only the upper chest expands;
  // a much smaller, continuous neck carry keeps the collar attached to the face.
  const breathe = [
    (x - center) * 0.028 * chest,
    -0.0047 * chest - 0.0014 * shoulders,
    1 - smooth(0.57, 0.89, y),
  ];

  const length = smooth(0.37, 0.94, y);
  const inner = 0.16 + 0.145 * smooth(0.55, 0.88, y);
  const edge = smooth(0.004, 0.04, x) * smooth(0.004, 0.04, 1 - x) * (1 - smooth(0.96, 1, y));
  const longHair = smooth(inner, inner + 0.075, distance) * length * edge;
  const fringe =
    0.14 *
    ellipse(x, y, 0.5, 0.32, 0.21, 0.13) *
    smooth(0.19, 0.31, y) *
    (1 - smooth(0.355, 0.4, y));
  const forelock =
    0.42 * smooth(0.32, 0.36, x) * (1 - smooth(0.56, 0.6, x)) * (1 - smooth(0.075, 0.135, y));
  // Tips lag their roots and the two sides lag one another. Secondary motion
  // shares the breathing rhythm but has its own slower-to-settle flutter.
  const lag = 0.35 + length * 1.45 + (x < center ? 0.2 : 0.85);
  const components = [
    [longHair, lag],
    [fringe, 0.25],
    [forelock, 1.05],
  ];
  const hair = [0, 0, 0, 0];
  for (const [weight, phase] of components) {
    hair[0] += weight * Math.cos(phase);
    hair[1] -= weight * Math.sin(phase);
    hair[2] += weight * Math.cos(phase + 0.8);
    hair[3] -= weight * Math.sin(phase + 0.8);
  }

  // Keep book covers/pages and the hands holding them rigid. The mask follows
  // the open book's V-shaped top, leaving the collar and upper chest free.
  const bookTop = 0.805 - 0.35 * Math.abs(x - 0.52);
  const book =
    smooth(0.18, 0.22, x) *
    (1 - smooth(0.82, 0.86, x)) *
    smooth(bookTop - 0.035, bookTop - 0.015, y);
  // Spoon, rice bowl and both hands are protected from the idle deformation;
  // the independent spoon layer handles the feeding path without moving them.
  const meal = smooth(0.27, 0.33, x) * (1 - smooth(0.66, 0.72, x)) * smooth(0.565, 0.61, y);
  return [...breathe, ...hair, book, meal];
}

export function respirationSignals(time, amount) {
  const strength = clamp(amount),
    phase = time * BREATH_RATE;
  return {
    chest: Math.sin(phase) * strength,
    flow: [
      Math.sin(phase) * strength,
      Math.cos(phase) * strength,
      Math.sin(phase * 1.63 + 0.4) * strength,
      Math.cos(phase * 1.63 + 0.4) * strength,
    ],
  };
}

export function propProtection(frame) {
  return [
    frame === 'study' || frame === 'study_tired' ? 1 : 0,
    frame.startsWith('feeding_') ? 1 : 0,
  ];
}

export function buildAvatarMesh(n = 64) {
  const vertices = [],
    indices = [];
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) vertices.push(x / n, y / n, ...respirationWeights(x / n, y / n));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x,
        b = a + 1,
        c = a + n + 1,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

// CPU counterpart for geometry checks and diagnostic landmarks, not rendering.
export function respirationOffset(point, signals, neckCarry, protection = [0, 0]) {
  const [bx, by, carry, hx, hy, vx, vy, book, meal] = respirationWeights(point.x, point.y);
  const free = 1 - clamp(book * protection[0] + meal * protection[1]),
    f = signals.flow;
  return {
    x:
      free *
      (bx * signals.chest +
        (hx * f[0] + hy * f[1]) * FLOW_AMPLITUDES[0] +
        (hx * f[2] + hy * f[3]) * FLOW_AMPLITUDES[1]),
    y:
      free *
      (by * signals.chest - carry * neckCarry + (vx * f[0] + vy * f[1]) * FLOW_AMPLITUDES[2]),
  };
}

export const RESPIRATION_GLSL = `
  float freeMotion=1.0-clamp(dot(a_props,u_protection),0.0,1.0);
  vec2 localBreath=a_breathe.xy*u_respiration-vec2(0.0,a_breathe.z*u_breath);
  vec2 hairFlow=vec2(dot(a_hair.xy,u_flow.xy)*${FLOW_AMPLITUDES[0]}+dot(a_hair.xy,u_flow.zw)*${FLOW_AMPLITUDES[1]},dot(a_hair.zw,u_flow.xy)*${FLOW_AMPLITUDES[2]});
  p+=(localBreath+hairFlow)*freeMotion;
`;
