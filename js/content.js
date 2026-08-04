/**
 * content.js — Single source of truth for every piece of copy on the site.
 *
 * Non-developers can safely edit this file: change the strings, not the keys.
 * Anything marked TODO needs a real value from Edith Maritime before launch.
 */

/* ------------------------------------------------------------------ company */

export const COMPANY = {
  legalName: 'Edith Maritime Services Pvt Ltd',
  shortName: 'Edith Maritime',
  initials: 'EMS',
  email: 'edithmaritime01@gmail.com',
  mobile: '+91 78774 84978',
  landline: '+91 141 452 0350',
  whatsapp: '917877484978',

  // TODO(client): confirm the DG Shipping RPSL licence number and its validity.
  // Until these are supplied the compliance badge stays hidden rather than
  // showing a placeholder, because an unverifiable licence claim is worse than
  // no claim at all.
  rpslNumber: '',
  rpslValidUntil: '',

  foundedYear: 2015,

  offices: [
    {
      city: 'Jaipur',
      role: 'Registered Office',
      // TODO(client): full street address.
      address: 'Jaipur, Rajasthan, India',
      phone: '+91 141 452 0350',
    },
    {
      city: 'Navi Mumbai',
      role: 'Operations',
      address: 'Navi Mumbai, Maharashtra, India',
      phone: '+91 78774 84978',
    },
    { city: 'Dubai', role: 'Regional Desk', address: 'Dubai, United Arab Emirates', phone: '' },
    { city: 'Turkey', role: 'Regional Desk', address: 'Turkey', phone: '' },
  ],

  team: [
    { name: 'Karan Singh Tomar', role: 'Founder & Chief Executive Officer' },
    { name: 'Ashish Shukla', role: 'Head of Management' },
    { name: 'Capt. Dhruv', role: 'Designated Person Ashore (DPA)' },
  ],

  social: { linkedin: '', facebook: '', instagram: '' },
};

/* --------------------------------------------------------------- navigation */

/**
 * Each nav entry maps to a scroll stop in the 3D journey. `stop` is the index
 * used by the camera rig, so the order here defines the order of the voyage.
 */
export const NAVIGATION = [
  { id: 'hero', stop: 0, label: 'Home' },
  { id: 'about', stop: 2, label: 'About' },
  { id: 'services', stop: 3, label: 'Services' },
  { id: 'fleet', stop: 4, label: 'Fleet' },
  { id: 'team', stop: 5, label: 'Team' },
  { id: 'careers', stop: 6, label: 'Careers' },
  { id: 'technical', stop: 7, label: 'Technical' },
  { id: 'life', stop: 8, label: 'Life On Board' },
  { id: 'welfare', stop: 9, label: 'Welfare' },
  { id: 'training', stop: 10, label: 'Pre-Sea' },
  { id: 'apply', stop: 11, label: 'Apply' },
  { id: 'contact', stop: 12, label: 'Contact' },
];

/* -------------------------------------------------------------- ranks & jobs */

/** Rank taxonomy used by the job board and the CV form. */
export const RANKS = {
  deck: [
    'Master', 'Chief Officer', 'Second Officer', 'Third Officer',
    'Deck Cadet', 'Bosun', 'Able Seaman', 'Ordinary Seaman',
  ],
  engine: [
    'Chief Engineer', 'Second Engineer', 'Third Engineer', 'Fourth Engineer',
    'Electro-Technical Officer', 'Engine Cadet', 'Fitter', 'Oiler', 'Wiper',
  ],
  catering: ['Chief Cook', 'Second Cook', 'Messman', 'Steward'],
};

export const VESSEL_TYPES = [
  'Container', 'Bulk Carrier', 'Oil Tanker', 'Chemical Tanker',
  'LPG / LNG Carrier', 'Car Carrier', 'General Cargo', 'Offshore / OSV',
];

/**
 * Live vacancies. Replace this array as openings change — or point
 * `loadJobs()` in js/ui/jobs.js at an API once a backend exists.
 */
