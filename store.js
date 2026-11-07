PW.store = (function () {
  'use strict';

  const utils = PW.utils;
  const STORAGE_KEY = 'inkflow.state.v1';

  const STAGES = [
    { id: 'submitted', label: 'Submitted', hint: 'Manuscript received from the author.' },
    { id: 'editing', label: 'Editing', hint: 'Developmental and line editing.' },
    { id: 'proofreading', label: 'Proofreading', hint: 'Checking spelling, grammar and layout.' },
    { id: 'cover', label: 'Cover Design', hint: 'Cover concept, artwork and blurb.' },
    { id: 'review', label: 'Final Review', hint: 'Editor-in-chief approval gate.' },
    { id: 'published', label: 'Published', hint: 'Live — ISBN assigned.' },
  ];
  
  const REVISION = {
    none: 'No revision',
    requested: 'Revision requested',
    in_progress: 'Author revising',
    revised: 'Revised draft submitted',
    accepted: 'Revision accepted',
  };
  
  const APPROVAL = {
    pending: 'Approval pending',
    approved: 'Approved',
    changes_requested: 'Changes requested',
    rejected: 'Rejected',
  };
  
  const PUBLICATION = {
    unpublished: 'Not published',
    scheduled: 'Scheduled',
    published: 'Published'
  };
  
  const ROLES = {
    author: 'Author',
    editor: 'Editor',
    admin: 'Admin'
  };

  function stageIndex(id) {
    for (let i = 0; i < STAGES.length; i++) {
      if (STAGES[i].id === id) {
        return i;
      }
    }
    return -1;
  }

  function stageLabel(id) {
    let index = stageIndex(id);
    if (index >= 0) {
      return STAGES[index].label;
    }
    return id;
  }

  const OPEN_REVISION = ['requested', 'in_progress', 'revised'];

  function isRevisionOpen(ms) {
    return OPEN_REVISION.includes(ms.revisionStatus);
  }

  let state = null;
  const subscribers = new Set();

  function ok(extra) {
    let result = { ok: true };
    if (extra) {
      Object.assign(result, extra);
    }
    return result;
  }

  function fail(error) {
    return { ok: false, error: error };
  }

  const FALLBACK_SEED = {
    version: 1,
    sessionUserId: 'u_admin',
    users: [
      { id: 'u_admin', name: 'Meera Iyer', role: 'admin', email: 'meera@inkflow.example', specialty: 'Managing Editor' },
      { id: 'u_e1', name: 'Rohan Kapoor', role: 'editor', email: 'rohan@inkflow.example', specialty: 'Fiction & Fantasy' },
      { id: 'u_a1', name: 'Kavya Menon', role: 'author', email: 'kavya@example.com', specialty: 'Fantasy' },
    ],
    manuscripts: [{
      id: 'ms_001',
      title: 'The Lantern Keepers of Hollow Bay',
      genre: 'Fantasy',
      wordCount: 94000,
      synopsis: "A fishing village's last lantern keepers guard something far older than the sea.",
      authorId: 'u_a1',
      editorId: 'u_e1',
      stage: 'editing',
      revisionStatus: 'none',
      revisionCount: 0,
      approvalStatus: 'pending',
      publicationStatus: 'unpublished',
      isbn: null,
      pubDate: null,
      deadline: null,
      createdAt: '2026-10-20T09:00:00.000Z',
      updatedAt: '2026-10-20T09:00:00.000Z',
      history: [{ stage: 'submitted', at: '2026-10-20T09:00:00.000Z', by: 'u_a1', note: 'Manuscript submitted' }],
      comments: [],
    }],
    activity: [],
  };

  async function loadSeed() {
    try {
      let response = await fetch('data/seed.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('HTTP error ' + response.status);
      }
      let json = await response.json();
      return { data: json, source: 'seed' };
    } catch (err) {
      let fallbackData = JSON.parse(JSON.stringify(FALLBACK_SEED));
      return { data: fallbackData, source: 'fallback' };
    }
  }

  function normalise(data) {
    let s = {
      version: 1,
      users: [],
      manuscripts: [],
      activity: [],
      sessionUserId: null
    };
    Object.assign(s, data);

    for (let i = 0; i < s.manuscripts.length; i++) {
      let m = s.manuscripts[i];
      if (!m.history) m.history = [];
      if (!m.comments) m.comments = [];
      if (!m.revisionCount) m.revisionCount = 0;
      if (!m.updatedAt) {
        if (m.history.length > 0) {
          m.updatedAt = m.history[m.history.length - 1].at;
        } else {
          m.updatedAt = m.createdAt;
        }
      }
    }
    
    let userExists = false;
    for (let i = 0; i < s.users.length; i++) {
      if (s.users[i].id === s.sessionUserId) {
        userExists = true;
        break;
      }
    }
    if (!userExists) {
      if (s.users.length > 0) {
        s.sessionUserId = s.users[0].id;
      } else {
        s.sessionUserId = null;
      }
    }
    return s;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
    }
  }

  function commit() {
    persist();
    for (let fn of subscribers) {
      fn(state);
    }
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return function () {
      subscribers.delete(fn);
    };
  }

  async function init() {
    try {
      let savedString = localStorage.getItem(STORAGE_KEY);
      if (savedString) {
        let saved = JSON.parse(savedString);
        if (saved.version === 1 && Array.isArray(saved.manuscripts)) {
          state = normalise(saved);
          return 'local';
        }
      }
    } catch (e) {
    }
    
    let result = await loadSeed();
    state = normalise(result.data);
    persist();
    return result.source;
  }

  function users() {
    return state.users;
  }

  function userById(id) {
    for (let i = 0; i < state.users.length; i++) {
      if (state.users[i].id === id) {
        return state.users[i];
      }
    }
    return null;
  }

  function currentUser() {
    return userById(state.sessionUserId);
  }

  function getMs(id) {
    for (let i = 0; i < state.manuscripts.length; i++) {
      if (state.manuscripts[i].id === id) {
        return state.manuscripts[i];
      }
    }
    return null;
  }

  function isStaff(u) {
    if (!u) return false;
    return u.role === 'editor' || u.role === 'admin';
  }

  function usersByRole(role) {
    let result = [];
    for (let i = 0; i < state.users.length; i++) {
      if (state.users[i].role === role) {
        result.push(state.users[i]);
      }
    }
    return result;
  }

  function visibleManuscripts() {
    let u = currentUser();
    if (!u) return [];
    if (isStaff(u)) {
      return state.manuscripts;
    }
    let result = [];
    for (let i = 0; i < state.manuscripts.length; i++) {
      if (state.manuscripts[i].authorId === u.id) {
        result.push(state.manuscripts[i]);
      }
    }
    return result;
  }

  function canView(ms) {
    let visible = visibleManuscripts();
    return visible.includes(ms);
  }

  function isOwner(ms, u) {
    if (!u) u = currentUser();
    if (!u) return false;
    return ms.authorId === u.id;
  }

  function canEditDetails(ms, u) {
    if (!u) u = currentUser();
    if (!u || ms.stage === 'published') {
      return false;
    }
    if (isStaff(u)) {
      return true;
    }
    let owner = isOwner(ms, u);
    let validStage = ms.stage === 'submitted' || ms.revisionStatus === 'requested' || ms.revisionStatus === 'in_progress';
    return owner && validStage;
  }

  function canDelete(ms, u) {
    if (!u) u = currentUser();
    if (!u) return false;
    if (u.role === 'admin') return true;
    return isOwner(ms, u) && ms.stage === 'submitted';
  }

  function checkMove(ms, toStage, u) {
    if (!u) u = currentUser();
    if (!isStaff(u)) {
      return 'Only editors and admins can move manuscripts between stages.';
    }
    let from = stageIndex(ms.stage);
    let to = stageIndex(toStage);
    if (to < 0) {
      return 'Unknown stage.';
    }
    if (from === to) {
      return 'The manuscript is already in that stage.';
    }
    if (ms.stage === 'published') {
      return 'Published manuscripts are locked.';
    }
    if (to > from) {
      if (to !== from + 1) {
        let nextLabel = STAGES[from + 1].label;
        return 'Move one stage at a time — the next stage is “' + nextLabel + '”.';
      }
      if (ms.approvalStatus === 'rejected') {
        return 'This manuscript was rejected and cannot move forward. Send it back to rework it.';
      }
      if (isRevisionOpen(ms)) {
        return 'Close the open revision first (the author must submit it and an editor must accept it).';
      }
      if (ms.stage === 'submitted' && !ms.editorId) {
        return 'Assign an editor before editing can start.';
      }
      if (toStage === 'published' && ms.approvalStatus !== 'approved') {
        return 'Final approval is required before publication.';
      }
    }
    return null;
  }

  function touch(ms) {
    ms.updatedAt = new Date().toISOString();
  }

  function logActivity(msId, text) {
    let activityRecord = {
      id: utils.uid('a_'),
      at: new Date().toISOString(),
      userId: state.sessionUserId,
      msId: msId,
      text: text
    };
    state.activity.unshift(activityRecord);
    if (state.activity.length > 60) {
      state.activity.length = 60;
    }
  }

  function addComment(ms, text, kind) {
    if (!kind) kind = 'comment';
    let commentObj = {
      id: utils.uid('c_'),
      userId: state.sessionUserId,
      text: text,
      stage: ms.stage,
      kind: kind,
      at: new Date().toISOString()
    };
    ms.comments.push(commentObj);
    touch(ms);
  }

  function needStaff() {
    let user = currentUser();
    if (isStaff(user)) {
      return null;
    }
    return fail('Only editors and admins can do that.');
  }

  function createManuscript(input) {
    let actor = currentUser();
    let authorId = input.authorId;
    if (actor.role === 'author') {
      authorId = actor.id;
    }
    let data = Object.assign({}, input);
    data.authorId = authorId;
    
    let errors = utils.validateManuscript(data);
    if (errors.length > 0) {
      return fail(errors.join(' '));
    }
    
    let now = new Date().toISOString();
    let editorId = null;
    if (isStaff(actor) && data.editorId) {
      editorId = data.editorId;
    }
    
    let ms = {
      id: utils.uid('ms_'),
      title: data.title.trim(),
      genre: data.genre,
      synopsis: data.synopsis.trim(),
      wordCount: Number(data.wordCount),
      authorId: authorId,
      editorId: editorId,
      stage: 'submitted',
      revisionStatus: 'none',
      revisionCount: 0,
      approvalStatus: 'pending',
      publicationStatus: 'unpublished',
      isbn: null,
      pubDate: null,
      deadline: data.deadline || null,
      createdAt: now,
      updatedAt: now,
      history: [{ stage: 'submitted', at: now, by: actor.id, note: 'Manuscript submitted' }],
      comments: [],
    };
    
    state.manuscripts.unshift(ms);
    logActivity(ms.id, 'submitted “' + ms.title + '”');
    commit();
    return ok({ id: ms.id });
  }

  function updateManuscript(id, input) {
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (!canEditDetails(ms)) return fail('You cannot edit this manuscript right now.');
    
    let data = Object.assign({}, ms, input);
    if (isStaff(currentUser())) {
      data.authorId = input.authorId || ms.authorId;
    } else {
      data.authorId = ms.authorId;
    }
    
    let errors = utils.validateManuscript(data);
    if (errors.length > 0) return fail(errors.join(' '));
    
    ms.title = data.title.trim();
    ms.genre = data.genre;
    ms.synopsis = data.synopsis.trim();
    ms.wordCount = Number(data.wordCount);
    ms.authorId = data.authorId;
    ms.deadline = data.deadline || null;
    
    touch(ms);
    logActivity(id, 'updated details of “' + ms.title + '”');
    commit();
    return ok();
  }

  function deleteManuscript(id) {
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (!canDelete(ms)) return fail('You cannot delete this manuscript.');
    
    let newList = [];
    for (let i = 0; i < state.manuscripts.length; i++) {
      if (state.manuscripts[i].id !== id) {
        newList.push(state.manuscripts[i]);
      }
    }
    state.manuscripts = newList;
    
    logActivity(null, 'deleted “' + ms.title + '”');
    commit();
    return ok();
  }

  function assignEditor(id, editorId) {
    let denied = needStaff();
    if (denied) return denied;
    
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage === 'published') return fail('Published manuscripts are locked.');
    
    let editor = userById(editorId);
    if (!editor || editor.role === 'author') return fail('Choose an editor.');
    
    ms.editorId = editorId;
    addComment(ms, editor.name + ' assigned as editor.', 'system');
    logActivity(id, 'assigned ' + editor.name + ' to “' + ms.title + '”');
    commit();
    return ok();
  }

  function moveStage(id, toStage) {
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    
    let problem = checkMove(ms, toStage);
    if (problem) return fail(problem);

    let reviewIdx = stageIndex('review');
    let target = stageIndex(toStage);
    let wentBack = target < stageIndex(ms.stage);
    
    ms.stage = toStage;
    
    if (target < reviewIdx) {
      ms.approvalStatus = 'pending';
      if (ms.publicationStatus === 'scheduled') {
        ms.publicationStatus = 'unpublished';
        ms.pubDate = null;
      }
    }
    
    if (toStage === 'published') {
      ms.publicationStatus = 'published';
      ms.pubDate = utils.todayISO();
      if (!ms.isbn) {
        ms.isbn = utils.generateISBN();
      }
    }
    
    let note = '';
    if (wentBack) {
      note = 'Sent back to ' + stageLabel(toStage);
    } else {
      note = 'Moved to ' + stageLabel(toStage);
    }
    
    ms.history.push({
      stage: toStage,
      at: new Date().toISOString(),
      by: state.sessionUserId,
      note: note
    });
    
    addComment(ms, note + '.', 'system');
    
    let actionText = wentBack ? 'sent back' : 'moved';
    logActivity(id, actionText + ' “' + ms.title + '” → ' + stageLabel(toStage));
    commit();
    return ok();
  }

  function requestRevision(id, note) {
    let denied = needStaff();
    if (denied) return denied;
    
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage === 'published') return fail('Published manuscripts are locked.');
    if (isRevisionOpen(ms)) return fail('A revision is already open for this manuscript.');
    if (!note || note.trim().length < 5) return fail('Please describe what needs to change (at least 5 characters).');
    
    ms.revisionStatus = 'requested';
    ms.revisionCount += 1;
    if (ms.stage === 'review') {
      ms.approvalStatus = 'changes_requested';
    }
    addComment(ms, note.trim(), 'revision');
    logActivity(id, 'requested revision #' + ms.revisionCount + ' on “' + ms.title + '”');
    commit();
    return ok();
  }

  function startRevision(id) {
    let ms = getMs(id);
    if (!ms || !isOwner(ms)) return fail('Only the author can do that.');
    if (ms.revisionStatus !== 'requested') return fail('There is no revision request to start.');
    
    ms.revisionStatus = 'in_progress';
    addComment(ms, 'Started working on the requested revision.', 'system');
    logActivity(id, 'started revising “' + ms.title + '”');
    commit();
    return ok();
  }

  function submitRevision(id, note) {
    let ms = getMs(id);
    if (!ms || !isOwner(ms)) return fail('Only the author can submit a revised draft.');
    
    let validStatus = ms.revisionStatus === 'requested' || ms.revisionStatus === 'in_progress';
    if (!validStatus) return fail('No revision is open.');
    
    ms.revisionStatus = 'revised';
    let commentText = 'Revised draft submitted.';
    if (note && note.trim().length > 0) {
      commentText = note.trim();
    }
    
    addComment(ms, commentText, 'comment');
    logActivity(id, 'submitted a revised draft of “' + ms.title + '”');
    commit();
    return ok();
  }

  function acceptRevision(id) {
    let denied = needStaff();
    if (denied) return denied;
    
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.revisionStatus !== 'revised') return fail('There is no revised draft waiting for review.');
    
    ms.revisionStatus = 'accepted';
    if (ms.approvalStatus === 'changes_requested') {
      ms.approvalStatus = 'pending';
    }
    
    addComment(ms, 'Revision accepted.', 'system');
    logActivity(id, 'accepted the revision of “' + ms.title + '”');
    commit();
    return ok();
  }

  function setApproval(id, status, note) {
    let denied = needStaff();
    if (denied) return denied;
    
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.stage !== 'review') return fail('Approval decisions are made at the Final Review stage.');
    if (status === 'changes_requested') {
      return requestRevision(id, note);
    }
    if (status === 'approved' && isRevisionOpen(ms)) {
      return fail('Close the open revision before approving.');
    }
    if (status === 'rejected') {
      if (!note || note.trim().length < 5) {
        return fail('Please give a reason for rejecting (at least 5 characters).');
      }
    }
    
    let validStatuses = ['approved', 'rejected', 'pending'];
    if (!validStatuses.includes(status)) {
      return fail('Unknown approval status.');
    }
    
    ms.approvalStatus = status;
    if (status !== 'approved' && ms.publicationStatus === 'scheduled') {
      ms.publicationStatus = 'unpublished';
      ms.pubDate = null;
    }
    
    let commentText = 'Approval set to “' + APPROVAL[status] + '”.';
    if (note && note.trim().length > 0) {
      commentText = note.trim();
    }
    
    addComment(ms, commentText, 'approval');
    
    let actionWord = 'reset approval of';
    if (status === 'approved') actionWord = 'approved';
    if (status === 'rejected') actionWord = 'rejected';
    
    logActivity(id, actionWord + ' “' + ms.title + '”');
    commit();
    return ok();
  }

  function schedulePublication(id, date) {
    let denied = needStaff();
    if (denied) return denied;
    
    let ms = getMs(id);
    if (!ms) return fail('Manuscript not found.');
    if (ms.approvalStatus !== 'approved' || ms.stage !== 'review') {
      return fail('Only approved manuscripts in Final Review can be scheduled.');
    }
    if (!date) {
      return fail('Pick a valid publication date.');
    }
    let dateObj = new Date(date + 'T00:00:00');
    if (Number.isNaN(dateObj.getTime())) {
      return fail('Pick a valid publication date.');
    }
    if (utils.daysUntil(date) < 0) {
      return fail('The publication date cannot be in the past.');
    }
    
    ms.publicationStatus = 'scheduled';
    ms.pubDate = date;
    
    addComment(ms, 'Publication scheduled for ' + date + '.', 'system');
    logActivity(id, 'scheduled “' + ms.title + '” for ' + date);
    commit();
    return ok();
  }

  function postComment(id, text) {
    let ms = getMs(id);
    if (!ms || !canView(ms)) return fail('Manuscript not found.');
    
    let clean = '';
    if (text) clean = text.trim();
    
    if (clean.length < 2 || clean.length > 1000) {
      return fail('Comments must be 2–1000 characters.');
    }
    
    addComment(ms, clean, 'comment');
    logActivity(id, 'commented on “' + ms.title + '”');
    commit();
    return ok();
  }

  function addUser(input) {
    if (currentUser().role !== 'admin') return fail('Only admins can add people.');
    
    let name = '';
    if (input.name) name = input.name.trim();
    
    let email = '';
    if (input.email) email = input.email.trim();
    
    let specialty = '';
    if (input.specialty) specialty = input.specialty.trim();
    
    if (!utils.RX.personName.test(name)) {
      return fail('Enter a valid name (letters, spaces, . \' -).');
    }
    if (!utils.RX.email.test(email)) {
      return fail('Enter a valid email address.');
    }
    if (!ROLES[input.role]) {
      return fail('Choose a role.');
    }
    
    for (let i = 0; i < state.users.length; i++) {
      if (state.users[i].email.toLowerCase() === email.toLowerCase()) {
        return fail('That email is already registered.');
      }
    }
    
    let user = {
      id: utils.uid('u_'),
      name: name,
      email: email,
      role: input.role,
      specialty: specialty
    };
    
    state.users.push(user);
    logActivity(null, 'added ' + ROLES[input.role].toLowerCase() + ' ' + user.name);
    commit();
    return ok({ id: user.id });
  }

  function removeUser(id) {
    if (currentUser().role !== 'admin') return fail('Only admins can remove people.');
    
    let user = userById(id);
    if (!user) return fail('Person not found.');
    if (id === state.sessionUserId) return fail('You cannot remove the account you are using.');
    
    for (let i = 0; i < state.manuscripts.length; i++) {
      let m = state.manuscripts[i];
      if (m.authorId === id || m.editorId === id) {
        return fail('This person is linked to manuscripts. Reassign them first.');
      }
    }
    
    let newList = [];
    for (let i = 0; i < state.users.length; i++) {
      if (state.users[i].id !== id) {
        newList.push(state.users[i]);
      }
    }
    state.users = newList;
    
    logActivity(null, 'removed ' + user.name);
    commit();
    return ok();
  }

  function setSession(userId) {
    if (!userById(userId)) return fail('Unknown user.');
    state.sessionUserId = userId;
    commit();
    return ok();
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return fail('That file is not valid JSON.');
    }
    if (!data || !Array.isArray(data.manuscripts) || !Array.isArray(data.users)) {
      return fail('This does not look like an InkFlow export.');
    }
    state = normalise(data);
    commit();
    return ok({ count: state.manuscripts.length });
  }

  async function resetDemo() {
    let result = await loadSeed();
    state = normalise(result.data);
    commit();
    return ok();
  }

  function countIf(list, fn) {
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      if (fn(list[i])) count++;
    }
    return count;
  }

  function statsFor(list) {
    let today = utils.todayISO();
    
    let inProgressCount = countIf(list, function (m) {
      return m.stage === 'editing' || m.stage === 'proofreading' || m.stage === 'cover' || m.stage === 'review';
    });
    
    let awaitingCount = countIf(list, function (m) {
      return m.stage === 'review' && m.approvalStatus === 'pending';
    });
    
    let revisionCount = countIf(list, isRevisionOpen);
    
    let publishedCount = countIf(list, function (m) {
      return m.stage === 'published';
    });
    
    let overdueCount = countIf(list, function (m) {
      return m.deadline && m.deadline < today && m.stage !== 'published';
    });
    
    let perStage = [];
    for (let i = 0; i < STAGES.length; i++) {
      let stage = STAGES[i];
      let stageCount = countIf(list, function (m) {
        return m.stage === stage.id;
      });
      let stageObj = Object.assign({}, stage);
      stageObj.count = stageCount;
      perStage.push(stageObj);
    }
    
    return {
      total: list.length,
      inProgress: inProgressCount,
      awaitingApproval: awaitingCount,
      openRevisions: revisionCount,
      published: publishedCount,
      overdue: overdueCount,
      perStage: perStage
    };
  }

  function getActivity() {
    return state.activity;
  }

  return {
    STAGES: STAGES,
    REVISION: REVISION,
    APPROVAL: APPROVAL,
    PUBLICATION: PUBLICATION,
    ROLES: ROLES,
    stageIndex: stageIndex,
    stageLabel: stageLabel,
    isRevisionOpen: isRevisionOpen,
    init: init,
    subscribe: subscribe,
    users: users,
    userById: userById,
    currentUser: currentUser,
    getMs: getMs,
    isStaff: isStaff,
    usersByRole: usersByRole,
    visibleManuscripts: visibleManuscripts,
    canView: canView,
    isOwner: isOwner,
    canEditDetails: canEditDetails,
    canDelete: canDelete,
    checkMove: checkMove,
    createManuscript: createManuscript,
    updateManuscript: updateManuscript,
    deleteManuscript: deleteManuscript,
    assignEditor: assignEditor,
    moveStage: moveStage,
    requestRevision: requestRevision,
    startRevision: startRevision,
    submitRevision: submitRevision,
    acceptRevision: acceptRevision,
    setApproval: setApproval,
    schedulePublication: schedulePublication,
    postComment: postComment,
    addUser: addUser,
    removeUser: removeUser,
    setSession: setSession,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetDemo: resetDemo,
    statsFor: statsFor,
    get activity() { return getActivity(); },
  };
})();
