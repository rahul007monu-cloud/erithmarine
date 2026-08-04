/**
 * interiors.js — The three interior spaces the camera enters.
 *
 * Each is built around an anchor from journey.js and is intentionally compact:
 * the camera only ever sees them from one or two authored framings, so geometry
 * exists where it will be looked at and nowhere else.
 *
 * All rooms are built inside the ship's local space, which means they inherit
 * the vessel's heave, pitch and roll for free.
 */

import {
  createBox,
  createCylinder,
  createFrame,
  createRailing,
  merge,
  faceted,
} from '../engine/geometry.js';
import { Mesh } from '../engine/gl.js';
import { mat4, vec3 } from '../engine/math.js';
import { INTERIOR_ANCHORS } from './journey.js';

const m = () => mat4.create();

/** Places a box at a position, optionally rotated. */
function part(w, h, d, x, y, z, color, rot = null) {
  return {
    geometry: createBox(w, h, d),
    matrix: rot
      ? mat4.compose(m(), vec3.create(x, y, z), vec3.create(rot[0], rot[1], rot[2]), vec3.create(1, 1, 1))
      : mat4.fromTranslation(m(), vec3.create(x, y, z)),
    color,
  };
}

function tube(radius, length, x, y, z, color, rot = null) {
  return {
    geometry: createCylinder(radius, radius, length, 12, true),
    matrix: rot
      ? mat4.compose(m(), vec3.create(x, y, z), vec3.create(rot[0], rot[1], rot[2]), vec3.create(1, 1, 1))
      : mat4.fromTranslation(m(), vec3.create(x, y, z)),
    color,
  };
}

const C = {
  deckSoft: [0.085, 0.092, 0.105],
  panel: [0.125, 0.135, 0.155],
  consoleTop: [0.09, 0.10, 0.12],
  wood: [0.28, 0.18, 0.11],
  paperWhite: [0.72, 0.71, 0.66],
  steel: [0.34, 0.36, 0.39],
  darkSteel: [0.13, 0.14, 0.16],
  engineGreen: [0.10, 0.20, 0.17],
  engineBlock: [0.14, 0.16, 0.19],
  copper: [0.42, 0.24, 0.12],
  pipeRed: [0.34, 0.10, 0.09],
  pipeBlue: [0.11, 0.20, 0.34],
  pipeYellow: [0.42, 0.34, 0.10],
  grating: [0.22, 0.23, 0.24],
  holdWall: [0.19, 0.20, 0.21],
  rust: [0.30, 0.17, 0.10],
  screenGlow: [0.10, 0.55, 0.55],
  lampWarm: [1.0, 0.80, 0.48],
  lampCool: [0.80, 0.90, 1.0],

  // Accommodation spaces are deliberately warmer and lighter than machinery
  // spaces — that contrast is what sells "inside the ship" as somewhere livable.
  messFloor: [0.135, 0.115, 0.10],
  messWall: [0.32, 0.31, 0.285],
  tableTop: [0.44, 0.33, 0.22],
  benchBlue: [0.13, 0.20, 0.30],
  cork: [0.34, 0.24, 0.14],
  cabinFloor: [0.155, 0.125, 0.10],
  cabinWall: [0.34, 0.32, 0.29],
  bedding: [0.62, 0.63, 0.62],
};

/* ------------------------------------------------------------------- bridge */

/**
 * Wheelhouse: a wraparound console under a forward window band, chart table
 * aft, overhead deckhead panels, and the helm.
 */
