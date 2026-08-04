/**
 * ship.js — Procedural ultra-large container vessel.
 *
 * Built from naval-architecture proportions rather than eyeballed boxes: the
 * hull is lofted through station sections with a real bilge radius, deck sheer,
 * bulbous bow and transom stern. Everything is generated in metres.
 *
 * Coordinate frame (ship local space):
 *   +Z  forward (bow)
 *   +Y  up, with y = 0 at the design waterline
 *   +X  starboard
 */

import {
  createBox,
  createCylinder,
  createSphere,
  createRailing,
  loft,
  merge,
  faceted,
  computeNormals,
} from '../engine/geometry.js';
import { Mesh } from '../engine/gl.js';
import { mat4, vec3, clamp, lerp, smoothstep, makeRandom } from '../engine/math.js';
import { sampleOcean } from './ocean.js';

/* -------------------------------------------------------------- dimensions */

export const SHIP = {
  loa: 300,          // length overall
  beam: 45,          // moulded breadth
  depth: 24,         // keel to main deck
  draft: 13,         // design draft
  get keelY() { return -this.draft; },
  get deckY() { return this.depth - this.draft; },   // +11 m
  get sternZ() { return -this.loa / 2; },
  get bowZ() { return this.loa / 2; },
  // Accommodation block sits aft, as on a modern ULCV.
  houseZ: -96,
  houseLength: 27,
  houseWidth: 32,
  deckHeight: 3.2,
  houseDecks: 8,
  funnelZ: -122,
};

/* ------------------------------------------------------------------ palette */

export const PALETTE = {
  hullAbove: [0.026, 0.050, 0.100],   // deep navy
  hullBelow: [0.30, 0.075, 0.052],    // oxide-red antifouling
  boottop: [0.06, 0.06, 0.07],        // black boot-topping band
  deck: [0.115, 0.125, 0.118],        // dark green-grey deck paint
  hatch: [0.18, 0.19, 0.185],
  house: [0.80, 0.805, 0.79],         // off-white accommodation
  houseTrim: [0.10, 0.13, 0.20],
  funnel: [0.055, 0.085, 0.14],
  funnelBand: [0.78, 0.60, 0.22],     // brass/gold company band
  steel: [0.34, 0.36, 0.38],
  darkSteel: [0.14, 0.15, 0.16],
  glass: [0.05, 0.10, 0.14],
  glassLit: [1.0, 0.83, 0.52],
  crane: [0.72, 0.60, 0.16],
};

/* ------------------------------------------------------- hull form curves */

/** Piecewise-linear curve sampler over [t, value] control points. */
function sampleCurve(table, t) {
  const x = clamp(t, 0, 1);
  for (let i = 0; i < table.length - 1; i++) {
    const [t0, v0] = table[i];
    const [t1, v1] = table[i + 1];
    if (x <= t1) {
      const f = t1 - t0 < 1e-6 ? 0 : (x - t0) / (t1 - t0);
      return lerp(v0, v1, f);
    }
  }
  return table[table.length - 1][1];
}

/** Half-breadth as a fraction of maximum beam, stern (t=0) to bow (t=1). */
const HALF_BEAM_CURVE = [
  [0.00, 0.60], [0.05, 0.79], [0.13, 0.92], [0.23, 0.985],
  [0.34, 1.00], [0.60, 1.00], [0.70, 0.98], [0.79, 0.92],
  [0.86, 0.80], [0.92, 0.60], [0.96, 0.36], [0.99, 0.12], [1.00, 0.03],
];

/** Keel rise as a fraction of draft — the stern skeg and forefoot lift here. */
const KEEL_RISE_CURVE = [
  [0.00, 0.46], [0.06, 0.14], [0.16, 0.01], [0.78, 0.00],
  [0.87, 0.09], [0.94, 0.32], [0.98, 0.62], [1.00, 0.86],
];

/** Deck sheer above the moulded deck line, in metres. */
function deckSheer(t) {
  const fromMid = t - 0.42;
  return fromMid * fromMid * 7.2;
}

const SIDE_POINTS = 5;
const BILGE_POINTS = 6;
const BOTTOM_POINTS = 4;
const HALF_POINTS = SIDE_POINTS + BILGE_POINTS + BOTTOM_POINTS; // 15
const SECTION_POINTS = HALF_POINTS * 2 - 1;                     // 29

