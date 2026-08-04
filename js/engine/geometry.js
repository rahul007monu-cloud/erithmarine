/**
 * geometry.js — CPU-side procedural geometry construction.
 *
 * Everything in the scene (hull, superstructure, containers, cranes, ocean grid)
 * is generated here at runtime, so the site ships with zero binary model assets.
 *
 * Convention: right-handed, Y up. Geometry is returned as
 *   { positions: Float32Array, normals, uvs, colors?, indices: Uint32Array }
 */

import { mat4, mat3, vec3, TAU } from './math.js';

/* --------------------------------------------------------------- utilities */

/** Recomputes smooth (area-weighted) vertex normals from triangle faces. */
export function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // Un-normalised cross product weights each face by twice its area.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 1e-8) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i + 1] = 1;
    }
  }
  return normals;
}

/**
 * Splits shared vertices so each triangle gets its own normal.
 * Used for hard-edged industrial shapes (containers, plating, machinery).
 */
export function faceted(geometry) {
  const { positions, indices, uvs, colors } = geometry;
  const triCount = indices.length / 3;

  const outPos = new Float32Array(triCount * 9);
  const outNrm = new Float32Array(triCount * 9);
  const outUV = new Float32Array(triCount * 6);
  const outCol = colors ? new Float32Array(triCount * 9) : null;
  const outIdx = new Uint32Array(triCount * 3);

  for (let t = 0; t < triCount; t++) {
    const src = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];

    for (let v = 0; v < 3; v++) {
      const s = src[v] * 3;
      const d = (t * 3 + v) * 3;
      outPos[d] = positions[s];
      outPos[d + 1] = positions[s + 1];
      outPos[d + 2] = positions[s + 2];

      if (uvs) {
        outUV[(t * 3 + v) * 2] = uvs[src[v] * 2];
        outUV[(t * 3 + v) * 2 + 1] = uvs[src[v] * 2 + 1];
      }
      if (outCol) {
        outCol[d] = colors[s];
        outCol[d + 1] = colors[s + 1];
        outCol[d + 2] = colors[s + 2];
      }
      outIdx[t * 3 + v] = t * 3 + v;
    }

    // Flat normal for the whole triangle.
    const a = t * 9;
    const e1x = outPos[a + 3] - outPos[a], e1y = outPos[a + 4] - outPos[a + 1], e1z = outPos[a + 5] - outPos[a + 2];
    const e2x = outPos[a + 6] - outPos[a], e2y = outPos[a + 7] - outPos[a + 1], e2z = outPos[a + 8] - outPos[a + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    for (let v = 0; v < 3; v++) {
      const d = a + v * 3;
      outNrm[d] = nx;
      outNrm[d + 1] = ny;
      outNrm[d + 2] = nz;
    }
  }

  return {
    positions: outPos,
    normals: outNrm,
    uvs: outUV,
    colors: outCol,
    indices: outIdx,
  };
}

const _nm = mat3.create();

/** Applies a 4x4 transform to a geometry in place, fixing up normals. */
export function transformGeometry(geometry, matrix) {
  const { positions, normals } = geometry;
  mat4.normalMatrix(_nm, matrix);

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    positions[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    positions[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    positions[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];

    if (normals) {
      const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
      let tx = _nm[0] * nx + _nm[3] * ny + _nm[6] * nz;
      let ty = _nm[1] * nx + _nm[4] * ny + _nm[7] * nz;
      let tz = _nm[2] * nx + _nm[5] * ny + _nm[8] * nz;
      const len = Math.hypot(tx, ty, tz) || 1;
      normals[i] = tx / len;
      normals[i + 1] = ty / len;
      normals[i + 2] = tz / len;
    }
  }
  return geometry;
}

/** Assigns a single flat color to every vertex of a geometry. */
export function paint(geometry, color) {
  const count = geometry.positions.length / 3;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
  }
  geometry.colors = colors;
  return geometry;
}

