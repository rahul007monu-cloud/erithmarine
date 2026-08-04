/**
 * gl.js — Thin WebGL2 abstraction: context, programs with introspected
 * uniforms, VAO-backed meshes (with instancing), textures and framebuffers.
 *
 * Deliberately small: only what the scene actually needs, no scene graph.
 */

/* ---------------------------------------------------------------- context */

/**
 * Creates a WebGL2 context, or returns null when the device can't provide one.
 * Callers must handle null and fall back to the non-3D experience.
 */
export function createContext(canvas, opts = {}) {
  const attribs = {
    alpha: false,
    depth: true,
    stencil: false,
    antialias: opts.antialias !== false,
    premultipliedAlpha: false,
    // Off in production (faster); dev previews turn it on so a single rendered
    // frame survives compositing and can be screenshotted.
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    powerPreference: opts.powerPreference || 'high-performance',
    failIfMajorPerformanceCaveat: false,
    desynchronized: true,
  };

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', attribs);
  } catch (err) {
    return null;
  }
  if (!gl) return null;

  // Rendering to half-float targets (needed for the HDR scene buffer and bloom)
  // is an extension even in WebGL2. Probe it once and record the result so
  // createFramebuffer can fall back to 8-bit rather than failing outright.
  const colorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
  const textureFloatLinear = !!gl.getExtension('OES_texture_float_linear');

  gl.capabilities = {
    colorBufferFloat,
    // Half-float textures are linearly filterable in WebGL2 core; the extension
    // only matters for full 32-bit floats.
    textureFloatLinear,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES),
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clearColor(0, 0, 0, 1);

  return gl;
}

/* ---------------------------------------------------------------- shaders */

function formatShaderError(gl, shader, source, label) {
  const log = gl.getShaderInfoLog(shader) || '(no log)';
  const lines = source.split('\n');

  // Pull "ERROR: 0:<line>:" out of the driver log so we can show real context.
  const decorated = log.replace(/ERROR:\s*\d+:(\d+)/g, (match, lineNo) => {
    const idx = parseInt(lineNo, 10) - 1;
    const src = lines[idx] !== undefined ? `  →  ${lines[idx].trim()}` : '';
    return `${match}${src}`;
  });

  return `[${label}] shader compile failed:\n${decorated}`;
}

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = formatShaderError(gl, shader, source, label);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

/** Uniform setter dispatch table, keyed by the GL type enum. */
function uniformSetter(gl, type, location, isArray) {
  switch (type) {
    case gl.FLOAT:
      return isArray
        ? (v) => gl.uniform1fv(location, v)
        : (v) => gl.uniform1f(location, v);
    case gl.FLOAT_VEC2:
      return (v) => gl.uniform2fv(location, v);
    case gl.FLOAT_VEC3:
      return (v) => gl.uniform3fv(location, v);
    case gl.FLOAT_VEC4:
      return (v) => gl.uniform4fv(location, v);
    case gl.INT:
    case gl.BOOL:
      return isArray
        ? (v) => gl.uniform1iv(location, v)
        : (v) => gl.uniform1i(location, v);
    case gl.INT_VEC2:
      return (v) => gl.uniform2iv(location, v);
    case gl.INT_VEC3:
      return (v) => gl.uniform3iv(location, v);
    case gl.FLOAT_MAT3:
      return (v) => gl.uniformMatrix3fv(location, false, v);
    case gl.FLOAT_MAT4:
      return (v) => gl.uniformMatrix4fv(location, false, v);
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
    case gl.SAMPLER_2D_SHADOW:
      return (v) => gl.uniform1i(location, v);
    default:
      return null;
  }
}

/**
 * A compiled shader program with all active uniforms discovered up front.
 * `set(name, value)` silently ignores unknown names, so shaders can drop
 * uniforms without breaking callers.
 */
export class Program {
  constructor(gl, vertexSource, fragmentSource, label = 'program') {
    this.gl = gl;
    this.label = label;

    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label}:vert`);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}:frag`);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    // Shaders can be released as soon as the program is linked.
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`[${label}] program link failed:\n${log}`);
    }

    this.program = program;
    this.setters = new Map();
    this.attribs = new Map();

    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;

      // Array uniforms report as "name[0]" — normalise to "name".
      const isArray = info.name.endsWith('[0]');
      const name = isArray ? info.name.slice(0, -3) : info.name;
      const location = gl.getUniformLocation(program, info.name);
      if (!location && location !== 0) continue;

      const setter = uniformSetter(gl, info.type, location, isArray || info.size > 1);
      if (setter) this.setters.set(name, setter);
    }

    const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < attribCount; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (!info) continue;
      this.attribs.set(info.name, gl.getAttribLocation(program, info.name));
    }
  }

  use() {
    this.gl.useProgram(this.program);
    return this;
  }

  /** Sets a single uniform. Unknown / optimised-out names are a no-op. */
  set(name, value) {
    const setter = this.setters.get(name);
    if (setter) setter(value);
    return this;
  }

  /** Bulk uniform assignment from a plain object. */
  setAll(uniforms) {
    for (const key in uniforms) {
      const setter = this.setters.get(key);
      if (setter) setter(uniforms[key]);
    }
    return this;
  }

  /** Binds a texture to a unit and points the sampler uniform at it. */
  setTexture(name, texture, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(texture.target || gl.TEXTURE_2D, texture.handle || texture);
    this.set(name, unit);
    return this;
  }

  dispose() {
    this.gl.deleteProgram(this.program);
    this.setters.clear();
  }
}

