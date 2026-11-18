// Render-time layers: stationary body, deformable cheek skin,
// then ALL original hair above the face. Reuse the aligned source pixels so light,
// blush and tear expressions keep their original painting and color.
export const CHEEK_RANGE = Object.freeze({
  outward: 0.09,
  inward: 0.025,
  vertical: 0.026,
  width: 0.125,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function cheekSample(x, y, pin) {
  const left = pin[0] < 0.52,
    anchor = left ? 0.505 : 0.535;
  const band = smooth(0.478, 0.51, y) * (1 - smooth(0.546, 0.59, y));
  const pull = clamp((left ? -1 : 1) * pin[2], -CHEEK_RANGE.inward, CHEEK_RANGE.outward);
  const side = left ? 1 - smooth(0.385, anchor, x) : smooth(anchor, 0.655, x);
  const scale = 1 + (pull / CHEEK_RANGE.width) * band;
  return {
    x: anchor + (x - anchor) / scale,
    y: y - clamp(pin[3], -CHEEK_RANGE.vertical, CHEEK_RANGE.vertical) * band * side * 0.7,
    scale,
    side,
  };
}
export const CHEEK_GLSL = `
float skinLayer(vec4 color){
  return smoothstep(.065,.14,color.r-color.b)*smoothstep(.22,.48,color.r);
}
vec2 cheekSample(vec2 point,vec4 pin){
  bool left=pin.x<.52;
  float anchor=left?.505:.535;
  float band=smoothstep(.478,.510,point.y)*(1.0-smoothstep(.546,.590,point.y));
  float pull=clamp((left?-1.0:1.0)*pin.z,-${CHEEK_RANGE.inward},${CHEEK_RANGE.outward});
  float side=left?1.0-smoothstep(.385,anchor,point.x):smoothstep(anchor,.655,point.x);
  float scale=1.0+pull/${CHEEK_RANGE.width}*band;
  return vec2(anchor+(point.x-anchor)/scale,point.y-clamp(pin.w,-${CHEEK_RANGE.vertical},${CHEEK_RANGE.vertical})*band*side*.7);
}
float cheekLayer(vec2 point,vec4 color,bool left){
  float side=left?1.0-smoothstep(.475,.505,point.x):smoothstep(.535,.565,point.x);
  float face=smoothstep(.372,.385,point.x)*(1.0-smoothstep(.657,.670,point.x));
  float band=smoothstep(.478,.493,point.y)*(1.0-smoothstep(.565,.590,point.y));
  return side*face*band*skinLayer(color);
}`;
