[readme.md](https://github.com/user-attachments/files/35035487/readme.md)
# InkFlow — Book Publishing Workflow System

A web application that tracks book manuscripts through every editorial stage — **Submitted → Editing → Proofreading → Cover Design → Final Review → Published** — with authors, editors, comments, revision status, approval and publication status.

Built for the CA project (problem statement: *Book Publishing Workflow System*) using only **HTML, CSS and vanilla JavaScript** — no frameworks, no build step.

**Live demo:** https://charitarththakur.github.io/inkflow-k4p26pw/
**Team:** Paranthaman Prabhu Raj (12627060, leader) · Charitarth Thakur (12627155) · Mansi Devi (12624611) — Section K4P26PW

## Features

| Requirement | How InkFlow handles it |
|---|---|
| **Manuscripts** | Submit, edit, delete, search, filter and sort; generated SVG covers |
| **Authors** | Directory with each author's manuscripts; authors only see their own work |
| **Editors** | Directory with workload; editors are assigned per manuscript |
| **Stages** | Six-stage pipeline, stepper on each manuscript, Kanban board with drag-and-drop |
| **Comments** | Discussion thread per manuscript, tagged with the stage it was written in |
| **Revision status** | Requested → Author revising → Revised draft submitted → Accepted (counts rounds) |
| **Approval** | Final Review gate: Approve / Request changes / Reject (with notes) |
| **Publication status** | Not published → Scheduled → Published; valid ISBN-13 generated on publication |

### Workflow rules (enforced in `js/store.js`)
- Only editors/admins move manuscripts; forward moves are one stage at a time, backward moves are allowed.
- An editor must be assigned before editing starts.
- An open revision (requested / in progress / revised) blocks moving forward until an editor accepts it.
- Publishing requires **Approved**; rejected manuscripts cannot move forward.
- Published manuscripts are locked.

### Roles (use the "Acting as" menu in the header)
| Role | Can do |
|---|---|
| Author | Submit manuscripts, edit while in Submitted or revision, answer revision requests, comment, see own work only |
| Editor | Everything on all manuscripts: assign, move stages, request/accept revisions, approve, schedule, publish |
| Admin | Editor powers + add/remove people + delete any manuscript |

## Run it
Open `index.html` directly, or serve the folder (`python -m http.server`) and visit `http://localhost:8000`.
When opened from disk the browser blocks `fetch`, so a small built-in sample is used; through a server or GitHub Pages the full `data/seed.json` is loaded.

## Project structure
```text
index.html          page shell (semantic HTML, header, main, footer, dialog)
css/styles.css      design tokens (CSS variables), layout, components, dark mode, responsive
js/utils.js         escaping, dates, regex validation, ISBN-13 checksum
js/store.js         data + workflow rules + localStorage + fetch of seed.json
js/views.js         functions that return HTML for each page
js/app.js           router, event delegation, dialogs, drag-and-drop, theme
data/seed.json      sample data (11 manuscripts, 9 people) loaded with the Fetch API.