export const JOBS = [
  {
    id: 'ems-2026-001',
    rank: 'Second Officer',
    department: 'deck',
    vesselType: 'Container',
    experience: '24 months in rank',
    joining: 'Immediate',
    duration: '6 months ± 1',
    salaryRange: 'USD 4,800 – 5,400',
    coc: 'STCW II/2 (Management level)',
    status: 'open',
  },
  {
    id: 'ems-2026-002',
    rank: 'Third Engineer',
    department: 'engine',
    vesselType: 'Bulk Carrier',
    experience: '12 months in rank',
    joining: 'Within 30 days',
    duration: '8 months ± 1',
    salaryRange: 'USD 4,100 – 4,600',
    coc: 'STCW III/1',
    status: 'open',
  },
  {
    id: 'ems-2026-003',
    rank: 'Electro-Technical Officer',
    department: 'engine',
    vesselType: 'LPG / LNG Carrier',
    experience: 'Any, gas experience preferred',
    joining: 'Within 45 days',
    duration: '6 months',
    salaryRange: 'USD 3,900 – 4,500',
    coc: 'STCW III/6',
    status: 'open',
  },
  {
    id: 'ems-2026-004',
    rank: 'Deck Cadet',
    department: 'deck',
    vesselType: 'Container',
    experience: 'Fresher — pre-sea completed',
    joining: 'Rolling intake',
    duration: '12 months training',
    salaryRange: 'As per company scale',
    coc: 'DG Shipping approved pre-sea',
    status: 'open',
  },
  {
    id: 'ems-2026-005',
    rank: 'Chief Cook',
    department: 'catering',
    vesselType: 'General Cargo',
    experience: '36 months at sea',
    joining: 'Within 20 days',
    duration: '9 months',
    salaryRange: 'USD 1,600 – 1,900',
    coc: 'Ship Cook Certificate',
    status: 'open',
  },
];

/** Documents a seafarer is asked to keep current, used by the document vault. */
export const DOCUMENTS = [
  { id: 'passport', label: 'Passport', expires: true },
  { id: 'cdc', label: 'CDC (Continuous Discharge Certificate)', expires: true },
  { id: 'indos', label: 'INDoS Number', expires: false },
  { id: 'coc', label: 'Certificate of Competency', expires: true },
  { id: 'cop', label: 'Certificate of Proficiency', expires: true },
  { id: 'medical', label: 'Medical Fitness Certificate', expires: true },
  { id: 'yellowFever', label: 'Yellow Fever Vaccination', expires: true },
  { id: 'stcw', label: 'STCW Basic Safety Training', expires: true },
  { id: 'seamanBook', label: "Seaman's Book", expires: true },
  { id: 'visa', label: 'US Visa / Schengen (if held)', expires: true },
];

/* ------------------------------------------------------------------ copy */

