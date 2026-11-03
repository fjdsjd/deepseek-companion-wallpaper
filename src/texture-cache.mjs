// 用 URL 解码一张图；cors=true 时按 CORS 模式请求（拿到"同源干净"的像素）。
function decodeImage(url, cors = true) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error(`角色素材加载失败: ${url}`));
    image.src = url;
  });
}

// 贴图必须"同源干净"才能进 WebGL：壁纸常被放进 allow-scripts 的沙箱 iframe
// （DSH 壁纸引擎、Wallpaper Engine 网页壁纸都是这个形态），此时页面是不透明源，
// 普通 new Image() 拿到的像素会被判跨域，texImage2D 抛 SecurityError，人物整块不画。
// 先带 crossOrigin 取一次（宿主对壁纸资源带 Access-Control-Allow-Origin，跨域也是干净像素），
// 失败再退回普通 Image —— 本机预览、file:// 打开等没有 CORS 的场景照旧。
// 注意：这里不用 fetch，构建脚本禁止壁纸包出现网络 API（见 scripts/build.mjs）。
function loadWallpaperImage(src) {
  return decodeImage(src, true).catch(() => decodeImage(src, false));
}

// Bound both decoded images and GPU textures. The browser's compressed-file
// cache may retain PNG bytes; no dormant portrait needs a resident GL texture.
export class TextureCache {
  constructor(gl, { limit = 8, ttl = 20000, loadImage = loadWallpaperImage } = {}) {
    this.gl = gl;
    this.limit = limit;
    this.ttl = ttl;
    this.loadImage = loadImage;
    this.entries = new Map();
    this.images = {};
    this.textures = {};
    this.protected = new Set();
    this.lastTrim = 0;
    this.errors = [];
  }
  async request(name) {
    let entry = this.entries.get(name);
    if (entry) return entry.promise;
    entry = { name, touched: performance.now(), image: null, texture: null };
    this.entries.set(name, entry);
    entry.promise = this.loadImage(`assets/character/${name}.png`)
      .then((image) => {
        entry.image = image;
        this.images[name] = image;
        return image;
      })
      .catch((error) => {
        entry.failed = true;
        this.errors.push(String(error));
        throw error;
      });
    return entry.promise;
  }
  prepare(names, now) {
    this.protected = new Set(names);
    let ready = true;
    for (const name of this.protected) {
      const entry = this.entries.get(name);
      if (entry) entry.touched = now;
      if (!entry?.image) {
        ready = false;
        if (!entry) this.request(name).catch((error) => console.error(error));
      }
    }
    return ready;
  }
  texture(name) {
    const entry = this.entries.get(name);
    if (!entry?.image) return null;
    if (!entry.texture) {
      const gl = this.gl,
        texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.image);
      entry.texture = texture;
      this.textures[name] = texture;
    }
    return entry.texture;
  }
  trim(now, force = false) {
    // TTL cleanup is throttled, but memory pressure is handled immediately:
    // quick pinches/hugs must not accumulate a one-second burst of textures.
    if (!force && this.entries.size <= this.limit && now - this.lastTrim < 1000) return;
    this.lastTrim = now;
    const candidates = [...this.entries.values()]
      .filter((e) => e.image && !this.protected.has(e.name))
      .sort((a, b) => a.touched - b.touched);
    for (const e of candidates) {
      if (force || this.entries.size > this.limit || now - e.touched > this.ttl) {
        if (e.texture) this.gl?.deleteTexture(e.texture);
        // Remove JS references to the decoded bitmap as well as the GL object.
        delete this.textures[e.name];
        delete this.images[e.name];
        this.entries.delete(e.name);
      }
    }
  }
  get stats() {
    const entries = [...this.entries.values()];
    const bytes = (e) =>
      (e.image.naturalWidth || e.image.width) * (e.image.naturalHeight || e.image.height) * 4;
    return {
      resident: entries.filter((e) => e.texture).map((e) => e.name),
      decoded: entries.filter((e) => e.image).map((e) => e.name),
      pending: entries.filter((e) => !e.image && !e.failed).map((e) => e.name),
      textureBytes: entries.filter((e) => e.texture).reduce((n, e) => n + bytes(e), 0),
      decodedBytes: entries.filter((e) => e.image).reduce((n, e) => n + bytes(e), 0),
      limit: this.limit,
      errors: [...this.errors],
    };
  }
}