function buildBridge() {
  const a = INTERIOR_ANCHORS.bridge;
  const body = [];
  const emissive = [];

  const width = 40;   // wing to wing
  const depth = 12;
  const height = 3.4;

  // Deck, deckhead and the aft bulkhead. No forward bulkhead — that is glass.
  body.push(part(width, 0.25, depth, a.x, a.y - 0.12, a.z, C.deckSoft));
  body.push(part(width, 0.25, depth, a.x, a.y + height, a.z, C.panel));
  body.push(part(width, height, 0.3, a.x, a.y + height / 2, a.z - depth / 2, C.panel));
  // Side bulkheads.
  body.push(part(0.3, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.panel));
  body.push(part(0.3, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.panel));

  // Forward console, angled back toward the helmsman.
  const consoleZ = a.z + depth / 2 - 2.0;
  body.push(part(26, 1.05, 1.5, a.x, a.y + 0.55, consoleZ, C.panel));
  body.push(part(26, 0.12, 1.7, a.x, a.y + 1.1, consoleZ - 0.1, C.consoleTop, [-0.32, 0, 0]));

  // Instrument screens along the console — these read as light sources.
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    emissive.push(part(1.9, 0.9, 0.08, a.x + i * 2.6, a.y + 1.32, consoleZ - 0.42, C.screenGlow, [-0.32, 0, 0]));
  }

  // Radar pedestals either side of centre.
  for (const dx of [-3.4, 3.4]) {
    body.push(part(1.9, 1.2, 1.4, a.x + dx, a.y + 1.55, consoleZ - 1.6, C.darkSteel));
    emissive.push(part(1.5, 0.06, 1.1, a.x + dx, a.y + 2.18, consoleZ - 1.6, C.screenGlow));
  }

  // Helm: pedestal, wheel, and the telegraph beside it.
  body.push(tube(0.42, 1.1, a.x, a.y + 0.55, consoleZ - 2.6, C.darkSteel));
  body.push({
    geometry: createCylinder(0.62, 0.62, 0.16, 20, true),
    matrix: mat4.compose(
      m(),
      vec3.create(a.x, a.y + 1.25, consoleZ - 2.6),
      vec3.create(Math.PI / 2 - 0.28, 0, 0),
      vec3.create(1, 1, 1),
    ),
    color: C.wood,
  });
  body.push(tube(0.26, 1.3, a.x + 1.5, a.y + 0.65, consoleZ - 2.7, C.copper));

  // Chart table aft, with a chart on it and a task lamp.
  const chartZ = a.z - depth / 2 + 2.6;
  body.push(part(4.6, 0.14, 2.4, a.x + 4.5, a.y + 1.0, chartZ, C.wood));
  for (const [dx, dz] of [[-2.1, -1.0], [2.1, -1.0], [-2.1, 1.0], [2.1, 1.0]]) {
    body.push(tube(0.07, 1.0, a.x + 4.5 + dx, a.y + 0.5, chartZ + dz, C.steel));
  }
  body.push(part(3.6, 0.03, 1.8, a.x + 4.5, a.y + 1.09, chartZ, C.paperWhite));
  emissive.push(part(0.7, 0.12, 0.5, a.x + 6.0, a.y + 1.9, chartZ, C.lampWarm));

  // Captain's chairs.
  for (const dx of [-7.5, 7.5]) {
    body.push(tube(0.16, 0.9, a.x + dx, a.y + 0.45, consoleZ - 3.4, C.steel));
    body.push(part(1.1, 0.16, 1.1, a.x + dx, a.y + 0.95, consoleZ - 3.4, C.consoleTop));
    body.push(part(1.1, 1.1, 0.16, a.x + dx, a.y + 1.5, consoleZ - 3.9, C.consoleTop));
  }

  // Deckhead light fittings.
  for (const dx of [-11, -5.5, 5.5, 11]) {
    emissive.push(part(2.4, 0.1, 0.7, a.x + dx, a.y + height - 0.2, a.z - 1, C.lampCool));
  }

  // Window mullions across the forward opening, so the glass reads as framed.
  const mullions = [];
  for (let i = -6; i <= 6; i++) {
    mullions.push(part(0.16, 2.4, 0.16, a.x + i * 3.1, a.y + 2.0, a.z + depth / 2, C.darkSteel));
  }

  return {
    body: merge([...body, ...mullions]),
    emissive: merge(emissive),
  };
}

/* -------------------------------------------------------------- engine room */

/**
 * Engine room: a tall space around a two-stroke main engine, with gratings,
 * pipe runs, a workshop bench and the control room window.
 */
