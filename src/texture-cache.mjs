// Bound both decoded images and GPU textures. The browser's compressed-file
// cache may retain PNG bytes; no dormant portrait needs a resident GL texture.
export class TextureCache {
  constructor(
    gl,
    {
      limit = 8,
      ttl = 20000,
      loadImage = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(Error(`角色素材加载失败: ${src}`));
          image.src = src;
        }),
    } = {},
  ) {
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
