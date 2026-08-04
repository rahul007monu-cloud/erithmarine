/**
 * journey.js — The scroll-driven camera voyage.
 *
 * The site is one continuous shot. Scroll position drives a camera that starts
 * far out at sea, closes on the vessel, boards it, and then moves through the
 * bridge, engine room and cargo hold before returning to the deck.
 *
 * Each STOP owns:
 *   - a camera position and look-at target, in world space
 *   - the DOM section that should be legible while the camera is there
 *   - an environment mood (exterior daylight vs. interior lighting)
 *
 * Between stops the camera follows a Catmull-Rom spline through the stop
 * positions, so motion is smooth and never snaps, while still passing exactly
 * through each authored framing.
 */

import { vec3, catmullRom, clamp, smoothstep, lerp, easing } from '../engine/math.js';
import { SHIP } from './ship.js';

/**
 * Where the interior spaces live inside the hull. Shared with interiors.js.
 *
 * Decks are stacked realistically: the ship's office is low in the
 * accommodation block, crew mess above it, cabins higher still, and the bridge
 * on top. Machinery spaces sit below the waterline aft, and the cargo hold is
 * forward under the hatch covers.
 */
export const INTERIOR_ANCHORS = {
  // Accommodation block, from the bottom up.
  shipOffice: { x: 0, y: SHIP.deckY + SHIP.deckHeight * 1, z: SHIP.houseZ + 1 },
  crewMess: { x: 0, y: SHIP.deckY + SHIP.deckHeight * 3, z: SHIP.houseZ },
  cabin: { x: 0, y: SHIP.deckY + SHIP.deckHeight * 5, z: SHIP.houseZ + 2 },
  bridge: {
    x: 0,
    y: SHIP.deckY + SHIP.deckHeight * SHIP.houseDecks + 2.0,
    z: SHIP.houseZ + 3,
  },

  // Machinery spaces, below the waterline aft.
  engineRoom: { x: 0, y: -7.5, z: SHIP.funnelZ + 6 },
  engineControlRoom: { x: -11, y: 3.5, z: SHIP.funnelZ - 16 },

  // Cargo hold, forward and below deck.
  cargoHold: { x: 0, y: -4.0, z: 40 },
};

/**
 * The voyage. `mood` selects a lighting preset; `sectionId` links the stop to
 * markup in index.html.
 */