/**
 * Builds one station outline, ordered starboard deck edge -> keel -> port deck
 * edge. That direction is what makes loft() produce outward-facing normals.
 */
function hullSection(t) {
  const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
  const bottomY = SHIP.keelY + SHIP.draft * sampleCurve(KEEL_RISE_CURVE, t);
  const topY = SHIP.deckY + deckSheer(t);

  // Bilge radius shrinks with the section so fine ends stay V-shaped.
  const radius = Math.min(3.4, halfBeam * 0.42, (topY - bottomY) * 0.28);

  const half = [];

  // Vertical side, deck edge down to the top of the bilge turn.
  const bilgeTopY = bottomY + radius;
  for (let i = 0; i < SIDE_POINTS; i++) {
    const f = i / (SIDE_POINTS - 1);
    half.push([halfBeam, lerp(topY, bilgeTopY, f)]);
  }

  // Quarter-circle bilge, centred at (halfBeam - radius, bottomY + radius).
  const cx = halfBeam - radius;
  const cy = bottomY + radius;
  for (let i = 1; i <= BILGE_POINTS; i++) {
    const a = (i / BILGE_POINTS) * (Math.PI / 2);
    half.push([cx + Math.cos(a) * radius, cy - Math.sin(a) * radius]);
  }

  // Flat of bottom inboard to the centreline.
  for (let i = 1; i <= BOTTOM_POINTS; i++) {
    const f = i / BOTTOM_POINTS;
    half.push([lerp(cx, 0, f), bottomY]);
  }

  const points = [];
  for (let i = 0; i < half.length; i++) points.push([half[i][0], half[i][1]]);
  for (let i = half.length - 2; i >= 0; i--) points.push([-half[i][0], half[i][1]]);

  return points;
}

const STATIONS = 46;

/** Lofts the hull skin plus the transom cap. */
function buildHullSkin() {
  const sections = [];
  for (let i = 0; i < STATIONS; i++) {
    // Bias stations toward the ends, where curvature is highest.
    const even = i / (STATIONS - 1);
    const t = even + Math.sin(even * Math.PI * 2) * 0.012;
    sections.push({
      z: lerp(SHIP.sternZ, SHIP.bowZ, clamp(t, 0, 1)),
      points: hullSection(clamp(t, 0, 1)),
    });
  }
  return loft(sections, { capStart: true, capEnd: true });
}

/**
 * Main deck: a flat ribbon spanning port to starboard at every station,
 * following the deck edge and its sheer.
 */
