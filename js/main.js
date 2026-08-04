/**
 * main.js — Application entry point.
 *
 * Responsibilities, in order:
 *   1. Render all DOM content from js/content.js and wire the interactive parts.
 *      This happens first and unconditionally, so the site is complete and
 *      usable even if the 3D scene never starts.
 *   2. Attempt to boot the WebGL voyage. On any failure — no WebGL2, reduced
 *      motion, a shader that will not compile — fall back to a plain scrolling
 *      document by adding `.no-3d` to <html>.
 *   3. Drive the camera from scroll position and fade panels in and out to match.
 */

import { clamp, smoothstep } from './engine/math.js';
import { createContext } from './engine/gl.js';
import { $, $$, applyStrings, debounce, prefersReducedMotion } from './ui/dom.js';
import { renderAll, setActiveSection } from './ui/render.js';
import { mountJobs } from './ui/jobs.js';
import { mountApplyForm, mountContactForm } from './ui/forms.js';
import { mountChat } from './ui/chat.js';
import { registerServiceWorker, mountInstallPrompt } from './ui/pwa.js';

/* ------------------------------------------------------------------ globals */

const state = {
  scene: null,        // populated only if WebGL boots
  journey: null,
  panels: [],
  activeSection: null,
  scrollHeightPerStop: 0,
  running: false,
};

// Surfaced for debugging and read by the dev screenshot harness.
window.__boot = { mode: 'pending', errors: [] };

/*
 * Global error capture, installed before anything else runs.
 *
 * Without this a throw inside the render loop kills the animation frame chain
 * silently: the canvas stays black, no error is reported anywhere, and the page
 * looks like the scene simply decided not to draw. That cost real debugging
 * time, so failures are now always recorded and always visible.
 */
