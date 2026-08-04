/**
 * forms.js — The CV application form and the contact form.
 *
 * Both post to serverless endpoints under /api. When no backend is reachable
 * (for example a static preview deploy), submissions fall back to composing a
 * pre-filled mailto so an enquiry is never silently lost.
 */

import { $, $$, el } from './dom.js';
import { COMPANY, RANKS, VESSEL_TYPES, STRINGS } from '../content.js';

const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED_CV = /\.(pdf|doc|docx)$/i;

/* ----------------------------------------------------------------- helpers */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-()]{8,18}$/;

function setError(form, name, message) {
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  const input = form.elements[name];
  if (slot) slot.textContent = message || '';
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function clearErrors(form) {
  for (const slot of $$('[data-error-for]', form)) slot.textContent = '';
  for (const input of Array.from(form.elements)) input.removeAttribute?.('aria-invalid');
}

/** Generates a human-quotable reference like EMS-7K2P4M. */
function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `EMS-${out}`;
}

function showResult(host, { ok, title, body, ref }) {
  host.hidden = false;
  host.classList.toggle('is-error', !ok);
  host.replaceChildren(
    el('h3', { text: title }),
    el('p', {}, [body, ref ? el('code', { text: ref }) : null]),
  );
  host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Posts to an endpoint, returning `null` when the endpoint does not exist.
 * A missing /api route on a static host answers with HTML, so a JSON parse
 * failure is treated as "no backend" rather than a real error.
 */
async function postOrNull(url, body, isFormData = false) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
      body: isFormData ? body : JSON.stringify(body),
    });
    if (response.status === 404 || response.status === 405) return null;

    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { return null; }

    if (!response.ok) {
      throw new Error(data && data.error ? data.error : `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) return null;   // network unreachable
    throw error;
  }
}

function mailtoFallback(subject, lines) {
  const body = encodeURIComponent(lines.filter(Boolean).join('\n'));
  return `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}&body=${body}`;
}

/* ------------------------------------------------------------- apply form */

/** Fills the department, rank and vessel selects, keeping rank in sync. */
function wireRankSelects(form) {
  const department = form.elements.department;
  const rank = form.elements.rank;
  const vessel = form.elements.vesselType;
  if (!department || !rank) return;

  const departments = [
    { id: 'deck', label: 'Deck' },
    { id: 'engine', label: 'Engine' },
    { id: 'catering', label: 'Catering' },
  ];

  department.replaceChildren(
    el('option', { value: '', text: 'Select…' }),
    ...departments.map((d) => el('option', { value: d.id, text: d.label })),
  );

  if (vessel) {
    vessel.replaceChildren(
      el('option', { value: '', text: 'Select…' }),
      ...VESSEL_TYPES.map((v) => el('option', { value: v, text: v })),
    );
  }

  const fillRanks = () => {
    const list = RANKS[department.value] || [];
    rank.replaceChildren(
      el('option', { value: '', text: list.length ? 'Select…' : 'Choose a department first' }),
      ...list.map((r) => el('option', { value: r, text: r })),
    );
    rank.disabled = list.length === 0;
  };

  department.addEventListener('change', fillRanks);
  fillRanks();
}

/** File input: size/type validation plus drag-and-drop affordance. */
function wireDropzone(form) {
  const zone = $('#dropzone');
  const input = form.elements.cv;
  const label = $('#dropzoneText');
  if (!zone || !input || !label) return;

  const describe = () => {
    const file = input.files && input.files[0];
    if (!file) {
      zone.classList.remove('has-file');
      label.textContent = 'PDF, DOC or DOCX — up to 5 MB';
      return;
    }
    zone.classList.add('has-file');
    const kb = file.size / 1024;
    const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
    label.textContent = `${file.name} · ${size}`;
  };

  input.addEventListener('change', () => { setError(form, 'cv', ''); describe(); });

  for (const event of ['dragenter', 'dragover']) {
    zone.addEventListener(event, (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    zone.addEventListener(event, () => zone.classList.remove('is-dragover'));
  }
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      input.files = e.dataTransfer.files;
      describe();
    }
  });
}

function validateApply(form) {
  clearErrors(form);
  let ok = true;
  const value = (name) => (form.elements[name]?.value || '').trim();

  if (!value('name')) { setError(form, 'name', STRINGS['ui.required']); ok = false; }

  if (!value('email')) { setError(form, 'email', STRINGS['ui.required']); ok = false; }
  else if (!EMAIL_RE.test(value('email'))) { setError(form, 'email', STRINGS['ui.invalidEmail']); ok = false; }

  if (!value('phone')) { setError(form, 'phone', STRINGS['ui.required']); ok = false; }
  else if (!PHONE_RE.test(value('phone'))) { setError(form, 'phone', STRINGS['ui.invalidPhone']); ok = false; }

  if (!value('department')) { setError(form, 'department', STRINGS['ui.required']); ok = false; }
  if (!value('rank')) { setError(form, 'rank', STRINGS['ui.required']); ok = false; }

  const file = form.elements.cv?.files?.[0];
  if (!file) { setError(form, 'cv', STRINGS['ui.required']); ok = false; }
  else if (!ALLOWED_CV.test(file.name)) { setError(form, 'cv', STRINGS['ui.fileWrongType']); ok = false; }
  else if (file.size > MAX_CV_BYTES) { setError(form, 'cv', STRINGS['ui.fileTooLarge']); ok = false; }

  if (!form.elements.consent?.checked) { setError(form, 'consent', STRINGS['ui.required']); ok = false; }

  return ok;
}

export function mountApplyForm() {
  const form = $('#applyForm');
  const result = $('#applyResult');
  const submit = $('#applySubmit');
  if (!form || !result) return null;

  wireRankSelects(form);
  wireDropzone(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateApply(form)) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = STRINGS['apply.submitting'];
    const ref = reference();

    try {
      const payload = new FormData(form);
      payload.set('reference', ref);

      const response = await postOrNull('api/apply', payload, true);

      if (response === null) {
        // No backend reachable — hand the candidate a pre-filled email so the
        // application still reaches a human.
        const link = mailtoFallback(`CV — ${form.elements.rank.value} — ${ref}`, [
          `Reference: ${ref}`,
          `Name: ${form.elements.name.value}`,
          `Email: ${form.elements.email.value}`,
          `Phone: ${form.elements.phone.value}`,
          `Department: ${form.elements.department.value}`,
          `Rank: ${form.elements.rank.value}`,
          `Vessel type: ${form.elements.vesselType.value}`,
          `Experience: ${form.elements.experience.value}`,
          `INDoS: ${form.elements.indos.value}`,
          `Available from: ${form.elements.availability.value}`,
          '',
          form.elements.notes.value,
          '',
          '(Please attach your CV to this email.)',
        ]);

        showResult(result, {
          ok: true,
          title: STRINGS['apply.successTitle'],
          body: 'Your details are ready to send. Your email app will open — please attach your CV and send. Reference ',
          ref,
        });
        window.location.href = link;
      } else {
        showResult(result, {
          ok: true,
          title: STRINGS['apply.successTitle'],
          body: `${STRINGS['apply.successBody']} `,
          ref: response.reference || ref,
        });
        form.reset();
        $('#dropzone')?.classList.remove('has-file');
        if ($('#dropzoneText')) $('#dropzoneText').textContent = 'PDF, DOC or DOCX — up to 5 MB';
      }
    } catch (error) {
      console.error('[apply] submission failed', error);
      showResult(result, {
        ok: false,
        title: STRINGS['apply.errorTitle'],
        body: `${error.message}. Please email ${COMPANY.email} directly.`,
      });
    } finally {
      submit.disabled = false;
      submit.textContent = STRINGS['apply.submit'];
    }
  });

  /** Pre-selects a department and rank when a vacancy card is used. */
  return function prefill(job) {
    if (!job) return;
    const department = form.elements.department;
    const rank = form.elements.rank;
    const vessel = form.elements.vesselType;

    if (department) {
      department.value = job.department;
      department.dispatchEvent(new Event('change'));
    }
    if (rank) rank.value = job.rank;
    if (vessel) vessel.value = job.vesselType;
  };
}

/* ----------------------------------------------------------- contact form */

export function mountContactForm() {
  const form = $('#contactForm');
  const result = $('#contactResult');
  if (!form || !result) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const value = (name) => (form.elements[name]?.value || '').trim();
    let ok = true;
    if (!value('name')) { setError(form, 'name', STRINGS['ui.required']); ok = false; }
    if (!EMAIL_RE.test(value('email'))) { setError(form, 'email', STRINGS['ui.invalidEmail']); ok = false; }
    if (!value('message')) { setError(form, 'message', STRINGS['ui.required']); ok = false; }
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      const response = await postOrNull('api/contact', {
        name: value('name'),
        email: value('email'),
        phone: value('phone'),
        subject: value('subject'),
        message: value('message'),
      });

      if (response === null) {
        const link = mailtoFallback(value('subject') || 'Website enquiry', [
          `Name: ${value('name')}`,
          `Email: ${value('email')}`,
          `Phone: ${value('phone')}`,
          '',
          value('message'),
        ]);
        showResult(result, {
          ok: true,
          title: 'Ready to send',
          body: 'Your email app will open with this message prepared.',
        });
        window.location.href = link;
      } else {
        showResult(result, {
          ok: true,
          title: 'Message sent',
          body: 'Thank you — we reply during Indian business hours.',
        });
        form.reset();
      }
    } catch (error) {
      showResult(result, {
        ok: false,
        title: 'Could not send',
        body: `${error.message}. Please email ${COMPANY.email} directly.`,
      });
    } finally {
      button.disabled = false;
    }
  });
}
