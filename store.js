/* store.js — the "brain" of the app.
   Holds all data, enforces the publishing workflow rules and saves to localStorage.
   Views never change data directly; they call the actions exported here. */
PW.store = (function () {
  'use strict';

  const { uid, validateManuscript, generateISBN, todayISO, RX, daysUntil } = PW.utils;
  const STORAGE_KEY = 'inkflow.state.v1';

  /* ---------- Workflow vocabulary ---------- */
  const STAGES = [
    { id: 'submitted', label: 'Submitted', hint: 'Manuscript received from the author.' },
    { id: 'editing', label: 'Editing', hint: 'Developmental and line editing.' },
    { id: 'proofreading', label: 'Proofreading', hint: 'Checking spelling, grammar and layout.' },
    { id: 'cover', label: 'Cover Design', hint: 'Cover concept, artwork and blurb.' },
    { id: 'review', label: 'Final Review', hint: 'Editor-in-chief approval gate.' },
    { id: 'published', label: 'Published', hint: 'Live — ISBN assigned.' },
  ];
  const REVISION = {
    none: 'No revision', requested: 'Revision requested', in_progress: 'Author revising',
    revised: 'Revised draft submitted', accepted: 'Revision accepted',
  };
  const APPROVAL = {
    pending: 'Approval pending', approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Rejected',
  };
  const PUBLICATION = { unpublished: 'Not published', scheduled: 'Scheduled', published: 'Published' };
  const ROLES = { author: 'Author', editor: 'Editor', admin: 'Admin' };

  const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);
  const stageLabel = (id) => (STAGES[stageIndex(id)] || {}).label || id;
  const OPEN_REVISION = ['requested', 'in_progress', 'revised'];
  const isRevisionOpen = (ms) => OPEN_REVISION.includes(ms.revisionStatus);

  /* ---------- State ---------- */
  let state = null;
  const subscribers = new Set();
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const fail = (error) => ({ ok: false, error });

  const FALLBACK_SEED = {   // used only if data/seed.json cannot be fetched (e.g. opened via file://)
    version: 1, sessionUserId: 'u_admin',
    users: [
      { id: 'u_admin', name: 'Meera Iyer', role: 'admin', email: 'meera@inkflow.example', specialty: 'Managing Editor' },
      { id: 'u_e1', name: 'Rohan Kapoor', role: 'editor', email: 'rohan@inkflow.example', specialty: 'Fiction & Fantasy' },
      { id: 'u_a1', name: 'Kavya Menon', role: 'author', email: 'kavya@example.com', specialty: 'Fantasy' },
    ],
    manuscripts: [{
      id: 'ms_001', title: 'The Lantern Keepers of Hollow Bay', genre: 'Fantasy', wordCount: 94000,
      synopsis: "A fishing village's last lantern keepers guard something far older than the sea.",
      authorId: 'u_a1', editorId: 'u_e1', stage: 'editing', revisionStatus: 'none', revisionCount: 0,
      approvalStatus: 'pending', publicationStatus: 'unpublished', isbn: null, pubDate: null, deadline: null,
      createdAt: '2026-10-20T09:00:00.000Z', updatedAt: '2026-10-20T09:00:00.000Z',
      history: [{ stage: 'submitted', at: '2026-10-20T09:00:00.000Z', by: 'u_a1', note: 'Manuscript submitted' }],
      comments: [],
    }],
    activity: [],
  };

  async function loadSeed() {
    try {
      const response = await fetch('data/seed.json', { cache: 'no-store' });     // Unit V: Fetch API + JSON
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return { data: await response.json(), source: 'seed' };
    } catch (err) {
      return { data: JSON.parse(JSON.stringify(FALLBACK_SEED)), source: 'fallback' };
    }
  }

  function normalise(data) {
    const s = { version: 1, users: [], manuscripts: [], activity: [], sessionUserId: null, ...data };
    s.manuscripts.forEach((m) => {
      m.history = m.history || [];
      m.comments = m.comments || [];
      m.revisionCount = m.revisionCount || 0;
      m.updatedAt = m.updatedAt || (m.history.length ? m.history[m.history.length - 1].at : m.createdAt);
    });
    if (!s.users.some((u) => u.id === s.sessionUserId)) s.sessionUserId = (s.users[0] || {}).id || null;
    return s;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full / blocked */ }
  }
  function commit() { persist(); subscribers.forEach((fn) => fn(state)); }
  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };

  /** @returns {Promise<'local'|'seed'|'fallback'>} where the data came from */
  async function init() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === 1 && Array.isArray(saved.manuscripts)) {
        state = normalise(saved);
        return 'local';
      }
    } catch (e) { /* corrupted storage — fall through to the seed */ }
    const { data, source } = await loadSeed();
    state = normalise(data);
    persist();
    return source;
  }

  /* ---------- Lookups ---------- */
  const users = () => state.users;
  const userById = (id) => state.users.find((u) => u.id === id) || null;
  const currentUser = () => userById(state.sessionUserId);
  const getMs = (id) => state.manuscripts.find((m) => m.id === id) || null;
  const isStaff = (u) => !!u && (u.role === 'editor' || u.role === 'admin');
  const usersByRole = (role) => state.users.filter((u) => u.role === role);

  /** Authors only see their own manuscripts; editors and admins see everything. */
  function visibleManuscripts() {
    const u = currentUser();
    if (!u) return [];
    return isStaff(u) ? state.manuscripts : state.manuscripts.filter((m) => m.authorId === u.id);
  }
  const canView = (ms) => visibleManuscripts().includes(ms);
  const isOwner = (ms, u = currentUser()) => !!u && ms.authorId === u.id;

  /* ---------- Permission helpers (used by views AND by actions) ---------- */
  function canEditDetails(ms, u = currentUser()) {
    if (!u || ms.stage === 'published') return false;
    if (isStaff(u)) return true;
    return isOwner(ms, u) && (ms.stage === 'submitted' || ['requested', 'in_progress'].includes(ms.revisionStatus));
  }
  function canDelete(ms, u = currentUser()) {
    return !!u && (u.role === 'admin' || (isOwner(ms, u) && ms.stage === 'submitted'));
  }

  /** Returns a reason string if the move is not allowed, otherwise null. */
  function checkMove(ms, toStage, u = currentUser()) {
    if (!isStaff(u)) return 'Only editors and admins can move manuscripts between stages.';
    const from = stageIndex(ms.stage);
    const to = stageIndex(toStage);
    if (to < 0) return 'Unknown stage.';
    if (from === to) return 'The manuscript is already in that stage.';
    if (ms.stage === 'published') return 'Published manuscripts are locked.';
    if (to > from) {
      if (to !== from + 1) return `Move one stage at a time — the next stage is “${stageLabel(STAGES[from + 1].id)}”.`;
      if (ms.approvalStatus === 'rejected') return 'This manuscript was rejected and cannot move forward. Send it back to rework it.';
      if (isRevisionOpen(ms)) return 'Close the open revision first (the author must submit it and an editor must accept it).';
      if (ms.stage === 'submitted' && !ms.editorId) return 'Assign an editor before editing can start.';
      if (toStage === 'published' && ms.approvalStatus !== 'approved') return 'Final approval is required before publication.';
    }
    return null;
  }

  /* ---------- Internal helpers ---------- */
  function touch(ms) { ms.updatedAt = new Date().toISOString(); }
  function logActivity(msId, text) {
    state.activity.unshift({ id: uid('a_'), at: new Date().toISOString(), userId: state.sessionUserId, msId, text });
    state.activity.length = Math.min(state.activity.length, 60);
  }
  function addComment(ms, text, kind = 'comment') {
    ms.comments.push({ id: uid('c_'), userId: state.sessionUserId, text, stage: ms.stage, kind, at: new Date().toISOString() });
    touch(ms);
  }
  const needStaff = () => (isStaff(currentUser()) ? null : fail('Only editors and admins can do that.'));

  /* ---------- Actions: manuscripts ---------- */
  function createManuscript(input) {
    const actor = currentUser();
    const authorId = actor.role === 'author' ? actor.id : input.authorId;
    const data = { ...input, authorId };
    const errors = validateManuscript(data);
    if (errors.length) return fail(errors.join(' '));
    const now = new Date().toISOString();
    const ms = {
      id: uid('ms_'), title: data.title.trim(), genre: data.genre, synopsis: data.synopsis.trim(),
      wordCount: Number(data.wordCount), authorId, editorId: isStaff(actor) && data.editorId ? data.editorId : null,
      stage: 'submitted', revisionStatus: 'none', revisionCount: 0, approvalStatus: 'pending',
      publicationStatus: 'unpublished', isbn: null, pubDate: null, deadline: data.deadline || null,
      createdAt: now, updatedAt: now,
      history: [{ stage: 'submitted', at: now, by: actor.id, note: 'Manuscript submitted' }], comments: [],
    };
    state.manuscripts.unshift(ms);
    logActivity(ms.id, `submitted “${ms.title}”`);
    commit();
    return ok({ id: ms.id });
  }

  function updateManuscript(id, input) {
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (!canEditDetails(ms)) return fail('You cannot edit this manuscript right now.');
    const data = { ...ms, ...input, authorId: isStaff(currentUser()) ? (input.authorId || ms.authorId) : ms.authorId };
    const errors = validateManuscript(data);
    if (errors.length) return fail(errors.join(' '));
    Object.assign(ms, {
      title: data.title.trim(), genre: data.genre, synopsis: data.synopsis.trim(),
      wordCount: Number(data.wordCount), authorId: data.authorId, deadline: data.deadline || null,
    });
    touch(ms);
    logActivity(id, `updated details of “${ms.title}”`);
    commit();
    return ok();
  }

  function deleteManuscript(id) {
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (!canDelete(ms)) return fail('You cannot delete this manuscript.');
    state.manuscripts = state.manuscripts.filter((m) => m.id !== id);
    logActivity(null, `deleted “${ms.title}”`);
    commit();
    return ok();
  }

  function assignEditor(id, editorId) {
    const denied = needStaff(); if (denied) return denied;
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage === 'published') return fail('Published manuscripts are locked.');
    const editor = userById(editorId);
    if (!editor || editor.role === 'author') return fail('Choose an editor.');
    ms.editorId = editorId;
    addComment(ms, `${editor.name} assigned as editor.`, 'system');
    logActivity(id, `assigned ${editor.name} to “${ms.title}”`);
    commit();
    return ok();
  }

  /* ---------- Actions: workflow stages ---------- */
  function moveStage(id, toStage) {
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    const problem = checkMove(ms, toStage);
    if (problem) return fail(problem);

    const reviewIdx = stageIndex('review');
    const target = stageIndex(toStage);
    const wentBack = target < stageIndex(ms.stage);
    ms.stage = toStage;
    if (target < reviewIdx) {                    // leaving the approval gate resets it
      ms.approvalStatus = 'pending';
      if (ms.publicationStatus === 'scheduled') { ms.publicationStatus = 'unpublished'; ms.pubDate = null; }
    }
    if (toStage === 'published') {
      ms.publicationStatus = 'published';
      ms.pubDate = todayISO();
      ms.isbn = ms.isbn || generateISBN();
    }
    const note = wentBack ? `Sent back to ${stageLabel(toStage)}` : `Moved to ${stageLabel(toStage)}`;
    ms.history.push({ stage: toStage, at: new Date().toISOString(), by: state.sessionUserId, note });
    addComment(ms, note + '.', 'system');
    logActivity(id, `${wentBack ? 'sent back' : 'moved'} “${ms.title}” → ${stageLabel(toStage)}`);
    commit();
    return ok();
  }

  /* ---------- Actions: revisions ---------- */
  function requestRevision(id, note) {
    const denied = needStaff(); if (denied) return denied;
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage === 'published') return fail('Published manuscripts are locked.');
    if (isRevisionOpen(ms)) return fail('A revision is already open for this manuscript.');
    if (!note || note.trim().length < 5) return fail('Please describe what needs to change (at least 5 characters).');
    ms.revisionStatus = 'requested';
    ms.revisionCount += 1;
    if (ms.stage === 'review') ms.approvalStatus = 'changes_requested';
    addComment(ms, note.trim(), 'revision');
    logActivity(id, `requested revision #${ms.revisionCount} on “${ms.title}”`);
    commit();
    return ok();
  }

  function startRevision(id) {
    const ms = getMs(id);
    if (!ms || !isOwner(ms)) return fail('Only the author can do that.');
    if (ms.revisionStatus !== 'requested') return fail('There is no revision request to start.');
    ms.revisionStatus = 'in_progress';
    addComment(ms, 'Started working on the requested revision.', 'system');
    logActivity(id, `started revising “${ms.title}”`);
    commit();
    return ok();
  }

  function submitRevision(id, note) {
    const ms = getMs(id);
    if (!ms || !isOwner(ms)) return fail('Only the author can submit a revised draft.');
    if (!['requested', 'in_progress'].includes(ms.revisionStatus)) return fail('No revision is open.');
    ms.revisionStatus = 'revised';
    addComment(ms, (note || '').trim() || 'Revised draft submitted.', 'comment');
    logActivity(id, `submitted a revised draft of “${ms.title}”`);
    commit();
    return ok();
  }

  function acceptRevision(id) {
    const denied = needStaff(); if (denied) return denied;
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.revisionStatus !== 'revised') return fail('There is no revised draft waiting for review.');
    ms.revisionStatus = 'accepted';
    if (ms.approvalStatus === 'changes_requested') ms.approvalStatus = 'pending';
    addComment(ms, 'Revision accepted.', 'system');
    logActivity(id, `accepted the revision of “${ms.title}”`);
    commit();
    return ok();
  }

  /* ---------- Actions: approval & publication ---------- */
  function setApproval(id, status, note) {
    const denied = needStaff(); if (denied) return denied;
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage !== 'review') return fail('Approval decisions are made at the Final Review stage.');
    if (status === 'changes_requested') return requestRevision(id, note);
    if (status === 'approved' && isRevisionOpen(ms)) return fail('Close the open revision before approving.');
    if (status === 'rejected' && (!note || note.trim().length < 5)) return fail('Please give a reason for rejecting (at least 5 characters).');
    if (!['approved', 'rejected', 'pending'].includes(status)) return fail('Unknown approval status.');
    ms.approvalStatus = status;
    if (status !== 'approved' && ms.publicationStatus === 'scheduled') { ms.publicationStatus = 'unpublished'; ms.pubDate = null; }
    addComment(ms, (note || '').trim() || `Approval set to “${APPROVAL[status]}”.`, 'approval');
    logActivity(id, `${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'reset approval of'} “${ms.title}”`);
    commit();
    return ok();
  }

  function schedulePublication(id, date) {
    const denied = needStaff(); if (denied) return denied;
    const ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.approvalStatus !== 'approved' || ms.stage !== 'review') return fail('Only approved manuscripts in Final Review can be scheduled.');
    if (!date || Number.isNaN(new Date(date + 'T00:00:00').getTime())) return fail('Pick a valid publication date.');
    if (daysUntil(date) < 0) return fail('The publication date cannot be in the past.');
    ms.publicationStatus = 'scheduled';
    ms.pubDate = date;
    addComment(ms, `Publication scheduled for ${date}.`, 'system');
    logActivity(id, `scheduled “${ms.title}” for ${date}`);
    commit();
    return ok();
  }

  /* ---------- Actions: comments ---------- */
  function postComment(id, text) {
    const ms = getMs(id);
    if (!ms || !canView(ms)) return fail('Manuscript not found.');
    const clean = (text || '').trim();
    if (clean.length < 2 || clean.length > 1000) return fail('Comments must be 2–1000 characters.');
    addComment(ms, clean, 'comment');
    logActivity(id, `commented on “${ms.title}”`);
    commit();
    return ok();
  }

  /* ---------- Actions: people ---------- */
  function addUser({ name, email, role, specialty }) {
    if (currentUser().role !== 'admin') return fail('Only admins can add people.');
    if (!RX.personName.test((name || '').trim())) return fail('Enter a valid name (letters, spaces, . \' -).');
    if (!RX.email.test((email || '').trim())) return fail('Enter a valid email address.');
    if (!ROLES[role]) return fail('Choose a role.');
    if (state.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) return fail('That email is already registered.');
    const user = { id: uid('u_'), name: name.trim(), email: email.trim(), role, specialty: (specialty || '').trim() };
    state.users.push(user);
    logActivity(null, `added ${ROLES[role].toLowerCase()} ${user.name}`);
    commit();
    return ok({ id: user.id });
  }

  function removeUser(id) {
    if (currentUser().role !== 'admin') return fail('Only admins can remove people.');
    const user = userById(id);
    if (!user) return fail('Person not found.');
    if (id === state.sessionUserId) return fail('You cannot remove the account you are using.');
    if (state.manuscripts.some((m) => m.authorId === id || m.editorId === id)) return fail('This person is linked to manuscripts. Reassign them first.');
    state.users = state.users.filter((u) => u.id !== id);
    logActivity(null, `removed ${user.name}`);
    commit();
    return ok();
  }

  function setSession(userId) {
    if (!userById(userId)) return fail('Unknown user.');
    state.sessionUserId = userId;
    commit();
    return ok();
  }

  /* ---------- Data tools ---------- */
  const exportJSON = () => JSON.stringify(state, null, 2);

  function importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return fail('That file is not valid JSON.'); }
    if (!data || !Array.isArray(data.manuscripts) || !Array.isArray(data.users)) return fail('This does not look like an InkFlow export.');
    state = normalise(data);
    commit();
    return ok({ count: state.manuscripts.length });
  }

  async function resetDemo() {
    const { data } = await loadSeed();
    state = normalise(data);
    commit();
    return ok();
  }

  /** Counts used by the dashboard, people pages and badges. */
  function statsFor(list) {
    const today = todayISO();
    const by = (fn) => list.filter(fn).length;
    return {
      total: list.length,
      inProgress: by((m) => ['editing', 'proofreading', 'cover', 'review'].includes(m.stage)),
      awaitingApproval: by((m) => m.stage === 'review' && m.approvalStatus === 'pending'),
      openRevisions: by(isRevisionOpen),
      published: by((m) => m.stage === 'published'),
      overdue: by((m) => m.deadline && m.deadline < today && m.stage !== 'published'),
      perStage: STAGES.map((s) => ({ ...s, count: by((m) => m.stage === s.id) })),
    };
  }

  return {
    STAGES, REVISION, APPROVAL, PUBLICATION, ROLES, stageIndex, stageLabel, isRevisionOpen,
    init, subscribe, users, userById, currentUser, getMs, isStaff, usersByRole, visibleManuscripts,
    canView, isOwner, canEditDetails, canDelete, checkMove,
    createManuscript, updateManuscript, deleteManuscript, assignEditor, moveStage,
    requestRevision, startRevision, submitRevision, acceptRevision, setApproval, schedulePublication,
    postComment, addUser, removeUser, setSession, exportJSON, importJSON, resetDemo, statsFor,
    get activity() { return state.activity; },
  };
})();