export const STOPS = [
  {
    id: 'hero',
    sectionId: 'hero',
    mood: 'exterior',
    // Establishing shot. Close enough that the vessel reads as a ship rather
    // than a speck, and aimed left of it so the hull sits right of the copy.
    position: [520, 104, -580],
    target: [-150, 30, 46],
    fov: 42,
  },
  {
    id: 'approach',
    sectionId: null,
    mood: 'exterior',
    // Closing in; the vessel fills the frame.
    position: [300, 68, -330],
    target: [0, 30, 20],
    fov: 44,
  },
  {
    id: 'about',
    sectionId: 'about',
    mood: 'exterior',
    // Low broadside pass along the hull — the full 300 m profile.
    position: [188, 30, -132],
    target: [-10, 26, 60],
    fov: 44,
  },
  {
    id: 'services',
    sectionId: 'services',
    mood: 'exterior',
    // Up on deck, walking forward between the container stacks.
    position: [17, 34, -50],
    target: [2, 30, 96],
    fov: 62,
  },
  {
    id: 'fleet',
    sectionId: 'fleet',
    mood: 'exterior',
    // High over the stacks, looking aft at the accommodation block.
    position: [-64, 74, 128],
    target: [0, 34, -60],
    fov: 52,
  },
  {
    id: 'team',
    sectionId: 'team',
    mood: 'bridge',
    // Inside the bridge, looking forward over the console and out the windows.
    position: [
      INTERIOR_ANCHORS.bridge.x - 4.2,
      INTERIOR_ANCHORS.bridge.y + 1.7,
      INTERIOR_ANCHORS.bridge.z - 3.4,
    ],
    target: [
      INTERIOR_ANCHORS.bridge.x + 1.5,
      INTERIOR_ANCHORS.bridge.y + 1.2,
      INTERIOR_ANCHORS.bridge.z + 8,
    ],
    fov: 66,
  },
  {
    id: 'careers',
    sectionId: 'careers',
    mood: 'engine',
    // Engine room, alongside the main engine.
    position: [
      INTERIOR_ANCHORS.engineRoom.x - 11.5,
      INTERIOR_ANCHORS.engineRoom.y + 10.4,
      INTERIOR_ANCHORS.engineRoom.z - 18,
    ],
    target: [
      INTERIOR_ANCHORS.engineRoom.x + 1.5,
      INTERIOR_ANCHORS.engineRoom.y + 6.0,
      INTERIOR_ANCHORS.engineRoom.z + 10,
    ],
    fov: 72,
  },
  {
    id: 'technical',
    sectionId: 'technical',
    mood: 'controlRoom',
    // Engine control room, facing the alarm and switchboard wall.
    position: [
      INTERIOR_ANCHORS.engineControlRoom.x + 3.4,
      INTERIOR_ANCHORS.engineControlRoom.y + 1.7,
      INTERIOR_ANCHORS.engineControlRoom.z - 3.2,
    ],
    target: [
      INTERIOR_ANCHORS.engineControlRoom.x - 2.0,
      INTERIOR_ANCHORS.engineControlRoom.y + 1.5,
      INTERIOR_ANCHORS.engineControlRoom.z + 5.0,
    ],
    fov: 66,
  },
  {
    id: 'life',
    sectionId: 'life',
    mood: 'mess',
    // Crew mess, across the tables toward the servery.
    position: [
      INTERIOR_ANCHORS.crewMess.x + 5.2,
      INTERIOR_ANCHORS.crewMess.y + 1.65,
      INTERIOR_ANCHORS.crewMess.z - 5.0,
    ],
    target: [
      INTERIOR_ANCHORS.crewMess.x - 3.0,
      INTERIOR_ANCHORS.crewMess.y + 1.2,
      INTERIOR_ANCHORS.crewMess.z + 4.5,
    ],
    fov: 68,
  },
  {
    id: 'welfare',
    sectionId: 'welfare',
    mood: 'cabin',
    // Officer's cabin, from the doorway toward the porthole and desk.
    position: [
      INTERIOR_ANCHORS.cabin.x + 2.6,
      INTERIOR_ANCHORS.cabin.y + 1.6,
      INTERIOR_ANCHORS.cabin.z - 3.4,
    ],
    target: [
      INTERIOR_ANCHORS.cabin.x - 1.6,
      INTERIOR_ANCHORS.cabin.y + 1.2,
      INTERIOR_ANCHORS.cabin.z + 3.2,
    ],
    fov: 70,
  },
  {
    id: 'training',
    sectionId: 'training',
    mood: 'hold',
    // Deep in the cargo hold, between the cell guides.
    position: [
      INTERIOR_ANCHORS.cargoHold.x - 6.0,
      INTERIOR_ANCHORS.cargoHold.y + 1.9,
      INTERIOR_ANCHORS.cargoHold.z - 22,
    ],
    target: [
      INTERIOR_ANCHORS.cargoHold.x + 1.0,
      INTERIOR_ANCHORS.cargoHold.y + 4.5,
      INTERIOR_ANCHORS.cargoHold.z + 14,
    ],
    fov: 70,
  },
  {
    id: 'apply',
    sectionId: 'apply',
    mood: 'office',
    // Ship's office, across the desk where crew paperwork is handled.
    position: [
      INTERIOR_ANCHORS.shipOffice.x + 3.8,
      INTERIOR_ANCHORS.shipOffice.y + 1.6,
      INTERIOR_ANCHORS.shipOffice.z - 3.6,
    ],
    target: [
      INTERIOR_ANCHORS.shipOffice.x - 2.2,
      INTERIOR_ANCHORS.shipOffice.y + 1.1,
      INTERIOR_ANCHORS.shipOffice.z + 3.4,
    ],
    fov: 66,
  },
  {
    id: 'contact',
    sectionId: 'contact',
    mood: 'exterior',
    // Pull back off the stern quarter to close the film.
    position: [300, 74, -430],
    target: [0, 30, -60],
    fov: 44,
  },
];

