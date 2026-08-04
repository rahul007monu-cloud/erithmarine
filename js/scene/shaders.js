/**
 * shaders.js — All GLSL ES 3.0 source for the scene.
 *
 * Organised as reusable chunks that get concatenated into complete programs.
 * The sky function is shared verbatim between the sky pass and the ocean pass,
 * which is what makes the water reflections agree with the actual sky.
 */

export const WAVE_COUNT = 6;

/* ------------------------------------------------------------------ chunks */

/** Constants, hashing, value noise, fbm, tonemapping, fresnel. */
const COMMON = /* glsl */ `
#define PI   3.141592653589793
#define TAU  6.283185307179586

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3  saturate3(vec3 x) { return clamp(x, 0.0, 1.0); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/** Smooth value noise in 2D. */
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Fractal brownian motion — 5 octaves, rotated each step to hide the lattice. */
float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  const mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    total += noise2(p) * amplitude;
    p = rot * p * 2.02;
    amplitude *= 0.5;
  }
  return total;
}

/** Schlick approximation of the Fresnel term. */
float fresnelSchlick(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - saturate(cosTheta), 5.0);
}

/** ACES filmic tonemap (Narkowicz fit) — gives the image its cinematic roll-off. */
vec3 tonemapACES(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return saturate3((x * (a * x + b)) / (x * (c * x + d) + e));
}

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}
`;

/**
 * Per-frame uniforms shared by several chunks. Included exactly once per
 * program, ahead of any chunk that needs them.
 */
const FRAME = /* glsl */ `
uniform float uTime;
uniform vec3  uCameraPosition;
`;

/**
 * Atmosphere. `skyColor()` is evaluated for camera rays in the sky pass and for
 * reflected rays in the ocean pass, so both stay physically consistent.
 * Requires: COMMON, FRAME.
 */
const SKY = /* glsl */ `
uniform vec3  uSunDirection;
uniform vec3  uSunColor;
uniform vec3  uZenithColor;
// The horizon is warm only where it faces the sun and cool everywhere else —
// this azimuthal split is what stops the whole sky washing out to pale peach.
uniform vec3  uHorizonColor;
uniform vec3  uHorizonCoolColor;
uniform vec3  uCloudColor;

/** Layered cloud deck sampled by ray-marching a single plane. Cheap, reads well. */
float cloudDensity(vec3 dir) {
  if (dir.y < 0.015) return 0.0;

  const float CLOUD_HEIGHT = 1400.0;
  float travel = (CLOUD_HEIGHT - uCameraPosition.y) / max(dir.y, 0.015);
  if (travel <= 0.0) return 0.0;

  vec2 p = (uCameraPosition.xz + dir.xz * travel) * 0.00055;
  p += vec2(uTime * 0.0035, uTime * 0.0012);

  float base = fbm(p);
  float detail = fbm(p * 3.1 + 4.7);
  float density = base * 0.75 + detail * 0.25;

  // Fade clouds out toward the horizon so the deck reads as a flat ceiling.
  float horizonFade = smoothstep(0.015, 0.30, dir.y);
  return smoothstep(0.48, 0.78, density) * horizonFade;
}

vec3 skyColor(vec3 dir, float cloudAmount) {
  vec3 d = normalize(dir);

  // Vertical gradient. Rays below the horizon reuse the mirrored gradient so
  // reflections off wave backsides stay plausible instead of going black.
  float h = d.y;
  float grad = pow(1.0 - saturate(abs(h)), 5.0);

  // Blend the warm and cool horizon tints by how far this ray points toward the
  // sun in plan view, ignoring elevation.
  vec2 dirFlat = normalize(vec2(d.x, d.z) + 1e-5);
  vec2 sunFlat = normalize(vec2(uSunDirection.x, uSunDirection.z) + 1e-5);
  float towardSun = pow(saturate(dot(dirFlat, sunFlat) * 0.5 + 0.5), 2.4);
  vec3 horizon = mix(uHorizonCoolColor, uHorizonColor, towardSun);

  vec3 col = mix(uZenithColor, horizon, grad);

  float cosSun = dot(d, uSunDirection);

  // Broad atmospheric halo, then the tight forward-scatter glow.
  col += uSunColor * pow(saturate(cosSun), 9.0) * 0.11;
  col += uSunColor * pow(saturate(cosSun), 64.0) * 0.55;
  col += uSunColor * pow(saturate(cosSun), 900.0) * 3.0;

  // Below-horizon rays are dimmer (they see water-scattered light, not sky).
  col *= mix(0.42, 1.0, smoothstep(-0.25, 0.05, h));

  if (cloudAmount > 0.0) {
    float density = cloudDensity(d);
    // Clouds pick up warm rim light when they sit near the sun.
    vec3 lit = mix(uCloudColor, uSunColor * 1.15, pow(saturate(cosSun), 3.0) * 0.55);
    col = mix(col, lit, density * cloudAmount);
  }
  return col;
}
`;

