/**
 * math.js — Minimal, allocation-conscious 3D math library.
 * Zero dependencies. Column-major 4x4 matrices (same convention as WebGL/GLSL).
 */

/* ------------------------------------------------------------------ scalars */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const saturate = (v) => clamp(v, 0, 1);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Smooth Hermite interpolation between two edges. */
export function smoothstep(edge0, edge1, x) {
  const t = saturate(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/** Maps `v` from one range to another, clamped. */
export function remap(v, inMin, inMax, outMin, outMax) {
  return lerp(outMin, outMax, saturate(invLerp(inMin, inMax, v)));
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(current, target, smoothing, dt) {
  return lerp(current, target, 1 - Math.pow(smoothing, dt));
}

/* ------------------------------------------------------------------- easing */

export const easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/* --------------------------------------------------------------------- vec3 */

export const vec3 = {
  create: (x = 0, y = 0, z = 0) => new Float32Array([x, y, z]),

  set(out, x, y, z) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },

  copy(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
  },

  add(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },

  sub(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },

  scale(out, a, s) {
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
  },

  /** out = a + b * s  (fused multiply-add, avoids a temp vector) */
  scaleAndAdd(out, a, b, s) {
    out[0] = a[0] + b[0] * s;
    out[1] = a[1] + b[1] * s;
    out[2] = a[2] + b[2] * s;
    return out;
  },

  mul(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
  },

  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],

  cross(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },

  length: (a) => Math.hypot(a[0], a[1], a[2]),

  sqrLength: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],

  distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),

  normalize(out, a) {
    const len = Math.hypot(a[0], a[1], a[2]);
    if (len > 1e-8) {
      const inv = 1 / len;
      out[0] = a[0] * inv;
      out[1] = a[1] * inv;
      out[2] = a[2] * inv;
    } else {
      out[0] = out[1] = out[2] = 0;
    }
    return out;
  },

  lerp(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  },

  /** Transforms a point by a 4x4 matrix (applies translation, divides by w). */
  transformMat4(out, a, m) {
    const x = a[0], y = a[1], z = a[2];
    let w = m[3] * x + m[7] * y + m[11] * z + m[15];
    w = w || 1;
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  },

  /** Transforms a direction by a 4x4 matrix (ignores translation). */
  transformDirection(out, a, m) {
    const x = a[0], y = a[1], z = a[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z;
    out[1] = m[1] * x + m[5] * y + m[9] * z;
    out[2] = m[2] * x + m[6] * y + m[10] * z;
    return out;
  },
};

/* --------------------------------------------------------------------- mat4 */

