/**
 * renderer.js — Owns the GL programs, render targets and the frame graph.
 *
 * Frame graph:
 *   scene HDR target
 *     -> sky (fullscreen, depth off)
 *     -> ocean
 *     -> opaque solids
 *   bright pass -> bloom blur (H, V) at quarter resolution
 *   composite (bloom + exposure + ACES + vignette + grain) -> default framebuffer
 */

import { mat4, vec3, DEG } from '../engine/math.js';
import {
  Program,
  createFramebuffer,
  createDepthTarget,
  createNoiseTexture,
  drawFullscreen,
  FULLSCREEN_VERT,
} from '../engine/gl.js';
import {
  SHADOW_VERT,
  SHADOW_FRAG,
  SHADOW_DEBUG_FRAG,
  SKY_FRAG,
  OCEAN_VERT,
  OCEAN_FRAG,
  SOLID_VERT,
  SOLID_FRAG,
  BRIGHT_FRAG,
  BLUR_FRAG,
  COMPOSITE_FRAG,
} from './shaders.js';

/**
 * Golden-hour environment. Colours are in linear space and are deliberately
 * over-unity for the sun so bloom and the ACES curve have headroom to work with.
 */
export const GOLDEN_HOUR = {
  sunElevation: 11.0,  // degrees above the horizon
  sunAzimuth: 24,      // degrees, rotates the sun around the scene
  sunColor: [1.0, 0.80, 0.58],
  sunIntensity: 1.45,
  zenithColor: [0.035, 0.115, 0.34],
  horizonColor: [1.00, 0.67, 0.43],
  horizonCoolColor: [0.30, 0.40, 0.58],
  cloudColor: [0.52, 0.50, 0.58],
  cloudAmount: 0.6,
  deepColor: [0.004, 0.030, 0.050],
  shallowColor: [0.030, 0.165, 0.205],
  fogColor: [0.50, 0.49, 0.52],
  fogDensity: 0.00011,
  foamAmount: 0.55,
  waveScale: 1.0,
  exposure: 1.02,
  bloomStrength: 0.62,
  bloomThreshold: 1.05,
  vignette: 0.66,
  grain: 0.02,
};

/** Interior lighting preset — dimmer, cooler ambient, almost no fog. */
export const INTERIOR = {
  ...GOLDEN_HOUR,
  fogDensity: 0.0006,
  exposure: 1.05,
  bloomStrength: 0.4,
  vignette: 0.78,
};

const DEFAULT_MATERIAL = {
  roughness: 0.55,
  metallic: 0.1,
  emissive: 0.0,
  ambientOcclusion: 1.0,
  tintColor: [1, 1, 1],
  tintAmount: 0.0,
  waterlineY: -999,
  waterlineAmount: 0.0,
  // 1 = outdoors, ~0 = enclosed (stands in for shadowing).
  sunlit: 1.0,
  map: null,
  // 1 = alpha-blended decal, 2 = opaque texture.
  mapMode: 1,
  opacity: 1.0,
  // Procedural surface detail.
  weather: 0.0,
  panelSize: 0.0,
  corrugation: 0.0,
};