/**
 * Gerstner wave displacement with analytic tangents.
 * Mirrored exactly by sampleOcean() in ocean.js so the ship floats on the
 * same surface the GPU draws.
 */
const GERSTNER = /* glsl */ `
#define WAVE_COUNT ${WAVE_COUNT}

// xy = direction, z = amplitude, w = wavelength
uniform vec4 uWaveA[WAVE_COUNT];
// x = speed, y = steepness
uniform vec2 uWaveB[WAVE_COUNT];
uniform float uWaveScale;

vec3 gerstner(vec2 pos, float time, out vec3 tangent, out vec3 binormal) {
  vec3 displacement = vec3(0.0);
  tangent  = vec3(1.0, 0.0, 0.0);
  binormal = vec3(0.0, 0.0, 1.0);

  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2  dir       = normalize(uWaveA[i].xy);
    float amplitude = uWaveA[i].z * uWaveScale;
    float wavelength = uWaveA[i].w;
    float speed     = uWaveB[i].x;
    float steepness = uWaveB[i].y;

    float k = TAU / wavelength;
    float q = steepness / max(k * amplitude * float(WAVE_COUNT), 1e-4);
    float phase = k * dot(dir, pos) - speed * k * time;

    float c = cos(phase);
    float s = sin(phase);
    float ka = k * amplitude;

    displacement.x += q * amplitude * dir.x * c;
    displacement.z += q * amplitude * dir.y * c;
    displacement.y += amplitude * s;

    tangent  += vec3(-q * dir.x * dir.x * ka * s,
                      dir.x * ka * c,
                     -q * dir.x * dir.y * ka * s);
    binormal += vec3(-q * dir.x * dir.y * ka * s,
                      dir.y * ka * c,
                     -q * dir.y * dir.y * ka * s);
  }
  return displacement;
}
`;

/** Distance fog toward the horizon colour, shared by ocean and solids. */
const FOG = /* glsl */ `
uniform float uFogDensity;
uniform vec3  uFogColor;

vec3 applyFog(vec3 color, float distance, vec3 viewDir) {
  float amount = 1.0 - exp(-distance * uFogDensity);
  // Fog near the sun scatters warm light forward.
  float sunAmount = pow(saturate(dot(viewDir, uSunDirection)), 6.0);
  vec3 fog = mix(uFogColor, uSunColor, sunAmount * 0.5);
  return mix(color, fog, saturate(amount));
}
`;

/* ------------------------------------------------------------------ sky pass */

export const SKY_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;

uniform mat4  uInverseViewProjection;
uniform float uCloudAmount;

out vec4 outColor;

${COMMON}
${FRAME}
${SKY}

