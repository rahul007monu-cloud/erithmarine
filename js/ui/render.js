/**
 * render.js — Populates the static, data-driven parts of the page from
 * js/content.js: navigation, voyage rail, team, offices, fleet chips, stats,
 * the compliance badge and the footer.
 */

import { $, el, escapeHTML } from './dom.js';
import { COMPANY, NAVIGATION, VESSEL_TYPES, JOBS, STRINGS } from '../content.js';

/** Builds the top navigation and the left-hand voyage rail. */
export function renderNavigation(onJump) {
  const nav = $('#nav');
  const stops = $('#voyageStops');
  if (nav) nav.replaceChildren();
  if (stops) stops.replaceChildren();

  for (const item of NAVIGATION) {
    if (nav) {
      nav.append(el('a', {
        href: `#${item.id}`,
        text: item.label,
        dataset: { stop: String(item.stop), section: item.id },
        'on:click': (event) => {
          event.preventDefault();
          onJump(item.stop, item.id);
        },
      }));
    }

    if (stops) {
      stops.append(el('li', {}, [
        el('button', {
          type: 'button',
          title: item.label,
          'aria-label': item.label,
          dataset: { stop: String(item.stop), section: item.id },
          'on:click': () => onJump(item.stop, item.id),
        }),
      ]));
    }
  }
}

/** Marks the nav link and rail dot matching the active section. */
export function setActiveSection(sectionId) {
  for (const node of document.querySelectorAll('#nav a, #voyageStops button')) {
    node.classList.toggle('is-active', node.dataset.section === sectionId);
  }
}

/** Team cards. Initials stand in until real photographs are supplied. */
export function renderTeam() {
  const grid = $('#teamGrid');
  if (!grid) return;

  const initials = (name) =>
    name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0]))
      .slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  grid.replaceChildren(...COMPANY.team.map((member) =>
    el('article', { class: 'card card--tight' }, [
      el('div', { class: 'person' }, [
        el('span', { class: 'person__avatar', text: initials(member.name) }),
        el('div', {}, [
          el('div', { class: 'person__name', text: member.name }),
          el('div', { class: 'person__role', text: member.role }),
        ]),
      ]),
    ]),
  ));
}

/** Vessel-type chips in the Fleet section. */
export function renderFleet() {
  const list = $('#fleetChips');
  if (!list) return;
  list.replaceChildren(...VESSEL_TYPES.map((type) => el('li', { text: type })));
}

/**
 * Headline figures for the About section.
 * Derived from real data where possible so they cannot drift out of date.
 */
export function renderStats() {
  const row = $('#aboutStats');
  if (!row) return;

  const years = Math.max(1, new Date().getFullYear() - COMPANY.foundedYear);
  const openRoles = JOBS.filter((job) => job.status === 'open').length;

  const stats = [
    { value: `${years}+`, label: 'Years operating' },
    { value: String(COMPANY.offices.length), label: 'Offices' },
    { value: String(openRoles), label: 'Live vacancies' },
    { value: String(VESSEL_TYPES.length), label: 'Vessel types crewed' },
  ];

  row.replaceChildren(...stats.map((stat) =>
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__value', text: stat.value }),
      el('div', { class: 'stat__label', text: stat.label }),
    ]),
  ));
}

/** Office list and direct contact links. */
export function renderContact() {
  const list = $('#officeList');
  if (list) {
    list.replaceChildren(...COMPANY.offices.map((office) =>
      el('li', { class: 'office' }, [
        el('div', {}, [
          el('span', { class: 'office__city', text: office.city }),
          el('span', { class: 'office__role', text: office.role }),
        ]),
        el('p', { class: 'office__address', text: office.address }),
        office.phone
          ? el('a', { class: 'office__phone', href: `tel:${office.phone.replace(/\s/g, '')}`, text: office.phone })
          : null,
      ]),
    ));
  }

  const direct = $('#directContact');
  if (direct) {
    direct.replaceChildren(
      el('a', { href: `mailto:${COMPANY.email}`, html: `<span aria-hidden="true">✉</span> ${escapeHTML(COMPANY.email)}` }),
      el('a', { href: `tel:${COMPANY.mobile.replace(/\s/g, '')}`, html: `<span aria-hidden="true">✆</span> ${escapeHTML(COMPANY.mobile)}` }),
      el('a', { href: `tel:${COMPANY.landline.replace(/\s/g, '')}`, html: `<span aria-hidden="true">✆</span> ${escapeHTML(COMPANY.landline)}` }),
      el('a', {
        href: `https://wa.me/${COMPANY.whatsapp}`,
        target: '_blank', rel: 'noopener',
        html: `<span aria-hidden="true">◆</span> ${escapeHTML(STRINGS['ui.whatsapp'])}`,
      }),
    );
  }

  const year = $('#footerYear');
  if (year) year.textContent = `© ${new Date().getFullYear()}`;
}

/**
 * The compliance / anti-fraud badge.
 *
 * The licence line only renders when a real RPSL number exists in content.js.
 * Displaying an unverifiable licence claim would be worse than showing none,
 * so the no-fee warning stands on its own until the client supplies it.
 */
export function renderTrust() {
  const host = $('#trustBadge');
  if (!host) return;

  const children = [
    el('span', { class: 'trust__icon', html: '&#10003;', 'aria-hidden': 'true' }),
    el('div', {}, [
      el('div', { class: 'trust__title', text: STRINGS['trust.noFeeTitle'] }),
      el('p', { class: 'trust__body', text: STRINGS['trust.noFeeBody'] }),
    ]),
  ];

  if (COMPANY.rpslNumber) {
    children.push(el('div', { class: 'trust__licence' }, [
      el('div', { text: `${STRINGS['trust.rpslLabel']}: ${COMPANY.rpslNumber}` }),
      COMPANY.rpslValidUntil
        ? el('div', { text: `Valid to ${COMPANY.rpslValidUntil}` })
        : null,
    ]));
  }

  host.replaceChildren(...children);
}

/** Runs every static renderer. */
export function renderAll(onJump) {
  renderNavigation(onJump);
  renderTeam();
  renderFleet();
  renderStats();
  renderContact();
  renderTrust();
}