function buildEngineRoom() {
  const a = INTERIOR_ANCHORS.engineRoom;
  const body = [];
  const emissive = [];

  const width = 34;
  const depth = 44;
  const height = 18;

  // Enclosure. Drawn double-sided by the caller, so single planes suffice.
  body.push(part(width, 0.4, depth, a.x, a.y - 0.2, a.z, C.grating));
  body.push(part(width, 0.4, depth, a.x, a.y + height, a.z, C.darkSteel));
  body.push(part(0.4, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.holdWall));
  body.push(part(0.4, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.holdWall));
  body.push(part(width, height, 0.4, a.x, a.y + height / 2, a.z - depth / 2, C.holdWall));
  body.push(part(width, height, 0.4, a.x, a.y + height / 2, a.z + depth / 2, C.holdWall));

  // Main engine: bedplate, block, and cylinder covers in a row.
  const engineZ = a.z + 2;
  body.push(part(9.0, 2.2, 26, a.x, a.y + 1.1, engineZ, C.engineBlock));
  body.push(part(7.6, 5.0, 25, a.x, a.y + 4.6, engineZ, C.engineGreen));

  for (let i = 0; i < 7; i++) {
    const z = engineZ - 10.5 + i * 3.5;
    // Cylinder liner and head.
    body.push(tube(1.5, 4.2, a.x, a.y + 9.2, z, C.engineGreen));
    body.push(tube(1.75, 0.5, a.x, a.y + 11.5, z, C.darkSteel));
    // Rocker gear on top.
    body.push(part(2.4, 0.7, 1.6, a.x, a.y + 12.0, z, C.steel));
    // Fuel pump and its linkage on the side.
    body.push(tube(0.5, 1.8, a.x + 4.3, a.y + 7.4, z, C.copper));
    body.push(tube(0.16, 3.0, a.x + 4.3, a.y + 5.4, z, C.steel));
  }

  // Exhaust manifold running the length of the engine.
  body.push(tube(1.25, 25, a.x - 4.6, a.y + 10.5, engineZ, C.rust, [Math.PI / 2, 0, 0]));

  // Turbocharger at the aft end.
  body.push(tube(2.3, 4.4, a.x - 4.6, a.y + 12.6, engineZ - 14, C.darkSteel, [Math.PI / 2, 0, 0]));
  body.push(tube(3.0, 1.2, a.x - 4.6, a.y + 12.6, engineZ - 16.6, C.steel, [Math.PI / 2, 0, 0]));

  // Upper grating platform with railing, reached by a ladder.
  const platformY = a.y + 8.0;
  body.push(part(9, 0.18, depth - 6, a.x - 12, platformY, a.z, C.grating));
  body.push({
    geometry: createRailing(depth - 6, 1.1, 12, 0.06),
    matrix: mat4.compose(
      m(),
      vec3.create(a.x - 7.7, platformY, a.z),
      vec3.create(0, 0, 0),
      vec3.create(1, 1, 1),
    ),
    color: C.steel,
  });
  // Ladder stringers and rungs.
  for (const dx of [-0.5, 0.5]) {
    body.push(tube(0.08, 8.2, a.x - 12 + dx, a.y + 4.0, a.z - 15, C.steel));
  }
  for (let i = 0; i < 11; i++) {
    body.push(tube(0.05, 1.1, a.x - 12, a.y + 0.5 + i * 0.75, a.z - 15, C.steel, [0, 0, Math.PI / 2]));
  }

  // Pipe runs along the side bulkhead, colour-coded as they are on real ships.
  const pipeColors = [C.pipeRed, C.pipeBlue, C.pipeYellow, C.steel, C.pipeBlue];
  pipeColors.forEach((color, i) => {
    body.push(tube(0.28, depth - 4, a.x + width / 2 - 1.6, a.y + 4.2 + i * 1.15, a.z, color, [Math.PI / 2, 0, 0]));
  });

  // Control room window, glowing from inside.
  body.push(part(9, 3.4, 0.3, a.x - 11, a.y + 11.0, a.z - depth / 2 + 0.4, C.panel));
  emissive.push(part(8, 2.4, 0.12, a.x - 11, a.y + 11.0, a.z - depth / 2 + 0.62, C.screenGlow));

  // Workshop bench with a vice.
  body.push(part(5, 0.16, 1.6, a.x + 11, a.y + 1.2, a.z - 16, C.steel));
  body.push(part(0.8, 0.7, 0.8, a.x + 12.4, a.y + 1.6, a.z - 16, C.darkSteel));

  // Overhead fluorescents and a red emergency lamp.
  for (const z of [-14, -4, 6, 16]) {
    emissive.push(part(3.4, 0.14, 0.6, a.x, a.y + height - 0.6, a.z + z, C.lampCool));
  }
  emissive.push(part(0.6, 0.6, 0.3, a.x + 8, a.y + 14, a.z - depth / 2 + 0.7, [1.0, 0.18, 0.12]));

  return { body: merge(body), emissive: merge(emissive) };
}

/* --------------------------------------------------------------- cargo hold */

/**
 * Cargo hold: cell guides rising through the space, containers stowed below
 * deck, an access ladder, and light spilling from the open hatch above.
 */