window.addEventListener('error', (event) => {
  window.__boot.errors.push(`error: ${event.message} @ ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  window.__boot.errors.push(`rejection: ${String(event.reason && event.reason.message || event.reason)}`);
});

/** Centre of the directional shadow box, roughly mid-hull at deck height. */
const SHADOW_FOCUS = [0, 10, 0];

/** Frames to render before halting, when driven by the dev harness. */
function captureFrames() {
  const value = new URLSearchParams(location.search).get('capture');
  if (!value) return 0;
  const frames = Number(value);
  return Number.isFinite(frames) && frames > 0 ? frames : 45;
}

const recordError = (label, error) => {
  const message = error && error.message ? error.message : String(error);
  window.__boot.errors.push(`${label}: ${message}`);
  console.error(`[${label}]`, error);
};

/* ---------------------------------------------------------------- DOM first */

function jumpToStop(stopIndex, sectionId) {
  if (state.journey && state.scrollHeightPerStop) {
    window.scrollTo({
      top: stopIndex * state.scrollHeightPerStop,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  } else {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  closeMobileNav();
}

function closeMobileNav() {
  $('#nav')?.classList.remove('is-open');
  $('#hamburger')?.setAttribute('aria-expanded', 'false');
}

function mountChrome() {
  const hamburger = $('#hamburger');
  const nav = $('#nav');

  hamburger?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    hamburger.setAttribute('aria-expanded', String(open));
  });

  // Condense the top bar once the visitor has moved off the hero.
  const topbar = $('#topbar');
  const onScroll = () => topbar?.classList.toggle('is-condensed', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Anchor links inside panels should drive the camera, not native anchoring.
  for (const link of $$('a[data-stop]')) {
    link.addEventListener('click', (event) => {
      const target = link.getAttribute('href') || '';
      if (!target.startsWith('#')) return;
      event.preventDefault();
      jumpToStop(Number(link.dataset.stop), target.slice(1));
    });
  }
}

async function mountDOM() {
  applyStrings();
  renderAll(jumpToStop);
  mountChrome();

  const prefillApply = mountApplyForm();
  mountContactForm();

  await mountJobs((job) => {
    // Jump to the form, then pre-select the rank that was clicked.
    jumpToStop(11, 'apply');
    prefillApply?.(job);
    setTimeout(() => $('#ap-name')?.focus(), prefersReducedMotion() ? 0 : 900);
  });

  mountChat();
  mountInstallPrompt();
}

/* -------------------------------------------------------------- 3D pipeline */

/**
 * Boots the WebGL voyage. Every heavy module is imported dynamically so a
 * device that cannot run the scene never pays to download or parse it.
 */
async function bootScene() {
  const canvas = $('#scene');
  if (!canvas) throw new Error('canvas missing');

  // `?capture=<frames>` is a development affordance: it retains the drawing
  // buffer and halts the loop after a fixed number of frames so a headless
  // browser can screenshot a settled image. Never used in normal browsing.
  const gl = createContext(canvas, { preserveDrawingBuffer: captureFrames() > 0 });
  if (!gl) throw new Error('WebGL2 unavailable');

  const [
    { Renderer, GOLDEN_HOUR },
    { createOcean },
    { createShip, shipPose, applyShipPose, SHIP },
    { createInteriors },
    { Journey, STOPS, MOODS },
  ] = await Promise.all([
    import('./scene/renderer.js'),
    import('./scene/ocean.js'),
    import('./scene/ship.js'),
    import('./scene/interiors.js'),
    import('./scene/journey.js'),
  ]);

  setProgress(0.35);

  const renderer = new Renderer(gl, canvas);
  const ocean = createOcean(gl);
  setProgress(0.55);

  const ship = createShip(gl);
  setProgress(0.78);

  const interiors = createInteriors(gl, ship.model);
  const journey = new Journey(STOPS);
  setProgress(0.94);

  const solids = [...ship.batches, ...interiors.batches];
  const vessel = {
    position: [0, 0, 0],
    heading: 0,
    halfBeam: SHIP.beam / 2,
    halfLength: SHIP.loa / 2,
    shadow: 0.85,
    wake: 1,
  };

  /**
   * Resolution is the single biggest lever on frame cost, and the ocean and sky
   * shaders are expensive per pixel. A retina display at 2x would ask for four
   * times the pixels of a 1x buffer for detail that is invisible on water.
   *
   * `renderScale` is adjusted at runtime by the frame-time monitor, so a slow
   * machine quietly drops resolution instead of stuttering.
   */
  const quality = {
    baseDpr: Math.min(window.devicePixelRatio || 1, 1.5),
    renderScale: 1,
    minScale: 0.55,
  };

  const applySize = () => {
    const effective = quality.baseDpr * quality.renderScale;
    renderer.resize(
      Math.max(320, Math.round(window.innerWidth * effective)),
      Math.max(240, Math.round(window.innerHeight * effective)),
    );
  };
  applySize();
  window.addEventListener('resize', debounce(applySize, 140));

  return {
    renderer, ocean, ship, interiors, journey, solids, vessel,
    GOLDEN_HOUR, MOODS, shipPose, applyShipPose,
    stopCount: STOPS.length,
    quality, applySize,
  };
}

/* ------------------------------------------------------------- scroll model */

/**
 * The document is one viewport tall per voyage stop. Scroll position therefore
 * maps linearly onto "stop units", which is what the camera consumes.
 */
function configureScrollHeight(stopCount) {
  const perStop = Math.max(window.innerHeight * 0.92, 520);
  state.scrollHeightPerStop = perStop;
  document.body.style.height = `${perStop * (stopCount - 1) + window.innerHeight}px`;
}

function scrollProgress() {
  if (!state.scrollHeightPerStop) return 0;
  return window.scrollY / state.scrollHeightPerStop;
}

/* --------------------------------------------------------------- panel fades */

function collectPanels() {
  state.panels = $$('.panel').map((node) => ({
    node,
    stop: Number(node.dataset.stop || 0),
    id: node.id,
    shown: false,
  }));
}

/**
 * Fades panels with the camera. A panel is legible only near its own stop, and
 * drifts slightly as it enters and leaves so the text feels attached to the
 * camera move rather than pasted on top of it.
 */
function updatePanels(progress, sceneFade = 0) {
  let nearest = null;
  let nearestDistance = Infinity;

  // While the scene is cut to black the copy fades with it, so text is never
  // left floating on an empty frame.
  const legibility = 1 - sceneFade;

  for (const panel of state.panels) {
    const distance = Math.abs(progress - panel.stop);
    const opacity = 1 - smoothstep(0.2, 0.66, distance);

    if (opacity <= 0.001) {
      if (panel.shown) {
        panel.node.classList.remove('is-visible');
        panel.node.style.opacity = '0';
        panel.shown = false;
      }
      continue;
    }

    if (!panel.shown) {
      panel.node.classList.add('is-visible');
      panel.shown = true;
    }

    const signed = progress - panel.stop;
    panel.node.style.opacity = String(opacity * legibility);
    panel.node.style.transform =
      `translate3d(0, ${(signed * 46).toFixed(2)}px, 0) scale(${(0.985 + opacity * 0.015).toFixed(4)})`;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = panel;
    }
  }

  if (nearest && nearest.id !== state.activeSection) {
    state.activeSection = nearest.id;
    setActiveSection(nearest.id);
    // Keep the address bar honest without adding history entries.
    if (window.history.replaceState) {
      window.history.replaceState(null, '', `#${nearest.id}`);
    }
  }
}

function updateVoyageRail(progress, stopCount) {
  const fill = $('#voyageFill');
  if (fill) {
    const ratio = clamp(progress / Math.max(stopCount - 1, 1), 0, 1);
    fill.style.height = `${(ratio * 100).toFixed(2)}%`;
  }
}