/** Lighting/mood presets applied as the camera moves between spaces. */
export const MOODS = {
  exterior: {
    ambientScale: 1.0,
    showOcean: true,
    fogDensity: 0.00011,
    exposure: 1.02,
    vignette: 0.66,
    bloomStrength: 0.62,
    lights: [],
  },
  bridge: {
    ambientScale: 0.2,
    showOcean: true,
    fogDensity: 0.0004,
    exposure: 1.06,
    vignette: 0.8,
    bloomStrength: 0.5,
    lights: [
      // Warm instrument glow low on the console, plus dim overhead.
      { at: 'bridge', offset: [0, 0.4, 3.0], color: [1.0, 0.62, 0.30], intensity: 1.09, range: 13 },
      { at: 'bridge', offset: [-5, 2.4, -1], color: [0.55, 0.72, 1.0], intensity: 0.63, range: 16 },
      { at: 'bridge', offset: [5, 2.4, -1], color: [0.55, 0.72, 1.0], intensity: 0.63, range: 16 },
    ],
  },
  engine: {
    ambientScale: 0.13,
    showOcean: false,
    fogDensity: 0.0016,
    exposure: 1.12,
    vignette: 0.9,
    bloomStrength: 0.75,
    lights: [
      // Deckhead fluorescents, matching the emissive fittings in interiors.js.
      { at: 'engineRoom', offset: [0, 17.2, -14], color: [0.86, 0.92, 1.0], intensity: 1.6, range: 34 },
      { at: 'engineRoom', offset: [0, 17.2, 6], color: [0.86, 0.92, 1.0], intensity: 1.5, range: 34 },
      // Warm fill at platform level so the grating and engine flanks read.
      { at: 'engineRoom', offset: [-11, 10.5, 12], color: [1.0, 0.80, 0.50], intensity: 1.1, range: 26 },
      { at: 'engineRoom', offset: [7, 6.0, -12], color: [1.0, 0.52, 0.28], intensity: 0.7, range: 22 },
    ],
  },
  hold: {
    ambientScale: 0.11,
    showOcean: false,
    fogDensity: 0.0022,
    exposure: 1.15,
    vignette: 0.94,
    bloomStrength: 0.7,
    lights: [
      // Daylight down the open hatch, plus hold lamps near the deckhead.
      { at: 'cargoHold', offset: [0, 20.5, 0], color: [0.80, 0.89, 1.0], intensity: 1.7, range: 40 },
      { at: 'cargoHold', offset: [-14, 19.5, 18], color: [0.88, 0.92, 1.0], intensity: 1.0, range: 32 },
      { at: 'cargoHold', offset: [14, 8.0, -18], color: [1.0, 0.84, 0.58], intensity: 0.85, range: 28 },
    ],
  },

  // Engine control room: a quiet, screen-lit box off the machinery space.
  controlRoom: {
    ambientScale: 0.12,
    showOcean: false,
    fogDensity: 0.0008,
    exposure: 1.08,
    vignette: 0.86,
    bloomStrength: 0.68,
    lights: [
      { at: 'engineControlRoom', offset: [-1.5, 1.6, 3.0], color: [0.42, 0.86, 0.92], intensity: 1.18, range: 12 },
      { at: 'engineControlRoom', offset: [0, 2.6, -1.0], color: [0.86, 0.92, 1.0], intensity: 0.84, range: 13 },
      { at: 'engineControlRoom', offset: [3.0, 1.8, 2.0], color: [1.0, 0.52, 0.24], intensity: 0.5, range: 9 },
    ],
  },

  // Crew mess: warm, domestic, the most human space on board.
  mess: {
    ambientScale: 0.14,
    showOcean: true,
    fogDensity: 0.0005,
    exposure: 1.04,
    vignette: 0.8,
    bloomStrength: 0.48,
    lights: [
      { at: 'crewMess', offset: [0, 2.5, 0], color: [1.0, 0.88, 0.70], intensity: 1.22, range: 16 },
      { at: 'crewMess', offset: [-5, 2.3, 4], color: [1.0, 0.82, 0.58], intensity: 0.84, range: 13 },
      { at: 'crewMess', offset: [6, 1.6, -3], color: [0.72, 0.86, 1.0], intensity: 0.59, range: 11 },
    ],
  },

  // Officer's cabin: a single desk lamp plus daylight through the porthole.
  cabin: {
    ambientScale: 0.16,
    showOcean: true,
    fogDensity: 0.0004,
    exposure: 1.02,
    vignette: 0.84,
    bloomStrength: 0.5,
    lights: [
      { at: 'cabin', offset: [-1.4, 1.5, 2.4], color: [1.0, 0.80, 0.52], intensity: 0.92, range: 8 },
      { at: 'cabin', offset: [0, 2.3, 0], color: [0.94, 0.92, 0.88], intensity: 0.63, range: 10 },
      { at: 'cabin', offset: [-2.4, 1.7, 3.4], color: [0.80, 0.90, 1.0], intensity: 0.76, range: 9 },
    ],
  },

  // Ship's office: functional overhead light and a monitor.
  office: {
    ambientScale: 0.13,
    showOcean: true,
    fogDensity: 0.0005,
    exposure: 1.04,
    vignette: 0.82,
    bloomStrength: 0.5,
    lights: [
      { at: 'shipOffice', offset: [0, 2.4, 0], color: [0.96, 0.95, 0.92], intensity: 1.09, range: 14 },
      { at: 'shipOffice', offset: [-1.8, 1.5, 2.2], color: [0.46, 0.80, 0.90], intensity: 0.67, range: 8 },
      { at: 'shipOffice', offset: [3.0, 1.6, -2.0], color: [1.0, 0.84, 0.60], intensity: 0.55, range: 9 },
    ],
  },
};

