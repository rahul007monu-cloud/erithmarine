/**
 * ocean.js — Ocean surface data and CPU-side wave sampling.
 *
 * The wave definitions here are the single source of truth: they are uploaded
 * to the GPU as uniforms AND evaluated on the CPU by `sampleOcean()`. Both use
 * the identical Gerstner formulation, so anything floated with the CPU sampler
 * sits exactly on the surface the GPU rasterises.
 *
 * World units are metres. The vessel is roughly 300 m long.
 */

import { createRadialPlane } from '../engine/geometry.js';
import { Mesh, createNoiseTexture } from '../engine/gl.js';
import { WAVE_COUNT } from './shaders.js';
import { TAU } from '../engine/math.js';

/**
 * Deep-water gravity wave train. Wavelengths descend geometrically and each
 * component travels at its physical phase velocity c = sqrt(gL / 2π), which is
 * what makes the surface read as real open ocean rather than scrolling noise.
 *
 * Amplitudes sum to ~2.9 m — a moderate sea state that suits a large vessel.
 */
const GRAVITY = 9.81;

function makeWave(directionDegrees, amplitude, wavelength, steepness) {
  const radians = directionDegrees * (Math.PI / 180);
  return {
    dirX: Math.cos(radians),
    dirZ: Math.sin(radians),
    amplitude,
    wavelength,
    // Physical deep-water phase velocity.
    speed: Math.sqrt((GRAVITY * wavelength) / TAU),
    steepness,
  };
}

// Dominant swell from roughly -20°, with shorter components fanned around it.
export const WAVES = [
  makeWave(-20, 1.05, 145, 0.62),
  makeWave(12, 0.72, 88, 0.58),
  makeWave(-46, 0.46, 54, 0.52),
  makeWave(38, 0.30, 31, 0.46),
  makeWave(-72, 0.19, 18, 0.40),
  makeWave(74, 0.12, 10.5, 0.34),
];

if (WAVES.length !== WAVE_COUNT) {
  throw new Error(
    `ocean.js: WAVES has ${WAVES.length} entries but shaders expect ${WAVE_COUNT}`,
  );
}

/** Packs the wave train into the uniform layout the shaders declare. */
export function waveUniforms() {
  const a = new Float32Array(WAVE_COUNT * 4);
  const b = new Float32Array(WAVE_COUNT * 2);

  WAVES.forEach((wave, i) => {
    a[i * 4] = wave.dirX;
    a[i * 4 + 1] = wave.dirZ;
    a[i * 4 + 2] = wave.amplitude;
    a[i * 4 + 3] = wave.wavelength;
    b[i * 2] = wave.speed;
    b[i * 2 + 1] = wave.steepness;
  });

  return { uWaveA: a, uWaveB: b };
}

/** Total amplitude, used to normalise crest height into a 0..1 foam factor. */
export const AMPLITUDE_SUM = WAVES.reduce((sum, w) => sum + w.amplitude, 0);

/**
 * Evaluates the wave train on the CPU.
 *
 * Mirrors the `gerstner()` function in shaders.js exactly. Returns the
 * displaced surface point plus its normal, so callers can both sit an object
 * on the water and align it to the local slope.
 *
 * @param {number} x world X of the *undisplaced* sample point
 * @param {number} z world Z of the *undisplaced* sample point
 * @param {number} time seconds
 * @param {number} waveScale matches the uWaveScale uniform
 * @param {Object} [out] optional target to avoid allocation
 */
export function sampleOcean(x, z, time, waveScale = 1, out = null) {
  const result = out || {
    x: 0, y: 0, z: 0,
    normalX: 0, normalY: 1, normalZ: 0,
  };

  let dispX = 0;
  let dispY = 0;
  let dispZ = 0;

  let tangentX = 1, tangentY = 0, tangentZ = 0;
  let binormalX = 0, binormalY = 0, binormalZ = 1;

  for (let i = 0; i < WAVES.length; i++) {
    const wave = WAVES[i];
    const dirX = wave.dirX;
    const dirZ = wave.dirZ;
    const amplitude = wave.amplitude * waveScale;
    const k = TAU / wave.wavelength;
    const q = wave.steepness / Math.max(k * amplitude * WAVES.length, 1e-4);

    const phase = k * (dirX * x + dirZ * z) - wave.speed * k * time;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const ka = k * amplitude;

    dispX += q * amplitude * dirX * c;
    dispZ += q * amplitude * dirZ * c;
    dispY += amplitude * s;

    tangentX += -q * dirX * dirX * ka * s;
    tangentY += dirX * ka * c;
    tangentZ += -q * dirX * dirZ * ka * s;

    binormalX += -q * dirX * dirZ * ka * s;
    binormalY += dirZ * ka * c;
    binormalZ += -q * dirZ * dirZ * ka * s;
  }

  result.x = x + dispX;
  result.y = dispY;
  result.z = z + dispZ;

  // normal = cross(binormal, tangent)
  let nx = binormalY * tangentZ - binormalZ * tangentY;
  let ny = binormalZ * tangentX - binormalX * tangentZ;
  let nz = binormalX * tangentY - binormalY * tangentX;
  const length = Math.hypot(nx, ny, nz) || 1;

  result.normalX = nx / length;
  result.normalY = ny / length;
  result.normalZ = nz / length;

  return result;
}

const _heightScratch = {
  x: 0, y: 0, z: 0, normalX: 0, normalY: 1, normalZ: 0,
};

/** Convenience: just the surface height at a point. Allocation-free. */
export function oceanHeight(x, z, time, waveScale = 1) {
  return sampleOcean(x, z, time, waveScale, _heightScratch).y;
}

/**
 * Builds the ocean surface mesh.
 *
 * A radial disc keeps vertex density high near the camera and sparse toward the
 * horizon. The mesh is authored around the origin and re-centred on the camera
 * each frame via the `uOceanOrigin` uniform, so the water is effectively
 * infinite without ever rebuilding geometry.
 */
export function createOcean(gl, options = {}) {
  const {
    radius = 6000,
    radialSegments = 160,
    ringSegments = 120,
    falloff = 2.0,
    noiseSize = 512,
  } = options;

  const geometry = createRadialPlane(radius, radialSegments, ringSegments, falloff);
  const mesh = new Mesh(gl, { positions: geometry.positions, indices: geometry.indices });
  const noise = createNoiseTexture(gl, noiseSize, 7);

  return {
    mesh,
    noise,
    radius,
    vertexCount: geometry.positions.length / 3,
    uniforms: waveUniforms(),
    dispose() {
      mesh.dispose();
      gl.deleteTexture(noise.handle);
    },
  };
}