/* ------------------------------------------------------------------ the loop */

function startLoop(scene) {
  const {
    renderer, ocean, journey, solids, vessel, interiors,
    GOLDEN_HOUR, MOODS, shipPose, applyShipPose, stopCount,
  } = scene;

  let last = performance.now();
  let currentSpace = undefined;
  const frameBudget = captureFrames();
  let frameCount = 0;

  /**
   * Frame-time monitor driving adaptive quality.
   *
   * Uses a rolling mean rather than instantaneous timings, because a single slow
   * frame during a scroll flick is normal and should not trigger a downgrade.
   */
  const perf = {
    mean: 16.7,
    samples: 0,
    cooldown: 0,
  };

  function adaptQuality(dtMs) {
    // Ignore the first handful of frames: shader compilation and buffer upload
    // land there and would immediately force the resolution down.
    if (perf.samples++ < 20) return;

    perf.mean += (dtMs - perf.mean) * 0.06;

    if (perf.cooldown > 0) {
      perf.cooldown--;
      return;
    }

    const q = scene.quality;

    // Below ~45 fps: step down. Above ~70 fps with headroom: step back up.
    if (perf.mean > 22 && q.renderScale > q.minScale) {
      q.renderScale = Math.max(q.minScale, q.renderScale - 0.12);
      scene.applySize();
      perf.cooldown = 90;
      window.__boot.renderScale = Number(q.renderScale.toFixed(2));
    } else if (perf.mean < 13.5 && q.renderScale < 1) {
      q.renderScale = Math.min(1, q.renderScale + 0.08);
      scene.applySize();
      perf.cooldown = 150;
      window.__boot.renderScale = Number(q.renderScale.toFixed(2));
    }
  }

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // On touch devices the "pointer" is the scroll itself; leave sway at rest.
  window.addEventListener('touchstart', () => { pointer.x = 0; pointer.y = 0; }, { passive: true });

  /**
   * Wraps a frame so a single throw cannot silently end the render loop.
   * On failure the reason is recorded and the site drops to the readable
   * fallback rather than sitting on a black canvas.
   */
  function safeFrame(now) {
    try {
      frame(now);
    } catch (error) {
      state.running = false;
      recordError('loop', error);
      window.__boot.mode = 'loop-failed';
      enableFallback(`render loop failed: ${error && error.message ? error.message : error}`);
      dismissLoader();
    }
  }

  function frame(now) {
    if (!state.running) return;

    const elapsedMs = now - last;
    const dt = Math.min(elapsedMs / 1000, 0.05);
    last = now;
    const time = now / 1000;

    if (!frameBudget) adaptQuality(elapsedMs);

    journey.setProgress(scrollProgress());
    journey.setPointer(pointer.x, pointer.y);
    const camera = journey.update(dt, time);

    // Mood: lighting, exposure and fog blend between stops.
    const mood = journey.resolveMoodParameters();
    renderer.setEnvironment({
      fogDensity: mood.fogDensity,
      exposure: mood.exposure,
      vignette: mood.vignette,
      bloomStrength: mood.bloomStrength,
    });
    renderer.ambientScale = mood.ambientScale;
    renderer.setLights(journey.resolveLights());

    // Only one interior is ever resident on screen.
    const space = journey.visibleSpace;
    if (space !== currentSpace) {
      interiors.setVisible(space);
      currentSpace = space;
    }

    const moodPreset = MOODS[journey.mood] || MOODS.exterior;

    // Cut to black while the camera passes through the hull between spaces.
    renderer.fadeToBlack = journey.transitionFade();

    // Seat the vessel on the waves.
    applyShipPose(scene.ship.model, shipPose(time, renderer.environment.waveScale));

    renderer.render({
      camera,
      time,
      ocean,
      showOcean: moodPreset.showOcean !== false,
      solids,
      vessel,
      // The vessel is the only caster worth resolving, so the shadow box is
      // fitted to it rather than to the camera frustum.
      shadowFocus: SHADOW_FOCUS,
      shadowRadius: 210,
    });

    updatePanels(journey.progress, renderer.fadeToBlack);
    updateVoyageRail(journey.progress, stopCount);

    frameCount++;
    window.__boot.frames = frameCount;

    if (frameBudget && frameCount >= frameBudget) {
      // Settle and stop, so a headless capture gets a stable image.
      state.running = false;
      window.__boot.captured = true;

      /**
       * Renders `steps` frames on demand with a fixed timestep. The dev harness
       * calls this after scrolling so the camera has time to ease into its new
       * stop before the screenshot is taken.
       */
      window.__step = (steps = 60) => {
        const fixed = 1 / 60;
        for (let i = 0; i < steps; i++) {
          // frame() halts itself once past the budget, so re-arm each iteration.
          state.running = true;
          last = performance.now() - fixed * 1000;
          frame(performance.now());
        }
        state.running = false;
        return {
          progress: Number(journey.progress.toFixed(3)),
          mood: journey.mood,
          space: journey.visibleSpace,
          section: state.activeSection,
        };
      };
      return;
    }

    requestAnimationFrame(safeFrame);
  }

  void GOLDEN_HOUR;
  state.running = true;
  requestAnimationFrame(safeFrame);

  // Pause rendering when the tab is hidden — no reason to burn a phone battery.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.running = false;
    } else if (!state.running) {
      state.running = true;
      last = performance.now();
      requestAnimationFrame(safeFrame);
    }
  });
}

