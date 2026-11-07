/* views.js — turns data into HTML strings. No event handling here (that lives in app.js)
   and no data changes (those live in store.js). Every piece of user text goes through esc(). */
PW.views = (function () {
  'use strict';

  const { esc, fmtDate, fmtDateTime, timeAgo, daysUntil, todayISO, initials, hashString, wrapText, number, GENRES } = PW.utils;
  const S = PW.store;
  const FILTER_KEY = 'inkflow.filters';
  const DEFAULT_FILTERS = { q: '', stage: 'all', genre: 'all', focus: 'all', sort: 'recent' };

  /* ---------- Filters are remembered per tab with sessionStorage ---------- */
  function getFilters() {
    try { return { ...DEFAULT_FILTERS, ...JSON.parse(sessionStorage.getItem(FILTER_KEY)) }; }
    catch (e) { return { ...DEFAULT_FILTERS }; }
  }
  function setFilters(next) {
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  }

  /* ---------- Small building blocks ---------- */
  const nameOf = (id) => (S.userById(id) ? S.userById(id).name : 'Unassigned');
  const badge = (kind, value, label) =>
    `<span class="badge" data-kind="${kind}" data-value="${esc(value)}">${esc(label)}</span>`;
  const avatar = (user, cls = '') => user
    ? `<span class="avatar ${cls}" data-role="${esc(user.role)}" title="${esc(user.name)}" aria-hidden="true">${esc(initials(user.name))}</span>`
    : `<span class="avatar none ${cls}" title="No editor assigned" aria-hidden="true">?</span>`;

  function statusBadges(ms) {
    const out = [];
    if (ms.revisionStatus !== 'none') out.push(badge('revision', ms.revisionStatus, S.REVISION[ms.revisionStatus]));
    if (ms.stage === 'review' || ms.approvalStatus !== 'pending') out.push(badge('approval', ms.approvalStatus, S.APPROVAL[ms.approvalStatus]));
    if (ms.publicationStatus !== 'unpublished' && ms.stage !== 'published') out.push(badge('publication', ms.publicationStatus, S.PUBLICATION[ms.publicationStatus]));
    return out.join('');
  }

  function deadlineChip(ms) {
    if (!ms.deadline) return '';
    if (ms.stage === 'published') return `<span class="chip">Due ${fmtDate(ms.deadline)}</span>`;
    const d = daysUntil(ms.deadline);
    const state = d < 0 ? 'late' : d <= 7 ? 'soon' : 'ok';
    const text = d < 0 ? `${-d} d overdue` : d === 0 ? 'Due today' : `Due in ${d} d`;
    return `<span class="chip" data-state="${state}" title="Deadline ${fmtDate(ms.deadline)}">${text}</span>`;
  }

  /* ---------- Generated SVG book cover (Unit I: SVG graphics) ---------- */
  let coverCounter = 0;
  function cover(ms, cls = '') {
    coverCounter += 1;
    const h = hashString(ms.title);
    const hue = h % 360;
    const gid = `cg${coverCounter}`;
    const lines = wrapText(ms.title, 12, 4)
      .map((line, i) => `<tspan x="60" dy="${i ? 17 : 0}">${esc(line)}</tspan>`).join('');
    const author = nameOf(ms.authorId).toUpperCase();
    return `<svg class="cover ${cls}" viewBox="0 0 120 170" role="img" aria-label="Generated cover of ${esc(ms.title)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 52% 36%)"/><stop offset="1" stop-color="hsl(${(hue + 45) % 360} 58% 20%)"/>
      </linearGradient></defs>
      <rect width="120" height="170" rx="5" fill="url(#${gid})"/>
      <rect x="7" width="3" height="170" fill="rgba(255,255,255,.2)"/>
      <circle cx="62" cy="34" r="13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>
      <path d="M55 36q7-12 14 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>
      <text x="60" y="78" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="12.5" font-weight="700">${lines}</text>
      <text x="62" y="158" text-anchor="middle" fill="rgba(255,255,255,.8)" font-family="Arial,sans-serif" font-size="6.5" letter-spacing="1">${esc(author.length > 22 ? author.slice(0, 21) + '…' : author)}</text>
    </svg>`;
  }

  const stepper = (ms) => {
    const current = S.stageIndex(ms.stage);
    return `<ol class="stepper" aria-label="Workflow progress">${S.STAGES.map((s, i) => {
      const status = i < current ? 'done' : i === current ? 'current' : 'todo';
      return `<li class="${status}"${i === current ? ' aria-current="step"' : ''}>
        <span class="dot" aria-hidden="true">${i < current ? '✓' : i + 1}</span><span class="step-label">${esc(s.label)}</span></li>`;
    }).join('')}</ol>`;
  };

  const emptyState = (title, text) =>
    `<div class="empty"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M12 10h30a6 6 0 0 1 6 6v38H18a6 6 0 0 1-6-6z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 22h20M20 32h20M20 42h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
    <h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;

  /* ================================================================
     DASHBOARD
     ================================================================ */
  function dashboard() {
    const me = S.currentUser();
    const list = S.visibleManuscripts();
    const st = S.statsFor(list);
    const max = Math.max(1, ...st.perStage.map((s) => s.count));
    const staff = S.isStaff(me);

    const tiles = [
      ['Manuscripts', st.total, 'all', ''],
      ['In production', st.inProgress, 'progress', 'editing → review'],
      ['Awaiting approval', st.awaitingApproval, 'approval', 'at final review'],
      ['Open revisions', st.openRevisions, 'revision', 'author ↔ editor'],
      ['Published', st.published, 'published', 'ISBN assigned'],
      ['Overdue', st.overdue, 'late', 'past deadline'],
    ].map(([label, value, kind, sub]) =>
      `<li class="stat" data-kind="${kind}"><span class="stat-value">${value}</span><span class="stat-label">${label}</span><span class="stat-sub">${sub}</span></li>`).join('');

    const attention = [];
    list.forEach((m) => {
      if (!staff && m.revisionStatus === 'requested') attention.push([m, 'Editor asked for a revision — start working on it.']);
      else if (!staff && m.revisionStatus === 'in_progress') attention.push([m, 'Revision in progress — submit your revised draft when ready.']);
      if (staff && m.revisionStatus === 'revised') attention.push([m, 'Revised draft submitted — review and accept it.']);
      if (staff && m.stage === 'submitted' && !m.editorId) attention.push([m, 'New submission — assign an editor.']);
      if (staff && m.stage === 'review' && m.approvalStatus === 'pending' && !S.isRevisionOpen(m)) attention.push([m, 'Ready for your approval decision.']);
      if (staff && m.stage === 'review' && m.approvalStatus === 'approved' && m.publicationStatus !== 'published') attention.push([m, m.publicationStatus === 'scheduled' ? `Scheduled for ${fmtDate(m.pubDate)} — publish when ready.` : 'Approved — schedule or publish.']);
      if (m.deadline && m.stage !== 'published' && daysUntil(m.deadline) < 0) attention.push([m, `Deadline passed on ${fmtDate(m.deadline)}.`]);
    });

    const visibleIds = new Set(list.map((m) => m.id));
    const recent = S.activity.filter((a) => !a.msId || visibleIds.has(a.msId)).slice(0, 8);

    return `
    <header class="page-head">
      <div><p class="eyebrow">${esc(S.ROLES[me.role])} workspace</p><h1>Welcome back, ${esc(me.name.split(' ')[0])}</h1>
      <p class="lede">${staff ? 'Track every manuscript from first draft to published book.' : 'Follow your manuscripts through each editorial stage.'}</p></div>
      <button class="btn primary" data-action="new-manuscript">＋ ${staff ? 'New manuscript' : 'Submit a manuscript'}</button>
    </header>
    <ul class="stats" aria-label="Summary figures">${tiles}</ul>
    <div class="grid-2">
      <section class="panel" aria-labelledby="pipe-h">
        <h2 id="pipe-h">Pipeline</h2>
        <ul class="bars">${st.perStage.map((s) => `
          <li><span class="bar-label">${esc(s.label)}</span>
          <span class="bar-track"><span class="bar-fill" data-stage="${s.id}" style="width:${(s.count / max) * 100}%"></span></span>
          <span class="bar-count">${s.count}</span></li>`).join('')}</ul>
        <p class="muted small"><a href="#/board">Open the board →</a></p>
      </section>
      <section class="panel" aria-labelledby="att-h">
        <h2 id="att-h">Needs attention <span class="count-pill">${attention.length}</span></h2>
        ${attention.length ? `<ul class="attention">${attention.slice(0, 7).map(([m, why]) => `
          <li><a href="#/manuscript/${esc(m.id)}"><strong>${esc(m.title)}</strong></a><span>${esc(why)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Nothing is waiting on you. 🎉</p>'}
      </section>
    </div>
    <section class="panel" aria-labelledby="act-h">
      <h2 id="act-h">Recent activity</h2>
      ${recent.length ? `<ul class="activity">${recent.map((a) => `
        <li>${avatar(S.userById(a.userId))}<span><strong>${esc(nameOf(a.userId))}</strong> ${esc(a.text)}</span>
        <time datetime="${esc(a.at)}">${timeAgo(a.at)}</time></li>`).join('')}</ul>` : '<p class="muted">No activity yet.</p>'}
    </section>`;
  }

  /* ================================================================
     KANBAN BOARD (drag-and-drop lives in app.js)
     ================================================================ */
  function card(ms, canMove) {
    const idx = S.stageIndex(ms.stage);
    const prev = S.STAGES[idx - 1];
    const next = S.STAGES[idx + 1];
    const editor = S.userById(ms.editorId);
    return `<li><article class="card" data-id="${esc(ms.id)}" ${canMove && ms.stage !== 'published' ? 'draggable="true"' : ''}>
      <div class="card-top">${cover(ms, 'mini')}<div>
        <h3><a href="#/manuscript/${esc(ms.id)}">${esc(ms.title)}</a></h3>
        <p class="muted small">${esc(nameOf(ms.authorId))} · ${esc(ms.genre)}</p></div></div>
      <div class="chips">${statusBadges(ms)}</div>
      <div class="card-foot">
        <span class="card-people" title="Editor: ${esc(editor ? editor.name : 'none')}">${avatar(editor)}</span>
        ${deadlineChip(ms)}
        ${canMove && ms.stage !== 'published' ? `<span class="card-move">
          ${prev ? `<button class="icon-btn" data-action="move" data-id="${esc(ms.id)}" data-stage="${prev.id}" aria-label="Send ${esc(ms.title)} back to ${esc(prev.label)}" title="Back to ${esc(prev.label)}">◀</button>` : ''}
          ${next ? `<button class="icon-btn" data-action="move" data-id="${esc(ms.id)}" data-stage="${next.id}" aria-label="Advance ${esc(ms.title)} to ${esc(next.label)}" title="Advance to ${esc(next.label)}">▶</button>` : ''}
        </span>` : ''}
      </div></article></li>`;
  }

  function board() {
    const list = S.visibleManuscripts();
    const canMove = S.isStaff(S.currentUser());
    return `
    <header class="page-head"><div><p class="eyebrow">Workflow</p><h1>Editorial board</h1>
      <p class="lede">${canMove ? 'Drag a card to the next column (or use the ◀ ▶ buttons). Workflow rules are enforced.' : 'A read-only view of where your manuscripts are in the pipeline.'}</p></div>
      <button class="btn primary" data-action="new-manuscript">＋ ${canMove ? 'New manuscript' : 'Submit a manuscript'}</button></header>
    <div class="board" role="list">${S.STAGES.map((s) => {
      const items = list.filter((m) => m.stage === s.id);
      return `<section class="column" role="listitem" data-stage="${s.id}" aria-labelledby="col-${s.id}">
        <header><h2 id="col-${s.id}">${esc(s.label)}</h2><span class="count-pill">${items.length}</span></header>
        <p class="column-hint">${esc(s.hint)}</p>
        <ul class="cards" data-stage="${s.id}">${items.map((m) => card(m, canMove)).join('') || '<li class="drop-hint">No manuscripts</li>'}</ul></section>`;
    }).join('')}</div>`;
  }

  /* ================================================================
     MANUSCRIPT LIST
     ================================================================ */
  function applyFilters(list, f) {
    const q = f.q.trim().toLowerCase();
    const today = todayISO();
    let out = list.filter((m) => {
      if (q && !(`${m.title} ${nameOf(m.authorId)} ${m.genre} ${m.synopsis} ${m.isbn || ''}`.toLowerCase().includes(q))) return false;
      if (f.stage !== 'all' && m.stage !== f.stage) return false;
      if (f.genre !== 'all' && m.genre !== f.genre) return false;
      if (f.focus === 'revision' && !S.isRevisionOpen(m)) return false;
      if (f.focus === 'approval' && !(m.stage === 'review' && m.approvalStatus === 'pending')) return false;
      if (f.focus === 'overdue' && !(m.deadline && m.deadline < today && m.stage !== 'published')) return false;
      if (f.focus === 'unassigned' && m.editorId) return false;
      return true;
    });
    const sorters = {
      recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      title: (a, b) => a.title.localeCompare(b.title),
      deadline: (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'),
      words: (a, b) => b.wordCount - a.wordCount,
    };
    out = out.slice().sort(sorters[f.sort] || sorters.recent);
    return out;
  }

  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;

  function manuscripts() {
    const f = getFilters();
    const all = S.visibleManuscripts();
    const shown = applyFilters(all, f);
    const me = S.currentUser();
    return `
    <header class="page-head"><div><p class="eyebrow">Library</p><h1>${S.isStaff(me) ? 'All manuscripts' : 'My manuscripts'}</h1>
      <p class="lede"><span id="result-count">${shown.length}</span> of ${all.length} shown</p></div>
      <button class="btn primary" data-action="new-manuscript">＋ ${S.isStaff(me) ? 'New manuscript' : 'Submit a manuscript'}</button></header>
    <form class="filters" id="filterForm" role="search" aria-label="Filter manuscripts" autocomplete="off">
      <label class="field grow"><span>Search</span><input type="search" name="q" value="${esc(f.q)}" placeholder="Title, author, genre, ISBN…"></label>
      <label class="field"><span>Stage</span><select name="stage">${option('all', 'All stages', f.stage)}${S.STAGES.map((s) => option(s.id, s.label, f.stage)).join('')}</select></label>
      <label class="field"><span>Genre</span><select name="genre">${option('all', 'All genres', f.genre)}${GENRES.map((g) => option(g, g, f.genre)).join('')}</select></label>
      <label class="field"><span>Show</span><select name="focus">${[['all', 'Everything'], ['revision', 'Open revisions'], ['approval', 'Awaiting approval'], ['overdue', 'Overdue'], ['unassigned', 'No editor']].map(([v, l]) => option(v, l, f.focus)).join('')}</select></label>
      <label class="field"><span>Sort by</span><select name="sort">${[['recent', 'Recently updated'], ['title', 'Title A–Z'], ['deadline', 'Deadline'], ['words', 'Word count']].map(([v, l]) => option(v, l, f.sort)).join('')}</select></label>
      <button type="button" class="btn ghost" data-action="clear-filters">Reset</button>
    </form>
    <div id="manuscript-grid">${manuscriptGrid(shown)}</div>`;
  }

  function manuscriptGrid(shown) {
    if (!shown.length) return emptyState('No manuscripts match', 'Try clearing a filter, or submit a new manuscript.');
    return `<ul class="ms-grid">${shown.map((m) => `
      <li><article class="ms-card">
        <a class="ms-cover" href="#/manuscript/${esc(m.id)}" tabindex="-1" aria-hidden="true">${cover(m)}</a>
        <div class="ms-body">
          <h2><a href="#/manuscript/${esc(m.id)}">${esc(m.title)}</a></h2>
          <p class="muted small">${esc(nameOf(m.authorId))} · ${esc(m.genre)} · ${number(m.wordCount)} words</p>
          <p class="clamp">${esc(m.synopsis)}</p>
          <div class="chips">${badge('stage', m.stage, S.stageLabel(m.stage))}${statusBadges(m)}${deadlineChip(m)}</div>
        </div></article></li>`).join('')}</ul>`;
  }

  /* ================================================================
     MANUSCRIPT DETAIL
     ================================================================ */
  function staffPanel(ms) {
    const idx = S.stageIndex(ms.stage);
    const prev = S.STAGES[idx - 1];
    const next = S.STAGES[idx + 1];
    const id = esc(ms.id);
    const editors = S.users().filter((u) => u.role !== 'author');
    const blocker = next ? S.checkMove(ms, next.id) : null;
    const locked = ms.stage === 'published';
    let html = `<h3>Editorial actions</h3>`;

    if (locked) return html + '<p class="muted">This book is published and locked. 🎉</p>';

    html += `<form class="inline-form" data-form="assign" data-id="${id}">
      <label class="field grow"><span>Editor</span><select name="editorId"><option value="">— choose —</option>${editors.map((u) => option(u.id, `${u.name} (${u.specialty || S.ROLES[u.role]})`, ms.editorId)).join('')}</select></label>
      <button class="btn" type="submit">${ms.editorId ? 'Reassign' : 'Assign'}</button></form>`;

    html += `<div class="btn-row">
      ${prev ? `<button class="btn" data-action="move" data-id="${id}" data-stage="${prev.id}">← Back to ${esc(prev.label)}</button>` : ''}
      ${next ? `<button class="btn primary" data-action="move" data-id="${id}" data-stage="${next.id}">${next.id === 'published' ? '📖 Publish now' : `Advance to ${esc(next.label)} →`}</button>` : ''}</div>`;
    if (blocker) html += `<p class="hint" role="note">⚠ ${esc(blocker)}</p>`;

    html += '<hr>';
    if (ms.revisionStatus === 'revised') {
      html += `<p class="hint info">The author submitted a revised draft.</p>
        <div class="btn-row"><button class="btn primary" data-action="accept-revision" data-id="${id}">Accept revision</button>
        <button class="btn" data-action="request-revision" data-id="${id}">Ask for more changes</button></div>`;
    } else if (!S.isRevisionOpen(ms)) {
      html += `<div class="btn-row"><button class="btn" data-action="request-revision" data-id="${id}">Request a revision</button></div>`;
    } else {
      html += `<p class="muted small">Revision open — waiting for the author.</p>`;
    }

    if (ms.stage === 'review') {
      html += `<hr><h4>Final approval</h4><div class="btn-row">
        <button class="btn good" data-action="approve" data-id="${id}" ${ms.approvalStatus === 'approved' ? 'disabled' : ''}>✔ Approve</button>
        <button class="btn" data-action="request-changes" data-id="${id}">Request changes</button>
        <button class="btn danger" data-action="reject" data-id="${id}" ${ms.approvalStatus === 'rejected' ? 'disabled' : ''}>Reject</button></div>`;
      if (ms.approvalStatus === 'approved') {
        html += `<form class="inline-form" data-form="schedule" data-id="${id}">
          <label class="field grow"><span>Publication date</span><input type="date" name="date" min="${todayISO()}" value="${esc(ms.pubDate || '')}" required></label>
          <button class="btn" type="submit">${ms.publicationStatus === 'scheduled' ? 'Reschedule' : 'Schedule'}</button></form>`;
      }
    }
    return html;
  }

  function authorPanel(ms) {
    const id = esc(ms.id);
    let html = '<h3>Your actions</h3>';
    if (ms.revisionStatus === 'requested') html += `<p class="hint info">Your editor asked for a revision. Read the latest “Revision” comment below.</p><div class="btn-row"><button class="btn" data-action="start-revision" data-id="${id}">Start revising</button><button class="btn primary" data-action="submit-revision" data-id="${id}">Submit revised draft</button></div>`;
    else if (ms.revisionStatus === 'in_progress') html += `<p class="hint info">You are working on a revision.</p><div class="btn-row"><button class="btn primary" data-action="submit-revision" data-id="${id}">Submit revised draft</button></div>`;
    else if (ms.revisionStatus === 'revised') html += '<p class="muted">Your revised draft is with the editor.</p>';
    else html += '<p class="muted">No action needed right now. Your editor will contact you here.</p>';
    return html;
  }

  function detail(id) {
    const ms = S.getMs(id);
    if (!ms || !S.canView(ms)) return notFound();
    const me = S.currentUser();
    const staff = S.isStaff(me);
    const author = S.userById(ms.authorId);
    const editor = S.userById(ms.editorId);

    const comments = ms.comments.slice().sort((a, b) => a.at.localeCompare(b.at));
    const timeline = ms.history.slice().sort((a, b) => b.at.localeCompare(a.at));

    return `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/manuscripts">Manuscripts</a> <span aria-hidden="true">/</span> <span>${esc(ms.title)}</span></nav>
    <header class="detail-head">
      <div class="detail-cover">${cover(ms)}</div>
      <div class="detail-info">
        <p class="eyebrow">${esc(ms.genre)}</p>
        <h1>${esc(ms.title)}</h1>
        <p class="lede">${esc(ms.synopsis)}</p>
        <div class="chips">${badge('stage', ms.stage, S.stageLabel(ms.stage))}${statusBadges(ms)}${deadlineChip(ms)}</div>
        <dl class="facts">
          <div><dt>Author</dt><dd>${esc(author ? author.name : '—')}</dd></div>
          <div><dt>Editor</dt><dd>${esc(editor ? editor.name : 'Not assigned')}</dd></div>
          <div><dt>Length</dt><dd>${number(ms.wordCount)} words</dd></div>
          <div><dt>Deadline</dt><dd>${fmtDate(ms.deadline)}</dd></div>
          <div><dt>Revision rounds</dt><dd>${ms.revisionCount}</dd></div>
          <div><dt>Publication</dt><dd>${esc(S.PUBLICATION[ms.publicationStatus])}${ms.pubDate ? ` · ${fmtDate(ms.pubDate)}` : ''}</dd></div>
          <div><dt>ISBN</dt><dd>${ms.isbn ? `<code>${esc(ms.isbn)}</code>` : '—'}</dd></div>
          <div><dt>Submitted</dt><dd>${fmtDate(ms.createdAt)}</dd></div>
        </dl>
        <div class="btn-row">
          ${S.canEditDetails(ms) ? `<button class="btn" data-action="edit-manuscript" data-id="${esc(ms.id)}">✎ Edit details</button>` : ''}
          ${S.canDelete(ms) ? `<button class="btn danger ghost" data-action="delete-manuscript" data-id="${esc(ms.id)}">Delete</button>` : ''}
        </div>
      </div>
    </header>
    ${stepper(ms)}
    <div class="detail-grid">
      <section class="panel" aria-labelledby="disc-h">
        <h2 id="disc-h">Discussion <span class="count-pill">${comments.length}</span></h2>
        <ol class="comments">${comments.map((c) => {
          const u = S.userById(c.userId);
          return `<li class="comment" data-kind="${esc(c.kind)}">${avatar(u)}
            <div><p class="comment-meta"><strong>${esc(u ? u.name : 'Former member')}</strong>
              <span class="chip">${esc(S.stageLabel(c.stage))}</span>
              ${c.kind === 'revision' ? badge('revision', 'requested', 'Revision') : ''}${c.kind === 'approval' ? badge('approval', 'approved', 'Decision') : ''}
              <time datetime="${esc(c.at)}" title="${esc(fmtDateTime(c.at))}">${timeAgo(c.at)}</time></p>
              <p class="comment-text">${esc(c.text)}</p></div></li>`;
        }).join('') || '<li class="muted">No comments yet — start the conversation.</li>'}</ol>
        <form data-form="comment" data-id="${esc(ms.id)}" class="comment-form">
          <label class="field"><span>Add a comment</span>
            <textarea name="text" rows="3" maxlength="1000" required placeholder="Write a note for the team…"></textarea></label>
          <button class="btn primary" type="submit">Post comment</button>
        </form>
      </section>
      <aside class="side">
        <section class="panel">${staff ? staffPanel(ms) : authorPanel(ms)}</section>
        <section class="panel" aria-labelledby="hist-h"><h2 id="hist-h" class="h3">Stage history</h2>
          <ol class="timeline">${timeline.map((h) => `<li><strong>${esc(S.stageLabel(h.stage))}</strong>
            <span class="muted small">${esc(h.note)} · ${esc(nameOf(h.by))}</span>
            <time class="muted small" datetime="${esc(h.at)}">${fmtDateTime(h.at)}</time></li>`).join('')}</ol></section>
      </aside>
    </div>`;
  }

  /* ================================================================
     PEOPLE (authors / editors)
     ================================================================ */
  function people(role) {
    const me = S.currentUser();
    const isAdmin = me.role === 'admin';
    const group = role === 'author' ? S.usersByRole('author') : S.users().filter((u) => u.role !== 'author');
    const heading = role === 'author' ? 'Authors' : 'Editors';
    const all = S.visibleManuscripts();

    const cards = group.map((u) => {
      const mine = (role === 'author' ? all.filter((m) => m.authorId === u.id) : all.filter((m) => m.editorId === u.id));
      const active = mine.filter((m) => m.stage !== 'published');
      return `<li><article class="person">
        ${avatar(u, 'lg')}
        <div class="person-body"><h2>${esc(u.name)} ${u.role === 'admin' ? badge('role', 'admin', 'Admin') : ''}</h2>
          <p class="muted small">${esc(u.specialty || S.ROLES[u.role])}</p>
          <p class="small"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></p>
          <p class="small"><strong>${mine.length}</strong> manuscript${mine.length === 1 ? '' : 's'} · <strong>${active.length}</strong> active</p>
          ${mine.length ? `<ul class="mini-list">${mine.slice(0, 4).map((m) => `<li><a href="#/manuscript/${esc(m.id)}">${esc(m.title)}</a> ${badge('stage', m.stage, S.stageLabel(m.stage))}</li>`).join('')}</ul>` : ''}
        </div>
        ${isAdmin && u.id !== me.id ? `<button class="icon-btn danger" data-action="remove-user" data-id="${esc(u.id)}" aria-label="Remove ${esc(u.name)}" title="Remove">🗑</button>` : ''}
      </article></li>`;
    }).join('');

    return `
    <header class="page-head"><div><p class="eyebrow">Directory</p><h1>${heading}</h1>
      <p class="lede">${group.length} ${heading.toLowerCase()} on the platform.</p></div></header>
    <ul class="people">${cards}</ul>
    ${isAdmin ? `<section class="panel" aria-labelledby="add-h"><h2 id="add-h">Add a person</h2>
      <form data-form="person" class="inline-form wrap" novalidate>
        <label class="field"><span>Full name</span><input name="name" required autocomplete="off"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="field"><span>Role</span><select name="role">${option('author', 'Author', role === 'author' ? 'author' : '')}${option('editor', 'Editor', role === 'author' ? '' : 'editor')}${option('admin', 'Admin', '')}</select></label>
        <label class="field grow"><span>Specialty</span><input name="specialty" placeholder="e.g. Fantasy, Cookbooks"></label>
        <button class="btn primary" type="submit">Add</button>
        <p class="form-error" role="alert" hidden></p>
      </form></section>` : ''}`;
  }

  function notFound() {
    return emptyState('Not found', 'That page or manuscript does not exist — or you do not have access to it.') +
      '<p class="center"><a class="btn" href="#/dashboard">Back to dashboard</a></p>';
  }

  /* ================================================================
     FORMS shown inside the modal <dialog>
     ================================================================ */
  function manuscriptForm(ms) {
    const me = S.currentUser();
    const staff = S.isStaff(me);
    const authors = S.usersByRole('author');
    const editors = S.users().filter((u) => u.role !== 'author');
    const v = ms || { title: '', genre: '', synopsis: '', wordCount: '', deadline: '', authorId: authors[0] && authors[0].id, editorId: '' };
    return `
    <form data-form="manuscript" data-id="${ms ? esc(ms.id) : ''}" novalidate method="dialog">
      <header class="modal-head"><h2>${ms ? 'Edit manuscript' : (staff ? 'New manuscript' : 'Submit a manuscript')}</h2>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></header>
      <label class="field"><span>Title</span><input name="title" value="${esc(v.title)}" required maxlength="120" autocomplete="off"></label>
      <div class="two-col">
        <label class="field"><span>Genre</span><select name="genre" required><option value="">Choose…</option>${GENRES.map((g) => option(g, g, v.genre)).join('')}</select></label>
        <label class="field"><span>Word count</span><input name="wordCount" type="number" min="1000" max="500000" step="1" value="${esc(v.wordCount)}" required></label>
      </div>
      <label class="field"><span>Synopsis <small class="muted"><output id="synCount">${(v.synopsis || '').length}</output>/600</small></span>
        <textarea name="synopsis" rows="4" maxlength="600" required>${esc(v.synopsis)}</textarea></label>
      <div class="two-col">
        <label class="field"><span>Target deadline</span><input name="deadline" type="date" value="${esc(v.deadline || '')}"></label>
        ${staff ? `<label class="field"><span>Author</span><select name="authorId" required>${authors.map((a) => option(a.id, a.name, v.authorId)).join('')}</select></label>` : ''}
      </div>
      ${staff && !ms ? `<label class="field"><span>Assign editor (optional)</span><select name="editorId"><option value="">— later —</option>${editors.map((e) => option(e.id, e.name, '')).join('')}</select></label>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">${ms ? 'Save changes' : 'Submit'}</button></footer>
    </form>`;
  }

  function noteForm({ title, label, required, confirmText, tone }) {
    return `
    <form data-form="note" method="dialog" novalidate>
      <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></header>
      <label class="field"><span>${esc(label)}${required ? '' : ' (optional)'}</span><textarea name="note" rows="4" maxlength="800" ${required ? 'required' : ''}></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn ${esc(tone || 'primary')}">${esc(confirmText)}</button></footer>
    </form>`;
  }

  return { dashboard, board, manuscripts, manuscriptGrid, detail, people, notFound, manuscriptForm, noteForm,
    getFilters, setFilters, applyFilters, DEFAULT_FILTERS };
})();
