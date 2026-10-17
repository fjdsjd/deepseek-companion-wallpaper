import { bodyPose, settleHead, unposeHead, NECK, HIPS } from './motion.mjs';
import { addMusicPose } from './audio.mjs';
import { TextureCache } from './texture-cache.mjs';
import { SPOON_ANCHOR } from './feeding.mjs';
import {
  buildAvatarMesh,
  RIG_STRIDE,
  respirationSignals,
  propProtection,
  RESPIRATION_GLSL,
} from './respiration.mjs';
// The original raised brows sit ABOVE the angry brows. Replace both positions
// completely, feathering only outside them, or the base brow remains visible.
// Keep WebGL and the CSS fallback on the same authored-image coordinates.
const expressionRegions = [
  { center: [0.52, 0.47], radius: [0.17, 0.14] },
  { center: [0.425, 0.37], radius: [0.1, 0.065] },
  { center: [0.6, 0.36], radius: [0.1, 0.065] },
];
const expressionMaskCSS = expressionRegions
  .map(
    ({ center, radius }) =>
      `radial-gradient(ellipse ${radius[0] * 100}% ${radius[1] * 100}% at ${center[0] * 100}% ${center[1] * 100}%,#000 80%,transparent 100%)`,
  )
  .join(',');
const VERTEX = `
precision mediump float;
attribute vec2 a_pos;
attribute vec3 a_breathe;
attribute vec4 a_hair;
attribute vec2 a_props;
varying vec2 v_uv;
uniform vec2 u_look;
uniform vec4 u_pose;
uniform float u_breath;
uniform float u_respiration;
uniform vec4 u_flow;
uniform vec2 u_protection;
uniform vec4 u_pin;
uniform float u_time;
uniform float u_motion;
uniform float u_hug;
uniform float u_cry;
uniform vec3 u_feed;
vec2 rotateAt(vec2 p,vec2 pivot,float angle){
  float c=cos(angle),s=sin(angle);vec2 d=p-pivot;
  return pivot+vec2(c*d.x-s*d.y,s*d.x+c*d.y);
}
void main(){
  v_uv=a_pos;
  vec2 p=a_pos;
  float head=1.0-smoothstep(.55,.68,a_pos.y);
  // Each press anchors its own cheek. No full-image mirroring or opposite-cheek movement.
  float cheek=exp(-dot((a_pos-u_pin.xy)/vec2(.105,.087),(a_pos-u_pin.xy)/vec2(.105,.087))*1.7);
  // The cheek stretches below the lower lids; keep the painted eyes intact.
  cheek*=smoothstep(.475,.515,a_pos.y);
  p += u_pin.zw*vec2(1.0,.6)*cheek;
  p.x += sin(u_time*17.0)*.0007*u_cry*head;
  ${RESPIRATION_GLSL}
  float arms=smoothstep(.65,.87,a_pos.y)*smoothstep(.06,.26,abs(a_pos.x-.52));
  p.x += (.52-a_pos.x)*u_hug*.19*arms;
  p.y -= u_hug*.025*arms;
  // Chewing stays in the lower face. Hands and bowl have no eating deformation.
  float mouth=exp(-dot((a_pos-vec2(.52,.525))/vec2(.095,.055),(a_pos-vec2(.52,.525))/vec2(.095,.055))*1.6);
  p.y+=u_feed.y*.0025*mouth+u_feed.z*.003*head;
  p.x+=(a_pos.x-.52)*u_feed.y*.025*mouth;
  // Small neck rotation, then a rigid torso lean. Never shear the chest to follow the mouse.
  p=mix(p,rotateAt(p,vec2(${NECK.join(',')}),u_pose.y)+u_pose.zw,head);
  p=rotateAt(p,vec2(${HIPS.join(',')}),u_pose.x);
  p=(p-vec2(.5,.57))*(1.0+u_hug*.10)+vec2(.5,.57);
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);
}`;
const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform sampler2D u_expression;
uniform sampler2D u_oldExpression;
uniform sampler2D u_idleBase;
uniform sampler2D u_mealBase;
uniform sampler2D u_spoonLoaded;
uniform sampler2D u_spoonEmpty;
uniform vec2 u_portraitKinds;
uniform vec4 u_spoonPose;
uniform vec2 u_spoonState;
uniform vec2 u_expressionWeights;
uniform float u_blend;
uniform vec2 u_look;
uniform float u_eye;
float eyeMask(vec2 uv,vec2 center){vec2 p=(uv-center)/vec2(.031,.030);return 1.0-smoothstep(.20,1.0,dot(p,p));}
float detailEllipse(vec2 uv,vec2 center,vec2 radius){vec2 p=(uv-center)/radius;return 1.0-smoothstep(.64,1.0,dot(p,p));}
vec4 portrait(sampler2D layer,vec2 uv,float kind){
  vec4 face=texture2D(layer,uv);
  if(kind<.5)return face;
  // Blink keeps the exact idle body and lighting. Meal keyframes share one
  // stationary bowl/hand base; only eyes and mouth may change between bites.
  vec4 base=kind<1.5?texture2D(u_idleBase,uv):texture2D(u_mealBase,uv);
  float region=max(detailEllipse(uv,vec2(.430,.448),vec2(.073,.053)),detailEllipse(uv,vec2(.608,.432),vec2(.073,.053)));
  if(kind>1.5)region=max(region,detailEllipse(uv,vec2(.523,.525),vec2(.065,.047)));
  return vec4(mix(base.rgb,face.rgb,region*face.a),base.a);
}
void main(){
  vec2 uv=v_uv;
  vec2 eyeA=vec2(.435,.446),eyeB=vec2(.604,.430);
  float mask=max(eyeMask(uv,eyeA),eyeMask(uv,eyeB));
  // Local iris-area texture deformation, independent of body/head movement.
  uv -= u_look*vec2(.0065,.0045)*mask*u_eye;
  vec4 b=portrait(u_current,uv,u_portraitKinds.y);
  vec3 rgb=b.rgb*b.a;float alpha=b.a;
  if(u_blend<.999){
    vec4 a=portrait(u_previous,uv,u_portraitKinds.x);
    rgb=mix(a.rgb*a.a,rgb,u_blend);alpha=mix(a.a,alpha,u_blend);
  }
  if(u_expressionWeights.x+u_expressionWeights.y>.001){
    // Only the aligned face changes: keep the held book, body and side-specific
    // cheek silhouette. The same mesh carries the tears along with either drag.
    vec2 faceOffset=vec2(0.0);
    float faceMask=0.0;
    ${expressionRegions.map(({ center, radius }) => `faceMask=max(faceMask,detailEllipse(v_uv-faceOffset,vec2(${center.join(',')}),vec2(${radius.join(',')})));`).join('\n    ')}
    vec4 oldFace=texture2D(u_oldExpression,uv-faceOffset),newFace=texture2D(u_expression,uv-faceOffset);
    float wa=u_expressionWeights.x*oldFace.a,wb=u_expressionWeights.y*newFace.a;
    rgb=rgb*(1.0-faceMask*(wa+wb))+alpha*faceMask*(oldFace.rgb*wa+newFace.rgb*wb);
  }
  if(u_spoonState.y>.001){
    vec2 d=v_uv-u_spoonPose.xy;
    float c=cos(u_spoonPose.w),s=sin(u_spoonPose.w);
    vec2 spoonUV=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)/u_spoonPose.z+vec2(${SPOON_ANCHOR.join(',')});
    float inside=step(0.0,spoonUV.x)*step(0.0,spoonUV.y)*step(spoonUV.x,1.0)*step(spoonUV.y,1.0);
    vec4 empty=texture2D(u_spoonEmpty,spoonUV),full=texture2D(u_spoonLoaded,spoonUV);
    float opacity=u_spoonState.y*inside;
    float spoonAlpha=mix(empty.a,full.a,u_spoonState.x)*opacity;
    vec3 spoonRGB=mix(empty.rgb*empty.a,full.rgb*full.a,u_spoonState.x)*opacity;
    rgb=spoonRGB+rgb*(1.0-spoonAlpha);alpha=spoonAlpha+alpha*(1.0-spoonAlpha);
  }
  gl_FragColor=vec4(alpha>.001?rgb/alpha:vec3(0.0),alpha);
}`;
const portraitKind = (frame) => (frame === 'blink' ? 1 : frame.startsWith('feeding_') ? 2 : 0);
const portraitBase = (frame) =>
  frame === 'blink' ? 'idle' : frame.startsWith('feeding_') ? 'feeding_base' : frame;
const portraitFace = (frame) => (frame === 'feeding_bite' ? 'feeding_base' : frame);
const eyeDetailMask =
  'radial-gradient(ellipse 7.3% 5.3% at 43% 44.8%,#000 80%,transparent 100%),radial-gradient(ellipse 7.3% 5.3% at 60.8% 43.2%,#000 80%,transparent 100%)';
const mouthDetailMask =
  'radial-gradient(ellipse 6.5% 4.7% at 52.3% 52.5%,#000 80%,transparent 100%)';
export class AvatarRenderer {
  constructor(canvas, fallback) {
    this.canvas = canvas;
    this.fallback = fallback;
    this.textures = {};
    this.images = {};
    this.current = 'idle';
    this.previous = 'idle';
    this.expression = 0;
    this.oldExpression = 0;
    this.expressionChangedAt = 0;
    this.expressionFallback = fallback.cloneNode();
    this.expressionFallback.id = 'expressionFallback';
    this.expressionFallback.alt = '';
    this.expressionFallback.setAttribute('aria-hidden', 'true');
    this.expressionFallback.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;object-fit:contain;mask-image:${expressionMaskCSS}`;
    this.faceFallback = fallback.cloneNode();
    this.faceFallback.id = 'faceFallback';
    this.faceFallback.alt = '';
    this.faceFallback.setAttribute('aria-hidden', 'true');
    this.expressionFallback.removeAttribute('src');
    this.faceFallback.removeAttribute('src');
    this.faceFallback.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;object-fit:contain';
    this.spoonFallback = document.createElement('div');
    this.spoonFallback.id = 'spoonFallback';
    this.spoonFallback.setAttribute('aria-hidden', 'true');
    this.spoonFallback.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.spoonSprite = document.createElement('div');
    this.spoonSprite.style.cssText = 'position:absolute;aspect-ratio:1;transform-origin:0 0';
    this.emptySpoon = new Image();
    this.fullSpoon = new Image();
    for (const spoon of [this.emptySpoon, this.fullSpoon]) {
      spoon.alt = '';
      spoon.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      this.spoonSprite.append(spoon);
    }
    this.spoonFallback.append(this.spoonSprite);
    this.expressionFallback.hidden = this.faceFallback.hidden = this.spoonFallback.hidden = true;
    fallback.after(this.faceFallback, this.expressionFallback, this.spoonFallback);
    this.changedAt = 0;
    this.motionTime = 0;
    this.params = { look: [0, 0], head: [0, 0], pin: [0.5, 0.5, 0, 0], feed: [0, 0, 0] };
    this.params.pose = bodyPose([0, 0], [0, 0], 0, 0);
    this.velocity = { head: [0, 0], pin: [0, 0] };
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    this.cache = new TextureCache(this.gl);
    this.images = this.cache.images;
    this.textures = this.cache.textures;
    if (!this.gl) {
      canvas.hidden = true;
      fallback.hidden = false;
      this.backend = 'image-fallback';
      return;
    }
    const gl = this.gl;
    const compile = (type, source) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.program = program;
    this.u = Object.fromEntries(
      [
        'look',
        'pose',
        'breath',
        'respiration',
        'flow',
        'protection',
        'pin',
        'time',
        'motion',
        'hug',
        'cry',
        'feed',
        'current',
        'previous',
        'blend',
        'eye',
        'expression',
        'oldExpression',
        'expressionWeights',
        'idleBase',
        'mealBase',
        'portraitKinds',
        'spoonLoaded',
        'spoonEmpty',
        'spoonPose',
        'spoonState',
      ].map((k) => [k, gl.getUniformLocation(program, 'u_' + k)]),
    );
    this.emptyTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    const mesh = buildAvatarMesh();
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    for (const [name, size, offset] of [
      ['pos', 2, 0],
      ['breathe', 3, 2],
      ['hair', 4, 5],
      ['props', 2, 9],
    ]) {
      const a = gl.getAttribLocation(program, 'a_' + name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, RIG_STRIDE * 4, offset * 4);
    }
    const indices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.count = mesh.indices.length;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.backend = 'webgl-mesh';
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      fallback.src = this.images[this.current]?.src || fallback.src;
      fallback.hidden = false;
      canvas.hidden = true;
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
  }
  async load(names) {
    this.available = new Set(names.map(portraitFace));
    await Promise.all(['idle', 'blink'].map((name) => this.cache.request(name)));
  }
  hitPoint(point) {
    return unposeHead(point, this.params.pose);
  }
  draw(time, state, p) {
    // Advance only on rendered active frames, so a paused wallpaper resumes
    // at the same breath/hair phase rather than jumping to wall-clock time.
    this.motionTime += Math.min(p.dt, 100) / 1000;
    let frame = p.meal
      ? p.meal.frame
      : p.cryingPinch
        ? 'crying'
        : state === 'pinching'
          ? ['study', 'study_tired'].includes(p.gestureBase)
            ? p.gestureBase
            : p.side === 'left'
              ? 'pinch_left'
              : 'pinch_right'
          : state === 'idle' && p.listening
            ? 'listening'
            : p.blink && state === 'idle'
              ? 'blink'
              : state;
    let expression = p.pinchMood || 0;
    const dependencies = (name) => [
      portraitFace(name),
      ...(portraitKind(name) ? [portraitBase(name)] : []),
      ...(portraitKind(name) === 2 ? ['spoon_loaded', 'spoon_empty'] : []),
    ];
    const wanted = [...dependencies(frame), ...(expression ? [`annoyed_${expression}`] : [])];
    // Hold the last complete portrait while the local PNG decodes. Never draw
    // a blank or partially loaded face; preload the whole meal as a group.
    if (!this.cache.prepare(wanted, time)) {
      frame = this.current;
      expression = this.expression;
    }
    if (p.meal)
      for (const name of [
        'feeding_base',
        'feeding_ready',
        'feeding_chew',
        'spoon_loaded',
        'spoon_empty',
      ])
        this.cache.request(name).catch(() => {});
    if (this.current !== frame) {
      this.previous = this.current;
      this.current = frame;
      this.changedAt = time;
    }
    if (this.expression !== expression) {
      this.oldExpression = this.expression;
      this.expression = expression;
      this.expressionChangedAt = time;
    }
    const expressionBlend = Math.min(1, (time - this.expressionChangedAt) / 210);
    this.params.expression = {
      level: expression,
      previous: this.oldExpression,
      weights: [this.oldExpression ? 1 - expressionBlend : 0, expression ? expressionBlend : 0],
    };
    const smooth = 1 - Math.exp(-p.dt / 95);
    const look = this.params.look,
      head = this.params.head,
      pin = this.params.pin;
    const dt = Math.min(p.dt / 1000, 0.045);
    for (let i = 0; i < 2; i++) {
      look[i] += (p.look[i] - look[i]) * smooth;
      [head[i], this.velocity.head[i]] = settleHead(
        head[i],
        this.velocity.head[i],
        p.head[i],
        Math.min(p.dt / 1000, 0.1),
      );
      this.velocity.pin[i] += (300 * (p.pin[i + 2] - pin[i + 2]) - 20 * this.velocity.pin[i]) * dt;
      pin[i + 2] += this.velocity.pin[i] * dt;
    }
    // Keep the released anchor until the spring settles, so the same cheek rebounds.
    if (p.draggingCheek) {
      pin[0] = p.pin[0];
      pin[1] = p.pin[1];
    }
    const music = this.params.music || { sway: 0, bob: 0 };
    const musicEase = 1 - Math.exp(-p.dt / 180);
    music.sway += ((p.music?.sway || 0) - music.sway) * musicEase;
    music.bob += ((p.music?.bob || 0) - music.bob) * musicEase;
    this.params.music = music;
    const pose = (this.params.pose = addMusicPose(
      bodyPose(head, look, p.motion, this.motionTime),
      music,
      p.motion,
    ));
    const blendMs =
      frame === 'listening' || this.previous === 'listening'
        ? 320
        : frame === 'blink' || this.previous === 'blink'
          ? 55
          : 210;
    const blend = Math.min(1, (time - this.changedAt) / blendMs);
    if (blend === 1) this.previous = this.current;
    const inMeal = portraitKind(this.current) === 2;
    const keep = [
      ...wanted,
      ...dependencies(this.current),
      ...(blend < 1 ? dependencies(this.previous) : []),
      ...(expression ? [`annoyed_${expression}`] : []),
      ...(this.oldExpression && expressionBlend < 1 ? [`annoyed_${this.oldExpression}`] : []),
      ...(['idle', 'blink'].includes(this.current) ? ['idle', 'blink'] : []),
      ...(p.meal
        ? ['feeding_base', 'feeding_ready', 'feeding_chew', 'spoon_loaded', 'spoon_empty']
        : []),
    ];
    this.cache.protected = new Set(keep);
    this.cache.trim(time);
    const oldProps = propProtection(this.previous),
      newProps = propProtection(frame);
    const protection = oldProps.map((v, i) => v + (newProps[i] - v) * blend);
    const respiration = (this.params.respiration = {
      ...respirationSignals(this.motionTime, p.motion),
      protection,
      time: this.motionTime,
    });
    this.params.feed = p.meal ? [0, p.meal.chew * p.motion, p.meal.nod * p.motion] : [0, 0, 0];
    this.params.spoon = inMeal ? p.meal?.spoon || null : null;
    this.params.portrait = {
      base: portraitBase(frame),
      face: portraitFace(frame),
      kind: portraitKind(frame),
    };
    if (!this.gl || this.lost) {
      // A flat-image fallback cannot deform hair/chest. Do not substitute the
      // old whole-image bob or shrink the portrait during meals.
      this.fallback.style.transformOrigin = '50% 7%';
      this.fallback.style.transform = `rotate(${pose.bodyAngle}rad)`;
      const baseSrc = this.images[portraitBase(frame)]?.src;
      if (baseSrc && this.fallback.src !== baseSrc) this.fallback.src = baseSrc;
      const kind = portraitKind(frame);
      this.faceFallback.hidden = !kind;
      if (kind) {
        const src = this.images[portraitFace(frame)].src;
        if (this.faceFallback.src !== src) this.faceFallback.src = src;
        this.faceFallback.style.maskImage =
          eyeDetailMask + (kind === 2 ? ',' + mouthDetailMask : '');
        this.faceFallback.style.transformOrigin = this.fallback.style.transformOrigin;
        this.faceFallback.style.transform = this.fallback.style.transform;
      }
      this.spoonFallback.hidden = !(p.meal && inMeal);
      if (p.meal && inMeal) {
        if (this.emptySpoon.src !== this.images.spoon_empty.src)
          this.emptySpoon.src = this.images.spoon_empty.src;
        if (this.fullSpoon.src !== this.images.spoon_loaded.src)
          this.fullSpoon.src = this.images.spoon_loaded.src;
        const spoon = p.meal.spoon;
        this.spoonFallback.style.transformOrigin = this.fallback.style.transformOrigin;
        this.spoonFallback.style.transform = this.fallback.style.transform;
        this.spoonSprite.style.left = `${spoon.x * 100}%`;
        this.spoonSprite.style.top = `${spoon.y * 100}%`;
        this.spoonSprite.style.width = `${spoon.width * 100}%`;
        this.spoonSprite.style.transform = `rotate(${spoon.angle}rad) translate(${-SPOON_ANCHOR[0] * 100}%,${-SPOON_ANCHOR[1] * 100}%)`;
        this.spoonSprite.style.opacity = String(spoon.opacity);
        this.fullSpoon.style.opacity = String(spoon.loaded);
      }
      this.expressionFallback.hidden = !expression;
      if (expression) {
        const src = this.images[`annoyed_${expression}`].src;
        if (this.expressionFallback.src !== src) this.expressionFallback.src = src;
        this.expressionFallback.style.transformOrigin = this.fallback.style.transformOrigin;
        this.expressionFallback.style.transform = this.fallback.style.transform;
      }
      return;
    }
    const gl = this.gl;
    const size = Math.min(
      1254,
      Math.round(this.canvas.clientWidth * Math.min(devicePixelRatio, 1.4)),
    );
    if (size !== this.canvas.width) {
      this.canvas.width = this.canvas.height = size;
      gl.viewport(0, 0, size, size);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    const kind = portraitKind(this.current),
      oldKind = blend < 1 ? portraitKind(this.previous) : kind;
    for (const [unit, uniform, name] of [
      [0, 'current', portraitFace(this.current)],
      [1, 'previous', blend < 1 ? portraitFace(this.previous) : null],
      [2, 'expression', expression ? `annoyed_${expression}` : null],
      [
        3,
        'oldExpression',
        this.oldExpression && expressionBlend < 1 ? `annoyed_${this.oldExpression}` : null,
      ],
      [4, 'idleBase', kind === 1 || oldKind === 1 ? 'idle' : null],
      [5, 'mealBase', kind === 2 || oldKind === 2 ? 'feeding_base' : null],
      [6, 'spoonLoaded', this.params.spoon ? 'spoon_loaded' : null],
      [7, 'spoonEmpty', this.params.spoon ? 'spoon_empty' : null],
    ]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, name ? this.cache.texture(name) : this.emptyTexture);
      gl.uniform1i(this.u[uniform], unit);
    }
    gl.uniform2f(this.u.portraitKinds, portraitKind(this.previous), portraitKind(this.current));
    const spoon = this.params.spoon;
    gl.uniform4f(
      this.u.spoonPose,
      spoon?.x || 0,
      spoon?.y || 0,
      spoon?.width || 0.26,
      spoon?.angle || 0,
    );
    gl.uniform2f(this.u.spoonState, spoon?.loaded || 0, spoon?.opacity || 0);
    gl.uniform2fv(this.u.expressionWeights, this.params.expression.weights);
    gl.uniform1f(this.u.blend, blend);
    gl.uniform2fv(this.u.look, look);
    gl.uniform4f(this.u.pose, pose.bodyAngle, pose.headAngle, ...pose.headShift);
    gl.uniform1f(this.u.breath, pose.breath);
    gl.uniform4fv(this.u.pin, pin);
    gl.uniform1f(this.u.respiration, respiration.chest);
    gl.uniform4fv(this.u.flow, respiration.flow);
    gl.uniform2fv(this.u.protection, protection);
    gl.uniform1f(this.u.time, this.motionTime);
    gl.uniform1f(this.u.motion, p.motion);
    gl.uniform1f(this.u.hug, p.hug);
    gl.uniform3fv(this.u.feed, this.params.feed);
    gl.uniform1f(this.u.cry, state === 'crying' || p.cryingPinch ? p.motion : 0);
    gl.uniform1f(
      this.u.eye,
      expression
        ? 1
        : p.meal || ['hugging', 'blink', 'study', 'crying', 'listening'].includes(frame)
          ? 0
          : 1,
    );
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }
}