function buildCargoHold() {
  const a = INTERIOR_ANCHORS.cargoHold;
  const body = [];
  const emissive = [];

  const width = 36;
  const depth = 60;
  const height = 22;

  // Tank top, side shells, transverse bulkheads.
  body.push(part(width, 0.5, depth, a.x, a.y - 0.25, a.z, C.darkSteel));
  body.push(part(0.5, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.holdWall));
  body.push(part(0.5, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.holdWall));
  body.push(part(width, height, 0.6, a.x, a.y + height / 2, a.z - depth / 2, C.holdWall));
  body.push(part(width, height, 0.6, a.x, a.y + height / 2, a.z + depth / 2, C.holdWall));

  // Deckhead with a hatch opening, built as four panels around the gap so
  // daylight can read through the middle.
  const openW = 12;
  const openD = 16;
  const side = (width - openW) / 2;
  body.push(part(side, 0.5, depth, a.x - (openW / 2 + side / 2), a.y + height, a.z, C.darkSteel));
  body.push(part(side, 0.5, depth, a.x + (openW / 2 + side / 2), a.y + height, a.z, C.darkSteel));
  const endD = (depth - openD) / 2;
  body.push(part(openW, 0.5, endD, a.x, a.y + height, a.z - (openD / 2 + endD / 2), C.darkSteel));
  body.push(part(openW, 0.5, endD, a.x, a.y + height, a.z + (openD / 2 + endD / 2), C.darkSteel));

  // Vertical cell guides on a container pitch.
  for (let row = -3; row <= 3; row++) {
    for (const dz of [-24, -12, 0, 12, 24]) {
      const x = a.x + row * 2.55;
      body.push(part(0.28, height - 1, 0.28, x - 1.3, a.y + height / 2, a.z + dz, C.steel));
      body.push(part(0.28, height - 1, 0.28, x + 1.3, a.y + height / 2, a.z + dz, C.steel));
    }
  }

  // Transverse web frames on the side shell.
  for (const dz of [-20, -8, 4, 16]) {
    body.push(part(1.4, height - 2, 0.5, a.x - width / 2 + 1.0, a.y + height / 2, a.z + dz, C.holdWall));
    body.push(part(1.4, height - 2, 0.5, a.x + width / 2 - 1.0, a.y + height / 2, a.z + dz, C.holdWall));
  }

  // Containers stowed in the lower tiers, leaving the upper space open.
  const stowColors = [
    [0.40, 0.12, 0.10], [0.09, 0.20, 0.34], [0.12, 0.26, 0.19],
    [0.36, 0.26, 0.09], [0.28, 0.29, 0.31],
  ];
  let colorIndex = 0;
  for (let row = -3; row <= 3; row++) {
    for (const dz of [-24, -12, 24]) {
      for (let tier = 0; tier < 3; tier++) {
        body.push(part(
          2.44, 2.59, 11.9,
          a.x + row * 2.55,
          a.y + 0.3 + tier * 2.65 + 1.3,
          a.z + dz,
          stowColors[colorIndex++ % stowColors.length],
        ));
      }
    }
  }

  // Access ladder up the aft bulkhead.
  for (const dx of [-0.55, 0.55]) {
    body.push(tube(0.07, height - 2, a.x + 12 + dx, a.y + height / 2 - 1, a.z - depth / 2 + 1.2, C.steel));
  }
  for (let i = 0; i < 26; i++) {
    body.push(tube(0.045, 1.2, a.x + 12, a.y + 0.6 + i * 0.75, a.z - depth / 2 + 1.2, C.steel, [0, 0, Math.PI / 2]));
  }

  // Bulkhead access door with a frame.
  body.push({
    geometry: createFrame(2.2, 3.0, 0.22, 0.3),
    matrix: mat4.fromTranslation(m(), vec3.create(a.x - 10, a.y + 1.6, a.z - depth / 2 + 0.5)),
    color: C.steel,
  });

  // Hold lamps, plus a bright panel in the hatch opening standing in for the
  // daylight spilling down from the open deck above.
  for (const dz of [-18, 0, 18]) {
    emissive.push(part(2.6, 0.14, 0.6, a.x - 14, a.y + height - 1.2, a.z + dz, C.lampCool));
    emissive.push(part(2.6, 0.14, 0.6, a.x + 14, a.y + height - 1.2, a.z + dz, C.lampCool));
  }
  emissive.push(part(openW - 1, 0.08, openD - 1, a.x, a.y + height - 0.4, a.z, [0.85, 0.92, 1.0]));

  return { body: merge(body), emissive: merge(emissive) };
}

/* ------------------------------------------------------ engine control room */

/**
 * ECR: the sound-proofed box engineers actually work from. A switchboard and
 * alarm wall, a console with screens, and a window looking out at the engine.
 */
