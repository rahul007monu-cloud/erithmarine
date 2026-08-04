/**
 * chat.js — The candidate assistant.
 *
 * Two tiers, deliberately in this order:
 *
 *   1. A retrieval assistant that runs entirely in the browser against
 *      KNOWLEDGE in content.js. No API key, no server, no per-message cost,
 *      works offline, and can never invent a fact because every answer is
 *      copy the company has already approved.
 *
 *   2. If /api/chat is deployed with a Gemini key, questions are sent there
 *      for a fluent answer grounded in the same knowledge base. The local
 *      tier stays as the fallback whenever that endpoint is absent, rate
 *      limited or failing.
 *
 * The site is fully functional with tier 1 alone.
 */

import { $, el } from './dom.js';
import { KNOWLEDGE, COMPANY, STRINGS } from '../content.js';

/* --------------------------------------------------------------- retrieval */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'do', 'does', 'did', 'i', 'me', 'my',
  'you', 'your', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'if', 'it',
  'be', 'can', 'will', 'would', 'should', 'what', 'how', 'when', 'where',
  'which', 'who', 'why', 'there', 'this', 'that', 'with', 'from', 'about',
  'please', 'tell', 'want', 'need', 'know', 'get', 'give', 'any',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Scores each knowledge entry against the question.
 *
 * Multi-word keywords matched as a phrase score highest, then individual token
 * hits, then prefix matches so "document" still reaches "documents".
 */
function scoreEntry(entry, question, tokens) {
  let score = 0;
  const haystack = question.toLowerCase();

  for (const keyword of entry.keywords) {
    const key = keyword.toLowerCase();

    if (key.includes(' ')) {
      if (haystack.includes(key)) score += 6;
      continue;
    }

    for (const token of tokens) {
      if (token === key) score += 3;
      else if (token.length > 3 && key.startsWith(token)) score += 1.5;
      else if (key.length > 3 && token.startsWith(key)) score += 1.5;
    }
  }
  return score;
}

/**
 * Answers locally. Returns null when nothing is confident enough, so the caller
 * can say "I don't know" rather than guessing.
 */
export function answerLocally(question) {
  const tokens = tokenize(question);
  if (!tokens.length) return null;

  const ranked = KNOWLEDGE
    .map((entry) => ({ entry, score: scoreEntry(entry, question, tokens) }))
    .filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  const best = ranked[0];
  // A closely-scoring second topic is worth pointing at, but never merged into
  // the first answer — that is how retrieval assistants start sounding wrong.
  const alsoSee = ranked[1] && ranked[1].score >= best.score * 0.65
    ? ranked[1].entry
    : null;

  return { text: best.entry.answer, alsoSee, id: best.entry.id };
}

const NO_ANSWER =
  `I do not have a reliable answer for that. Please email ${COMPANY.email} ` +
  `or call ${COMPANY.mobile} and a member of our crewing desk will help.`;

/* -------------------------------------------------------------- remote tier */

let remoteAvailable = true;

/**
 * Asks the server-side model. Resolves to null whenever the endpoint is not
 * usable, which permanently demotes us to local answers for this session.
 */
async function answerRemotely(question, history) {
  if (!remoteAvailable) return null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: history.slice(-6) }),
    });

    // 404/405: not deployed. 501: deployed but no key configured.
    if ([404, 405, 501].includes(response.status)) {
      remoteAvailable = false;
      return null;
    }

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { remoteAvailable = false; return null; }

    if (!response.ok || !data.answer) return null;
    return String(data.answer);
  } catch {
    remoteAvailable = false;
    return null;
  }
}

/* ------------------------------------------------------------------- widget */

export function mountChat() {
  const fab = $('#chatFab');
  const panel = $('#chatPanel');
  const log = $('#chatLog');
  const form = $('#chatForm');
  const input = $('#chatInput');
  const closeBtn = $('#chatClose');
  const suggestHost = $('#chatSuggest');
  if (!fab || !panel || !log || !form || !input) return;

  const history = [];
  let busy = false;

  input.placeholder = STRINGS['chat.placeholder'];

  const addMessage = (role, text, sourceNote) => {
    const node = el('div', { class: `msg msg--${role}` }, [text]);
    if (sourceNote) node.append(el('span', { class: 'msg__source', text: sourceNote }));
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return node;
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    fab.style.display = open ? 'none' : '';
    if (open) {
      if (!log.children.length) addMessage('bot', STRINGS['chat.greeting']);
      input.focus();
    }
  };

  const ask = async (question) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    busy = true;
    input.value = '';
    addMessage('me', trimmed);
    if (suggestHost) suggestHost.replaceChildren();

    const typing = addMessage('bot', STRINGS['chat.thinking']);
    typing.classList.add('msg--typing');

    let answer = null;
    let note = '';

    try {
      answer = await answerRemotely(trimmed, history);
    } catch {
      answer = null;
    }

    if (!answer) {
      const local = answerLocally(trimmed);
      if (local) {
        answer = local.text;
        if (local.alsoSee) {
          answer += `\n\nYou may also want to know: ${local.alsoSee.answer}`;
        }
        note = STRINGS['chat.fallbackNote'];
      } else {
        answer = NO_ANSWER;
      }
    }

    typing.remove();
    addMessage('bot', answer, note);

    history.push({ role: 'user', text: trimmed });
    history.push({ role: 'assistant', text: answer });
    busy = false;
    input.focus();
  };

  if (suggestHost) {
    const suggestions = [
      STRINGS['chat.suggest1'],
      STRINGS['chat.suggest2'],
      STRINGS['chat.suggest3'],
    ];
    suggestHost.replaceChildren(...suggestions.map((question) =>
      el('button', { type: 'button', text: question, 'on:click': () => ask(question) }),
    ));
  }

  fab.addEventListener('click', () => setOpen(true));
  closeBtn?.addEventListener('click', () => setOpen(false));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  return { open: () => setOpen(true), ask };
}