/**
 * Which interior mesh each mood needs on screen. Only one interior is ever
 * drawn at a time, so seven fully-furnished spaces cost the same as one.
 * `null` means the camera is outside and no interior should be drawn.
 */
export const MOOD_SPACE = {
  exterior: null,
  bridge: 'bridge',
  engine: 'engineRoom',
  controlRoom: 'engineControlRoom',
  mess: 'crewMess',
  cabin: 'cabin',
  hold: 'cargoHold',
  office: 'shipOffice',
};

/** Stops whose mood places the camera inside the hull. */
const INTERIOR_MOODS = new Set(
  Object.keys(MOOD_SPACE).filter((key) => MOOD_SPACE[key] !== null),
);

export const isInteriorMood = (mood) => INTERIOR_MOODS.has(mood);

/**
 * Drives the camera from a scroll progress value.
 *
 * Progress is in "stop units": 0 at the first stop, STOPS.length - 1 at the
 * last. Fractional values interpolate.
 */
export class Journey {
  constructor(stops = STOPS) {
    this.stops = stops;
    this.lastIndex = stops.length - 1;

    // Control points for the spline, as plain arrays for catmullRom().
    this._positions = stops.map((s) => s.position);
    this._targets = stops.map((s) => s.target);

    this.camera = {
      position: vec3.create(),
      target: vec3.create(),
      fov: stops[0].fov,
      near: 0.35,
      far: 14000,
    };

    // Smoothed scroll value, so flicking the wheel does not jolt the camera.
    this.progress = 0;
    this.targetProgress = 0;

    this._splinePos = vec3.create();
    this._splineTarget = vec3.create();
    this._mouse = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  }

  /** Sets the desired progress, typically from scroll position. */
  setProgress(value) {
    this.targetProgress = clamp(value, 0, this.lastIndex);
    return this;
  }

  /** Jumps immediately, skipping the smoothing (used for nav clicks + init). */
  snapTo(value) {
    this.targetProgress = clamp(value, 0, this.lastIndex);
    this.progress = this.targetProgress;
    return this;
  }