/** All user-facing strings, keyed by dot-notation id. */
export const STRINGS = {
  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.services': 'Services',
  'nav.team': 'Team',
  'nav.fleet': 'Fleet',
  'nav.careers': 'Careers',
  'nav.technical': 'Technical',
  'nav.life': 'Life On Board',
  'nav.welfare': 'Welfare',
  'nav.training': 'Pre-Sea',
  'nav.apply': 'Apply',
  'nav.contact': 'Contact',

  'hero.eyebrow': 'Edith Maritime Services Pvt Ltd',
  'hero.title': 'Navigate Your Maritime Success',
  'hero.subtitle':
    'Crew management, technical and commercial ship management, and pre-sea guidance — delivered from Jaipur, Navi Mumbai, Dubai and Turkey.',
  'hero.ctaPrimary': 'View Vacancies',
  'hero.ctaSecondary': 'Upload Your CV',
  'hero.scrollHint': 'Scroll to board the vessel',

  'about.eyebrow': 'Who we are',
  'about.title': 'A crewing partner that answers the phone',
  'about.body':
    'Edith Maritime Services manages seafarers and ships for owners and managers across the world. We recruit, document, brief and follow up on every crew member we place, and we manage the technical and commercial side of the vessels entrusted to us. Our work is judged by two things: whether the ship sails on time, and whether the seafarer wants to sail with us again.',
  'about.point1': 'Full-cycle crewing — sourcing, screening, documentation, travel, sign-on',
  'about.point2': 'Technical and commercial management for owners',
  'about.point3': 'Pre-sea guidance for cadets entering the industry',
  'about.point4': 'Offices across India, the Gulf and Turkey',

  'services.eyebrow': 'What we do',
  'services.title': 'Four desks, one operation',
  'services.crew.title': 'Crew Management',
  'services.crew.body':
    'Sourcing, screening and deployment of officers, engineers and ratings across every major vessel type, with documentation and travel handled end to end.',
  'services.technical.title': 'Technical Management',
  'services.technical.body':
    'Planned maintenance, dry-dock supervision, spares and stores procurement, class and flag liaison, and ISM/ISPS compliance.',
  'services.commercial.title': 'Commercial Management',
  'services.commercial.body':
    'Chartering support, voyage accounting, bunker planning and post-fixture administration.',
  'services.consultancy.title': 'Consultancy',
  'services.consultancy.body':
    'Audits, vetting preparation, incident review and advisory for owners entering new trades or flags.',

  'fleet.eyebrow': 'Fleet',
  'fleet.title': 'The vessels we crew',
  'fleet.body':
    'We place officers, engineers and ratings across the full range of commercial tonnage. Each vessel class carries its own certificate requirements and its own working rhythm, and we brief every candidate on what the assignment actually involves before they sign.',
  'fleet.note': 'Tanker and gas assignments require the relevant specialised STCW certificates and prior experience on that vessel type.',

  'technical.eyebrow': 'Technical & safety',
  'technical.title': 'Run from the control room',
  'technical.body':
    'Technical management is unglamorous and entirely about discipline: a planned maintenance system that is actually followed, spares ordered before they are urgent, defects reported honestly, and audits that hold up because the work was done — not because the paperwork was tidied up beforehand.',
  'technical.point1.title': 'Planned maintenance',
  'technical.point1.body':
    'Machinery running hours, overhaul intervals and critical spares tracked per vessel.',
  'technical.point2.title': 'ISM & ISPS compliance',
  'technical.point2.body':
    'Safety management system upkeep, drills, internal audits and corrective action follow-through.',
  'technical.point3.title': 'Class & flag liaison',
  'technical.point3.body':
    'Survey scheduling, certificate validity and condition-of-class resolution before deadlines bite.',
  'technical.point4.title': 'Dry-dock supervision',
  'technical.point4.body':
    'Specification, yard selection, on-site supervision and final account scrutiny.',

  'life.eyebrow': 'Life on board',
  'life.title': 'Nine months is a long time',
  'life.body':
    'A contract is not only a wage. It is the food, the internet, the cabin, the people you share a mess room with, and whether anyone ashore picks up the phone when something goes wrong at 3 a.m. We ask our crew about all of it when they sign off, and we act on what they tell us.',
  'life.point1': 'Multinational crews — English is the working language on board',
  'life.point2': 'Structured watch systems with mandated rest hours under MLC',
  'life.point3': 'Connectivity, provisions and recreation raised directly with owners',
  'life.point4': 'A named shore contact for every seafarer we place',

  'welfare.eyebrow': 'Crew welfare',
  'welfare.title': 'What we owe the people we send to sea',
  'welfare.body':
    'Welfare is measured in specifics: wages paid on the date promised, relief arriving when the contract ends, medical cover that works in a foreign port, and a family at home who can reach someone. These are the things we are judged on, and the reason most of our crew sail with us again.',
  'welfare.point1.title': 'Wages on time',
  'welfare.point1.body':
    'Paid to the agreed schedule, with allotments to family accounts handled reliably.',
  'welfare.point2.title': 'Relief on schedule',
  'welfare.point2.body':
    'Contract end dates planned for in advance, not negotiated after they pass.',
  'welfare.point3.title': 'Medical & insurance',
  'welfare.point3.body':
    'P&I and medical cover explained before sign-on, with shore support if you are hospitalised abroad.',
  'welfare.point4.title': 'Family contact',
  'welfare.point4.body':
    'A shore number your family can call, answered by a person who knows your file.',

  'team.eyebrow': 'On the bridge',
  'team.title': 'The people accountable for your voyage',
  'team.body': 'A small, named team. You will know who is handling your file.',

  'careers.eyebrow': 'Careers at EMS',
  'careers.title': 'Current vacancies',
  'careers.body':
    'Live openings across deck, engine and catering departments. Apply once and your profile stays with us for future matching.',
  'careers.filterAll': 'All departments',
  'careers.filterDeck': 'Deck',
  'careers.filterEngine': 'Engine',
  'careers.filterCatering': 'Catering',
  'careers.apply': 'Apply for this rank',
  'careers.empty': 'No vacancies match this filter right now.',
  'careers.rank': 'Rank',
  'careers.vessel': 'Vessel',
  'careers.experience': 'Experience',
  'careers.joining': 'Joining',
  'careers.duration': 'Contract',
  'careers.wages': 'Wages',
  'careers.coc': 'Certificate',

  'training.eyebrow': 'Pre-sea courses',
  'training.title': 'Starting out at sea',
  'training.body':
    'If you are entering the merchant navy, the route matters more than the advertisement. We guide candidates toward DG Shipping approved pre-sea courses and explain honestly what each path leads to.',
  'training.step1.title': 'Check eligibility',
  'training.step1.body':
    'Age, 10+2 with Physics, Chemistry and Maths, English marks, and medical fitness including eyesight.',
  'training.step2.title': 'Choose the right course',
  'training.step2.body':
    'B.Sc. Nautical Science, DNS, GME, ETO or GP Rating — each leads to a different rank and timeline.',
  'training.step3.title': 'Verify the institute',
  'training.step3.body':
    'Only DG Shipping approved institutes count. We will tell you how to confirm approval yourself.',
  'training.step4.title': 'Plan the first contract',
  'training.step4.body':
    'Documentation, INDoS, CDC and what a first sign-on actually involves.',

  'apply.eyebrow': 'Apply',
  'apply.title': 'Send us your CV',
  'apply.body':
    'One form. Your details go straight to our crewing desk and stay on file for future openings.',
  'apply.name': 'Full name (as in passport)',
  'apply.email': 'Email address',
  'apply.phone': 'Mobile number (with country code)',
  'apply.rank': 'Rank applied for',
  'apply.department': 'Department',
  'apply.experience': 'Total sea experience',
  'apply.vessel': 'Last vessel type',
  'apply.indos': 'INDoS number (if held)',
  'apply.availability': 'Available from',
  'apply.cv': 'Attach CV (PDF or DOC, max 5 MB)',
  'apply.notes': 'Anything else we should know',
  'apply.consent':
    'I confirm the information above is true and consent to Edith Maritime storing it for recruitment purposes.',
  'apply.submit': 'Submit application',
  'apply.submitting': 'Submitting…',
  'apply.successTitle': 'Application received',
  'apply.successBody':
    'We have your CV. Our crewing desk reviews every submission and will contact you if there is a match. Your reference number is',
  'apply.errorTitle': 'Could not submit',
  'apply.another': 'Submit another application',

  'contact.eyebrow': 'Contact',
  'contact.title': 'Reach the crewing desk',
  'contact.body': 'Call, email or send a message. We reply during Indian business hours.',
  'contact.formName': 'Your name',
  'contact.formEmail': 'Email',
  'contact.formPhone': 'Phone',
  'contact.formSubject': 'Subject',
  'contact.formMessage': 'Message',
  'contact.formSubmit': 'Send message',
  'contact.offices': 'Our offices',

  'trust.noFeeTitle': 'We never charge for placement',
  'trust.noFeeBody':
    'Recruitment for a job on board is free. If anyone asks you for money in our name, do not pay — email us directly.',
  'trust.rpslLabel': 'RPSL Licence',
  'trust.verifyLabel': 'Verify us on the DG Shipping RPSL list',

  'chat.title': 'Ask about a career at sea',
  'chat.greeting':
    'Hello. I can answer questions about ranks, eligibility, pre-sea courses, documents and how to apply. What would you like to know?',
  'chat.placeholder': 'Type your question…',
  'chat.send': 'Send',
  'chat.disclaimer': 'Automated assistant. For anything binding, confirm with our crewing desk.',
  'chat.thinking': 'Thinking…',
  'chat.suggest1': 'How do I join the merchant navy after 12th?',
  'chat.suggest2': 'What documents do I need to sail?',
  'chat.suggest3': 'What does a Deck Cadet earn?',
  'chat.fallbackNote': 'Answered from our own information pages.',

  'footer.tagline': 'Crew, technical and commercial ship management.',
  'footer.legal': 'Recruitment for shipboard employment is free of charge.',
  'footer.rights': 'All rights reserved.',

  'ui.install': 'Install app',
  'ui.menu': 'Menu',
  'ui.close': 'Close',
  'ui.loading': 'Preparing the vessel…',
  'ui.enter': 'Enter',
  'ui.skip3d': 'Skip the 3D tour',
  'ui.whatsapp': 'WhatsApp us',
  'ui.required': 'This field is required',
  'ui.invalidEmail': 'Enter a valid email address',
  'ui.invalidPhone': 'Enter a valid phone number',
  'ui.fileTooLarge': 'File must be under 5 MB',
  'ui.fileWrongType': 'Upload a PDF, DOC or DOCX file',
};