export class Renderer {
  constructor(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;

    this.programs = {
      sky: new Program(gl, FULLSCREEN_VERT, SKY_FRAG, 'sky'),
      ocean: new Program(gl, OCEAN_VERT, OCEAN_FRAG, 'ocean'),
      solid: new Program(gl, SOLID_VERT, SOLID_FRAG, 'solid'),
      bright: new Program(gl, FULLSCREEN_VERT, BRIGHT_FRAG, 'bright'),
      blur: new Program(gl, FULLSCREEN_VERT, BLUR_FRAG, 'blur'),
      composite: new Program(gl, FULLSCREEN_VERT, COMPOSITE_FRAG, 'composite'),
      shadow: new Program(gl, SHADOW_VERT, SHADOW_FRAG, 'shadow'),
      shadowDebug: new Program(gl, FULLSCREEN_VERT, SHADOW_DEBUG_FRAG, 'shadowDebug'),
    };

    this.environment = { ...GOLDEN_HOUR };

    // Shared detail noise for surface weathering and water ripples.
    this.noise = createNoiseTexture(gl, 512, 11);

    // Directional shadow map for the vessel. 2048 is plenty for a single tight
    // orthographic map covering a 300 m hull.
    this.shadowSize = 1024;
    this.shadow = null;
    this.shadowStrength = 0.88;
    // The sun does not move and the hull only rises on a slow swell, so the
    // map is refreshed every few frames instead of every one.
    this.shadowInterval = 4;
    this._shadowTick = 0;
    this._lightView = mat4.create();
    this._lightProjection = mat4.create();
    this._lightViewProjection = mat4.create();
    this._lightEye = vec3.create();
    this._shadowCenter = vec3.create();

    try {
      this.shadow = createDepthTarget(gl, this.shadowSize);
    } catch (error) {
      // Some drivers refuse depth-texture targets. Losing shadows is far better
      // than losing the whole scene.
      console.warn('[renderer] shadow map unavailable', error);
      this.shadowStrength = 0;
    }

    // Reused matrices — the render loop must not allocate.
    this._projection = mat4.create();
    this._view = mat4.create();
    this._viewProjection = mat4.create();
    this._inverseViewProjection = mat4.create();
    this._sunDirection = vec3.create(0, 1, 0);
    this._sunRadiance = vec3.create();
    this._up = vec3.create(0, 1, 0);
    this._oceanOrigin = new Float32Array(2);
    this._shipPosition = new Float32Array(3);
    this._shipExtent = new Float32Array([22.5, 150]);
    this._texelSize = new Float32Array(2);
    this._blurH = new Float32Array([1, 0]);
    this._blurV = new Float32Array([0, 1]);

    // Point-light staging buffers, sized to MAX_LIGHTS in the shader.
    this.maxLights = 6;
    this._lightPositions = new Float32Array(this.maxLights * 3);
    this._lightColors = new Float32Array(this.maxLights * 3);
    this._lightRanges = new Float32Array(this.maxLights);
    this._lightCount = 0;

    // Planar reflection of the vessel in the water. Rendered at half resolution:
    // the result is displaced by wave normals and composited at partial weight,
    // so full resolution would be invisible effort.
    this.reflectionScale = 0.5;
    this.reflectionStrength = 0.85;
    this._reflectionMatrix = mat4.fromScaling(mat4.create(), vec3.create(1, -1, 1));
    this._reflectionView = mat4.create();
    this._reflectionViewProjection = mat4.create();
    this._resolution = new Float32Array(2);

    this.targets = null;
    this.width = 0;
    this.height = 0;
    this.fadeToBlack = 0;
    // Scales sky ambient on solids; dropped when the camera moves inside.
    this.ambientScale = 1;

    this._updateSun();
  }

  /** Recomputes the sun direction and pre-multiplied radiance from the preset. */
  _updateSun() {
    const env = this.environment;
    const elevation = env.sunElevation * DEG;
    const azimuth = env.sunAzimuth * DEG;

    vec3.set(
      this._sunDirection,
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    );
    vec3.normalize(this._sunDirection, this._sunDirection);

    vec3.set(
      this._sunRadiance,
      env.sunColor[0] * env.sunIntensity,
      env.sunColor[1] * env.sunIntensity,
      env.sunColor[2] * env.sunIntensity,
    );
  }

  /** Merges a preset (or partial override) into the active environment. */
  setEnvironment(patch) {
    Object.assign(this.environment, patch);
    this._updateSun();
    return this;
  }

  get sunDirection() {
    return this._sunDirection;
  }

