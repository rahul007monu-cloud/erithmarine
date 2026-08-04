# Edith Maritime Services — website

A single-page site for **Edith Maritime Services Pvt Ltd** built around a
scroll-driven 3D voyage: the visitor starts on open ocean, closes on a container
vessel, boards it, and moves through the bridge, machinery spaces, crew
accommodation and cargo hold. Each interior space hosts one section of the site.

**No build step. No dependencies. No bundler.** Open `index.html` on any static
host and it runs.

## Why there are no dependencies

The 3D is a purpose-written WebGL2 renderer (`js/engine/`, `js/scene/`) rather
than Three.js. The ocean, hull, superstructure, containers and every interior are
generated procedurally at runtime, so the repository contains no model files, no
textures and no `node_modules`. Total payload is a few hundred kilobytes of
JavaScript and CSS.

That also means the site works offline once cached, which is what makes the PWA
genuinely useful rather than decorative.

## Running locally

Any static file server works. From the repository root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

ES modules require `http://` — opening `index.html` from the filesystem will not
work.

## Deploying

### Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Other**. Leave build command and output directory empty.
3. Deploy.

`vercel.json` sets the security and caching headers. Anything in `api/` is
picked up automatically as a serverless function.

### Netlify

1. Import the repository at [app.netlify.com](https://app.netlify.com).
2. Publish directory `.`, no build command.
3. Deploy.

`netlify.toml` handles headers and maps `/api/*` onto the functions directory.

### Anywhere else

Upload the repository as-is. Only `/api/*` needs a Node runtime, and the site
degrades cleanly without it (see *Forms* below).

## Editing content

**Everything a non-developer needs to change lives in `js/content.js`.** Change
the strings, not the keys.

| What | Where in `js/content.js` |
| --- | --- |
| Phone, email, addresses, offices | `COMPANY` |
| Leadership names and roles | `COMPANY.team` |
| RPSL licence number | `COMPANY.rpslNumber` |
| Vacancies | `JOBS` |
| Rank lists in the apply form | `RANKS` |
| Vessel types | `VESSEL_TYPES` |
| All page copy | `STRINGS` |
| Assistant answers | `KNOWLEDGE` |

### Items still needed from the client

These are marked `TODO(client)` in `js/content.js`:

- **RPSL licence number and validity.** The compliance badge deliberately hides
  the licence line until a real number is supplied — an unverifiable licence
  claim on a crewing site is worse than none. Set `COMPANY.rpslNumber` and the
  badge appears automatically.
- **Full street addresses** for the Jaipur, Navi Mumbai, Dubai and Turkey offices.
- **Logo file.** The site currently draws a typographic mark in SVG. Drop a real
  logo into `icons/` and swap the `<svg class="brand__mark">` in `index.html`.
- **Team photographs.** Team cards fall back to initials.

## Forms

Both the CV application and the contact form post to `/api/*` and **fall back to
a pre-filled `mailto:` when no backend is reachable.** This is intentional: on a
plain static deploy no enquiry is silently lost, and the candidate always ends
up with an email addressed to the crewing desk.

To store applications properly instead, implement `api/apply.js` and
`api/contact.js`. `js/ui/forms.js` already sends the right payload:

- `POST /api/apply` — `multipart/form-data` with all form fields plus `cv` and a
  generated `reference`. Respond `{ "reference": "EMS-…" }`.
- `POST /api/contact` — JSON `{ name, email, phone, subject, message }`.

Returning 404, 405 or a non-JSON body makes the client use the mailto path, so
adding these endpoints later is a drop-in change.

## The assistant

The career assistant works in two tiers:

1. **Built in, no API key.** `js/ui/chat.js` runs a keyword-retrieval assistant
   against `KNOWLEDGE` in `js/content.js`, entirely in the browser. Free, works
   offline, and cannot invent facts because every answer is copy the company has
   already approved. **This is the default and needs no setup.**
2. **Gemini, optional.** If `api/chat.js` is deployed with a `GEMINI_API_KEY`
   environment variable, questions are answered by Gemini, grounded in the same
   facts and constrained by explicit guardrails. Without the key the endpoint
   returns 501 and the client quietly uses tier 1.

To enable tier 2, set `GEMINI_API_KEY` in your host's environment variables. A
free-tier key from [Google AI Studio](https://aistudio.google.com/apikey) is
enough for normal traffic. Optionally set `GEMINI_MODEL` (default
`gemini-1.5-flash`). The endpoint rate limits to 12 questions per IP per minute.

To extend what the assistant knows, add an entry to `KNOWLEDGE` — both tiers pick
it up.

## Accessibility and fallbacks

The 3D scene is decorative. All content lives in ordinary HTML, and the site
switches to a plain scrolling document whenever the voyage cannot or should not
run:

- No WebGL2 support
- `prefers-reduced-motion: reduce`
- Any error while starting the scene

In those cases `<html>` gets `.no-3d`, panels become a normal document flow, and
a CSS ocean stands in for the canvas. Rendering also pauses when the tab is
hidden.

## Project layout

```
index.html               Markup for every section
css/styles.css           All styling, including the .no-3d fallback
manifest.webmanifest     PWA manifest
sw.js                    Service worker (app-shell cache, never caches /api)
vercel.json              Headers for Vercel
netlify.toml             Headers, functions and /api routing for Netlify
icons/                   Generated PWA icons and favicon

js/
  content.js             ← all copy and data lives here
  main.js                Boot, scroll → camera mapping, panel fades, fallback
  engine/
    math.js              vec3/mat4/mat3, Catmull-Rom paths, seeded noise
    gl.js                Context, programs, VAO meshes, instancing, FBOs
    geometry.js          Lofting, extrusion, primitives, merging
  scene/
    shaders.js           All GLSL, as composable chunks
    ocean.js             Gerstner wave train + matching CPU sampler
    ship.js              The vessel, built from station sections
    interiors.js         Seven interior spaces
    journey.js           Voyage stops, lighting moods, camera rig
    renderer.js          Frame graph: scene → bloom → composite
  ui/
    dom.js render.js jobs.js forms.js chat.js pwa.js
api/
  chat.js                Optional Gemini proxy
dev/
  shot.sh                Headless screenshot helper
  smoke.html ocean.html ship.html interior.html
```

## Development notes

`dev/` holds a small harness used while building the scene. It is not part of the
site and can be deleted without affecting anything.

```bash
./dev/shot.sh "/index.html?capture=30" my-shot 1280 720 9
./dev/shot.sh "/dev/interior.html?stop=careers" engine-room
```

`?capture=<frames>` on the main page renders a fixed number of frames, halts the
loop, and exposes `window.__step(n)` so a headless browser can scroll and then
advance the camera before screenshotting. `window.__boot` reports the render mode
and any startup errors.

## Known gaps

Honest list of what is not finished:

- **Applications are not yet stored server-side.** The mailto fallback works, but
  the CRM-style dashboard (status pipeline, filters, document expiry tracking,
  duplicate merging) described in `docs/site-reference.md` is not built.
- **No shadow maps.** Interiors set a `sunlit` material factor near zero to stop
  sunlight leaking through the hull, which is convincing but not physical.
- **Blog is not implemented.** The existing WordPress blog is placeholder content;
  a real one needs a decision on where posts will be authored.
- **Only English.** The copy layer is keyed, so adding Hindi or Turkish later
  means adding a second string table, not touching markup.

See `docs/site-reference.md` for the audit of the existing sites this replaces.
