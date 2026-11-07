PW.views = (function () {
  'use strict';

  const utils = PW.utils;
  const esc = utils.esc;
  const S = PW.store;
  const FILTER_KEY = 'inkflow.filters';
  const DEFAULT_FILTERS = { q: '', stage: 'all', genre: 'all', focus: 'all', sort: 'recent' };

  function getFilters() {
    try {
      let saved = sessionStorage.getItem(FILTER_KEY);
      if (saved) {
        let parsed = JSON.parse(saved);
        let result = Object.assign({}, DEFAULT_FILTERS, parsed);
        return result;
      }
    } catch (e) {
    }
    return Object.assign({}, DEFAULT_FILTERS);
  }

  function setFilters(next) {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch (e) {
    }
  }

  function nameOf(id) {
    let user = S.userById(id);
    if (user) {
      return user.name;
    }
    return 'Unassigned';
  }

  function badge(kind, value, label) {
    return '<span class="badge" data-kind="' + kind + '" data-value="' + esc(value) + '">' + esc(label) + '</span>';
  }

  function avatar(user, cls) {
    if (!cls) cls = '';
    if (user) {
      return '<span class="avatar ' + cls + '" data-role="' + esc(user.role) + '" title="' + esc(user.name) + '" aria-hidden="true">' + esc(utils.initials(user.name)) + '</span>';
    } else {
      return '<span class="avatar none ' + cls + '" title="No editor assigned" aria-hidden="true">?</span>';
    }
  }

  function statusBadges(ms) {
    let html = '';
    if (ms.revisionStatus !== 'none') {
      html += badge('revision', ms.revisionStatus, S.REVISION[ms.revisionStatus]);
    }
    if (ms.stage === 'review' || ms.approvalStatus !== 'pending') {
      html += badge('approval', ms.approvalStatus, S.APPROVAL[ms.approvalStatus]);
    }
    if (ms.publicationStatus !== 'unpublished' && ms.stage !== 'published') {
      html += badge('publication', ms.publicationStatus, S.PUBLICATION[ms.publicationStatus]);
    }
    return html;
  }

  function deadlineChip(ms) {
    if (!ms.deadline) return '';
    if (ms.stage === 'published') {
      return '<span class="chip">Due ' + utils.fmtDate(ms.deadline) + '</span>';
    }
    let d = utils.daysUntil(ms.deadline);
    let state = 'ok';
    if (d < 0) state = 'late';
    else if (d <= 7) state = 'soon';
    
    let text = '';
    if (d < 0) text = -d + ' d overdue';
    else if (d === 0) text = 'Due today';
    else text = 'Due in ' + d + ' d';
    
    return '<span class="chip" data-state="' + state + '" title="Deadline ' + utils.fmtDate(ms.deadline) + '">' + text + '</span>';
  }

  let coverCounter = 0;
  function cover(ms, cls) {
    if (!cls) cls = '';
    coverCounter += 1;
    let h = utils.hashString(ms.title);
    let hue = h % 360;
    let hue2 = (hue + 45) % 360;
    let gid = 'cg' + coverCounter;
    
    let wrappedTitle = utils.wrapText(ms.title, 12, 4);
    let linesHtml = '';
    for (let i = 0; i < wrappedTitle.length; i++) {
      let dy = (i > 0) ? 17 : 0;
      linesHtml += '<tspan x="60" dy="' + dy + '">' + esc(wrappedTitle[i]) + '</tspan>';
    }
    
    let authorName = nameOf(ms.authorId).toUpperCase();
    if (authorName.length > 22) {
      authorName = authorName.slice(0, 21) + '…';
    }
    
    let html = '<svg class="cover ' + cls + '" viewBox="0 0 120 170" role="img" aria-label="Generated cover of ' + esc(ms.title) + '">';
    html += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">';
    html += '<stop offset="0" stop-color="hsl(' + hue + ' 52% 36%)"/><stop offset="1" stop-color="hsl(' + hue2 + ' 58% 20%)"/>';
    html += '</linearGradient></defs>';
    html += '<rect width="120" height="170" rx="5" fill="url(#' + gid + ')"/><rect x="7" width="3" height="170" fill="rgba(255,255,255,.2)"/>';
    html += '<circle cx="62" cy="34" r="13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>';
    html += '<path d="M55 36q7-12 14 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>';
    html += '<text x="60" y="78" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="12.5" font-weight="700">' + linesHtml + '</text>';
    html += '<text x="62" y="158" text-anchor="middle" fill="rgba(255,255,255,.8)" font-family="Arial,sans-serif" font-size="6.5" letter-spacing="1">' + esc(authorName) + '</text>';
    html += '</svg>';
    return html;
  }

  function stepper(ms) {
    let current = S.stageIndex(ms.stage);
    let html = '<ol class="stepper" aria-label="Workflow progress">';
    for (let i = 0; i < S.STAGES.length; i++) {
      let s = S.STAGES[i];
      let status = 'todo';
      if (i < current) status = 'done';
      else if (i === current) status = 'current';
      
      let aria = '';
      if (i === current) aria = ' aria-current="step"';
      
      let icon = (i < current) ? '✓' : (i + 1);
      html += '<li class="' + status + '"' + aria + '><span class="dot" aria-hidden="true">' + icon + '</span><span class="step-label">' + esc(s.label) + '</span></li>';
    }
    html += '</ol>';
    return html;
  }

  function emptyState(title, text) {
    let html = '<div class="empty"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">';
    html += '<path d="M12 10h30a6 6 0 0 1 6 6v38H18a6 6 0 0 1-6-6z" fill="none" stroke="currentColor" stroke-width="3"/>';
    html += '<path d="M20 22h20M20 32h20M20 42h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
    html += '</svg><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></div>';
    return html;
  }

  function dashboard() {
    let me = S.currentUser();
    let list = S.visibleManuscripts();
    let st = S.statsFor(list);
    
    let maxCount = 1;
    for (let i = 0; i < st.perStage.length; i++) {
      if (st.perStage[i].count > maxCount) {
        maxCount = st.perStage[i].count;
      }
    }
    
    let staff = S.isStaff(me);

    let statItems = [
      { label: 'Manuscripts', value: st.total, kind: 'all', sub: '' },
      { label: 'In production', value: st.inProgress, kind: 'progress', sub: 'editing → review' },
      { label: 'Awaiting approval', value: st.awaitingApproval, kind: 'approval', sub: 'at final review' },
      { label: 'Open revisions', value: st.openRevisions, kind: 'revision', sub: 'author ↔ editor' },
      { label: 'Published', value: st.published, kind: 'published', sub: 'ISBN assigned' },
      { label: 'Overdue', value: st.overdue, kind: 'late', sub: 'past deadline' }
    ];

    let tilesHtml = '';
    for (let i = 0; i < statItems.length; i++) {
      let item = statItems[i];
      tilesHtml += '<li class="stat" data-kind="' + item.kind + '"><span class="stat-value">' + item.value + '</span><span class="stat-label">' + item.label + '</span><span class="stat-sub">' + item.sub + '</span></li>';
    }

    let attention = [];
    for (let i = 0; i < list.length; i++) {
      let m = list[i];
      if (!staff && m.revisionStatus === 'requested') {
        attention.push({ ms: m, why: 'Editor asked for a revision — start working on it.' });
      } else if (!staff && m.revisionStatus === 'in_progress') {
        attention.push({ ms: m, why: 'Revision in progress — submit your revised draft when ready.' });
      }
      
      if (staff && m.revisionStatus === 'revised') {
        attention.push({ ms: m, why: 'Revised draft submitted — review and accept it.' });
      }
      if (staff && m.stage === 'submitted' && !m.editorId) {
        attention.push({ ms: m, why: 'New submission — assign an editor.' });
      }
      if (staff && m.stage === 'review' && m.approvalStatus === 'pending' && !S.isRevisionOpen(m)) {
        attention.push({ ms: m, why: 'Ready for your approval decision.' });
      }
      if (staff && m.stage === 'review' && m.approvalStatus === 'approved' && m.publicationStatus !== 'published') {
        let whyText = 'Approved — schedule or publish.';
        if (m.publicationStatus === 'scheduled') {
          whyText = 'Scheduled for ' + utils.fmtDate(m.pubDate) + ' — publish when ready.';
        }
        attention.push({ ms: m, why: whyText });
      }
      if (m.deadline && m.stage !== 'published' && utils.daysUntil(m.deadline) < 0) {
        attention.push({ ms: m, why: 'Deadline passed on ' + utils.fmtDate(m.deadline) + '.' });
      }
    }

    let visibleIds = [];
    for (let i = 0; i < list.length; i++) {
      visibleIds.push(list[i].id);
    }
    
    let allActivity = S.activity;
    let recent = [];
    for (let i = 0; i < allActivity.length; i++) {
      let a = allActivity[i];
      if (!a.msId || visibleIds.includes(a.msId)) {
        recent.push(a);
        if (recent.length >= 8) {
          break;
        }
      }
    }

    let nameFirst = me.name.split(' ')[0];
    let headerText = staff ? 'Track every manuscript from first draft to published book.' : 'Follow your manuscripts through each editorial stage.';
    let btnText = staff ? 'New manuscript' : 'Submit a manuscript';

    let html = '<header class="page-head"><div><p class="eyebrow">' + esc(S.ROLES[me.role]) + ' workspace</p><h1>Welcome back, ' + esc(nameFirst) + '</h1>';
    html += '<p class="lede">' + headerText + '</p></div>';
    html += '<button class="btn primary" data-action="new-manuscript">＋ ' + btnText + '</button></header>';
    
    html += '<ul class="stats" aria-label="Summary figures">' + tilesHtml + '</ul>';
    
    html += '<div class="grid-2"><section class="panel" aria-labelledby="pipe-h"><h2 id="pipe-h">Pipeline</h2><ul class="bars">';
    
    for (let i = 0; i < st.perStage.length; i++) {
      let s = st.perStage[i];
      let percent = (s.count / maxCount) * 100;
      html += '<li><span class="bar-label">' + esc(s.label) + '</span>';
      html += '<span class="bar-track"><span class="bar-fill" data-stage="' + s.id + '" style="width:' + percent + '%"></span></span>';
      html += '<span class="bar-count">' + s.count + '</span></li>';
    }
    html += '</ul><p class="muted small"><a href="#/board">Open the board →</a></p></section>';

    html += '<section class="panel" aria-labelledby="att-h"><h2 id="att-h">Needs attention <span class="count-pill">' + attention.length + '</span></h2>';
    if (attention.length > 0) {
      html += '<ul class="attention">';
      for (let i = 0; i < attention.length && i < 7; i++) {
        let att = attention[i];
        html += '<li><a href="#/manuscript/' + esc(att.ms.id) + '"><strong>' + esc(att.ms.title) + '</strong></a><span>' + esc(att.why) + '</span></li>';
      }
      html += '</ul>';
    } else {
      html += '<p class="muted">Nothing is waiting on you. 🎉</p>';
    }
    html += '</section></div>';

    html += '<section class="panel" aria-labelledby="act-h"><h2 id="act-h">Recent activity</h2>';
    if (recent.length > 0) {
      html += '<ul class="activity">';
      for (let i = 0; i < recent.length; i++) {
        let a = recent[i];
        html += '<li>' + avatar(S.userById(a.userId)) + '<span><strong>' + esc(nameOf(a.userId)) + '</strong> ' + esc(a.text) + '</span>';
        html += '<time datetime="' + esc(a.at) + '">' + utils.timeAgo(a.at) + '</time></li>';
      }
      html += '</ul>';
    } else {
      html += '<p class="muted">No activity yet.</p>';
    }
    html += '</section>';

    return html;
  }

  function card(ms, canMove) {
    let idx = S.stageIndex(ms.stage);
    let prev = S.STAGES[idx - 1];
    let next = S.STAGES[idx + 1];
    let editor = S.userById(ms.editorId);
    
    let draggableAttr = '';
    if (canMove && ms.stage !== 'published') {
      draggableAttr = 'draggable="true"';
    }
    
    let html = '<li><article class="card" data-id="' + esc(ms.id) + '" ' + draggableAttr + '>';
    html += '<div class="card-top">' + cover(ms, 'mini') + '<div>';
    html += '<h3><a href="#/manuscript/' + esc(ms.id) + '">' + esc(ms.title) + '</a></h3>';
    html += '<p class="muted small">' + esc(nameOf(ms.authorId)) + ' · ' + esc(ms.genre) + '</p></div></div>';
    html += '<div class="chips">' + statusBadges(ms) + '</div>';
    
    let editorName = 'none';
    if (editor) {
      editorName = editor.name;
    }
    html += '<div class="card-foot">';
    html += '<span class="card-people" title="Editor: ' + esc(editorName) + '">' + avatar(editor) + '</span>';
    html += deadlineChip(ms);
    
    if (canMove && ms.stage !== 'published') {
      html += '<span class="card-move">';
      if (prev) {
        html += '<button class="icon-btn" data-action="move" data-id="' + esc(ms.id) + '" data-stage="' + prev.id + '" aria-label="Send ' + esc(ms.title) + ' back to ' + esc(prev.label) + '" title="Back to ' + esc(prev.label) + '">◀</button>';
      }
      if (next) {
        html += '<button class="icon-btn" data-action="move" data-id="' + esc(ms.id) + '" data-stage="' + next.id + '" aria-label="Advance ' + esc(ms.title) + ' to ' + esc(next.label) + '" title="Advance to ' + esc(next.label) + '">▶</button>';
      }
      html += '</span>';
    }
    html += '</div></article></li>';
    return html;
  }

  function board() {
    let list = S.visibleManuscripts();
    let canMove = S.isStaff(S.currentUser());
    
    let ledeText = canMove ? 'Drag a card to the next column (or use the ◀ ▶ buttons). Workflow rules are enforced.' : 'A read-only view of where your manuscripts are in the pipeline.';
    let btnText = canMove ? 'New manuscript' : 'Submit a manuscript';
    
    let html = '<header class="page-head"><div><p class="eyebrow">Workflow</p><h1>Editorial board</h1>';
    html += '<p class="lede">' + ledeText + '</p></div>';
    html += '<button class="btn primary" data-action="new-manuscript">＋ ' + btnText + '</button></header>';
    html += '<div class="board" role="list">';
    
    for (let i = 0; i < S.STAGES.length; i++) {
      let s = S.STAGES[i];
      let items = [];
      for (let j = 0; j < list.length; j++) {
        if (list[j].stage === s.id) {
          items.push(list[j]);
        }
      }
      
      html += '<section class="column" role="listitem" data-stage="' + s.id + '" aria-labelledby="col-' + s.id + '">';
      html += '<header><h2 id="col-' + s.id + '">' + esc(s.label) + '</h2><span class="count-pill">' + items.length + '</span></header>';
      html += '<p class="column-hint">' + esc(s.hint) + '</p>';
      html += '<ul class="cards" data-stage="' + s.id + '">';
      
      if (items.length > 0) {
        for (let k = 0; k < items.length; k++) {
          html += card(items[k], canMove);
        }
      } else {
        html += '<li class="drop-hint">No manuscripts</li>';
      }
      html += '</ul></section>';
    }
    
    html += '</div>';
    return html;
  }

  function applyFilters(list, f) {
    let q = f.q.trim().toLowerCase();
    let today = utils.todayISO();
    
    let filtered = [];
    for (let i = 0; i < list.length; i++) {
      let m = list[i];
      let match = true;
      
      if (q) {
        let searchString = m.title + ' ' + nameOf(m.authorId) + ' ' + m.genre + ' ' + m.synopsis + ' ' + (m.isbn || '');
        if (!searchString.toLowerCase().includes(q)) {
          match = false;
        }
      }
      if (f.stage !== 'all' && m.stage !== f.stage) match = false;
      if (f.genre !== 'all' && m.genre !== f.genre) match = false;
      if (f.focus === 'revision' && !S.isRevisionOpen(m)) match = false;
      if (f.focus === 'approval' && !(m.stage === 'review' && m.approvalStatus === 'pending')) match = false;
      if (f.focus === 'overdue' && !(m.deadline && m.deadline < today && m.stage !== 'published')) match = false;
      if (f.focus === 'unassigned' && m.editorId) match = false;
      
      if (match) {
        filtered.push(m);
      }
    }
    
    filtered.sort(function (a, b) {
      if (f.sort === 'title') {
        return a.title.localeCompare(b.title);
      } else if (f.sort === 'deadline') {
        let da = a.deadline || '9999';
        let db = b.deadline || '9999';
        return da.localeCompare(db);
      } else if (f.sort === 'words') {
        return b.wordCount - a.wordCount;
      } else {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
    
    return filtered;
  }

  function option(value, label, current) {
    let selected = '';
    if (value === current) {
      selected = ' selected';
    }
    return '<option value="' + esc(value) + '"' + selected + '>' + esc(label) + '</option>';
  }

  function manuscripts() {
    let f = getFilters();
    let all = S.visibleManuscripts();
    let shown = applyFilters(all, f);
    let me = S.currentUser();
    
    let isStaff = S.isStaff(me);
    let titleText = isStaff ? 'All manuscripts' : 'My manuscripts';
    let btnText = isStaff ? 'New manuscript' : 'Submit a manuscript';

    let html = '<header class="page-head"><div><p class="eyebrow">Library</p><h1>' + titleText + '</h1>';
    html += '<p class="lede"><span id="result-count">' + shown.length + '</span> of ' + all.length + ' shown</p></div>';
    html += '<button class="btn primary" data-action="new-manuscript">＋ ' + btnText + '</button></header>';
    
    html += '<form class="filters" id="filterForm" role="search" aria-label="Filter manuscripts" autocomplete="off">';
    html += '<label class="field grow"><span>Search</span><input type="search" name="q" value="' + esc(f.q) + '" placeholder="Title, author, genre, ISBN…"></label>';
    
    html += '<label class="field"><span>Stage</span><select name="stage">';
    html += option('all', 'All stages', f.stage);
    for (let i = 0; i < S.STAGES.length; i++) {
      html += option(S.STAGES[i].id, S.STAGES[i].label, f.stage);
    }
    html += '</select></label>';
    
    html += '<label class="field"><span>Genre</span><select name="genre">';
    html += option('all', 'All genres', f.genre);
    for (let i = 0; i < utils.GENRES.length; i++) {
      html += option(utils.GENRES[i], utils.GENRES[i], f.genre);
    }
    html += '</select></label>';
    
    html += '<label class="field"><span>Show</span><select name="focus">';
    html += option('all', 'Everything', f.focus);
    html += option('revision', 'Open revisions', f.focus);
    html += option('approval', 'Awaiting approval', f.focus);
    html += option('overdue', 'Overdue', f.focus);
    html += option('unassigned', 'No editor', f.focus);
    html += '</select></label>';
    
    html += '<label class="field"><span>Sort by</span><select name="sort">';
    html += option('recent', 'Recently updated', f.sort);
    html += option('title', 'Title A–Z', f.sort);
    html += option('deadline', 'Deadline', f.sort);
    html += option('words', 'Word count', f.sort);
    html += '</select></label>';
    
    html += '<button type="button" class="btn ghost" data-action="clear-filters">Reset</button>';
    html += '</form>';
    html += '<div id="manuscript-grid">' + manuscriptGrid(shown) + '</div>';
    
    return html;
  }

  function manuscriptGrid(shown) {
    if (shown.length === 0) {
      return emptyState('No manuscripts match', 'Try clearing a filter, or submit a new manuscript.');
    }
    let html = '<ul class="ms-grid">';
    for (let i = 0; i < shown.length; i++) {
      let m = shown[i];
      html += '<li><article class="ms-card">';
      html += '<a class="ms-cover" href="#/manuscript/' + esc(m.id) + '" tabindex="-1" aria-hidden="true">' + cover(m) + '</a>';
      html += '<div class="ms-body">';
      html += '<h2><a href="#/manuscript/' + esc(m.id) + '">' + esc(m.title) + '</a></h2>';
      html += '<p class="muted small">' + esc(nameOf(m.authorId)) + ' · ' + esc(m.genre) + ' · ' + utils.number(m.wordCount) + ' words</p>';
      html += '<p class="clamp">' + esc(m.synopsis) + '</p>';
      html += '<div class="chips">' + badge('stage', m.stage, S.stageLabel(m.stage)) + statusBadges(m) + deadlineChip(m) + '</div>';
      html += '</div></article></li>';
    }
    html += '</ul>';
    return html;
  }

  function staffPanel(ms) {
    let idx = S.stageIndex(ms.stage);
    let prev = S.STAGES[idx - 1];
    let next = S.STAGES[idx + 1];
    let id = esc(ms.id);
    
    let users = S.users();
    let editors = [];
    for (let i = 0; i < users.length; i++) {
      if (users[i].role !== 'author') {
        editors.push(users[i]);
      }
    }
    
    let blocker = null;
    if (next) {
      blocker = S.checkMove(ms, next.id);
    }
    
    let html = '<h3>Editorial actions</h3>';

    if (ms.stage === 'published') {
      return html + '<p class="muted">This book is published and locked. 🎉</p>';
    }

    html += '<form class="inline-form" data-form="assign" data-id="' + id + '">';
    html += '<label class="field grow"><span>Editor</span><select name="editorId"><option value="">— choose —</option>';
    for (let i = 0; i < editors.length; i++) {
      let u = editors[i];
      let specialtyText = u.specialty ? u.specialty : S.ROLES[u.role];
      html += option(u.id, u.name + ' (' + specialtyText + ')', ms.editorId);
    }
    html += '</select></label>';
    let assignBtnText = ms.editorId ? 'Reassign' : 'Assign';
    html += '<button class="btn" type="submit">' + assignBtnText + '</button></form>';

    html += '<div class="btn-row">';
    if (prev) {
      html += '<button class="btn" data-action="move" data-id="' + id + '" data-stage="' + prev.id + '">← Back to ' + esc(prev.label) + '</button>';
    }
    if (next) {
      let nextBtnText = 'Advance to ' + esc(next.label) + ' →';
      if (next.id === 'published') {
        nextBtnText = '📖 Publish now';
      }
      html += '<button class="btn primary" data-action="move" data-id="' + id + '" data-stage="' + next.id + '">' + nextBtnText + '</button>';
    }
    html += '</div>';
    
    if (blocker) {
      html += '<p class="hint" role="note">⚠ ' + esc(blocker) + '</p>';
    }

    html += '<hr>';
    if (ms.revisionStatus === 'revised') {
      html += '<p class="hint info">The author submitted a revised draft.</p>';
      html += '<div class="btn-row"><button class="btn primary" data-action="accept-revision" data-id="' + id + '">Accept revision</button>';
      html += '<button class="btn" data-action="request-revision" data-id="' + id + '">Ask for more changes</button></div>';
    } else if (!S.isRevisionOpen(ms)) {
      html += '<div class="btn-row"><button class="btn" data-action="request-revision" data-id="' + id + '">Request a revision</button></div>';
    } else {
      html += '<p class="muted small">Revision open — waiting for the author.</p>';
    }

    if (ms.stage === 'review') {
      html += '<hr><h4>Final approval</h4><div class="btn-row">';
      let approveDisabled = ms.approvalStatus === 'approved' ? 'disabled' : '';
      let rejectDisabled = ms.approvalStatus === 'rejected' ? 'disabled' : '';
      
      html += '<button class="btn good" data-action="approve" data-id="' + id + '" ' + approveDisabled + '>✔ Approve</button>';
      html += '<button class="btn" data-action="request-changes" data-id="' + id + '">Request changes</button>';
      html += '<button class="btn danger" data-action="reject" data-id="' + id + '" ' + rejectDisabled + '>Reject</button></div>';
      
      if (ms.approvalStatus === 'approved') {
        let scheduleBtnText = ms.publicationStatus === 'scheduled' ? 'Reschedule' : 'Schedule';
        html += '<form class="inline-form" data-form="schedule" data-id="' + id + '">';
        html += '<label class="field grow"><span>Publication date</span><input type="date" name="date" min="' + utils.todayISO() + '" value="' + esc(ms.pubDate || '') + '" required></label>';
        html += '<button class="btn" type="submit">' + scheduleBtnText + '</button></form>';
      }
    }
    return html;
  }

  function authorPanel(ms) {
    let id = esc(ms.id);
    let html = '<h3>Your actions</h3>';
    if (ms.revisionStatus === 'requested') {
      html += '<p class="hint info">Your editor asked for a revision. Read the latest “Revision” comment below.</p>';
      html += '<div class="btn-row"><button class="btn" data-action="start-revision" data-id="' + id + '">Start revising</button>';
      html += '<button class="btn primary" data-action="submit-revision" data-id="' + id + '">Submit revised draft</button></div>';
    } else if (ms.revisionStatus === 'in_progress') {
      html += '<p class="hint info">You are working on a revision.</p>';
      html += '<div class="btn-row"><button class="btn primary" data-action="submit-revision" data-id="' + id + '">Submit revised draft</button></div>';
    } else if (ms.revisionStatus === 'revised') {
      html += '<p class="muted">Your revised draft is with the editor.</p>';
    } else {
      html += '<p class="muted">No action needed right now. Your editor will contact you here.</p>';
    }
    return html;
  }

  function detail(id) {
    let ms = S.getMs(id);
    if (!ms || !S.canView(ms)) {
      return notFound();
    }
    
    let me = S.currentUser();
    let staff = S.isStaff(me);
    let author = S.userById(ms.authorId);
    let editor = S.userById(ms.editorId);

    let comments = ms.comments.slice();
    comments.sort(function (a, b) {
      return a.at.localeCompare(b.at);
    });
    
    let timeline = ms.history.slice();
    timeline.sort(function (a, b) {
      return b.at.localeCompare(a.at);
    });

    let authorName = author ? author.name : '—';
    let editorName = editor ? editor.name : 'Not assigned';
    let pubText = esc(S.PUBLICATION[ms.publicationStatus]);
    if (ms.pubDate) {
      pubText += ' · ' + utils.fmtDate(ms.pubDate);
    }
    let isbnText = ms.isbn ? '<code>' + esc(ms.isbn) + '</code>' : '—';

    let html = '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/manuscripts">Manuscripts</a> <span aria-hidden="true">/</span> <span>' + esc(ms.title) + '</span></nav>';
    html += '<header class="detail-head"><div class="detail-cover">' + cover(ms) + '</div>';
    html += '<div class="detail-info"><p class="eyebrow">' + esc(ms.genre) + '</p>';
    html += '<h1>' + esc(ms.title) + '</h1>';
    html += '<p class="lede">' + esc(ms.synopsis) + '</p>';
    html += '<div class="chips">' + badge('stage', ms.stage, S.stageLabel(ms.stage)) + statusBadges(ms) + deadlineChip(ms) + '</div>';
    
    html += '<dl class="facts">';
    html += '<div><dt>Author</dt><dd>' + esc(authorName) + '</dd></div>';
    html += '<div><dt>Editor</dt><dd>' + esc(editorName) + '</dd></div>';
    html += '<div><dt>Length</dt><dd>' + utils.number(ms.wordCount) + ' words</dd></div>';
    html += '<div><dt>Deadline</dt><dd>' + utils.fmtDate(ms.deadline) + '</dd></div>';
    html += '<div><dt>Revision rounds</dt><dd>' + ms.revisionCount + '</dd></div>';
    html += '<div><dt>Publication</dt><dd>' + pubText + '</dd></div>';
    html += '<div><dt>ISBN</dt><dd>' + isbnText + '</dd></div>';
    html += '<div><dt>Submitted</dt><dd>' + utils.fmtDate(ms.createdAt) + '</dd></div>';
    html += '</dl>';
    
    html += '<div class="btn-row">';
    if (S.canEditDetails(ms)) {
      html += '<button class="btn" data-action="edit-manuscript" data-id="' + esc(ms.id) + '">✎ Edit details</button>';
    }
    if (S.canDelete(ms)) {
      html += '<button class="btn danger ghost" data-action="delete-manuscript" data-id="' + esc(ms.id) + '">Delete</button>';
    }
    html += '</div></div></header>';
    
    html += stepper(ms);
    
    html += '<div class="detail-grid"><section class="panel" aria-labelledby="disc-h">';
    html += '<h2 id="disc-h">Discussion <span class="count-pill">' + comments.length + '</span></h2>';
    
    if (comments.length > 0) {
      html += '<ol class="comments">';
      for (let i = 0; i < comments.length; i++) {
        let c = comments[i];
        let u = S.userById(c.userId);
        let cName = u ? u.name : 'Former member';
        
        html += '<li class="comment" data-kind="' + esc(c.kind) + '">' + avatar(u);
        html += '<div><p class="comment-meta"><strong>' + esc(cName) + '</strong>';
        html += '<span class="chip">' + esc(S.stageLabel(c.stage)) + '</span>';
        
        if (c.kind === 'revision') html += badge('revision', 'requested', 'Revision');
        if (c.kind === 'approval') html += badge('approval', 'approved', 'Decision');
        
        html += '<time datetime="' + esc(c.at) + '" title="' + esc(utils.fmtDateTime(c.at)) + '">' + utils.timeAgo(c.at) + '</time></p>';
        html += '<p class="comment-text">' + esc(c.text) + '</p></div></li>';
      }
      html += '</ol>';
    } else {
      html += '<ol class="comments"><li class="muted">No comments yet — start the conversation.</li></ol>';
    }
    
    html += '<form data-form="comment" data-id="' + esc(ms.id) + '" class="comment-form">';
    html += '<label class="field"><span>Add a comment</span>';
    html += '<textarea name="text" rows="3" maxlength="1000" required placeholder="Write a note for the team…"></textarea></label>';
    html += '<button class="btn primary" type="submit">Post comment</button></form></section>';
    
    html += '<aside class="side">';
    let panelHtml = staff ? staffPanel(ms) : authorPanel(ms);
    html += '<section class="panel">' + panelHtml + '</section>';
    html += '<section class="panel" aria-labelledby="hist-h"><h2 id="hist-h" class="h3">Stage history</h2>';
    html += '<ol class="timeline">';
    
    for (let i = 0; i < timeline.length; i++) {
      let h = timeline[i];
      html += '<li><strong>' + esc(S.stageLabel(h.stage)) + '</strong>';
      html += '<span class="muted small">' + esc(h.note) + ' · ' + esc(nameOf(h.by)) + '</span>';
      html += '<time class="muted small" datetime="' + esc(h.at) + '">' + utils.fmtDateTime(h.at) + '</time></li>';
    }
    html += '</ol></section></aside></div>';
    
    return html;
  }

  function people(role) {
    let me = S.currentUser();
    let isAdmin = me.role === 'admin';
    let group = role === 'author' ? S.usersByRole('author') : S.users().filter(function (u) { return u.role !== 'author'; });
    let heading = role === 'author' ? 'Authors' : 'Editors';
    let all = S.visibleManuscripts();

    let html = '<header class="page-head"><div><p class="eyebrow">Directory</p><h1>' + heading + '</h1>';
    html += '<p class="lede">' + group.length + ' ' + heading.toLowerCase() + ' on the platform.</p></div></header>';
    html += '<ul class="people">';
    
    for (let i = 0; i < group.length; i++) {
      let u = group[i];
      let mine = [];
      for (let j = 0; j < all.length; j++) {
        let m = all[j];
        if (role === 'author' && m.authorId === u.id) {
          mine.push(m);
        } else if (role !== 'author' && m.editorId === u.id) {
          mine.push(m);
        }
      }
      
      let active = [];
      for (let k = 0; k < mine.length; k++) {
        if (mine[k].stage !== 'published') {
          active.push(mine[k]);
        }
      }
      
      html += '<li><article class="person">' + avatar(u, 'lg');
      html += '<div class="person-body"><h2>' + esc(u.name) + ' ';
      if (u.role === 'admin') {
        html += badge('role', 'admin', 'Admin');
      }
      html += '</h2>';
      let specialtyText = u.specialty ? u.specialty : S.ROLES[u.role];
      html += '<p class="muted small">' + esc(specialtyText) + '</p>';
      html += '<p class="small"><a href="mailto:' + esc(u.email) + '">' + esc(u.email) + '</a></p>';
      let pluralS = mine.length === 1 ? '' : 's';
      html += '<p class="small"><strong>' + mine.length + '</strong> manuscript' + pluralS + ' · <strong>' + active.length + '</strong> active</p>';
      
      if (mine.length > 0) {
        html += '<ul class="mini-list">';
        for (let x = 0; x < mine.length && x < 4; x++) {
          let m = mine[x];
          html += '<li><a href="#/manuscript/' + esc(m.id) + '">' + esc(m.title) + '</a> ' + badge('stage', m.stage, S.stageLabel(m.stage)) + '</li>';
        }
        html += '</ul>';
      }
      html += '</div>';
      
      if (isAdmin && u.id !== me.id) {
        html += '<button class="icon-btn danger" data-action="remove-user" data-id="' + esc(u.id) + '" aria-label="Remove ' + esc(u.name) + '" title="Remove">🗑</button>';
      }
      html += '</article></li>';
    }
    html += '</ul>';
    
    if (isAdmin) {
      let authorSelected = role === 'author' ? 'author' : '';
      let editorSelected = role === 'author' ? '' : 'editor';
      
      html += '<section class="panel" aria-labelledby="add-h"><h2 id="add-h">Add a person</h2>';
      html += '<form data-form="person" class="inline-form wrap" novalidate>';
      html += '<label class="field"><span>Full name</span><input name="name" required autocomplete="off"></label>';
      html += '<label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label>';
      html += '<label class="field"><span>Role</span><select name="role">';
      html += option('author', 'Author', authorSelected);
      html += option('editor', 'Editor', editorSelected);
      html += option('admin', 'Admin', '');
      html += '</select></label>';
      html += '<label class="field grow"><span>Specialty</span><input name="specialty" placeholder="e.g. Fantasy, Cookbooks"></label>';
      html += '<button class="btn primary" type="submit">Add</button>';
      html += '<p class="form-error" role="alert" hidden></p></form></section>';
    }
    
    return html;
  }

  function notFound() {
    let html = emptyState('Not found', 'That page or manuscript does not exist — or you do not have access to it.');
    html += '<p class="center"><a class="btn" href="#/dashboard">Back to dashboard</a></p>';
    return html;
  }

  function manuscriptForm(ms) {
    let me = S.currentUser();
    let staff = S.isStaff(me);
    let authors = S.usersByRole('author');
    
    let allUsers = S.users();
    let editors = [];
    for (let i = 0; i < allUsers.length; i++) {
      if (allUsers[i].role !== 'author') {
        editors.push(allUsers[i]);
      }
    }
    
    let v = ms;
    if (!v) {
      let defaultAuthorId = authors.length > 0 ? authors[0].id : '';
      v = { title: '', genre: '', synopsis: '', wordCount: '', deadline: '', authorId: defaultAuthorId, editorId: '' };
    }
    
    let formTitle = '';
    if (ms) formTitle = 'Edit manuscript';
    else if (staff) formTitle = 'New manuscript';
    else formTitle = 'Submit a manuscript';
    
    let btnText = ms ? 'Save changes' : 'Submit';
    let idAttr = ms ? esc(ms.id) : '';

    let html = '<form data-form="manuscript" data-id="' + idAttr + '" novalidate method="dialog">';
    html += '<header class="modal-head"><h2>' + formTitle + '</h2>';
    html += '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></header>';
    html += '<label class="field"><span>Title</span><input name="title" value="' + esc(v.title) + '" required maxlength="120" autocomplete="off"></label>';
    html += '<div class="two-col">';
    html += '<label class="field"><span>Genre</span><select name="genre" required><option value="">Choose…</option>';
    
    for (let i = 0; i < utils.GENRES.length; i++) {
      html += option(utils.GENRES[i], utils.GENRES[i], v.genre);
    }
    
    html += '</select></label>';
    html += '<label class="field"><span>Word count</span><input name="wordCount" type="number" min="1000" max="500000" step="1" value="' + esc(v.wordCount) + '" required></label></div>';
    
    let synLength = 0;
    if (v.synopsis) synLength = v.synopsis.length;
    html += '<label class="field"><span>Synopsis <small class="muted"><output id="synCount">' + synLength + '</output>/600</small></span>';
    html += '<textarea name="synopsis" rows="4" maxlength="600" required>' + esc(v.synopsis) + '</textarea></label>';
    
    html += '<div class="two-col">';
    html += '<label class="field"><span>Target deadline</span><input name="deadline" type="date" value="' + esc(v.deadline || '') + '"></label>';
    
    if (staff) {
      html += '<label class="field"><span>Author</span><select name="authorId" required>';
      for (let i = 0; i < authors.length; i++) {
        html += option(authors[i].id, authors[i].name, v.authorId);
      }
      html += '</select></label>';
    }
    html += '</div>';
    
    if (staff && !ms) {
      html += '<label class="field"><span>Assign editor (optional)</span><select name="editorId"><option value="">— later —</option>';
      for (let i = 0; i < editors.length; i++) {
        html += option(editors[i].id, editors[i].name, '');
      }
      html += '</select></label>';
    }
    
    html += '<p class="form-error" role="alert" hidden></p>';
    html += '<footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>';
    html += '<button type="submit" class="btn primary">' + btnText + '</button></footer></form>';
    
    return html;
  }

  function noteForm(options) {
    let reqText = options.required ? '' : ' (optional)';
    let reqAttr = options.required ? 'required' : '';
    let toneCls = options.tone ? options.tone : 'primary';
    
    let html = '<form data-form="note" method="dialog" novalidate>';
    html += '<header class="modal-head"><h2>' + esc(options.title) + '</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button></header>';
    html += '<label class="field"><span>' + esc(options.label) + reqText + '</span><textarea name="note" rows="4" maxlength="800" ' + reqAttr + '></textarea></label>';
    html += '<p class="form-error" role="alert" hidden></p>';
    html += '<footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>';
    html += '<button type="submit" class="btn ' + esc(toneCls) + '">' + esc(options.confirmText) + '</button></footer></form>';
    
    return html;
  }

  return {
    dashboard: dashboard,
    board: board,
    manuscripts: manuscripts,
    manuscriptGrid: manuscriptGrid,
    detail: detail,
    people: people,
    notFound: notFound,
    manuscriptForm: manuscriptForm,
    noteForm: noteForm,
    getFilters: getFilters,
    setFilters: setFilters,
    applyFilters: applyFilters,
    DEFAULT_FILTERS: DEFAULT_FILTERS
  };
})();