  /**
   * Allocates the render targets. Bloom runs at quarter resolution, which is
   * both faster and gives a wider, softer glow than a full-res blur.
   */
  resize(width, height) {
    const gl = this.gl;
    if (width === this.width && height === this.height && this.targets) return;

    this.width = width;
    this.height = height;

    if (this.targets) {
      this.targets.scene.dispose();
      this.targets.bloomA.dispose();
      this.targets.bloomB.dispose();
      this.targets.reflection.dispose();
    }

    const bloomWidth = Math.max(2, Math.floor(width / 4));
    const bloomHeight = Math.max(2, Math.floor(height / 4));

    this.targets = {
      scene: createFramebuffer(gl, width, height, { depth: true, float: true }),
      bloomA: createFramebuffer(gl, bloomWidth, bloomHeight, { depth: false, float: true }),
      bloomB: createFramebuffer(gl, bloomWidth, bloomHeight, { depth: false, float: true }),
      reflection: createFramebuffer(
        gl,
        Math.max(2, Math.floor(width * this.reflectionScale)),
        Math.max(2, Math.floor(height * this.reflectionScale)),
        { depth: true, float: true },
      ),
    };

    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Uniforms shared by the sky, ocean and solid programs. */
  _environmentUniforms(time) {
    const env = this.environment;
    return {
      uTime: time,
      uSunDirection: this._sunDirection,
      uSunColor: this._sunRadiance,
      uZenithColor: env.zenithColor,
      uHorizonColor: env.horizonColor,
      uHorizonCoolColor: env.horizonCoolColor,
      uCloudColor: env.cloudColor,
      uCloudAmount: env.cloudAmount,
      uFogColor: env.fogColor,
      uFogDensity: env.fogDensity,
      uCameraPosition: this._cameraPosition,
    };
  }

  /**
   * Stages point lights for the next frame.
   * @param {Array} lights [{ position:[x,y,z], color:[r,g,b], range:number }]
   */
  setLights(lights) {
    const count = Math.min(lights ? lights.length : 0, this.maxLights);
    for (let i = 0; i < count; i++) {
      const light = lights[i];
      this._lightPositions[i * 3] = light.position[0];
      this._lightPositions[i * 3 + 1] = light.position[1];
      this._lightPositions[i * 3 + 2] = light.position[2];

      const intensity = light.intensity !== undefined ? light.intensity : 1;
      this._lightColors[i * 3] = light.color[0] * intensity;
      this._lightColors[i * 3 + 1] = light.color[1] * intensity;
      this._lightColors[i * 3 + 2] = light.color[2] * intensity;

      this._lightRanges[i] = light.range;
    }
    this._lightCount = count;
    return this;
  }

  /**
   * Builds the light matrices and renders the shadow map.
   *
   * The orthographic box is fitted around the vessel rather than the camera
   * frustum: the ship is the only meaningful caster, and a tight box gives
   * sharp shadows that a camera-fitted cascade could not match at this size.
   */
  _renderShadowMap(solids, focus, radius) {
    const gl = this.gl;
    if (!this.shadow || this.shadowStrength <= 0) return;

    vec3.copy(this._shadowCenter, focus);

    // Place the light far enough back that the whole vessel is in front of the
    // near plane, including masts and container stacks.
    const distance = radius * 2.2;
    vec3.scaleAndAdd(this._lightEye, this._shadowCenter, this._sunDirection, distance);

    mat4.lookAt(this._lightView, this._lightEye, this._shadowCenter, this._up);
    mat4.ortho(
      this._lightProjection,
      -radius, radius,
      -radius, radius,
      1.0, distance + radius * 2.4,
    );
    mat4.multiply(this._lightViewProjection, this._lightProjection, this._lightView);

    this.shadow.bind();
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Front-face culling during the depth pass moves any remaining acne to
    // surfaces the camera cannot see.
    gl.cullFace(gl.FRONT);

    const program = this.programs.shadow.use();
    program.set('uLightViewProjection', this._lightViewProjection);

    for (const item of solids) {
      if (item.hidden || item.transparent) continue;
      // Interior geometry is enclosed; casting from it only adds acne.
      if (item.noShadow) continue;

      program.set('uModel', item.model);
      program.set('uInstanced', item.instanced ? 1 : 0);
      item.mesh.draw();
    }

    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Renders the vessel mirrored through the water plane.
   *
   * The view matrix is post-multiplied by a scale of (1, -1, 1), which is an
   * exact reflection about y = 0. That flips handedness, so triangle winding
   * inverts and the depth pass must cull front faces instead of back ones.
   *
   * Only the sky is skipped and only exterior geometry is drawn: the target is
   * cleared to zero alpha, so alpha doubles as a mask telling the ocean shader
   * where the hull actually appears and where the sky reflection should show
   * through instead.
   */
  _renderReflection(solids, shared) {
    const gl = this.gl;
    const target = this.targets.reflection;

    mat4.multiply(this._reflectionView, this._view, this._reflectionMatrix);
    mat4.multiply(
      this._reflectionViewProjection, this._projection, this._reflectionView,
    );

    target.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.cullFace(gl.FRONT);

    const program = this.programs.solid.use();
    program.setTexture('uNoise', this.noise, 3);
    if (this.shadow) program.setTexture('uShadowMap', this.shadow.texture, 1);
    program.setAll({
      ...shared,
      ...this._shadowUniforms(),
      uProjection: this._projection,
      uView: this._reflectionView,
      uAmbientScale: 1,
      uLightPosition: this._lightPositions,
      uLightColor: this._lightColors,
      uLightRange: this._lightRanges,
      uLightCount: 0,
      uReflectionStrength: 0,
    });

    for (const item of solids) {
      if (item.hidden || item.transparent) continue;
      // Interior spaces are inside the hull and can never appear in the water.
      if (item.space) continue;

      const material = item.material
        ? { ...DEFAULT_MATERIAL, ...item.material }
        : DEFAULT_MATERIAL;

      program.setAll({
        uModel: item.model,
        uInstanced: item.instanced ? 1 : 0,
        uRoughness: material.roughness,
        uMetallic: material.metallic,
        uEmissive: material.emissive,
        uAmbientOcclusion: material.ambientOcclusion,
        uTintColor: material.tintColor,
        uTintAmount: material.tintAmount,
        uWaterlineY: material.waterlineY,
        uWaterlineAmount: material.waterlineAmount,
        uSunlit: material.sunlit,
        uOpacity: 1,
        uWeather: material.weather,
        uPanelSize: material.panelSize,
        uCorrugation: material.corrugation,
        uUseMap: 0,
      });
      item.mesh.draw();
    }

    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Uniforms every shadow-receiving pass needs. */
  _shadowUniforms() {
    return {
      uLightViewProjection: this._lightViewProjection,
      uShadowStrength: this.shadow ? this.shadowStrength : 0,
      uShadowTexel: 1 / this.shadowSize,
    };
  }

  /**
   * Draws one pass of the solid list, filtered by transparency.
   *
   * Transparent items blend against the depth buffer written by the opaque
   * pass and do not write depth themselves, which is correct for the decals,
   * glass and signage this scene uses.
   */
  _drawSolids(program, solids, transparentPass) {
    const gl = this.gl;
    let blendEnabled = false;

    for (let i = 0; i < solids.length; i++) {
      const item = solids[i];
      if (item.hidden) continue;

      const material = item.material
        ? { ...DEFAULT_MATERIAL, ...item.material }
        : DEFAULT_MATERIAL;

      const isTransparent = !!item.transparent || material.opacity < 1;
      if (isTransparent !== transparentPass) continue;

      if (transparentPass && !blendEnabled) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        blendEnabled = true;
      }

      program.setAll({
        uModel: item.model,
        uInstanced: item.instanced ? 1 : 0,
        uRoughness: material.roughness,
        uMetallic: material.metallic,
        uEmissive: material.emissive,
        uAmbientOcclusion: material.ambientOcclusion,
        uTintColor: material.tintColor,
        uTintAmount: material.tintAmount,
        uWaterlineY: material.waterlineY,
        uWaterlineAmount: material.waterlineAmount,
        uSunlit: material.sunlit,
        uOpacity: material.opacity,
        uWeather: material.weather,
        uPanelSize: material.panelSize,
        uCorrugation: material.corrugation,
        uUseMap: material.map ? material.mapMode : 0,
      });

      if (material.map) program.setTexture('uAlbedoMap', material.map, 2);

      if (item.doubleSided) gl.disable(gl.CULL_FACE);
      item.mesh.draw();
      if (item.doubleSided) gl.enable(gl.CULL_FACE);
    }

    if (blendEnabled) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }

  /**
   * Renders one frame.
   *
   * @param {Object} frame
   * @param {Object} frame.camera { position, target, fov, near, far }
   * @param {number} frame.time seconds
   * @param {Object} [frame.ocean] result of createOcean()
   * @param {Array}  [frame.solids] [{ mesh, model, material, instanced }]
   * @param {Object} [frame.hullShadow] { x, z, radiusX, radiusZ, strength }
   */
  render(frame) {
    const gl = this.gl;
    const env = this.environment;
    const { camera, time } = frame;

    if (!this.targets) return;

    // ---------------------------------------------------------- camera setup
    const aspect = this.width / Math.max(this.height, 1);
    mat4.perspective(
      this._projection,
      (camera.fov || 45) * DEG,
      aspect,
      camera.near || 0.35,
      camera.far || 12000,
    );
    mat4.lookAt(this._view, camera.position, camera.target, camera.up || this._up);
    mat4.multiply(this._viewProjection, this._projection, this._view);
    mat4.invert(this._inverseViewProjection, this._viewProjection);

    this._cameraPosition = camera.position;
    this._resolution[0] = this.width;
    this._resolution[1] = this.height;
    const shared = this._environmentUniforms(time);

    // ----------------------------------------------------------- shadow pass
    if (frame.solids && frame.solids.length && frame.shadowFocus) {
      const due = (this._shadowTick % this.shadowInterval) === 0;
      this._shadowTick++;
      if (due) {
        this._renderShadowMap(
          frame.solids,
          frame.shadowFocus,
          frame.shadowRadius || 200,
        );
      }
    }

    // ------------------------------------------------------- reflection pass
    // Only worth doing when water is actually on screen.
    const wantsReflection =
      frame.ocean && frame.showOcean !== false &&
      frame.solids && frame.solids.length && this.reflectionStrength > 0;

    if (wantsReflection) this._renderReflection(frame.solids, shared);

    // ------------------------------------------------------------ scene pass
    this.targets.scene.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky fills every pixel, so it writes colour but not depth.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.programs.sky.use().setAll({
      ...shared,
      uInverseViewProjection: this._inverseViewProjection,
    });
    drawFullscreen(gl);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    // ---------------------------------------------------------------- ocean
    if (frame.ocean && frame.showOcean !== false) {
      // Vessel frame for the wake and contact shadow.
      const vessel = frame.vessel;
      if (vessel) {
        this._shipPosition[0] = vessel.position ? vessel.position[0] : 0;
        this._shipPosition[1] = vessel.position ? vessel.position[1] : 0;
        this._shipPosition[2] = vessel.position ? vessel.position[2] : 0;
        this._shipExtent[0] = vessel.halfBeam;
        this._shipExtent[1] = vessel.halfLength;
      }

      // The disc is re-centred on the camera so the water never runs out.
      this._oceanOrigin[0] = camera.position[0];
      this._oceanOrigin[1] = camera.position[2];

      const program = this.programs.ocean.use();
      if (this.shadow) program.setTexture('uShadowMap', this.shadow.texture, 1);
      program.setAll({
        ...shared,
        ...this._shadowUniforms(),
        uProjection: this._projection,
        uView: this._view,
        uOceanOrigin: this._oceanOrigin,
        uWaveA: frame.ocean.uniforms.uWaveA,
        uWaveB: frame.ocean.uniforms.uWaveB,
        uWaveScale: env.waveScale,
        uShallowColor: env.shallowColor,
        uDeepColor: env.deepColor,
        uFoamAmount: env.foamAmount,
        uShipPosition: this._shipPosition,
        uShipHeading: vessel ? (vessel.heading || 0) : 0,
        uShipExtent: this._shipExtent,
        uShipShadow: vessel ? (vessel.shadow !== undefined ? vessel.shadow : 0.9) : 0,
        uShipWake: vessel ? (vessel.wake !== undefined ? vessel.wake : 1) : 0,
        uResolution: this._resolution,
        uReflectionStrength: wantsReflection ? this.reflectionStrength : 0,
      });
      program.setTexture('uNoise', frame.ocean.noise, 0);
      program.setTexture('uReflection', this.targets.reflection.color, 2);

      // Steep crests can present back faces; drawing both sides avoids holes.
      gl.disable(gl.CULL_FACE);
      frame.ocean.mesh.draw();
      gl.enable(gl.CULL_FACE);
    }

    // --------------------------------------------------------------- solids
    const solids = frame.solids;
    if (solids && solids.length) {
      const program = this.programs.solid.use();
      program.setTexture('uNoise', this.noise, 3);
      if (this.shadow) program.setTexture('uShadowMap', this.shadow.texture, 1);
      program.setAll({
        ...shared,
        ...this._shadowUniforms(),
        uProjection: this._projection,
        uView: this._view,
        uAmbientScale: this.ambientScale,
        uReflectionStrength: 0,
        uLightPosition: this._lightPositions,
        uLightColor: this._lightColors,
        uLightRange: this._lightRanges,
        uLightCount: this._lightCount,
      });

      // Opaque geometry first, then anything transparent, so decals and glass
      // blend against a complete depth buffer.
      this._drawSolids(program, solids, false);
      this._drawSolids(program, solids, true);
    }

    // ------------------------------------------------------------ bloom chain
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    const { scene, bloomA, bloomB } = this.targets;

    bloomA.bind();
    this.programs.bright.use()
      .setTexture('uScene', scene.color, 0)
      .setAll({ uThreshold: env.bloomThreshold, uKnee: 0.6 });
    drawFullscreen(gl);

    this._texelSize[0] = 1 / bloomA.width;
    this._texelSize[1] = 1 / bloomA.height;

    bloomB.bind();
    this.programs.blur.use()
      .setTexture('uSource', bloomA.color, 0)
      .setAll({ uTexelSize: this._texelSize, uDirection: this._blurH });
    drawFullscreen(gl);

    bloomA.bind();
    this.programs.blur.use()
      .setTexture('uSource', bloomB.color, 0)
      .setAll({ uTexelSize: this._texelSize, uDirection: this._blurV });
    drawFullscreen(gl);

    // -------------------------------------------------------------- composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);

    // Development aid: draw the raw shadow map instead of the scene.
    if (this.debugShadowMap && this.shadow) {
      this.programs.shadowDebug.use().setTexture('uShadowMap', this.shadow.texture, 0);
      drawFullscreen(gl);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      return;
    }

    this.programs.composite.use()
      .setTexture('uScene', scene.color, 0)
      .setTexture('uBloom', bloomA.color, 1)
      .setAll({
        uBloomStrength: env.bloomStrength,
        uExposure: env.exposure,
        uVignette: env.vignette,
        uGrain: env.grain,
        uTime: time,
        uFadeToBlack: this.fadeToBlack,
      });
    drawFullscreen(gl);

    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  dispose() {
    this.gl.deleteTexture(this.noise.handle);
    if (this.shadow) this.shadow.dispose();
    for (const key in this.programs) this.programs[key].dispose();
    if (this.targets) {
      this.targets.scene.dispose();
      this.targets.bloomA.dispose();
      this.targets.bloomB.dispose();
      this.targets.reflection.dispose();
    }
  }
}