export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  },

  copy(out, a) {
    out.set(a);
    return out;
  },

  /** out = a * b */
  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },

  fromTranslation(out, v) {
    mat4.identity(out);
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    return out;
  },

  fromScaling(out, v) {
    out.fill(0);
    out[0] = v[0];
    out[5] = v[1];
    out[10] = v[2];
    out[15] = 1;
    return out;
  },

  fromXRotation(out, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    mat4.identity(out);
    out[5] = c;
    out[6] = s;
    out[9] = -s;
    out[10] = c;
    return out;
  },

  fromYRotation(out, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    mat4.identity(out);
    out[0] = c;
    out[2] = -s;
    out[8] = s;
    out[10] = c;
    return out;
  },

  fromZRotation(out, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    mat4.identity(out);
    out[0] = c;
    out[1] = s;
    out[4] = -s;
    out[5] = c;
    return out;
  },

  /**
   * Composes translation * rotationY * rotationX * rotationZ * scale.
   * Euler order chosen so yaw reads naturally for ship/prop placement.
   */
  compose(out, pos, rot, scl) {
    const cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
    const cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
    const cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);

    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz;
    const m01 = cx * sz;
    const m02 = -sy * cz + cy * sx * sz;

    const m10 = -cy * sz + sy * sx * cz;
    const m11 = cx * cz;
    const m12 = sy * sz + cy * sx * cz;

    const m20 = sy * cx;
    const m21 = -sx;
    const m22 = cy * cx;

    const sX = scl[0], sY = scl[1], sZ = scl[2];

    out[0] = m00 * sX;  out[1] = m01 * sX;  out[2] = m02 * sX;  out[3] = 0;
    out[4] = m10 * sY;  out[5] = m11 * sY;  out[6] = m12 * sY;  out[7] = 0;
    out[8] = m20 * sZ;  out[9] = m21 * sZ;  out[10] = m22 * sZ; out[11] = 0;
    out[12] = pos[0];   out[13] = pos[1];   out[14] = pos[2];   out[15] = 1;
    return out;
  },

  perspective(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },

  ortho(out, left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },

  /** Right-handed view matrix looking from `eye` toward `center`. */
  lookAt(out, eye, center, up) {
    const ex = eye[0], ey = eye[1], ez = eye[2];
    let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];

    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-8) {
      return mat4.identity(out);
    }
    len = 1 / len;
    zx *= len; zy *= len; zz *= len;

    // x = normalize(cross(up, z))
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-8) {
      // `up` is parallel to the view direction — nudge it to stay defined.
      xx = 1; xy = 0; xz = 0;
    } else {
      len = 1 / len;
      xx *= len; xy *= len; xz *= len;
    }

    // y = cross(z, x)
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx;  out[1] = yx;  out[2] = zx;  out[3] = 0;
    out[4] = xy;  out[5] = yy;  out[6] = zy;  out[7] = 0;
    out[8] = xz;  out[9] = yz;  out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },

  transpose(out, a) {
    if (out === a) {
      let t;
      t = a[1];  out[1] = a[4];  out[4] = t;
      t = a[2];  out[2] = a[8];  out[8] = t;
      t = a[3];  out[3] = a[12]; out[12] = t;
      t = a[6];  out[6] = a[9];  out[9] = t;
      t = a[7];  out[7] = a[13]; out[13] = t;
      t = a[11]; out[11] = a[14]; out[14] = t;
      return out;
    }
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) out[i * 4 + j] = a[j * 4 + i];
    }
    return out;
  },

  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },

  /**
   * Upper-left 3x3 inverse-transpose, written into a mat3 (9 floats).
   * Used to transform normals correctly under non-uniform scale.
   */
  normalMatrix(out3, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2];
    const a10 = a[4], a11 = a[5], a12 = a[6];
    const a20 = a[8], a21 = a[9], a22 = a[10];

    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;

    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) {
      out3.fill(0);
      out3[0] = out3[4] = out3[8] = 1;
      return out3;
    }
    det = 1 / det;

    // inverse(M)^T
    out3[0] = b01 * det;
    out3[1] = b11 * det;
    out3[2] = b21 * det;
    out3[3] = (-a22 * a01 + a02 * a21) * det;
    out3[4] = (a22 * a00 - a02 * a20) * det;
    out3[5] = (-a21 * a00 + a01 * a20) * det;
    out3[6] = (a12 * a01 - a02 * a11) * det;
    out3[7] = (-a12 * a00 + a02 * a10) * det;
    out3[8] = (a11 * a00 - a01 * a10) * det;
    return out3;
  },
};

export const mat3 = {
  create() {
    const m = new Float32Array(9);
    m[0] = m[4] = m[8] = 1;
    return m;
  },
};

/* ------------------------------------------------------------------- curves */

/**
 * Catmull-Rom spline through an array of vec3-like points.
 * Produces a smooth path that actually passes through every control point,
 * which is what we want for an authored camera journey.
 */
export function catmullRom(out, points, t) {
  const n = points.length;
  if (n === 0) return vec3.set(out, 0, 0, 0);
  if (n === 1) return vec3.copy(out, points[0]);

  const scaled = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(Math.floor(scaled), n - 2);
  const f = scaled - i;

  const p0 = points[Math.max(i - 1, 0)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(i + 2, n - 1)];

  const f2 = f * f;
  const f3 = f2 * f;

  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
  }
  return out;
}

/* -------------------------------------------------------------------- noise */

/** Deterministic hash-based pseudo-random in [0,1) — stable across reloads. */
export function hash01(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

/** Seeded PRNG (mulberry32) for repeatable scene layout. */
export function makeRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