/** Looks up a string by key, returning the key itself if it is missing. */
export function t(key) {
  return Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : key;
}

/* ------------------------------------------------------ assistant knowledge */

/**
 * The assistant's knowledge base.
 *
 * This powers the built-in retrieval assistant, which runs entirely in the
 * browser with no API key and no per-message cost. If a Gemini key is later
 * configured on the server, the same entries are passed to the model as
 * grounding context — so the answers the site gives never drift from the
 * answers the model gives.
 *
 * `keywords` are matched against the visitor's question; `answer` is returned
 * verbatim. Keep answers factual and short.
 */
export const KNOWLEDGE = [
  {
    id: 'join-after-12th',
    keywords: [
      'join', 'after 12th', '12th', 'twelfth', 'start', 'begin', 'career',
      'how to become', 'entry', 'fresher', 'become sailor', 'merchant navy',
    ],
    answer:
      'After 10+2 with Physics, Chemistry and Maths, the usual routes are B.Sc. Nautical Science, Diploma in Nautical Science (DNS), Graduate Marine Engineering (GME) for engineering graduates, Electro-Technical Officer (ETO), or General Purpose (GP) Rating. Deck and engine officer routes need the PCM background and a medical fitness certificate including eyesight standards. The most important step is choosing an institute that is approved by the Directorate General of Shipping — you can verify approval on the DG Shipping website before paying anyone.',
  },
  {
    id: 'documents',
    keywords: [
      'document', 'documents', 'paper', 'papers', 'certificate', 'need to sail',
      'cdc', 'indos', 'passport', 'medical', 'stcw', 'requirement',
    ],
    answer:
      'To sail you normally need: a valid passport, CDC (Continuous Discharge Certificate), an INDoS number, your Certificate of Competency or Proficiency for your rank, a medical fitness certificate, yellow fever vaccination, and STCW basic safety training. Officers also need the STCW certificate matching their level. Keep track of expiry dates — an expired medical or STCW course is the most common reason a sign-on is delayed.',
  },
  {
    id: 'cadet-salary',
    keywords: [
      'salary', 'wage', 'pay', 'earn', 'stipend', 'money', 'income',
      'cadet salary', 'how much',
    ],
    answer:
      'Wages depend on rank, vessel type, the owner and the collective agreement, so any single number would be misleading. As a guide, junior officers on our current openings are in the USD 3,900 – 5,400 range per month, and cadets are paid a training stipend set by the company scale. Exact figures for a specific vacancy are listed in the Careers section, and our crewing desk will confirm them in writing before you sign.',
  },
  {
    id: 'no-fee',
    keywords: [
      'fee', 'fees', 'charge', 'payment', 'pay money', 'agent money', 'donation',
      'bribe', 'scam', 'fraud', 'is it free', 'cost',
    ],
    answer:
      'Recruitment for shipboard employment is free of charge. Edith Maritime never asks a candidate for placement money. In India, seafarers must be recruited through an RPSL agency licensed by the Directorate General of Shipping, and licensed agencies are not permitted to charge for placement. If anyone asks you for money in our name, do not pay — email us directly at ' +
      COMPANY.email + ' and we will look into it.',
  },
  {
    id: 'apply-how',
    keywords: [
      'apply', 'application', 'upload', 'cv', 'resume', 'send cv', 'how to apply',
      'submit',
    ],
    answer:
      'Use the Apply section of this site. Fill in your name, contact details, rank, sea experience and availability, and attach your CV as a PDF or DOC under 5 MB. You will get a reference number on screen. Our crewing desk reviews every submission, and your profile stays on file for future openings even if there is no match today.',
  },
  {
    id: 'vacancies',
    keywords: [
      'vacancy', 'vacancies', 'opening', 'openings', 'job', 'jobs', 'hiring',
      'position', 'available',
    ],
    answer:
      'Current openings are listed in the Careers section of this site, with rank, vessel type, required experience, contract length and joining window for each. You can filter by deck, engine or catering department. If nothing matches your rank today, still upload your CV — we match against new requirements as they come in.',
  },
  {
    id: 'rpsl',
    keywords: [
      'rpsl', 'licence', 'license', 'dg shipping', 'approved', 'registered',
      'genuine', 'verify', 'legitimate',
    ],
    answer:
      'In India, recruitment and placement of seafarers is regulated by the Directorate General of Shipping under the Merchant Shipping (Recruitment and Placement of Seafarers) Rules. Seafarers should only be recruited through a licensed RPSL agency. You can and should verify any agency against the DG Shipping RPSL list before sharing documents or money.',
  },
  {
    id: 'services',
    keywords: [
      'service', 'services', 'what do you do', 'technical management',
      'commercial', 'consultancy', 'crew management', 'company',
    ],
    answer:
      'Edith Maritime Services operates four desks: Crew Management (sourcing, screening, documentation, travel and sign-on), Technical Management (planned maintenance, dry-dock supervision, procurement, class and flag liaison, ISM/ISPS), Commercial Management (chartering support, voyage accounting, bunker planning) and Consultancy (audits, vetting preparation, incident review).',
  },
  {
    id: 'contact',
    keywords: [
      'contact', 'phone', 'email', 'call', 'reach', 'address', 'office',
      'where are you', 'location', 'whatsapp',
    ],
    answer:
      `You can reach us at ${COMPANY.email}, on ${COMPANY.mobile}, or on ${COMPANY.landline}. We have offices in ` +
      COMPANY.offices.map((o) => o.city).join(', ') +
      '. We reply during Indian business hours.',
  },
  {
    id: 'eligibility-medical',
    keywords: [
      'medical', 'eyesight', 'eye', 'vision', 'colour blind', 'color blind',
      'height', 'fitness', 'tattoo', 'age limit', 'age',
    ],
    answer:
      'Sea service requires a medical fitness certificate from a DG Shipping approved doctor. Eyesight standards are stricter for the deck department than for engine, and colour vision is assessed for navigational duties. Age limits and specific standards vary by course and by the owner, so the safest step is to get a pre-medical check at an approved centre before you pay any course fee. We cannot assess medical fitness ourselves — that is the examining doctor\'s decision.',
  },
  {
    id: 'contract-length',
    keywords: [
      'contract', 'how long', 'duration', 'months', 'tenure', 'sign off',
      'leave', 'relief',
    ],
    answer:
      'Contract lengths on our current openings run between 6 and 9 months, usually with a one-month margin either side. The exact tenure, relief port and leave terms are stated in the employment agreement you sign before joining. Never join on a verbal promise — get the contract in writing.',
  },
  {
    id: 'vessel-types',
    keywords: [
      'vessel', 'ship type', 'tanker', 'container', 'bulk', 'lng', 'lpg',
      'which ships', 'fleet',
    ],
    answer:
      'We crew container ships, bulk carriers, oil and chemical tankers, LPG and LNG carriers, car carriers, general cargo vessels and offshore support vessels. Tanker and gas assignments usually require the relevant specialised STCW certificates and prior experience on that vessel type.',
  },
];

/** Topics the assistant must refuse or redirect rather than guess about. */
export const ASSISTANT_GUARDRAILS = [
  'Do not promise a job, a joining date, a specific salary or visa approval.',
  'Do not give medical, legal or immigration advice.',
  'Do not invent an RPSL licence number, certificate number or office address.',
  'If asked something not covered by the provided facts, say so plainly and point the person to the contact details.',
  'If someone reports being asked for money in the company name, tell them not to pay and to email the company directly.',
];

/** Compact company facts handed to the model as grounding, when one is configured. */
export const ASSISTANT_FACTS = [
  `${COMPANY.legalName} provides crew management, technical management, commercial management, consultancy and pre-sea guidance.`,
  `Contact: ${COMPANY.email}, ${COMPANY.mobile}, ${COMPANY.landline}.`,
  `Offices: ${COMPANY.offices.map((o) => o.city).join(', ')}.`,
  `Leadership: ${COMPANY.team.map((x) => `${x.name} (${x.role})`).join('; ')}.`,
  'Recruitment for shipboard employment is free of charge; the company never asks candidates for placement fees.',
  `Open vacancies: ${JOBS.filter((j) => j.status === 'open').map((j) => `${j.rank} on ${j.vesselType}`).join('; ')}.`,
];