  /** Records normalised pointer position in [-1, 1] for parallax. */
  setPointer(x, y) {
    this._mouse.x = clamp(x, -1, 1);
    this._mouse.y = clamp(y, -1, 1);
    return this;
  }

  /**
   * Index of the stop the camera is closest to, used to decide which DOM
   * section is active.
   */
  get nearestStop() {
    return Math.round(this.progress);
  }

  /** The mood at the current position, biased to whichever stop is nearer. */
  get mood() {
    return this.stops[clamp(Math.round(this.progress), 0, this.lastIndex)].mood;
  }

  /**
   * Advances smoothing and recomputes the camera.
   * @param {number} dt seconds since the previous frame
   * @param {number} time absolute seconds, for idle drift
   */
  update(dt, time) {
    // Critically-damped-ish approach to the scroll target. The exponent keeps
    // the feel identical at 30 fps and 144 fps.
    const smoothing = 1 - Math.pow(0.0022, dt);
    this.progress += (this.targetProgress - this.progress) * smoothing;

    const pointerSmoothing = 1 - Math.pow(0.004, dt);
    this._mouse.smoothX += (this._mouse.x - this._mouse.smoothX) * pointerSmoothing;
    this._mouse.smoothY += (this._mouse.y - this._mouse.smoothY) * pointerSmoothing;

    const span = this.lastIndex || 1;
    // Ease within each segment so arrivals settle rather than coast.
    const segment = Math.floor(this.progress);
    const local = this.progress - segment;
    const easedLocal = easing.inOutSine(local);
    const eased = clamp((segment + easedLocal) / span, 0, 1);

    catmullRom(this._splinePos, this._positions, eased);
    catmullRom(this._splineTarget, this._targets, eased);

    // Field of view blends linearly between the two bracketing stops.
    const a = this.stops[clamp(segment, 0, this.lastIndex)];
    const b = this.stops[clamp(segment + 1, 0, this.lastIndex)];
    const fov = lerp(a.fov, b.fov, easedLocal);

    // Parallax: interiors get a small, tight sway; exteriors a wider drift.
    const interior = isInteriorMood(this.mood);
    const swayScale = interior ? 0.55 : 1.0;
    const swayX = this._mouse.smoothX * swayScale;
    const swayY = this._mouse.smoothY * swayScale;

    // A slow idle drift keeps the frame alive when the visitor is not moving.
    const driftX = Math.sin(time * 0.16) * 0.55 + Math.sin(time * 0.071) * 0.3;
    const driftY = Math.cos(time * 0.13) * 0.35;

    // Sway is applied in the camera's own basis so it always reads as a look,
    // not a slide along world axes.
    const forwardX = this._splineTarget[0] - this._splinePos[0];
    const forwardZ = this._splineTarget[2] - this._splinePos[2];
    const forwardLength = Math.hypot(forwardX, forwardZ) || 1;
    // Right vector on the horizontal plane.
    const rightX = forwardZ / forwardLength;
    const rightZ = -forwardX / forwardLength;

    // Interiors are metres across, exteriors hundreds — scale the offset to the
    // distance being framed so the effect feels consistent at both scales.
    const reach = interior ? 1.6 : Math.min(forwardLength * 0.045, 26);

    const offsetX = (swayX + driftX * (interior ? 0.12 : 1)) * reach;
    const offsetY = (swayY + driftY * (interior ? 0.12 : 1)) * reach * 0.5;

    vec3.set(
      this.camera.position,
      this._splinePos[0] + rightX * offsetX,
      this._splinePos[1] + offsetY,
      this._splinePos[2] + rightZ * offsetX,
    );

    // The target counter-rotates slightly, which produces a gentle look-around
    // rather than a rigid pan.
    vec3.set(
      this.camera.target,
      this._splineTarget[0] - rightX * offsetX * 0.22,
      this._splineTarget[1] - offsetY * 0.35,
      this._splineTarget[2] - rightZ * offsetX * 0.22,
    );

    this.camera.fov = fov;
    return this.camera;
  }