void main() {
  // Reconstruct the world-space ray for this pixel from the inverse VP matrix.
  vec4 clip = vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec4 world = uInverseViewProjection * clip;
  vec3 dir = normalize(world.xyz / world.w - uCameraPosition);

  vec3 col = skyColor(dir, uCloudAmount);

  // Sun disc, drawn only for camera rays.
  float cosSun = dot(dir, uSunDirection);
  float disc = smoothstep(0.99975, 0.99992, cosSun);
  col += uSunColor * disc * 12.0;

  outColor = vec4(col, 1.0);
}`;

/* ---------------------------------------------------------------- ocean pass */

export const OCEAN_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4  uProjection;
uniform mat4  uView;
uniform vec2  uOceanOrigin;

out vec3 vWorldPosition;
out vec3 vNormal;
out float vCrest;

${COMMON}
${FRAME}
${GERSTNER}

void main() {
  // The ocean disc is re-centred on the camera every frame, so the mesh is
  // authored around the origin and offset here.
  vec2 planar = aPosition.xz + uOceanOrigin;

  vec3 tangent, binormal;
  vec3 displacement = gerstner(planar, uTime, tangent, binormal);

  vec3 world = vec3(planar.x + displacement.x,
                    displacement.y,
                    planar.y + displacement.z);

  vNormal = normalize(cross(binormal, tangent));
  vWorldPosition = world;

  // Normalised crest height drives foam in the fragment stage.
  float amplitudeSum = 0.0;
  for (int i = 0; i < WAVE_COUNT; i++) amplitudeSum += uWaveA[i].z * uWaveScale;
  vCrest = saturate(displacement.y / max(amplitudeSum * 0.95, 1e-3));

  gl_Position = uProjection * uView * vec4(world, 1.0);
}`;

export const OCEAN_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in float vCrest;

uniform vec3  uShallowColor;
uniform vec3  uDeepColor;
uniform float uCloudAmount;
uniform sampler2D uNoise;
uniform float uFoamAmount;
// Vessel frame, used for both the hull's contact shadow and its wake.
uniform vec3  uShipPosition;
uniform float uShipHeading;   // radians, 0 = bow toward +Z
uniform vec2  uShipExtent;    // half-beam, half-length
uniform float uShipShadow;    // 0..1
uniform float uShipWake;      // 0..1

out vec4 outColor;

${COMMON}
${FRAME}
${SKY}
${FOG}

/** Small-scale ripple normal, layered on top of the Gerstner normal. */
vec3 detailNormal(vec2 p, float fade) {
  vec2 uv1 = p * 0.055 + vec2(uTime * 0.021, uTime * -0.013);
  vec2 uv2 = p * 0.017 + vec2(uTime * -0.009, uTime * 0.006);

  float h1 = texture(uNoise, uv1).r;
  float h2 = texture(uNoise, uv2).r;

  // Finite differences on the noise texture give a usable bump normal.
  float e = 0.0035;
  float dx = texture(uNoise, uv1 + vec2(e, 0.0)).r - h1
           + (texture(uNoise, uv2 + vec2(e, 0.0)).r - h2) * 0.6;
  float dz = texture(uNoise, uv1 + vec2(0.0, e)).r - h1
           + (texture(uNoise, uv2 + vec2(0.0, e)).r - h2) * 0.6;

  return normalize(vec3(-dx * fade * 34.0, 1.0, -dz * fade * 34.0));
}