function buildEngineControlRoom() {
  const a = INTERIOR_ANCHORS.engineControlRoom;
  const body = [];
  const emissive = [];

  const width = 11;
  const depth = 9;
  const height = 2.9;

  body.push(part(width, 0.2, depth, a.x, a.y - 0.1, a.z, C.deckSoft));
  body.push(part(width, 0.2, depth, a.x, a.y + height, a.z, C.panel));
  body.push(part(width, height, 0.25, a.x, a.y + height / 2, a.z - depth / 2, C.panel));
  body.push(part(0.25, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.panel));
  body.push(part(0.25, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.panel));

  // Forward wall carries the switchboard; a window beside it looks at the engine.
  body.push(part(width * 0.55, height, 0.25, a.x - width * 0.22, a.y + height / 2, a.z + depth / 2, C.panel));
  body.push(part(width * 0.42, 0.6, 0.3, a.x + width * 0.28, a.y + height - 0.3, a.z + depth / 2, C.panel));
  body.push(part(width * 0.42, 0.5, 0.3, a.x + width * 0.28, a.y + 0.25, a.z + depth / 2, C.panel));

  // Switchboard cabinets with breaker rows and running lamps.
  for (let i = 0; i < 3; i++) {
    const x = a.x - 3.9 + i * 1.9;
    body.push(part(1.7, 2.3, 0.5, x, a.y + 1.15, a.z + depth / 2 - 0.5, C.darkSteel));
    for (let r = 0; r < 4; r++) {
      body.push(part(1.3, 0.16, 0.1, x, a.y + 0.6 + r * 0.42, a.z + depth / 2 - 0.78, C.steel));
    }
    emissive.push(part(0.12, 0.12, 0.08, x - 0.5, a.y + 2.1, a.z + depth / 2 - 0.8, [0.2, 1.0, 0.35]));
    emissive.push(part(0.12, 0.12, 0.08, x + 0.5, a.y + 2.1, a.z + depth / 2 - 0.8, [1.0, 0.68, 0.15]));
  }

  // Operator console: desk, angled screen bank, keyboard shelf.
  const consoleZ = a.z + 1.2;
  body.push(part(6.4, 0.12, 1.5, a.x - 1.2, a.y + 0.95, consoleZ, C.consoleTop));
  for (const dx of [-4.0, 1.7]) {
    body.push(part(0.5, 0.95, 1.4, a.x - 1.2 + dx, a.y + 0.48, consoleZ, C.darkSteel));
  }
  for (let i = 0; i < 4; i++) {
    emissive.push(part(1.25, 0.85, 0.06, a.x - 3.5 + i * 1.55, a.y + 1.62, consoleZ - 0.5, C.screenGlow, [-0.24, 0, 0]));
  }

  // Alarm annunciator panel on the aft bulkhead.
  body.push(part(3.2, 1.6, 0.2, a.x + 2.8, a.y + 1.7, a.z - depth / 2 + 0.3, C.darkSteel));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const lit = (r * 5 + c) % 7 === 0;
      emissive.push(part(0.5, 0.28, 0.06, a.x + 1.6 + c * 0.6, a.y + 1.2 + r * 0.44, a.z - depth / 2 + 0.42,
        lit ? [1.0, 0.42, 0.12] : [0.16, 0.30, 0.20]));
    }
  }

  // Chairs and a document rack.
  for (const dx of [-2.6, 0.4]) {
    body.push(tube(0.14, 0.75, a.x + dx, a.y + 0.38, consoleZ - 1.9, C.steel));
    body.push(part(0.95, 0.14, 0.95, a.x + dx, a.y + 0.8, consoleZ - 1.9, C.consoleTop));
    body.push(part(0.95, 0.95, 0.14, a.x + dx, a.y + 1.3, consoleZ - 2.35, C.consoleTop));
  }
  body.push(part(1.4, 1.9, 0.4, a.x - width / 2 + 0.6, a.y + 1.0, a.z - 2.4, C.steel));

  // Overhead lights.
  for (const dz of [-2.4, 1.6]) {
    emissive.push(part(2.6, 0.1, 0.5, a.x, a.y + height - 0.2, a.z + dz, C.lampCool));
  }

  return { body: merge(body), emissive: merge(emissive) };
}

/* ---------------------------------------------------------------- crew mess */

/**
 * Crew mess and galley servery: the social space. Tables and benches, a hot
 * counter, coffee urn, a TV on the bulkhead and portholes to the sea.
 */