/* ------------------------------------------------------------------ meshes */

const DEFAULT_ATTRIB_LOCATIONS = {
  aPosition: 0,
  aNormal: 1,
  aUV: 2,
  aColor: 3,
  // Instance attributes start at 4 so they never collide with vertex data.
  aInstanceMatrix: 4, // consumes 4, 5, 6, 7
  aInstanceColor: 8,
  aInstanceParams: 9,
};

/**
 * A VAO-backed indexed mesh.
 *
 * `data` is an object of attribute arrays:
 *   { positions: Float32Array, normals, uvs, colors, indices }
 * Optionally instanced via `addInstances()`.
 */
export class Mesh {
  constructor(gl, data, options = {}) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.buffers = [];
    this.instanceCount = 0;
    this.mode = options.mode !== undefined ? options.mode : gl.TRIANGLES;

    gl.bindVertexArray(this.vao);

    this._attrib(DEFAULT_ATTRIB_LOCATIONS.aPosition, data.positions, 3);
    if (data.normals) this._attrib(DEFAULT_ATTRIB_LOCATIONS.aNormal, data.normals, 3);
    if (data.uvs) this._attrib(DEFAULT_ATTRIB_LOCATIONS.aUV, data.uvs, 2);
    if (data.colors) this._attrib(DEFAULT_ATTRIB_LOCATIONS.aColor, data.colors, 3);

    if (data.indices) {
      const use32 =
        data.indices instanceof Uint32Array || data.positions.length / 3 > 65535;
      const indices = use32
        ? data.indices instanceof Uint32Array
          ? data.indices
          : new Uint32Array(data.indices)
        : data.indices instanceof Uint16Array
          ? data.indices
          : new Uint16Array(data.indices);

      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.buffers.push(ibo);

      this.indexType = use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.count = indices.length;
      this.indexed = true;
    } else {
      this.count = data.positions.length / 3;
      this.indexed = false;
    }

    gl.bindVertexArray(null);
  }

  _attrib(location, array, size, divisor = 0) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      array instanceof Float32Array ? array : new Float32Array(array),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    if (divisor) gl.vertexAttribDivisor(location, divisor);
    this.buffers.push(buffer);
    return buffer;
  }

  /**
   * Uploads per-instance mat4 transforms (and optional per-instance colors).
   * `matrices` is a flat Float32Array of 16 floats per instance.
   */
  addInstances(matrices, colors = null, params = null) {
    const gl = this.gl;
    const count = matrices.length / 16;
    gl.bindVertexArray(this.vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.STATIC_DRAW);

    // A mat4 attribute occupies four consecutive vec4 slots.
    const base = DEFAULT_ATTRIB_LOCATIONS.aInstanceMatrix;
    for (let i = 0; i < 4; i++) {
      const loc = base + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.buffers.push(buffer);

    if (colors) {
      this._attrib(DEFAULT_ATTRIB_LOCATIONS.aInstanceColor, colors, 3, 1);
    }
    if (params) {
      this._attrib(DEFAULT_ATTRIB_LOCATIONS.aInstanceParams, params, 4, 1);
    }

    gl.bindVertexArray(null);
    this.instanceCount = count;
    return this;
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    if (this.instanceCount > 0) {
      if (this.indexed) {
        gl.drawElementsInstanced(
          this.mode, this.count, this.indexType, 0, this.instanceCount,
        );
      } else {
        gl.drawArraysInstanced(this.mode, 0, this.count, this.instanceCount);
      }
    } else if (this.indexed) {
      gl.drawElements(this.mode, this.count, this.indexType, 0);
    } else {
      gl.drawArrays(this.mode, 0, this.count);
    }
    return this;
  }

  dispose() {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    gl.deleteVertexArray(this.vao);
    this.buffers.length = 0;
  }
}

export const ATTRIB_LOCATIONS = DEFAULT_ATTRIB_LOCATIONS;

/* ---------------------------------------------------------------- textures */