void main() {
  vec3 viewVector = uCameraPosition - vWorldPosition;
  float distance = length(viewVector);
  vec3 viewDir = viewVector / max(distance, 1e-4);

  // Ripple detail fades with distance to stop it aliasing into noise.
  float detailFade = exp(-distance * 0.0016);
  vec3 bump = detailNormal(vWorldPosition.xz, detailFade);

  vec3 n = normalize(vNormal);
  // Perturb the wave normal by the ripple normal in tangent space.
  n = normalize(vec3(n.x + bump.x * 0.55, n.y, n.z + bump.z * 0.55));

  vec3 reflectDir = reflect(-viewDir, n);
  reflectDir.y = abs(reflectDir.y) * 0.92 + 0.02;

  vec3 skyReflection = skyColor(reflectDir, uCloudAmount);

  // Water body colour: deep where we look straight down, brighter at grazing
  // angles, with a touch of forward scattering through wave crests.
  float facing = saturate(dot(n, viewDir));
  vec3 body = mix(uDeepColor, uShallowColor, pow(1.0 - facing, 1.6));

  float scatter = pow(vCrest, 2.2) * saturate(dot(uSunDirection, -viewDir) * 0.5 + 0.5);
  body += uShallowColor * scatter * 0.55;

  float fresnel = fresnelSchlick(facing, 0.021);
  vec3 col = mix(body, skyReflection, fresnel * 0.94);

  // Specular sun glitter.
  vec3 halfVector = normalize(uSunDirection + viewDir);
  float specular = pow(saturate(dot(n, halfVector)), 900.0);
  float sparkle = texture(uNoise, vWorldPosition.xz * 0.09 + uTime * 0.03).r;
  col += uSunColor * specular * 5.5;
  col += uSunColor * pow(saturate(dot(n, halfVector)), 90.0) * sparkle * detailFade * 0.9;

  // Foam on the steepest crests, broken up by noise so it never looks banded.
  float foamNoise = texture(uNoise, vWorldPosition.xz * 0.028 + uTime * 0.012).r
                  * 0.6
                  + texture(uNoise, vWorldPosition.xz * 0.11 - uTime * 0.02).r * 0.4;
  float foam = smoothstep(0.74, 1.04, vCrest * (0.42 + foamNoise * 1.15)) * uFoamAmount;

  // ------------------------------------------------------------------ wake
  // Everything below is evaluated in the vessel's own frame, so the wake stays
  // attached to the hull regardless of heading.
  vec2 rel = vWorldPosition.xz - uShipPosition.xz;
  float ch = cos(uShipHeading);
  float sh = sin(uShipHeading);
  vec2 local = vec2(rel.x * ch - rel.y * sh,   // athwartships
                    rel.x * sh + rel.y * ch);  // along the hull, +Z forward

  float halfBeam = uShipExtent.x;
  float halfLength = uShipExtent.y;
  float absX = abs(local.x);
  float astern = halfLength - local.y;         // 0 at the bow, grows aft

  // Crest foam is composited first; the wake is a separate, weaker layer so it
  // can never saturate to a solid white band the way additive foam did.
  col = mix(col, vec3(0.86, 0.90, 0.93), saturate(foam) * 0.78);

  if (uShipWake > 0.001) {
    // Turbulent, aerated trail directly behind the hull.
    float trailWidth = halfBeam * 1.05 + max(astern - halfLength * 2.0, 0.0) * 0.075;
    float trail = (1.0 - smoothstep(trailWidth * 0.45, trailWidth, absX))
                * smoothstep(0.0, 60.0, astern - halfLength * 1.85)
                * exp(-max(astern - halfLength * 2.2, 0.0) / 260.0);

    // Kelvin arms diverging at roughly 19.5 degrees from the bow.
    float spread = halfBeam * 0.85 + astern * 0.354;
    float arm = abs(absX - spread);
    float arms = exp(-arm * arm / 55.0)
               * smoothstep(0.0, 50.0, astern)
               * exp(-astern / 150.0);

    // Breaking water at the stem itself.
    float bow = exp(-dot(vec2(local.x, local.y - halfLength * 0.94),
                         vec2(local.x, local.y - halfLength * 0.94)) / 900.0);

    // Drifting noise breaks the wake into aerated patches. Multiplying (rather
    // than adding) means low-noise areas stay clear water.
    float wakeNoise = texture(uNoise, vWorldPosition.xz * 0.045 + uTime * 0.02).r * 0.55
                    + texture(uNoise, vWorldPosition.xz * 0.17 - uTime * 0.045).r * 0.45;

    float wake = trail * 0.55 + arms * 0.18 + bow * 0.7;
    wake *= 0.35 + wakeNoise * 0.85;
    // Global envelope so the wake cannot stretch to the horizon.
    wake *= exp(-astern / 520.0);
    wake = saturate(wake) * uShipWake;

    col = mix(col, vec3(0.88, 0.92, 0.94), wake * 0.6);
    // Churned water also scatters more light from below.
    col += uShallowColor * wake * 0.35;
  }

  // Analytic contact shadow under the hull — far cheaper than a shadow map and
  // enough to visually seat the vessel in the water.
  if (uShipShadow > 0.001) {
    vec2 d = vec2(local.x / halfBeam, local.y / halfLength);
    float inside = 1.0 - smoothstep(0.55, 1.1, length(d));
    col *= mix(1.0, 0.32, inside * uShipShadow);
  }

  col = applyFog(col, distance, -viewDir);
  outColor = vec4(col, 1.0);
}`;

/* --------------------------------------------------------------- solid pass */

/**
 * Vertex shader for all opaque geometry (hull, superstructure, containers,
 * interiors). Supports both single-transform and instanced draws.
 */
export const SOLID_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec3 aColor;
layout(location = 4) in mat4 aInstanceMatrix;
layout(location = 8) in vec3 aInstanceColor;

uniform mat4  uProjection;
uniform mat4  uView;
uniform mat4  uModel;
uniform float uInstanced;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vColor;

void main() {
  mat4 model = (uInstanced > 0.5) ? aInstanceMatrix : uModel;

  vec4 world = model * vec4(aPosition, 1.0);
  vWorldPosition = world.xyz;

  // Uniform-scale assumption holds for every object here, so the upper 3x3 is
  // adequate for normals and avoids uploading a separate normal matrix.
  vNormal = normalize(mat3(model) * aNormal);

  vUV = aUV;
  vColor = (uInstanced > 0.5) ? aInstanceColor : aColor;

  gl_Position = uProjection * uView * world;
}`;