function buildDeck() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
    const y = SHIP.deckY + deckSheer(t);
    const z = lerp(SHIP.sternZ, SHIP.bowZ, t);

    positions.push(-halfBeam, y, z, halfBeam, y, z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t, 1, t);
  }

  for (let i = 0; i < STATIONS - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1);
    indices.push(a + 1, a + 2, a + 3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/* ------------------------------------------------------------ superstructure */

const _m = () => mat4.create();
const box = (w, h, d, x, y, z, color) => ({
  geometry: createBox(w, h, d),
  matrix: mat4.fromTranslation(_m(), vec3.create(x, y, z)),
  color,
});

/**
 * Accommodation block: stacked decks with recessed window bands, bridge deck
 * with full-beam wings, and a radar mast.
 */
function buildAccommodation() {
  const entries = [];
  const baseY = SHIP.deckY + deckSheer(0.18);
  const { houseWidth: W, houseLength: L, houseZ: Z, deckHeight: H, houseDecks: N } = SHIP;

  // Main tower.
  const towerHeight = H * N;
  entries.push(box(W, towerHeight, L, 0, baseY + towerHeight / 2, Z, PALETTE.house));

  // Deck edge lips — a thin overhang per deck reads as real accommodation.
  for (let d = 1; d <= N; d++) {
    const y = baseY + d * H;
    entries.push(box(W + 1.1, 0.34, L + 1.1, 0, y, Z, PALETTE.houseTrim));
  }

  // Recessed window bands on the three exposed faces of each deck.
  for (let d = 0; d < N; d++) {
    const y = baseY + d * H + H * 0.62;
    // Forward and aft faces.
    entries.push(box(W * 0.86, 1.25, 0.5, 0, y, Z + L / 2 + 0.1, PALETTE.glass));
    entries.push(box(W * 0.86, 1.25, 0.5, 0, y, Z - L / 2 - 0.1, PALETTE.glass));
    // Port and starboard faces.
    entries.push(box(0.5, 1.25, L * 0.84, W / 2 + 0.1, y, Z, PALETTE.glass));
    entries.push(box(0.5, 1.25, L * 0.84, -W / 2 - 0.1, y, Z, PALETTE.glass));
  }

  // Bridge deck: shorter fore-and-aft, extended to the full beam as wings.
  const bridgeY = baseY + towerHeight;
  const bridgeHeight = 3.9;
  entries.push(box(SHIP.beam + 3, bridgeHeight, 13, 0, bridgeY + bridgeHeight / 2, Z + 3, PALETTE.house));
  // Wing undersides.
  entries.push(box(SHIP.beam + 3, 0.4, 13, 0, bridgeY + 0.2, Z + 3, PALETTE.houseTrim));
  // Bridge roof.
  entries.push(box(SHIP.beam + 4, 0.45, 14, 0, bridgeY + bridgeHeight + 0.2, Z + 3, PALETTE.houseTrim));

  // Radar mast and scanners.
  const mastBase = bridgeY + bridgeHeight + 0.4;
  entries.push({
    geometry: createCylinder(0.35, 0.55, 11, 10, true),
    matrix: mat4.fromTranslation(_m(), vec3.create(0, mastBase + 5.5, Z + 1)),
    color: PALETTE.steel,
  });
  for (const [h, w] of [[4.2, 4.6], [7.6, 3.2]]) {
    entries.push(box(w, 0.22, 0.5, 0, mastBase + h, Z + 1, PALETTE.steel));
  }
  entries.push({
    geometry: createSphere(0.9, 14, 10),
    matrix: mat4.fromTranslation(_m(), vec3.create(0, mastBase + 10.2, Z + 1)),
    color: PALETTE.house,
  });

  return merge(entries);
}

/** Bridge glazing, drawn separately so it can be lit and slightly reflective. */
function buildBridgeGlass() {
  const baseY = SHIP.deckY + deckSheer(0.18);
  const bridgeY = baseY + SHIP.deckHeight * SHIP.houseDecks;
  const Z = SHIP.houseZ + 3;
  const entries = [];

  // Forward-facing window band across the full bridge front, plus the wings.
  entries.push(box(SHIP.beam + 2.4, 2.5, 0.4, 0, bridgeY + 2.4, Z + 6.6, PALETTE.glass));
  // Wing-end windows facing outboard.
  entries.push(box(0.4, 2.5, 12, (SHIP.beam + 2.4) / 2, bridgeY + 2.4, Z, PALETTE.glass));
  entries.push(box(0.4, 2.5, 12, -(SHIP.beam + 2.4) / 2, bridgeY + 2.4, Z, PALETTE.glass));
  // Aft-looking band.
  entries.push(box(SHIP.beam * 0.7, 2.2, 0.4, 0, bridgeY + 2.4, Z - 6.6, PALETTE.glass));

  return merge(entries);
}

/** Funnel, engine casing and exhaust uptakes. */
function buildFunnel() {
  const entries = [];
  const baseY = SHIP.deckY + deckSheer(0.1);
  const Z = SHIP.funnelZ;

  // Engine casing the funnel grows out of.
  entries.push(box(20, 7, 16, 0, baseY + 3.5, Z, PALETTE.house));

  // Funnel proper — slightly raked, tapering.
  const funnelHeight = 17;
  const funnelY = baseY + 7 + funnelHeight / 2;
  entries.push({
    geometry: createBox(11, funnelHeight, 9),
    matrix: mat4.compose(
      _m(),
      vec3.create(0, funnelY, Z - 1),
      vec3.create(-0.06, 0, 0),
      vec3.create(1, 1, 1),
    ),
    color: PALETTE.funnel,
  });

  // Company band.
  entries.push({
    geometry: createBox(11.3, 3.2, 9.3),
    matrix: mat4.compose(
      _m(),
      vec3.create(0, funnelY + 3.4, Z - 1.2),
      vec3.create(-0.06, 0, 0),
      vec3.create(1, 1, 1),
    ),
    color: PALETTE.funnelBand,
  });

  // Exhaust uptakes on top.
  for (const dx of [-2.6, 2.6]) {
    entries.push({
      geometry: createCylinder(1.15, 1.3, 3.4, 12, true),
      matrix: mat4.fromTranslation(_m(), vec3.create(dx, funnelY + funnelHeight / 2 + 1.5, Z - 1.8)),
      color: PALETTE.darkSteel,
    });
  }

  return merge(entries);
}

/* ------------------------------------------------------------- deck fittings */

/** Hatch coamings and covers across the cargo hold, forward of the accommodation. */
const CARGO_START_Z = -78;
const CARGO_END_Z = 134;
const BAY_PITCH = 12.8;

function buildHatches() {
  const entries = [];
  const bays = Math.floor((CARGO_END_Z - CARGO_START_Z) / BAY_PITCH);

  for (let b = 0; b < bays; b++) {
    const z = CARGO_START_Z + b * BAY_PITCH + BAY_PITCH / 2;
    const t = (z - SHIP.sternZ) / SHIP.loa;
    const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
    const width = Math.max(4, halfBeam * 2 - 6.5);
    const y = SHIP.deckY + deckSheer(t);

    // Coaming, then the cover sitting on top of it.
    entries.push(box(width, 1.6, BAY_PITCH - 1.2, 0, y + 0.8, z, PALETTE.darkSteel));
    entries.push(box(width - 0.7, 0.5, BAY_PITCH - 2.0, 0, y + 1.8, z, PALETTE.hatch));
  }
  return merge(entries);
}

/** Side railings, catwalks, forward mast, mooring gear and the bulbous bow. */
function buildDetails() {
  const entries = [];

  // Railings along the cargo deck edges.
  for (let b = 0; b < 15; b++) {
    const z = CARGO_START_Z + b * 13.6;
    const t = (z - SHIP.sternZ) / SHIP.loa;
    const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
    const y = SHIP.deckY + deckSheer(t);
    if (halfBeam < 6) continue;

    for (const side of [-1, 1]) {
      entries.push({
        geometry: createRailing(13.6, 1.15, 7, 0.075),
        matrix: mat4.compose(
          _m(),
          vec3.create(side * (halfBeam - 1.1), y, z),
          vec3.create(0, Math.PI / 2, 0),
          vec3.create(1, 1, 1),
        ),
        color: PALETTE.steel,
      });
    }
  }

  // Forward mast with navigation platform.
  const bowT = 0.93;
  const bowY = SHIP.deckY + deckSheer(bowT);
  const bowZ = lerp(SHIP.sternZ, SHIP.bowZ, bowT);
  entries.push({
    geometry: createCylinder(0.4, 0.62, 15, 10, true),
    matrix: mat4.fromTranslation(_m(), vec3.create(0, bowY + 7.5, bowZ)),
    color: PALETTE.steel,
  });
  entries.push(box(5.2, 0.3, 2.2, 0, bowY + 11.5, bowZ, PALETTE.steel));

  // Forecastle breakwater.
  entries.push(box(26, 2.4, 1.1, 0, bowY + 1.2, CARGO_END_Z + 4, PALETTE.darkSteel));

  // Mooring winches on the forecastle and poop deck.
  for (const [z, t] of [[132, 0.94], [-140, 0.033]]) {
    const y = SHIP.deckY + deckSheer(t);
    for (const dx of [-7, 7]) {
      entries.push({
        geometry: createCylinder(1.5, 1.5, 2.6, 12, true),
        matrix: mat4.compose(
          _m(),
          vec3.create(dx, y + 1.1, z),
          vec3.create(0, 0, Math.PI / 2),
          vec3.create(1, 1, 1),
        ),
        color: PALETTE.darkSteel,
      });
    }
  }

  // Provision cranes beside the accommodation.
  for (const dx of [-13, 13]) {
    const y = SHIP.deckY + deckSheer(0.24);
    const z = SHIP.houseZ + 20;
    entries.push({
      geometry: createCylinder(1.0, 1.2, 9, 10, true),
      matrix: mat4.fromTranslation(_m(), vec3.create(dx, y + 4.5, z)),
      color: PALETTE.crane,
    });
    entries.push({
      geometry: createBox(0.9, 0.9, 19),
      matrix: mat4.compose(
        _m(),
        vec3.create(dx, y + 10.5, z + 7),
        vec3.create(-0.42, 0, 0),
        vec3.create(1, 1, 1),
      ),
      color: PALETTE.crane,
    });
  }

  // Bulbous bow.
  entries.push({
    geometry: createSphere(1, 20, 14),
    matrix: mat4.compose(
      _m(),
      vec3.create(0, -8.0, SHIP.bowZ - 2.5),
      vec3.create(0, 0, 0),
      vec3.create(3.6, 4.4, 11.5),
    ),
    color: PALETTE.hullBelow,
  });

  // Rudder and propeller boss at the stern.
  entries.push(box(0.9, 8.5, 7.5, 0, -8.5, SHIP.sternZ + 6, PALETTE.hullBelow));
  entries.push({
    geometry: createCylinder(1.6, 2.2, 6, 14, true),
    matrix: mat4.compose(
      _m(),
      vec3.create(0, -8.2, SHIP.sternZ + 13),
      vec3.create(Math.PI / 2, 0, 0),
      vec3.create(1, 1, 1),
    ),
    color: PALETTE.darkSteel,
  });

  return merge(entries);
}

/** Black boot-topping stripe marking the waterline along both sides. */
function buildBoottop() {
  const positions = [];
  const indices = [];
  const uvs = [];
  const bandTop = 1.5;
  const bandBottom = -0.9;

  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i < STATIONS; i++) {
      const t = i / (STATIONS - 1);
      const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
      const z = lerp(SHIP.sternZ, SHIP.bowZ, t);
      // Nudge outboard so the stripe never z-fights with the hull skin.
      const x = side * (halfBeam + 0.06);
      positions.push(x, bandTop, z, x, bandBottom, z);
      uvs.push(t, 1, t, 0);
    }
    for (let i = 0; i < STATIONS - 1; i++) {
      const a = base + i * 2;
      if (side > 0) {
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      } else {
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return {
    positions: pos,
    normals: computeNormals(pos, idx),
    uvs: new Float32Array(uvs),
    indices: idx,
  };
}

/* ------------------------------------------------------------- containers */

const CONTAINER = { length: 12.19, width: 2.44, height: 2.59 };

/**
 * Container liveries. Weighted by repetition rather than picked uniformly at
 * random: on a real vessel a handful of operators dominate the stack, so a few
 * colours recur constantly and the bright outliers are rare. Sampling a flat
 * random palette is what makes CG container stacks look like confectionery.
 */
const CONTAINER_COLORS = [
  [0.150, 0.062, 0.052],  // oxide red, the most common livery
  [0.150, 0.062, 0.052],
  [0.150, 0.062, 0.052],
  [0.135, 0.058, 0.048],
  [0.052, 0.088, 0.140],  // faded blue
  [0.052, 0.088, 0.140],
  [0.052, 0.088, 0.140],
  [0.060, 0.096, 0.150],
  [0.135, 0.140, 0.146],  // weathered grey
  [0.135, 0.140, 0.146],
  [0.120, 0.126, 0.132],
  [0.068, 0.112, 0.090],  // green
  [0.068, 0.112, 0.090],
  [0.170, 0.115, 0.048],  // ochre
  [0.185, 0.108, 0.040],  // orange, deliberately rare
  [0.112, 0.116, 0.140],  // slate
  [0.040, 0.058, 0.092],  // company navy
];

/**
 * Lays out the on-deck container stacks.
 *
 * Tier heights vary per stack and a few slots are left empty, which is what
 * makes the deck read as a working ship instead of a solid extruded block.
 */
function buildContainerInstances() {
  const random = makeRandom(20260804);
  const matrices = [];
  const colors = [];
  const scratch = mat4.create();

  const bays = Math.floor((CARGO_END_Z - CARGO_START_Z) / BAY_PITCH);
  const rowPitch = CONTAINER.width + 0.09;

  for (let b = 0; b < bays; b++) {
    const z = CARGO_START_Z + b * BAY_PITCH + BAY_PITCH / 2;
    const t = (z - SHIP.sternZ) / SHIP.loa;
    const halfBeam = (SHIP.beam / 2) * sampleCurve(HALF_BEAM_CURVE, t);
    const deckTop = SHIP.deckY + deckSheer(t) + 2.05;

    // Rows that physically fit inside the hull at this station.
    const usableHalf = halfBeam - 3.0;
    const rows = Math.max(0, Math.floor((usableHalf * 2) / rowPitch));
    if (rows < 2) continue;

    // Stacks are tallest amidships and step down toward the bow for visibility
    // from the bridge, which is how real vessels are loaded.
    const bayFraction = b / Math.max(bays - 1, 1);
    const maxTiers = Math.round(lerp(9, 5, smoothstep(0.42, 1.0, bayFraction)));

    for (let r = 0; r < rows; r++) {
      const x = (r - (rows - 1) / 2) * rowPitch;

      // Occasional empty slot.
      if (random() < 0.02) continue;

      let tiers = maxTiers;
      // Outboard stacks are one or two tiers lower.
      const outboard = Math.abs(x) / Math.max(usableHalf, 1);
      tiers -= Math.round(outboard * 1.3);
      tiers -= random() < 0.22 ? 1 : 0;
      tiers = Math.max(1, tiers);

      for (let tier = 0; tier < tiers; tier++) {
        const y = deckTop + tier * CONTAINER.height + CONTAINER.height / 2;
        mat4.compose(
          scratch,
          vec3.create(x, y, z),
          vec3.create(0, 0, 0),
          vec3.create(1, 1, 1),
        );
        for (let i = 0; i < 16; i++) matrices.push(scratch[i]);

        const color = CONTAINER_COLORS[(random() * CONTAINER_COLORS.length) | 0];
        // Slight per-box brightness variation so identical colours still read
        // as separate containers.
        const shade = 0.86 + random() * 0.26;
        colors.push(color[0] * shade, color[1] * shade, color[2] * shade);
      }
    }
  }

  return {
    matrices: new Float32Array(matrices),
    colors: new Float32Array(colors),
    count: matrices.length / 16,
  };
}

/* --------------------------------------------------------------- assembly */

/**
 * Builds every mesh for the vessel and returns draw batches ready to hand to
 * the renderer, plus the metadata the camera rig and physics need.
 */
export function createShip(gl) {
  const hullSkin = buildHullSkin();

  const hullMesh = new Mesh(gl, hullSkin);
  const deckMesh = new Mesh(gl, faceted(buildDeck()));
  const boottopMesh = new Mesh(gl, buildBoottop());
  const accommodationMesh = new Mesh(gl, faceted(buildAccommodation()));
  const glassMesh = new Mesh(gl, faceted(buildBridgeGlass()));
  const funnelMesh = new Mesh(gl, faceted(buildFunnel()));
  const hatchMesh = new Mesh(gl, faceted(buildHatches()));
  const detailMesh = new Mesh(gl, buildDetails());

  // One faceted 40 ft box, drawn once per container via instancing.
  const containerData = buildContainerInstances();
  const containerMesh = new Mesh(
    gl,
    faceted(createBox(CONTAINER.width, CONTAINER.height, CONTAINER.length)),
  );
  containerMesh.addInstances(containerData.matrices, containerData.colors);

  // Model matrix shared by every non-instanced batch; the ship pose writes here.
  const model = mat4.create();

  const batches = [
    {
      name: 'hull',
      mesh: hullMesh,
      model,
      material: {
        roughness: 0.62,
        metallic: 0.05,
        tintColor: PALETTE.hullAbove,
        tintAmount: 1.0,
        waterlineY: 0.6,
        waterlineAmount: 0.85,
        // Shell plating runs roughly 2.4 m; salt and rust streak heavily here.
        weather: 0.6,
        panelSize: 2.4,
      },
    },
    {
      name: 'boottop',
      mesh: boottopMesh,
      model,
      material: {
        roughness: 0.58,
        metallic: 0.04,
        tintColor: PALETTE.boottop,
        tintAmount: 1.0,
        weather: 0.8,
        panelSize: 2.4,
      },
    },
    {
      name: 'deck',
      mesh: deckMesh,
      model,
      material: {
        roughness: 0.8,
        metallic: 0.05,
        tintColor: PALETTE.deck,
        tintAmount: 1.0,
        ambientOcclusion: 0.8,
        weather: 1.0,
        panelSize: 1.6,
      },
    },
    {
      name: 'hatches',
      mesh: hatchMesh,
      model,
      material: {
        roughness: 0.74, metallic: 0.05, ambientOcclusion: 0.88,
        weather: 0.9, panelSize: 2.0,
      },
    },
    {
      name: 'containers',
      mesh: containerMesh,
      model,
      instanced: true,
      material: {
        roughness: 0.78, metallic: 0.03, ambientOcclusion: 0.82,
        // Boxes that have crossed oceans for years: heavily streaked, with
        // corrugated side walls and door-end seams.
        weather: 1.0, corrugation: 8.2,
      },
    },
    {
      name: 'accommodation',
      mesh: accommodationMesh,
      model,
      material: {
        roughness: 0.60, metallic: 0.03,
        weather: 0.42, panelSize: 1.2,
      },
    },
    {
      name: 'funnel',
      mesh: funnelMesh,
      model,
      material: {
        roughness: 0.55, metallic: 0.05,
        weather: 0.85, panelSize: 1.4,
      },
    },
    {
      name: 'details',
      mesh: detailMesh,
      model,
      material: {
        roughness: 0.45, metallic: 0.4,
        weather: 0.8,
      },
    },
    {
      name: 'glass',
      mesh: glassMesh,
      model,
      // Genuinely transparent: the bridge interior has no forward bulkhead, so
      // this glazing is what the camera looks through to reach the horizon.
      transparent: true,
      doubleSided: true,
      material: {
        roughness: 0.05,
        metallic: 0.6,
        emissive: 0.0,
        tintColor: PALETTE.glass,
        tintAmount: 1.0,
        opacity: 0.24,
      },
    },
  ];

  return {
    batches,
    model,
    containerCount: containerData.count,
    dimensions: SHIP,
    // Exposed for the dev winding/normal assertions.
    debugHullSkin: hullSkin,
    /** Total triangles, useful for the performance budget. */
    triangleCount:
      (hullSkin.indices.length +
        deckMesh.count +
        boottopMesh.count +
        accommodationMesh.count +
        glassMesh.count +
        funnelMesh.count +
        hatchMesh.count +
        detailMesh.count) / 3 +
      (containerMesh.count / 3) * containerData.count,
    dispose() {
      for (const batch of batches) batch.mesh.dispose();
    },
  };
}

/* ------------------------------------------------------------------ motion */

// Sample points along the hull used to fit the vessel to the wave field.
const PROBES = [
  [0, 110],    // forward
  [0, -110],   // aft
  [16, 0],     // starboard amidships
  [-16, 0],    // port amidships
];

const _probe = { x: 0, y: 0, z: 0, normalX: 0, normalY: 1, normalZ: 0 };

/**
 * Fits the ship to the wave field.
 *
 * Rather than displacing hull vertices, the ocean is sampled at four points and
 * a rigid heave/pitch/roll is solved from them. A 300 m hull spans many
 * wavelengths, so the motion is heavily damped — which is also physically
 * right, since a loaded ULCV barely responds to short waves.
 *
 * @returns {{y:number, pitch:number, roll:number}}
 */
export function shipPose(time, waveScale = 1, damping = 0.28) {
  let sumHeight = 0;
  const heights = [];

  for (const [x, z] of PROBES) {
    sampleOcean(x, z, time, waveScale, _probe);
    heights.push(_probe.y);
    sumHeight += _probe.y;
  }

  const meanHeight = sumHeight / PROBES.length;

  // Pitch from the fore/aft pair, roll from the port/starboard pair.
  const pitch = Math.atan2(heights[0] - heights[1], PROBES[0][1] - PROBES[1][1]);
  const roll = Math.atan2(heights[2] - heights[3], PROBES[2][0] - PROBES[3][0]);

  return {
    y: meanHeight * damping,
    pitch: -pitch * damping,
    roll: roll * damping,
  };
}

/** Writes the ship pose into a model matrix. */
export function applyShipPose(model, pose, position = null) {
  return mat4.compose(
    model,
    vec3.create(
      position ? position[0] : 0,
      pose.y,
      position ? position[2] : 0,
    ),
    vec3.create(pose.pitch, 0, pose.roll),
    vec3.create(1, 1, 1),
  );
}