/**
 * Merges many geometries into one draw-call-friendly buffer set.
 * Each entry may carry its own transform and color:
 *   merge([{ geometry, matrix, color }, ...])
 */
export function merge(entries) {
  let vertexTotal = 0;
  let indexTotal = 0;
  let hasUV = false;

  for (const entry of entries) {
    const g = entry.geometry || entry;
    vertexTotal += g.positions.length / 3;
    indexTotal += g.indices.length;
    if (g.uvs) hasUV = true;
  }

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const colors = new Float32Array(vertexTotal * 3);
  const uvs = hasUV ? new Float32Array(vertexTotal * 2) : null;
  const indices = new Uint32Array(indexTotal);

  let vOffset = 0;
  let iOffset = 0;
  const scratch = mat3.create();

  for (const entry of entries) {
    const g = entry.geometry || entry;
    const matrix = entry.matrix || null;
    const color = entry.color || null;
    const vertexCount = g.positions.length / 3;

    if (matrix) mat4.normalMatrix(scratch, matrix);

    for (let i = 0; i < vertexCount; i++) {
      const s = i * 3;
      const d = (vOffset + i) * 3;

      let x = g.positions[s], y = g.positions[s + 1], z = g.positions[s + 2];
      let nx = g.normals ? g.normals[s] : 0;
      let ny = g.normals ? g.normals[s + 1] : 1;
      let nz = g.normals ? g.normals[s + 2] : 0;

      if (matrix) {
        const px = x, py = y, pz = z;
        x = matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12];
        y = matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13];
        z = matrix[2] * px + matrix[6] * py + matrix[10] * pz + matrix[14];

        const ax = nx, ay = ny, az = nz;
        nx = scratch[0] * ax + scratch[3] * ay + scratch[6] * az;
        ny = scratch[1] * ax + scratch[4] * ay + scratch[7] * az;
        nz = scratch[2] * ax + scratch[5] * ay + scratch[8] * az;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
      }

      positions[d] = x; positions[d + 1] = y; positions[d + 2] = z;
      normals[d] = nx; normals[d + 1] = ny; normals[d + 2] = nz;

      if (color) {
        colors[d] = color[0]; colors[d + 1] = color[1]; colors[d + 2] = color[2];
      } else if (g.colors) {
        colors[d] = g.colors[s]; colors[d + 1] = g.colors[s + 1]; colors[d + 2] = g.colors[s + 2];
      } else {
        colors[d] = colors[d + 1] = colors[d + 2] = 1;
      }

      if (uvs) {
        uvs[(vOffset + i) * 2] = g.uvs ? g.uvs[i * 2] : 0;
        uvs[(vOffset + i) * 2 + 1] = g.uvs ? g.uvs[i * 2 + 1] : 0;
      }
    }

    for (let i = 0; i < g.indices.length; i++) {
      indices[iOffset + i] = g.indices[i] + vOffset;
    }

    vOffset += vertexCount;
    iOffset += g.indices.length;
  }

  return { positions, normals, uvs, colors, indices };
}

/* ------------------------------------------------------------------ shapes */

/** Subdivided plane on the XZ ground plane, centred at the origin. */
export function createPlane(width, depth, segmentsX = 1, segmentsZ = 1) {
  const vertexCountX = segmentsX + 1;
  const vertexCountZ = segmentsZ + 1;
  const positions = new Float32Array(vertexCountX * vertexCountZ * 3);
  const normals = new Float32Array(vertexCountX * vertexCountZ * 3);
  const uvs = new Float32Array(vertexCountX * vertexCountZ * 2);
  const indices = new Uint32Array(segmentsX * segmentsZ * 6);

  let v = 0;
  let uv = 0;
  for (let z = 0; z < vertexCountZ; z++) {
    const tz = z / segmentsZ;
    for (let x = 0; x < vertexCountX; x++) {
      const tx = x / segmentsX;
      positions[v] = (tx - 0.5) * width;
      positions[v + 1] = 0;
      positions[v + 2] = (tz - 0.5) * depth;
      normals[v + 1] = 1;
      uvs[uv] = tx;
      uvs[uv + 1] = tz;
      v += 3;
      uv += 2;
    }
  }

  let i = 0;
  for (let z = 0; z < segmentsZ; z++) {
    for (let x = 0; x < segmentsX; x++) {
      const a = z * vertexCountX + x;
      const b = a + 1;
      const c = a + vertexCountX;
      const d = c + 1;
      indices[i++] = a; indices[i++] = c; indices[i++] = b;
      indices[i++] = b; indices[i++] = c; indices[i++] = d;
    }
  }

  return { positions, normals, uvs, indices };
}

