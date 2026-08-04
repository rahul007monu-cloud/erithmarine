/**
 * jobs.js — The vacancy board.
 *
 * Reads from JOBS in content.js. `loadJobs()` is the single seam to swap in a
 * live API later without touching the rendering code.
 */

import { $, el } from './dom.js';
import { JOBS, STRINGS } from '../content.js';

const FILTERS = [
  { id: 'all', labelKey: 'careers.filterAll' },
  { id: 'deck', labelKey: 'careers.filterDeck' },
  { id: 'engine', labelKey: 'careers.filterEngine' },
  { id: 'catering', labelKey: 'careers.filterCatering' },
];

/**
 * Returns the vacancy list.
 * Replace the body with a fetch when a backend exists; the shape must match
 * the objects in content.js.
 */
export async function loadJobs() {
  return JOBS.filter((job) => job.status === 'open');
}

function jobCard(job, onApply) {
  const meta = [
    [STRINGS['careers.vessel'], job.vesselType],
    [STRINGS['careers.experience'], job.experience],
    [STRINGS['careers.joining'], job.joining],
    [STRINGS['careers.duration'], job.duration],
    [STRINGS['careers.coc'], job.coc],
  ];

  return el('article', { class: 'job' }, [
    el('div', {}, [
      el('div', { class: 'job__head' }, [
        el('h3', { class: 'job__rank', text: job.rank }),
        el('span', { class: 'job__tag', text: job.department }),
        el('span', { class: 'job__wage', text: job.salaryRange }),
      ]),
      el('dl', { class: 'job__meta' }, meta.flatMap(([label, value]) => [
        el('dt', { text: label }),
        el('dd', { text: value }),
      ])),
    ]),
    el('div', { class: 'job__action' }, [
      el('button', {
        class: 'job__apply',
        type: 'button',
        text: STRINGS['careers.apply'],
        'on:click': () => onApply(job),
      }),
    ]),
  ]);
}

/**
 * Mounts the board.
 * @param {Function} onApply called with the job when "Apply" is pressed
 */
export async function mountJobs(onApply) {
  const filterHost = $('#jobFilters');
  const listHost = $('#jobList');
  if (!filterHost || !listHost) return;

  let jobs = [];
  try {
    jobs = await loadJobs();
  } catch (error) {
    console.error('[jobs] could not load vacancies', error);
    listHost.replaceChildren(
      el('p', { class: 'jobs__empty', text: STRINGS['careers.empty'] }),
    );
    return;
  }

  let active = 'all';

  const draw = () => {
    const visible = active === 'all'
      ? jobs
      : jobs.filter((job) => job.department === active);

    listHost.replaceChildren(
      ...(visible.length
        ? visible.map((job) => jobCard(job, onApply))
        : [el('p', { class: 'jobs__empty', text: STRINGS['careers.empty'] })]),
    );

    for (const button of filterHost.children) {
      button.classList.toggle('is-active', button.dataset.filter === active);
    }
  };

  filterHost.replaceChildren(...FILTERS.map((filter) =>
    el('button', {
      type: 'button',
      text: STRINGS[filter.labelKey],
      dataset: { filter: filter.id },
      'on:click': () => { active = filter.id; draw(); },
    }),
  ));

  draw();
}
