# Edith Maritime — Existing Site Reference

Captured from the client's two live properties. This is the source of truth for
content and feature scope while rebuilding. Update it whenever the client
confirms or corrects a detail.

## Company

**Edith Maritime Services Pvt Ltd** — crew management, technical management,
commercial management, consultancy, and pre-sea courses.

| Field | Value |
| --- | --- |
| Email | edithmaritime01@gmail.com |
| Mobile | +91 78774 84978 |
| Landline | +91 141 452 0350 |
| Offices | Jaipur, Navi Mumbai, Dubai, Turkey |
| Founder / CEO | H.S. Tanwar |
| Management Head | Ashish Shukla |
| DPA | Capt. Dhruv |
| Tagline | "Navigate Your Maritime Success" |

> **Open questions for the client**
> - Registered RPSL licence number + validity (not currently displayed anywhere)
> - Full postal addresses for all four offices
> - Where Karan Singh Tomar should appear (named as a partner, absent from the site)
> - Official logo asset

## Site 1 — edithmaritime.com (WordPress + Elementor)

### Navigation

- Home
- About
- Services → Technical Management, Commercial Management, Consultancy Services, Crew Management
- Careers At EMS
- Pre Sea Courses
- Contact
- Blog (categories: Blog, Logistics, Transport)

### Homepage sections

1. Top bar — email, phone, office locations
2. Hero — "Navigate Your Maritime Success", CTAs: Contact us / Our Services
3. Three rotating hero blocks — Crew Management, Technical Excellence, Commercial & Consultancy
4. About — company intro plus Founder/CEO photo card
5. What We Do — four service cards
6. Meet Our Team — Founder CEO, Management Head, DPA
7. Key Features — four blurbs
8. Contact form — Name, Email, Phone, Subject, Message
9. Testimonials carousel — three client quotes
10. "10 Years" stats banner
11. Blog feed — three posts
12. Footer — company blurb, quick links, service links, two office addresses, two phone numbers, email, social icons

### Known gaps

- Blog posts are Elementor placeholder content (`hello-world`, lorem ipsum)
- Contact form has no confirmation step or CRM destination
- "Careers At EMS" is a static link, not a live job board
- No RPSL licence number or DG Shipping approval badge anywhere
- No multilingual support despite Dubai and Turkey offices
- Testimonials are generic, with no client logos or photos
- Top-bar trending text is hardcoded

## Site 2 — vessel-careers-2.emergent.host (Emergent low-code)

Internal recruitment CRM for seafarer CV submissions.

- Header: "Edith Maritime — Recruitment CRM"
- Public upload page: `/upload-cv`
- Admin dashboard:
  - Counters: Total, New CVs, Shortlisted, Duplicates, Rejected
  - Status tabs: New, Shortlisted, Rejected, All
  - Candidate list panel plus a detail panel

### Known gaps

- No filters (rank, vessel type, experience, certificate validity, nationality)
- No search
- No bulk actions or export
- No resume parsing or auto-tagging
- No communication log
- No document expiry tracking
- Duplicates are counted but there is no dedupe or merge tool

## Agreed scope for the rebuild

### Site 1 replacement — this repository

- Cinematic 3D marine experience: open ocean, container vessel, scroll-driven
  camera journey that moves from the horizon into the ship's interior
- Sections mapped onto ship locations (deck, bridge, engine room, cargo hold)
- Live job board driven by editable data
- CV upload wired to the same backend as the CRM
- Gemini-powered assistant for candidate queries
- PWA install support with offline shell
- RPSL licence badge and a "recruitment is free" trust notice
- English / Hindi language toggle (Turkish later)
- Per-page SEO metadata
- WhatsApp floating contact button

### CRM enhancements (phase 2)

Advanced filters, document expiry tracker with colour-coded warnings, resume
auto-parsing via Gemini, search, communication log, bulk actions, Excel/PDF
export, duplicate merge, interview scheduling, shareable client-facing candidate
lists, and an analytics dashboard.

## Technical notes

- Site 1 is WordPress/Elementor. This rebuild replaces it rather than extending it.
- Site 2 runs on Emergent; source export access is unconfirmed. Treat its
  database as an external integration until the client confirms what is exportable.
- The client already works with the Gemini API, so Gemini is the default AI provider.