export const SOLID_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vColor;

uniform float uRoughness;
uniform float uMetallic;
uniform float uEmissive;
uniform float uCloudAmount;
uniform float uAmbientOcclusion;
uniform vec3  uTintColor;
uniform float uTintAmount;
// Optional albedo map, used for hull lettering, deck signage and interior
// posters. Text is rasterised to a canvas at runtime, so no image assets ship.
uniform sampler2D uAlbedoMap;
uniform float uUseMap;
uniform float uOpacity;
// Waterline darkening: hull below this world Y gets wet/dark treatment.
uniform float uWaterlineY;
uniform float uWaterlineAmount;

out vec4 outColor;

${COMMON}
${FRAME}
${SKY}
${FOG}

void main() {
  vec3 albedo = mix(vColor, uTintColor, uTintAmount);
  float alpha = uOpacity;

  // uUseMap: 0 = untextured, 1 = alpha-blended decal, 2 = opaque texture.
  if (uUseMap > 0.5) {
    vec4 sampled = texture(uAlbedoMap, vUV);
    albedo = mix(albedo, sampled.rgb, sampled.a);
    if (uUseMap < 1.5) alpha *= sampled.a;
  }

  vec3 viewVector = uCameraPosition - vWorldPosition;
  float distance = length(viewVector);
  vec3 viewDir = viewVector / max(distance, 1e-4);

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;

  // Hemispheric ambient sampled from the actual sky, which keeps every surface
  // colour-matched to the environment.
  vec3 skyUp = skyColor(vec3(0.0, 1.0, 0.0), 0.0);
  vec3 skySide = skyColor(normalize(vec3(n.x, 0.12, n.z)), 0.0);
  // Sky fill is the only thing that keeps cool paint reading cool under a
  // warm sun; too little of it and every blue surface turns grey.
  vec3 ambient = mix(skySide, skyUp, saturate(n.y * 0.5 + 0.5)) * 0.85;

  // Sun with a soft wrap so shadowed sides never go fully black.
  float ndl = dot(n, uSunDirection);
  float wrapped = saturate((ndl + 0.28) / 1.28);
  vec3 direct = uSunColor * wrapped;

  // Blinn-Phong specular standing in for GGX — visually close at far less cost.
  vec3 halfVector = normalize(uSunDirection + viewDir);
  float gloss = mix(6.0, 340.0, 1.0 - uRoughness);
  float specular = pow(saturate(dot(n, halfVector)), gloss)
                 * mix(0.05, 1.0, 1.0 - uRoughness);

  float f0 = mix(0.04, 0.9, uMetallic);
  float fresnel = fresnelSchlick(saturate(dot(n, viewDir)), f0);

  vec3 diffuse = albedo * (ambient * uAmbientOcclusion + direct * 0.85);
  vec3 spec = mix(uSunColor, uSunColor * albedo, uMetallic)
            * specular * (0.35 + fresnel * 2.2);

  // Sky reflection on glossy metal (rails, glass, painted steel).
  vec3 reflectDir = reflect(-viewDir, n);
  vec3 envReflection = skyColor(reflectDir, uCloudAmount);
  vec3 col = diffuse + spec + envReflection * fresnel * (1.0 - uRoughness) * 0.6;

  // Wet, darker plating below the waterline.
  if (uWaterlineAmount > 0.001) {
    float wet = 1.0 - smoothstep(uWaterlineY - 0.6, uWaterlineY + 1.4, vWorldPosition.y);
    col *= mix(1.0, 0.55, wet * uWaterlineAmount);
  }

  col += albedo * uEmissive;
  col = applyFog(col, distance, -viewDir);

  outColor = vec4(col, alpha);
}`;

/* ----------------------------------------------------------------- post pass */

/** Bright-pass extraction feeding the bloom blur chain. */
export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;
out vec4 outColor;

${COMMON}

void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee so highlights ramp into bloom instead of popping.
  float contribution = max(0.0, luminance - uThreshold);
  contribution = contribution * contribution / (uKnee + contribution);
  outColor = vec4(c * (contribution / max(luminance, 1e-4)), 1.0);
}`;