/** Creates a texture from a typed array, canvas, or image. */
export function createTexture(gl, options = {}) {
  const {
    width = 1,
    height = 1,
    data = null,
    internalFormat = gl.RGBA8,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    wrap = gl.CLAMP_TO_EDGE,
    filter = gl.LINEAR,
    mipmap = false,
    source = null,
  } = options;

  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);

  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, source);
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data,
    );
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmap ? gl.LINEAR_MIPMAP_LINEAR : filter,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { handle, target: gl.TEXTURE_2D, width, height };
}

/**
 * Generates a tiling value-noise texture on the CPU.
 * Used for water detail, surface grunge and cloud shaping without any assets.
 */
export function createNoiseTexture(gl, size = 256, seed = 1) {
  const values = new Float32Array(size * size);

  // Simple hash lattice, then a few octaves of smoothed interpolation.
  const hash = (x, y) => {
    const n = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
    const m = (n ^ (n >>> 13)) * 1274126177;
    return ((m ^ (m >>> 16)) >>> 0) / 4294967296;
  };

  const smoothNoise = (x, y, period) => {
    const xi = Math.floor(x / period);
    const yi = Math.floor(y / period);
    const xf = (x / period) - xi;
    const yf = (y / period) - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const wrap = size / period;
    const w = (n) => ((n % wrap) + wrap) % wrap;

    const a = hash(w(xi), w(yi));
    const b = hash(w(xi + 1), w(yi));
    const c = hash(w(xi), w(yi + 1));
    const d = hash(w(xi + 1), w(yi + 1));

    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };

  let amplitudeSum = 0;
  for (let period = size / 4, amp = 1; period >= 2; period /= 2, amp *= 0.55) {
    amplitudeSum += amp;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        values[y * size + x] += smoothNoise(x, y, period) * amp;
      }
    }
  }

  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < values.length; i++) {
    const n = Math.min(255, Math.max(0, (values[i] / amplitudeSum) * 255)) | 0;
    pixels[i * 4] = n;
    pixels[i * 4 + 1] = n;
    pixels[i * 4 + 2] = n;
    pixels[i * 4 + 3] = 255;
  }

  return createTexture(gl, {
    width: size,
    height: size,
    data: pixels,
    wrap: gl.REPEAT,
    mipmap: true,
  });
}

/* ------------------------------------------------------------ framebuffers */

/** Off-screen render target with a color texture and optional depth. */
export function createFramebuffer(gl, width, height, options = {}) {
  const { depth = true, filter = gl.LINEAR } = options;

  // Honour the float request only when the driver can actually render to it.
  const caps = gl.capabilities || {};
  const float = !!options.float && caps.colorBufferFloat !== false;

  const color = createTexture(gl, {
    width,
    height,
    internalFormat: float ? gl.RGBA16F : gl.RGBA8,
    type: float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    filter,
  });

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color.handle, 0,
  );

  let depthBuffer = null;
  if (depth) {
    depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer,
    );
  }

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
  }

  return {
    fbo,
    color,
    depthBuffer,
    width,
    height,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, width, height);
    },
    dispose() {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(color.handle);
      if (depthBuffer) gl.deleteRenderbuffer(depthBuffer);
    },
  };
}

/**
 * Depth-only render target, for shadow maps.
 *
 * Has no colour attachment: the fragment shader writes nothing and only depth
 * is retained, which is both faster and exactly what a shadow lookup needs.
 * The depth texture is sampled as a normal sampler2D (comparison mode stays
 * off), so the raw depth arrives in the red channel.
 */
export function createDepthTarget(gl, size) {
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0,
    gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null,
  );
  // Linear filtering on a depth texture is not universally supported, and the
  // shadow lookup does its own multi-tap filtering, so nearest is correct here.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // Clamping to the edge would smear the border depth across the scene; clamp
  // to a border-like behaviour by keeping lookups inside the map in the shader.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, handle, 0,
  );

  // With no colour attachment the draw buffer list must say so explicitly.
  // Left at its default of COLOR_ATTACHMENT0, drivers discard the draw calls
  // and the depth buffer comes back empty. This state is stored per-framebuffer,
  // so setting it once here is enough.
  gl.drawBuffers([gl.NONE]);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(handle);
    throw new Error(`depth target incomplete: 0x${status.toString(16)}`);
  }

  const texture = { handle, target: gl.TEXTURE_2D, width: size, height: size };

  return {
    fbo,
    texture,
    size,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, size, size);
    },
    dispose() {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(handle);
    },
  };
}

/** Full-screen triangle for post-processing — no vertex buffer required. */
export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  // Oversized triangle covering the clip-space square.
  vec2 pos = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

/** Draws the full-screen triangle. Requires a bound program. */
export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
