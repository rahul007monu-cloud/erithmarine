/**
 * /api/chat — Optional Gemini-backed assistant.
 *
 * The site works without this endpoint: the browser falls back to the local
 * retrieval assistant in js/ui/chat.js. This exists only to give more fluent
 * answers when a key is available.
 *
 * Deploy notes:
 *   - Set GEMINI_API_KEY in the hosting environment. Without it this returns
 *     501 and the client silently uses the local assistant.
 *   - Uses only Node globals (fetch is built in from Node 18), so there are no
 *     dependencies to install.
 *
 * Compatible with Vercel and Netlify Node functions.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/** Simple in-memory rate limit. Resets on cold start, which is acceptable here. */
const BUCKET = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function rateLimited(ip) {
  const now = Date.now();
  const hits = (BUCKET.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  BUCKET.set(ip, hits);

  // Keep the map from growing without bound on a long-lived instance.
  if (BUCKET.size > 500) {
    for (const [key, times] of BUCKET) {
      if (!times.length || now - times[times.length - 1] > WINDOW_MS) BUCKET.delete(key);
    }
  }
  return hits.length > MAX_PER_WINDOW;
}

/**
 * Grounding copy. Kept in sync with js/content.js by hand — it is short on
 * purpose, and the guardrails matter more than the volume of facts.
 */
const FACTS = [
  'Edith Maritime Services Pvt Ltd provides crew management, technical management, commercial management, consultancy and pre-sea guidance for seafarers and shipowners.',
  'Contact: edithmaritime01@gmail.com, +91 78774 84978, +91 141 452 0350.',
  'Offices: Jaipur, Navi Mumbai, Dubai and Turkey.',
  'Founder & CEO: Karan Singh Tomar. Head of Management: Ashish Shukla. DPA: Capt. Dhruv.',
  'Recruitment for shipboard employment is free of charge. The company never asks candidates for placement fees.',
  'In India, seafarer recruitment must go through an RPSL agency licensed by the Directorate General of Shipping.',
  'Entry routes after 10+2 with Physics, Chemistry and Maths include B.Sc. Nautical Science, Diploma in Nautical Science (DNS), Graduate Marine Engineering (GME), Electro-Technical Officer (ETO) and General Purpose (GP) Rating.',
  'Only DG Shipping approved institutes should be used for pre-sea training.',
  'Documents a seafarer typically needs: passport, CDC, INDoS number, Certificate of Competency or Proficiency, medical fitness certificate, yellow fever vaccination and STCW basic safety training.',
  'Vessel types crewed: container, bulk carrier, oil tanker, chemical tanker, LPG/LNG carrier, car carrier, general cargo and offshore support vessels.',
  'Candidates apply through the Apply section of the website by uploading a CV.',
];

const GUARDRAILS = [
  'Answer only from the facts provided. If the facts do not cover the question, say you do not have that information and refer the person to the contact details.',
  'Never promise a job, a joining date, a specific salary figure, or visa approval.',
  'Never give medical, legal or immigration advice.',
  'Never invent a licence number, certificate number, office address or staff name.',
  'If someone says they were asked for money in the company name, tell them not to pay and to email the company directly.',
  'Reply in plain English, at most 130 words, no markdown formatting.',
];

function buildPrompt(question, history) {
  const transcript = (history || [])
    .filter((turn) => turn && turn.text)
    .slice(-6)
    .map((turn) => `${turn.role === 'user' ? 'Visitor' : 'Assistant'}: ${String(turn.text).slice(0, 600)}`)
    .join('\n');

  return [
    'You are the careers assistant for Edith Maritime Services Pvt Ltd, an Indian maritime crewing company.',
    '',
    'FACTS YOU MAY USE:',
    ...FACTS.map((fact) => `- ${fact}`),
    '',
    'RULES:',
    ...GUARDRAILS.map((rule) => `- ${rule}`),
    '',
    transcript ? `CONVERSATION SO FAR:\n${transcript}\n` : '',
    `Visitor: ${question}`,
    'Assistant:',
  ].join('\n');
}

/** Reads a JSON body from either a parsed or a streaming request. */
async function readJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // Signals the client to use its built-in assistant. Not an error state.
    return send(res, 501, { error: 'assistant not configured' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return send(res, 429, { error: 'Too many questions, please slow down.' });
  }

  const body = await readJSON(req);
  const question = typeof body.question === 'string' ? body.question.trim() : '';

  if (!question) return send(res, 400, { error: 'question is required' });
  if (question.length > 500) return send(res, 400, { error: 'question is too long' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const upstream = await fetch(ENDPOINT(MODEL, key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(question, body.history) }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 320,
          topP: 0.9,
        },
        safetySettings: [
          'HARM_CATEGORY_HARASSMENT',
          'HARM_CATEGORY_HATE_SPEECH',
          'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          'HARM_CATEGORY_DANGEROUS_CONTENT',
        ].map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
      }),
    }).finally(() => clearTimeout(timeout));

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('[api/chat] upstream error', upstream.status, detail.slice(0, 400));
      // 502 tells the client to fall back locally for this message only.
      return send(res, 502, { error: 'assistant unavailable' });
    }

    const data = await upstream.json();
    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!answer) return send(res, 502, { error: 'empty answer' });

    return send(res, 200, { answer });
  } catch (error) {
    console.error('[api/chat] failed', error);
    return send(res, 502, { error: 'assistant unavailable' });
  }
}