/** Separable Gaussian blur; `uDirection` selects the axis. */
export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
out vec4 outColor;

void main() {
  // 9-tap Gaussian collapsed into 5 bilinear samples.
  const float offsets[3] = float[3](0.0, 1.3846153846, 3.2307692308);
  const float weights[3] = float[3](0.2270270270, 0.3162162162, 0.0702702703);

  vec2 step = uDirection * uTexelSize;
  vec3 result = texture(uSource, vUV).rgb * weights[0];
  for (int i = 1; i < 3; i++) {
    result += texture(uSource, vUV + step * offsets[i]).rgb * weights[i];
    result += texture(uSource, vUV - step * offsets[i]).rgb * weights[i];
  }
  outColor = vec4(result, 1.0);
}`;

/** Final composite: bloom, exposure, ACES, vignette, grain, sRGB. */
export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uFadeToBlack;

out vec4 outColor;

${COMMON}

void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;

  vec3 col = scene + bloom * uBloomStrength;
  col *= uExposure;
  col = tonemapACES(col);

  // Vignette.
  vec2 centered = vUV - 0.5;
  float radius = length(centered * vec2(1.0, 1.12));
  col *= mix(1.0, smoothstep(0.86, 0.28, radius), uVignette);

  // Animated film grain, weighted toward the shadows.
  float grain = hash12(vUV * 1024.0 + fract(uTime) * 91.7) - 0.5;
  col += grain * uGrain * (1.0 - dot(col, vec3(0.33)) * 0.7);

  col = linearToSRGB(saturate3(col));
  col *= (1.0 - uFadeToBlack);

  outColor = vec4(col, 1.0);
}`;