/* ------------------------------------------------------------------- loader */

function setProgress(ratio) {
  const fill = $('#loaderFill');
  if (fill) fill.style.width = `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
}

function dismissLoader() {
  setProgress(1);
  // One frame of settle time so the first rendered image is already correct.
  requestAnimationFrame(() => {
    setTimeout(() => document.documentElement.classList.remove('is-loading'), 220);
  });
}

/**
 * Surfaces why the 3D scene is not running, on screen.
 *
 * Silently degrading to a plain page looks identical to the site being broken,
 * which cost a lot of time to diagnose. Saying so plainly — with a way to retry
 * — is far more useful than a mystery.
 */
function showFallbackNotice(reason) {
  if (document.getElementById('no3dNotice')) return;

  const notice = document.createElement('div');
  notice.id = 'no3dNotice';
  notice.className = 'no3d-notice';
  notice.innerHTML = `
    <strong>3D tour is off</strong>
    <span>${String(reason).replace(/[<>&]/g, '')}</span>
    <a href="?force3d=1">Try to enable it</a>
    <button type="button" aria-label="Dismiss">&times;</button>
  `;
  notice.querySelector('button').addEventListener('click', () => notice.remove());
  document.body.append(notice);
}

/** Switches permanently to the plain scrolling document. */
function enableFallback(reason) {
  document.documentElement.classList.add('no-3d');
  document.body.style.height = 'auto';
  window.__boot.mode = 'fallback';
  window.__boot.reason = reason;
  console.warn(`[scene] 3D disabled: ${reason}`);
  showFallbackNotice(reason);

  for (const panel of state.panels) {
    panel.node.classList.add('is-visible');
    panel.node.style.opacity = '1';
    panel.node.style.transform = 'none';
  }

  // Native scroll spy, since there is no camera to derive the section from.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) setActiveSection(entry.target.id);
    }
  }, { rootMargin: '-45% 0px -45% 0px' });

  for (const panel of state.panels) observer.observe(panel.node);
}

/* --------------------------------------------------------------------- init */

async function init() {
  try {
    await mountDOM();
  } catch (error) {
    recordError('dom', error);
  }

  collectPanels();
  setProgress(0.18);

  /*
   * Reduced motion must NOT remove the scene.
   *
   * Disabling the whole 3D experience for `prefers-reduced-motion` was the
   * wrong call: that setting is extremely common on macOS, and anyone who had
   * it enabled saw a plain gradient with no vessel and no water at all — the
   * entire point of the site, silently switched off.
   *
   * The correct reading of the preference is to remove *involuntary* motion:
   * the idle camera drift and the pointer parallax. The scroll-driven camera
   * stays, because it only moves when the visitor moves it.
   */
  const params = new URLSearchParams(location.search);
  const forced = params.has('force3d');
  const optedOut = !forced && params.has('no3d');
  const reducedMotion = !forced && (params.has('reduced') || prefersReducedMotion());

  if (optedOut) {
    enableFallback('opted out via ?no3d');
    dismissLoader();
    return;
  }

  try {
    const scene = await bootScene();
    state.scene = scene;
    state.journey = scene.journey;

    // Suppresses idle drift and pointer parallax, keeping the scroll-driven
    // camera intact.
    scene.journey.motionScale = reducedMotion ? 0 : 1;
    state.reducedMotion = reducedMotion;

    configureScrollHeight(scene.stopCount);
    window.addEventListener('resize', debounce(() => {
      configureScrollHeight(scene.stopCount);
    }, 160));

    // Land on the section named in the URL, if any.
    const hash = window.location.hash.slice(1);
    if (hash) {
      const panel = state.panels.find((p) => p.id === hash);
      if (panel) {
        window.scrollTo({ top: panel.stop * state.scrollHeightPerStop, behavior: 'auto' });
        scene.journey.snapTo(panel.stop);
      }
    }

    updatePanels(scene.journey.progress);
    startLoop(scene);

    window.__boot.mode = '3d';
    window.__boot.containers = scene.ship.containerCount;
    window.__boot.stops = scene.stopCount;
  } catch (error) {
    recordError('scene', error);
    enableFallback(error && error.message ? error.message : 'scene boot failed');
  }

  dismissLoader();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