function buildCrewMess() {
  const a = INTERIOR_ANCHORS.crewMess;
  const body = [];
  const emissive = [];

  const width = 15;
  const depth = 12;
  const height = 2.8;

  body.push(part(width, 0.2, depth, a.x, a.y - 0.1, a.z, C.messFloor));
  body.push(part(width, 0.2, depth, a.x, a.y + height, a.z, C.panel));
  body.push(part(width, height, 0.25, a.x, a.y + height / 2, a.z - depth / 2, C.messWall));
  body.push(part(width, height, 0.25, a.x, a.y + height / 2, a.z + depth / 2, C.messWall));
  body.push(part(0.25, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.messWall));
  body.push(part(0.25, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.messWall));

  // Four tables with bench seating either side.
  for (const [tx, tz] of [[-3.6, -3.0], [-3.6, 1.6], [2.4, -3.0], [2.4, 1.6]]) {
    const x = a.x + tx;
    const z = a.z + tz;
    body.push(part(3.0, 0.1, 1.25, x, a.y + 0.76, z, C.tableTop));
    body.push(tube(0.09, 0.75, x - 1.2, a.y + 0.38, z, C.steel));
    body.push(tube(0.09, 0.75, x + 1.2, a.y + 0.38, z, C.steel));
    for (const dz of [-1.0, 1.0]) {
      body.push(part(3.0, 0.1, 0.5, x, a.y + 0.44, z + dz, C.benchBlue));
      body.push(part(3.0, 0.75, 0.1, x, a.y + 0.8, z + dz * 1.28, C.benchBlue));
    }
  }

  // Servery counter with a hot cabinet and trays.
  const serveryX = a.x - width / 2 + 1.7;
  body.push(part(2.4, 1.0, 7.0, serveryX, a.y + 0.5, a.z, C.steel));
  body.push(part(2.6, 0.1, 7.2, serveryX, a.y + 1.03, a.z, C.tableTop));
  emissive.push(part(2.0, 0.08, 5.6, serveryX, a.y + 1.68, a.z, C.lampWarm));
  body.push(part(0.14, 0.75, 5.8, serveryX + 1.2, a.y + 1.4, a.z, C.steel));
  for (let i = 0; i < 4; i++) {
    body.push(part(1.5, 0.14, 1.0, serveryX, a.y + 1.1, a.z - 2.4 + i * 1.6, C.darkSteel));
  }

  // Coffee urn and a water cooler.
  body.push(tube(0.32, 0.85, serveryX + 0.2, a.y + 1.5, a.z + 3.0, C.steel));
  body.push(part(0.7, 1.5, 0.7, a.x + width / 2 - 1.0, a.y + 0.75, a.z - 4.6, C.paperWhite));

  // TV on the aft bulkhead, plus a notice board beside it.
  body.push(part(3.2, 1.85, 0.14, a.x + 2.0, a.y + 1.9, a.z - depth / 2 + 0.3, C.darkSteel));
  emissive.push(part(2.9, 1.6, 0.06, a.x + 2.0, a.y + 1.9, a.z - depth / 2 + 0.4, [0.22, 0.38, 0.62]));
  body.push(part(2.0, 1.3, 0.1, a.x - 3.4, a.y + 1.8, a.z - depth / 2 + 0.32, C.cork));
  for (let i = 0; i < 5; i++) {
    body.push(part(0.42, 0.55, 0.04, a.x - 4.1 + (i % 3) * 0.72, a.y + 2.0 - Math.floor(i / 3) * 0.62,
      a.z - depth / 2 + 0.39, C.paperWhite));
  }

  // Portholes on the outboard bulkhead, glowing with daylight.
  for (const dz of [-3.4, 0, 3.4]) {
    body.push({
      geometry: createCylinder(0.46, 0.46, 0.3, 16, true),
      matrix: mat4.compose(m(), vec3.create(a.x + width / 2 - 0.2, a.y + 1.65, a.z + dz),
        vec3.create(0, 0, Math.PI / 2), vec3.create(1, 1, 1)),
      color: C.steel,
    });
    emissive.push({
      geometry: createCylinder(0.36, 0.36, 0.1, 16, true),
      matrix: mat4.compose(m(), vec3.create(a.x + width / 2 - 0.32, a.y + 1.65, a.z + dz),
        vec3.create(0, 0, Math.PI / 2), vec3.create(1, 1, 1)),
      color: [0.86, 0.93, 1.0],
    });
  }

  // Overhead lighting.
  for (const [lx, lz] of [[-3.5, -2.8], [-3.5, 2.2], [3.0, -2.8], [3.0, 2.2]]) {
    emissive.push(part(1.9, 0.09, 0.6, a.x + lx, a.y + height - 0.18, a.z + lz, C.lampWarm));
  }

  return { body: merge(body), emissive: merge(emissive) };
}

/* -------------------------------------------------------------------- cabin */

/**
 * Officer's cabin: bunk, desk, wardrobe, day sofa and a porthole. Small on
 * purpose — this is what a real single cabin feels like.
 */