  /**
   * Resolves the point-light list for the current mood into world space.
   * Offsets in MOODS are relative to an interior anchor.
   */
  resolveLights() {
    const preset = MOODS[this.mood] || MOODS.exterior;
    return preset.lights.map((light) => {
      const anchor = INTERIOR_ANCHORS[light.at] || { x: 0, y: 0, z: 0 };
      return {
        position: [
          anchor.x + light.offset[0],
          anchor.y + light.offset[1],
          anchor.z + light.offset[2],
        ],
        color: light.color,
        intensity: light.intensity,
        range: light.range,
      };
    });
  }

  /**
   * Blends the numeric mood parameters between the two bracketing stops, so
   * moving from deck into the engine room dims gradually instead of cutting.
   */
  resolveMoodParameters() {
    const segment = clamp(Math.floor(this.progress), 0, this.lastIndex);
    const next = clamp(segment + 1, 0, this.lastIndex);
    const blend = smoothstep(0.25, 0.75, this.progress - segment);

    const from = MOODS[this.stops[segment].mood] || MOODS.exterior;
    const to = MOODS[this.stops[next].mood] || MOODS.exterior;

    return {
      ambientScale: lerp(from.ambientScale, to.ambientScale, blend),
      fogDensity: lerp(from.fogDensity, to.fogDensity, blend),
      exposure: lerp(from.exposure, to.exposure, blend),
      vignette: lerp(from.vignette, to.vignette, blend),
      bloomStrength: lerp(from.bloomStrength, to.bloomStrength, blend),
    };
  }

  /**
   * Visibility weight for a given stop, peaking when the camera is at it.
   * Used to fade DOM sections in and out with the camera.
   */
  sectionOpacity(stopIndex) {
    const distance = Math.abs(this.progress - stopIndex);
    return 1 - smoothstep(0.18, 0.62, distance);
  }

  /**
   * The interior space that should currently be drawn.
   *
   * Uses the *nearer* of the two bracketing stops rather than the floor, so the
   * swap happens at the midpoint of a transition — by which time the camera is
   * already inside the next enclosure and the change is invisible.
   */
  get visibleSpace() {
    const index = clamp(Math.round(this.progress), 0, this.lastIndex);
    return MOOD_SPACE[this.stops[index].mood] || null;
  }

  /**
   * The space the camera is heading toward, so its geometry can be warmed up
   * before it is needed.
   */
  get upcomingSpace() {
    const ahead = this.targetProgress >= this.progress ? 1 : -1;
    const index = clamp(Math.round(this.progress) + ahead, 0, this.lastIndex);
    return MOOD_SPACE[this.stops[index].mood] || null;
  }

  /**
   * Fade-to-black weight for the current position.
   *
   * Moving between two interiors means flying the camera through steel: hull
   * plating, tank tops and container stacks all pass through frame. Rather than
   * pretend that looks intentional, the transition is cut like film — black at
   * the midpoint, clear at both ends.
   *
   * Exterior-to-interior gets a lighter dip, because passing through the deck
   * for a moment reads as entering the ship rather than as a glitch.
   *
   * @returns {number} 0 (clear) to 1 (black)
   */
  transitionFade() {
    const segment = clamp(Math.floor(this.progress), 0, this.lastIndex);
    const next = clamp(segment + 1, 0, this.lastIndex);
    if (segment === next) return 0;

    const from = MOOD_SPACE[this.stops[segment].mood] || null;
    const to = MOOD_SPACE[this.stops[next].mood] || null;
    if (from === to) return 0;

    const bothInterior = from !== null && to !== null;
    // A cut between enclosed spaces has to be opaque; entering or leaving the
    // hull only needs a dip.
    const strength = bothInterior ? 1.0 : 0.5;

    const local = this.progress - segment;
    // sin^2 peaks at the midpoint and is exactly zero at both stops.
    const curve = Math.sin(local * Math.PI);
    return clamp(curve * curve * strength, 0, 1);
  }
}