/**
 * Radially subdivided disc used for the ocean surface.
 * Density falls off with distance, so the horizon stays cheap while the
 * water near the camera keeps enough vertices for real wave displacement.
 */
export function createRadialPlane(radius, radialSegments, ringSegments, power = 3) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Centre vertex.
  positions.push(0, 0, 0);
  normals.push(0, 1, 0);
  uvs.push(0, 0);

  for (let ring = 1; ring <= ringSegments; ring++) {
    const t = ring / ringSegments;
    const r = Math.pow(t, power) * radius;
    for (let s = 0; s < radialSegments; s++) {
      const a = (s / radialSegments) * TAU;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      normals.push(0, 1, 0);
      uvs.push(t, s / radialSegments);
    }
  }

  // Inner fan.
  for (let s = 0; s < radialSegments; s++) {
    const next = (s + 1) % radialSegments;
    indices.push(0, 1 + s, 1 + next);
  }

  // Quad rings.
  for (let ring = 1; ring < ringSegments; ring++) {
    const base = 1 + (ring - 1) * radialSegments;
    const nextBase = 1 + ring * radialSegments;
    for (let s = 0; s < radialSegments; s++) {
      const next = (s + 1) % radialSegments;
      indices.push(base + s, nextBase + s, base + next);
      indices.push(base + next, nextBase + s, nextBase + next);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Axis-aligned box centred at the origin. Hard normals, per-face UVs. */
export function createBox(width = 1, height = 1, depth = 1) {
  const hw = width / 2, hh = height / 2, hd = depth / 2;

  // [ normal, four corners ] per face, wound counter-clockwise when viewed
  // from outside the box.
  const faces = [
    { n: [0, 0, 1], c: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
    { n: [0, 0, -1], c: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    { n: [1, 0, 0], c: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
    { n: [-1, 0, 0], c: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
    { n: [0, 1, 0], c: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]] },
    { n: [0, -1, 0], c: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]] },
  ];

  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint32Array(36);

  faces.forEach((face, f) => {
    const uvCorners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      positions[vi * 3] = face.c[i][0];
      positions[vi * 3 + 1] = face.c[i][1];
      positions[vi * 3 + 2] = face.c[i][2];
      normals[vi * 3] = face.n[0];
      normals[vi * 3 + 1] = face.n[1];
      normals[vi * 3 + 2] = face.n[2];
      uvs[vi * 2] = uvCorners[i][0];
      uvs[vi * 2 + 1] = uvCorners[i][1];
    }
    const base = f * 4;
    const o = f * 6;
    indices[o] = base; indices[o + 1] = base + 1; indices[o + 2] = base + 2;
    indices[o + 3] = base; indices[o + 4] = base + 2; indices[o + 5] = base + 3;
  });

  return { positions, normals, uvs, indices };
}

/** Cylinder (or cone / tube) along +Y, centred at the origin. */
export function createCylinder(
  radiusTop = 1,
  radiusBottom = 1,
  height = 1,
  radialSegments = 16,
  capped = true,
) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const hh = height / 2;

  const slope = (radiusBottom - radiusTop) / height;

  // Side wall.
  for (let s = 0; s <= radialSegments; s++) {
    const t = s / radialSegments;
    const a = t * TAU;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    const nx = cos, nz = sin;
    const len = Math.hypot(nx, slope, nz) || 1;

    positions.push(cos * radiusTop, hh, sin * radiusTop);
    normals.push(nx / len, slope / len, nz / len);
    uvs.push(t, 1);

    positions.push(cos * radiusBottom, -hh, sin * radiusBottom);
    normals.push(nx / len, slope / len, nz / len);
    uvs.push(t, 0);
  }

  for (let s = 0; s < radialSegments; s++) {
    const a = s * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c);
    indices.push(c, b, d);
  }

  if (capped) {
    // Top cap.
    if (radiusTop > 1e-6) {
      const center = positions.length / 3;
      positions.push(0, hh, 0);
      normals.push(0, 1, 0);
      uvs.push(0.5, 0.5);
      const start = positions.length / 3;
      for (let s = 0; s <= radialSegments; s++) {
        const a = (s / radialSegments) * TAU;
        positions.push(Math.cos(a) * radiusTop, hh, Math.sin(a) * radiusTop);
        normals.push(0, 1, 0);
        uvs.push(Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5);
      }
      for (let s = 0; s < radialSegments; s++) {
        indices.push(center, start + s, start + s + 1);
      }
    }

    // Bottom cap.
    if (radiusBottom > 1e-6) {
      const center = positions.length / 3;
      positions.push(0, -hh, 0);
      normals.push(0, -1, 0);
      uvs.push(0.5, 0.5);
      const start = positions.length / 3;
      for (let s = 0; s <= radialSegments; s++) {
        const a = (s / radialSegments) * TAU;
        positions.push(Math.cos(a) * radiusBottom, -hh, Math.sin(a) * radiusBottom);
        normals.push(0, -1, 0);
        uvs.push(Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5);
      }
      for (let s = 0; s < radialSegments; s++) {
        indices.push(center, start + s + 1, start + s);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** UV sphere centred at the origin. */
export function createSphere(radius = 1, widthSegments = 24, heightSegments = 16) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSegments; x++) {
      const u = x / widthSegments;
      const theta = u * TAU;
      const nx = -Math.cos(theta) * Math.sin(phi);
      const ny = Math.cos(phi);
      const nz = Math.sin(theta) * Math.sin(phi);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, 1 - v);
    }
  }

  const stride = widthSegments + 1;
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < widthSegments; x++) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (y !== 0) indices.push(a, c, b);
      if (y !== heightSegments - 1) indices.push(b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/**
 * Lofts a surface through a sequence of cross-sections.
 *
 * Each section is `{ z, points: [[x, y], ...] }` and every section must have
 * the same number of points. This is how the ship hull is built: a series of
 * station outlines from stern to bow, blended into a continuous skin.
 *
 * @param {Array} sections ordered along +Z
 * @param {Object} opts { closeSection, capStart, capEnd }
 */
export function loft(sections, opts = {}) {
  const { closeSection = false, capStart = false, capEnd = false } = opts;

  const sectionCount = sections.length;
  const pointCount = sections[0].points.length;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let s = 0; s < sectionCount; s++) {
    const section = sections[s];
    if (section.points.length !== pointCount) {
      throw new Error('loft(): all sections must have the same point count');
    }
    for (let p = 0; p < pointCount; p++) {
      positions.push(section.points[p][0], section.points[p][1], section.z);
      uvs.push(p / (pointCount - 1), s / (sectionCount - 1));
    }
  }

  const lastP = closeSection ? pointCount : pointCount - 1;
  for (let s = 0; s < sectionCount - 1; s++) {
    for (let p = 0; p < lastP; p++) {
      const pNext = (p + 1) % pointCount;
      const a = s * pointCount + p;
      const b = s * pointCount + pNext;
      const c = (s + 1) * pointCount + p;
      const d = (s + 1) * pointCount + pNext;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Flat caps, triangulated as a fan from the section centroid.
  const addCap = (sectionIndex, flip) => {
    const section = sections[sectionIndex];
    let cx = 0, cy = 0;
    for (const pt of section.points) {
      cx += pt[0];
      cy += pt[1];
    }
    cx /= pointCount;
    cy /= pointCount;

    const center = positions.length / 3;
    positions.push(cx, cy, section.z);
    uvs.push(0.5, 0.5);

    const start = positions.length / 3;
    for (let p = 0; p < pointCount; p++) {
      positions.push(section.points[p][0], section.points[p][1], section.z);
      uvs.push(p / (pointCount - 1), flip ? 0 : 1);
    }

    for (let p = 0; p < pointCount - (closeSection ? 0 : 1); p++) {
      const pNext = (p + 1) % pointCount;
      if (flip) indices.push(center, start + pNext, start + p);
      else indices.push(center, start + p, start + pNext);
    }
  };

  if (capStart) addCap(0, true);
  if (capEnd) addCap(sectionCount - 1, false);

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return {
    positions: pos,
    normals: computeNormals(pos, idx),
    uvs: new Float32Array(uvs),
    indices: idx,
  };
}

/**
 * Extrudes a closed 2D polygon (XY) along Z, with flat caps.
 * Handy for deck plating, bulkheads, hatch covers and signage panels.
 */
export function extrude(polygon, depth) {
  const n = polygon.length;
  const hd = depth / 2;
  const positions = [];
  const indices = [];

  // Side walls (two vertices per polygon point per side, faceted later).
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const base = positions.length / 3;
    positions.push(a[0], a[1], -hd);
    positions.push(b[0], b[1], -hd);
    positions.push(b[0], b[1], hd);
    positions.push(a[0], a[1], hd);
    indices.push(base, base + 1, base + 2);
    indices.push(base, base + 2, base + 3);
  }

  // Caps via fan triangulation — valid for convex outlines, which is all we use.
  for (const [z, flip] of [[hd, false], [-hd, true]]) {
    const base = positions.length / 3;
    for (let i = 0; i < n; i++) positions.push(polygon[i][0], polygon[i][1], z);
    for (let i = 1; i < n - 1; i++) {
      if (flip) indices.push(base, base + i + 1, base + i);
      else indices.push(base, base + i, base + i + 1);
    }
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return {
    positions: pos,
    normals: computeNormals(pos, idx),
    uvs: new Float32Array((pos.length / 3) * 2),
    indices: idx,
  };
}

/**
 * Builds a rectangular frame (like a window mullion or railing panel) as four
 * boxes, returned pre-merged.
 */
export function createFrame(width, height, thickness, depth) {
  const t = thickness;
  const entries = [];

  const push = (w, h, x, y) => {
    entries.push({
      geometry: createBox(w, h, depth),
      matrix: mat4.fromTranslation(mat4.create(), vec3.create(x, y, 0)),
    });
  };

  push(width, t, 0, height / 2 - t / 2);
  push(width, t, 0, -height / 2 + t / 2);
  push(t, height - t * 2, -width / 2 + t / 2, 0);
  push(t, height - t * 2, width / 2 - t / 2, 0);

  return merge(entries);
}

/**
 * Horizontal railing running along the X axis: two rails plus stanchions.
 * Rails are cylinders rotated from +Y onto the X axis.
 */
export function createRailing(length, height = 1.1, posts = 12, radius = 0.045) {
  const entries = [];
  const lyingDown = vec3.create(0, 0, Math.PI / 2);
  const unit = vec3.create(1, 1, 1);

  for (const y of [height, height * 0.55]) {
    entries.push({
      geometry: createCylinder(radius, radius, length, 6, false),
      matrix: mat4.compose(mat4.create(), vec3.create(0, y, 0), lyingDown, unit),
    });
  }

  for (let i = 0; i <= posts; i++) {
    const x = (i / posts - 0.5) * length;
    entries.push({
      geometry: createCylinder(radius, radius, height, 6, false),
      matrix: mat4.fromTranslation(mat4.create(), vec3.create(x, height / 2, 0)),
    });
  }

  return merge(entries);
}