function buildCabin() {
  const a = INTERIOR_ANCHORS.cabin;
  const body = [];
  const emissive = [];

  const width = 6.2;
  const depth = 8.0;
  const height = 2.6;

  body.push(part(width, 0.18, depth, a.x, a.y - 0.09, a.z, C.cabinFloor));
  body.push(part(width, 0.18, depth, a.x, a.y + height, a.z, C.panel));
  body.push(part(width, height, 0.22, a.x, a.y + height / 2, a.z - depth / 2, C.cabinWall));
  body.push(part(width, height, 0.22, a.x, a.y + height / 2, a.z + depth / 2, C.cabinWall));
  body.push(part(0.22, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.cabinWall));
  body.push(part(0.22, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.cabinWall));

  // Bunk against the inboard bulkhead, with a reading light.
  const bunkX = a.x + width / 2 - 1.2;
  body.push(part(2.0, 0.5, 4.2, bunkX, a.y + 0.4, a.z + 0.6, C.wood));
  body.push(part(1.85, 0.22, 4.0, bunkX, a.y + 0.74, a.z + 0.6, C.bedding));
  body.push(part(1.5, 0.16, 0.6, bunkX, a.y + 0.9, a.z + 2.3, C.paperWhite));
  body.push(part(2.0, 0.6, 0.2, bunkX, a.y + 1.05, a.z - 1.6, C.wood));
  emissive.push(part(0.3, 0.1, 0.22, bunkX + 0.7, a.y + 1.5, a.z + 2.1, C.lampWarm));

  // Desk under the porthole, with a chair and a laptop.
  const deskX = a.x - width / 2 + 1.3;
  body.push(part(1.9, 0.1, 3.0, deskX, a.y + 0.76, a.z + 1.0, C.wood));
  body.push(part(1.7, 0.7, 0.6, deskX, a.y + 0.4, a.z + 2.2, C.wood));
  body.push(tube(0.1, 0.72, deskX + 0.6, a.y + 0.36, a.z - 0.3, C.steel));
  body.push(part(0.85, 0.12, 0.85, deskX + 0.6, a.y + 0.78, a.z - 0.3, C.benchBlue));
  body.push(part(0.85, 0.8, 0.12, deskX + 0.6, a.y + 1.2, a.z - 0.72, C.benchBlue));
  emissive.push(part(0.7, 0.05, 0.45, deskX, a.y + 1.06, a.z + 1.2, [0.35, 0.62, 0.78]));
  emissive.push(part(0.22, 0.3, 0.22, deskX - 0.5, a.y + 1.35, a.z + 2.0, C.lampWarm));

  // Shelf of books above the desk.
  body.push(part(1.7, 0.1, 0.35, deskX, a.y + 1.7, a.z + 1.6, C.wood));
  for (let i = 0; i < 6; i++) {
    body.push(part(0.16, 0.42, 0.28, deskX - 0.7 + i * 0.24, a.y + 1.96, a.z + 1.6,
      i % 2 ? [0.32, 0.14, 0.12] : [0.14, 0.22, 0.32]));
  }

  // Wardrobe by the door.
  body.push(part(1.1, 2.1, 0.65, a.x - width / 2 + 0.85, a.y + 1.05, a.z - depth / 2 + 0.9, C.wood));
  body.push(part(0.06, 0.3, 0.06, a.x - width / 2 + 1.35, a.y + 1.1, a.z - depth / 2 + 0.6, C.steel));

  // Porthole on the outboard side, with daylight behind it.
  body.push({
    geometry: createCylinder(0.5, 0.5, 0.28, 18, true),
    matrix: mat4.compose(m(), vec3.create(a.x - width / 2 + 0.18, a.y + 1.6, a.z + 1.4),
      vec3.create(0, 0, Math.PI / 2), vec3.create(1, 1, 1)),
    color: C.steel,
  });
  emissive.push({
    geometry: createCylinder(0.4, 0.4, 0.1, 18, true),
    matrix: mat4.compose(m(), vec3.create(a.x - width / 2 + 0.06, a.y + 1.6, a.z + 1.4),
      vec3.create(0, 0, Math.PI / 2), vec3.create(1, 1, 1)),
    color: [0.88, 0.94, 1.0],
  });

  // Deckhead light.
  emissive.push(part(1.4, 0.08, 0.5, a.x, a.y + height - 0.16, a.z, [1.0, 0.94, 0.84]));

  return { body: merge(body), emissive: merge(emissive) };
}

/* ------------------------------------------------------------- ship's office */

/**
 * Ship's office: where crew documents, sign-on papers and payroll are handled.
 * This is the space the Apply section lives in, which makes the metaphor land.
 */
function buildShipOffice() {
  const a = INTERIOR_ANCHORS.shipOffice;
  const body = [];
  const emissive = [];

  const width = 8.5;
  const depth = 9.0;
  const height = 2.7;

  body.push(part(width, 0.18, depth, a.x, a.y - 0.09, a.z, C.deckSoft));
  body.push(part(width, 0.18, depth, a.x, a.y + height, a.z, C.panel));
  body.push(part(width, height, 0.22, a.x, a.y + height / 2, a.z - depth / 2, C.messWall));
  body.push(part(width, height, 0.22, a.x, a.y + height / 2, a.z + depth / 2, C.messWall));
  body.push(part(0.22, height, depth, a.x - width / 2, a.y + height / 2, a.z, C.messWall));
  body.push(part(0.22, height, depth, a.x + width / 2, a.y + height / 2, a.z, C.messWall));

  // Desk facing the camera, with a monitor, keyboard and paperwork trays.
  const deskZ = a.z + 1.4;
  body.push(part(4.2, 0.12, 1.9, a.x - 0.8, a.y + 0.76, deskZ, C.wood));
  body.push(part(1.6, 0.72, 1.7, a.x - 2.4, a.y + 0.38, deskZ, C.wood));
  for (let i = 0; i < 3; i++) {
    body.push(part(1.3, 0.14, 0.1, a.x - 2.4, a.y + 0.3 + i * 0.2, deskZ - 0.86, C.steel));
  }
  body.push(part(1.15, 0.06, 0.42, a.x - 0.4, a.y + 0.84, deskZ - 0.5, C.darkSteel));
  emissive.push(part(1.35, 0.85, 0.06, a.x + 0.1, a.y + 1.35, deskZ + 0.4, C.screenGlow, [-0.16, 0, 0]));
  body.push(tube(0.12, 0.5, a.x + 0.1, a.y + 0.98, deskZ + 0.4, C.darkSteel));

  // Stacked document trays and a stamp block.
  for (let i = 0; i < 3; i++) {
    body.push(part(0.9, 0.1, 0.65, a.x + 1.15, a.y + 0.86 + i * 0.14, deskZ - 0.2, C.darkSteel));
    body.push(part(0.8, 0.05, 0.55, a.x + 1.15, a.y + 0.92 + i * 0.14, deskZ - 0.2, C.paperWhite));
  }

  // Chair behind the desk.
  body.push(tube(0.13, 0.7, a.x - 0.8, a.y + 0.35, deskZ + 1.9, C.steel));
  body.push(part(0.95, 0.13, 0.95, a.x - 0.8, a.y + 0.76, deskZ + 1.9, C.benchBlue));
  body.push(part(0.95, 0.95, 0.13, a.x - 0.8, a.y + 1.25, deskZ + 2.32, C.benchBlue));

  // Filing cabinets and a small safe along the side bulkhead.
  for (let i = 0; i < 3; i++) {
    const z = a.z - 3.4 + i * 1.35;
    body.push(part(1.2, 1.35, 0.7, a.x + width / 2 - 0.75, a.y + 0.67, z, C.steel));
    for (let d = 0; d < 3; d++) {
      body.push(part(1.0, 0.06, 0.06, a.x + width / 2 - 0.75, a.y + 0.35 + d * 0.42, z - 0.36, C.darkSteel));
    }
  }
  body.push(part(0.9, 0.9, 0.8, a.x - width / 2 + 0.8, a.y + 0.45, a.z - 3.2, C.darkSteel));
  body.push(tube(0.14, 0.12, a.x - width / 2 + 0.8, a.y + 0.45, a.z - 3.62, C.steel, [Math.PI / 2, 0, 0]));

  // Notice board with crew lists and a flag-state certificate frame.
  body.push(part(2.6, 1.5, 0.09, a.x - 1.2, a.y + 1.85, a.z - depth / 2 + 0.3, C.cork));
  for (let i = 0; i < 6; i++) {
    body.push(part(0.5, 0.62, 0.04, a.x - 2.1 + (i % 3) * 0.9, a.y + 2.1 - Math.floor(i / 3) * 0.7,
      a.z - depth / 2 + 0.37, C.paperWhite));
  }
  body.push({
    geometry: createFrame(1.1, 1.4, 0.09, 0.08),
    matrix: mat4.fromTranslation(m(), vec3.create(a.x + 1.9, a.y + 1.85, a.z - depth / 2 + 0.33)),
    color: [0.42, 0.32, 0.14],
  });
  body.push(part(0.95, 1.25, 0.03, a.x + 1.9, a.y + 1.85, a.z - depth / 2 + 0.36, C.paperWhite));

  // Deckhead lights.
  for (const dz of [-2.2, 1.8]) {
    emissive.push(part(2.0, 0.09, 0.55, a.x, a.y + height - 0.17, a.z + dz, [1.0, 0.96, 0.90]));
  }

  return { body: merge(body), emissive: merge(emissive) };
}

/* ---------------------------------------------------------------- assembly */

/**
 * Builds all interiors and returns draw batches.
 *
 * Interiors share the vessel's model matrix, so they move with the ship. They
 * are drawn double-sided because the camera sits inside the enclosures and
 * would otherwise see through the back faces of the bulkheads.
 */
export function createInteriors(gl, shipModel) {
  const spaces = {
    bridge: buildBridge(),
    engineRoom: buildEngineRoom(),
    engineControlRoom: buildEngineControlRoom(),
    crewMess: buildCrewMess(),
    cabin: buildCabin(),
    cargoHold: buildCargoHold(),
    shipOffice: buildShipOffice(),
  };

  const batches = [];
  const meshes = [];

  for (const [name, space] of Object.entries(spaces)) {
    const bodyMesh = new Mesh(gl, faceted(space.body));
    const emissiveMesh = new Mesh(gl, faceted(space.emissive));
    meshes.push(bodyMesh, emissiveMesh);

    batches.push({
      name: `${name}:body`,
      space: name,
      mesh: bodyMesh,
      model: shipModel,
      doubleSided: true,
      material: { roughness: 0.7, metallic: 0.12, ambientOcclusion: 0.55, sunlit: 0.05 },
    });

    batches.push({
      name: `${name}:emissive`,
      space: name,
      mesh: emissiveMesh,
      model: shipModel,
      doubleSided: true,
      // Emissive surfaces are the visible fixtures; the actual illumination
      // comes from the point lights defined in journey.js MOODS.
      material: { roughness: 0.4, metallic: 0.0, emissive: 1.35, ambientOcclusion: 0.6, sunlit: 0.05 },
    });
  }

  return {
    batches,
    /** Shows only the requested space (or none), to keep interiors cheap. */
    setVisible(spaceName) {
      for (const batch of batches) batch.hidden = batch.space !== spaceName;
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
    },
  };
}
