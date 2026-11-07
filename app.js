/* app.js — wires everything together: routing, events, dialogs, drag-and-drop, theme. */
(function () {
  'use strict';

  const { esc, debounce } = PW.utils;
  const S = PW.store;
  const V = PW.views;

  const $ = (sel, root = document) => root.querySelector(sel);
  const appEl = $('#app');
  const modal = $('#modal');
  const toasts = $('#toasts');

  /* ================================================================
     Toasts (accessible: the container is an aria-live region)
     ================================================================ */
  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = type;
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 6500 : 3500);
  }

  /** Shows an error toast for failed store actions; returns true when the action worked. */
  function handle(result, successMessage) {
    if (!result.ok) { toast(result.error, 'error'); return false; }
    if (successMessage) toast(successMessage);
    return true;
  }

  /* ================================================================
     Router (hash based — works on GitHub Pages without server config)
     ================================================================ */
  const ROUTES = {
    dashboard: { title: 'Dashboard', view: () => V.dashboard() },
    board: { title: 'Board', view: () => V.board() },
    manuscripts: { title: 'Manuscripts', view: () => V.manuscripts() },
    manuscript: { title: 'Manuscript', view: (id) => V.detail(id) },
    authors: { title: 'Authors', view: () => V.people('author') },
    editors: { title: 'Editors', view: () => V.people('editor') },
  };

  function parseRoute() {
    const [name = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'dashboard', param: decodeURIComponent(param) };
  }

  function render({ focus = false } = {}) {
    const { name, param } = parseRoute();
    const route = ROUTES[name];
    const scroll = window.scrollY;
    appEl.classList.toggle('wide', name === 'board');   // the board gets extra width so all 6 stages fit
    if (!route) {
      appEl.innerHTML = V.notFound();
      document.title = 'Not found · InkFlow';
    } else {
      appEl.innerHTML = route.view(param);
      const ms = name === 'manuscript' ? S.getMs(param) : null;
      document.title = `${ms ? ms.title : route.title} · InkFlow`;
    }
    document.querySelectorAll('#mainnav a').forEach((a) => {
      const active = a.getAttribute('href') === `#/${name === 'manuscript' ? 'manuscripts' : name}`;
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (focus) { appEl.focus({ preventScroll: true }); window.scrollTo(0, 0); } else window.scrollTo(0, scroll);
  }

  window.addEventListener('hashchange', () => {
    $('#mainnav').classList.remove('open');
    $('.nav-toggle').setAttribute('aria-expanded', 'false');
    render({ focus: true });
  });

  /* ================================================================
     Header: "Acting as" switcher + theme toggle
     ================================================================ */
  function renderHeader() {
    const select = $('#actingAs');
    const me = S.currentUser();
    const groups = ['admin', 'editor', 'author'].map((role) => {
      const opts = S.usersByRole(role).map((u) => `<option value="${esc(u.id)}"${me && u.id === me.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
      return opts ? `<optgroup label="${esc(S.ROLES[role])}s">${opts}</optgroup>` : '';
    }).join('');
    select.innerHTML = groups;
    $('#roleBadge').textContent = me ? S.ROLES[me.role] : '';
    $('#roleBadge').dataset.role = me ? me.role : '';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
    $('#themeToggle').textContent = theme === 'dark' ? '☀' : '☾';
    try { localStorage.setItem('inkflow.theme', theme); } catch (e) { /* ignore */ }
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('inkflow.theme'); } catch (e) { /* ignore */ }
    applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }

  /* ================================================================
     Dialog helpers
     ================================================================ */
  let noteResolver = null;

  function openModal(html) {
    modal.innerHTML = html;
    if (!modal.open) modal.showModal();
    const first = modal.querySelector('input, textarea, select');
    if (first) first.focus();
  }
  function closeModal() { if (modal.open) modal.close(); }

  modal.addEventListener('close', () => {
    if (noteResolver) { noteResolver(null); noteResolver = null; }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });   // click on the backdrop

  /** Opens a small form asking for a note. Resolves with the text, or null if cancelled. */
  function askNote(options) {
    return new Promise((resolve) => {
      noteResolver = resolve;
      openModal(V.noteForm(options));
    });
  }

  function confirmBox(title, text, confirmText) {
    return new Promise((resolve) => {
      noteResolver = () => resolve(false);
      openModal(`<form data-form="confirm" novalidate>
        <header class="modal-head"><h2>${esc(title)}</h2></header>
        <p>${esc(text)}</p>
        <footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn danger">${esc(confirmText)}</button></footer></form>`);
      modal.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault(); noteResolver = null; closeModal(); resolve(true);
      }, { once: true });
    });
  }

  function showError(form, message) {
    const box = form.querySelector('.form-error');
    if (!box) return;
    box.textContent = message;
    box.hidden = !message;
  }

  /* ================================================================
     Click actions (event delegation: one listener handles every button)
     ================================================================ */
  const actions = {
    'new-manuscript': () => openModal(V.manuscriptForm(null)),
    'edit-manuscript': (el) => openModal(V.manuscriptForm(S.getMs(el.dataset.id))),
    'close-modal': () => closeModal(),

    'move': (el) => handle(S.moveStage(el.dataset.id, el.dataset.stage), 'Stage updated.'),

    'delete-manuscript': async (el) => {
      const ms = S.getMs(el.dataset.id);
      if (await confirmBox('Delete manuscript?', `“${ms.title}” and its comments will be removed permanently.`, 'Delete')) {
        if (handle(S.deleteManuscript(ms.id), 'Manuscript deleted.')) location.hash = '#/manuscripts';
      }
    },

    'request-revision': async (el) => {
      const note = await askNote({ title: 'Request a revision', label: 'What should the author change?', required: true, confirmText: 'Send request' });
      if (note !== null) handle(S.requestRevision(el.dataset.id, note), 'Revision requested.');
    },
    'start-revision': (el) => handle(S.startRevision(el.dataset.id), 'Good luck with the revision!'),
    'submit-revision': async (el) => {
      const note = await askNote({ title: 'Submit revised draft', label: 'Summary of what you changed', required: false, confirmText: 'Submit draft' });
      if (note !== null) handle(S.submitRevision(el.dataset.id, note), 'Revised draft submitted.');
    },
    'accept-revision': (el) => handle(S.acceptRevision(el.dataset.id), 'Revision accepted.'),

    'approve': async (el) => {
      const note = await askNote({ title: 'Approve for publication', label: 'Approval note', required: false, confirmText: 'Approve', tone: 'good' });
      if (note !== null) handle(S.setApproval(el.dataset.id, 'approved', note), 'Approved ✔');
    },
    'request-changes': async (el) => {
      const note = await askNote({ title: 'Request changes', label: 'What needs to change before approval?', required: true, confirmText: 'Request changes' });
      if (note !== null) handle(S.setApproval(el.dataset.id, 'changes_requested', note), 'Changes requested.');
    },
    'reject': async (el) => {
      const note = await askNote({ title: 'Reject manuscript', label: 'Reason for rejection', required: true, confirmText: 'Reject', tone: 'danger' });
      if (note !== null) handle(S.setApproval(el.dataset.id, 'rejected', note), 'Manuscript rejected.');
    },

    'remove-user': async (el) => {
      const user = S.userById(el.dataset.id);
      if (await confirmBox('Remove person?', `${user.name} will be removed from the directory.`, 'Remove')) handle(S.removeUser(user.id), 'Person removed.');
    },

    'clear-filters': () => { V.setFilters({ ...V.DEFAULT_FILTERS }); render(); },

    'toggle-nav': (el) => {
      const open = $('#mainnav').classList.toggle('open');
      el.setAttribute('aria-expanded', String(open));
    },
    'toggle-theme': () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),

    'export': () => {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `inkflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Backup downloaded.');
    },
    'import': () => $('#importFile').click(),
    'reset': async () => {
      if (await confirmBox('Reset demo data?', 'All your changes will be replaced by the original sample data.', 'Reset')) {
        await S.resetDemo();
        toast('Sample data restored.');
      }
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    actions[el.dataset.action](el);
  });

  /* ================================================================
     Form submissions
     ================================================================ */
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const id = form.dataset.id;

    switch (form.dataset.form) {
      case 'manuscript': {
        const result = id ? S.updateManuscript(id, data) : S.createManuscript(data);
        if (!result.ok) return showError(form, result.error);
        closeModal();
        toast(id ? 'Changes saved.' : 'Manuscript submitted.');
        if (!id) location.hash = `#/manuscript/${result.id}`;
        break;
      }
      case 'note': {
        const note = (data.note || '').trim();
        const field = form.querySelector('textarea');
        if (field.required && note.length < 5) return showError(form, 'Please write at least 5 characters.');
        const resolve = noteResolver; noteResolver = null;
        closeModal();
        if (resolve) resolve(note);
        break;
      }
      case 'assign':
        handle(S.assignEditor(id, data.editorId), 'Editor assigned.');
        break;
      case 'schedule':
        handle(S.schedulePublication(id, data.date), 'Publication scheduled.');
        break;
      case 'comment':
        handle(S.postComment(id, data.text));
        break;
      case 'person': {
        const result = S.addUser(data);
        if (!result.ok) return showError(form, result.error);
        toast('Person added.');
        break;
      }
      default:
    }
  });

  /* ================================================================
     Live updates: filters, synopsis counter, acting-as, file import
     ================================================================ */
  function refreshList() {
    if (!$('#filterForm')) return;                   // the user may have left the page before the debounce fired
    const filters = Object.fromEntries(new FormData($('#filterForm')));
    V.setFilters({ ...V.DEFAULT_FILTERS, ...filters });
    const shown = V.applyFilters(S.visibleManuscripts(), V.getFilters());
    $('#manuscript-grid').innerHTML = V.manuscriptGrid(shown);
    $('#result-count').textContent = shown.length;
  }
  const refreshListSoon = debounce(refreshList, 150);

  document.addEventListener('input', (e) => {
    if (e.target.closest('#filterForm')) refreshListSoon();
    if (e.target.name === 'synopsis' && $('#synCount')) $('#synCount').textContent = e.target.value.length;
  });
  document.addEventListener('change', async (e) => {
    if (e.target.closest('#filterForm')) refreshList();
    if (e.target.id === 'actingAs') {
      S.setSession(e.target.value);
      toast(`Now acting as ${S.currentUser().name} (${S.ROLES[S.currentUser().role]}).`, 'info');
    }
    if (e.target.id === 'importFile' && e.target.files[0]) {
      const text = await e.target.files[0].text();
      handle(S.importJSON(text), 'Backup imported.');
      e.target.value = '';
    }
  });

  /* ================================================================
     Drag and drop on the board (HTML5 Drag and Drop API)
     ================================================================ */
  let draggingId = null;
  const clearDropStyles = () => document.querySelectorAll('.column').forEach((c) => c.classList.remove('drop-ok', 'drop-no'));

  document.addEventListener('dragstart', (e) => {
    const card = e.target instanceof Element && e.target.closest('.card[draggable="true"]');
    if (!card) return;
    draggingId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  document.addEventListener('dragend', () => {
    draggingId = null;
    document.querySelectorAll('.card.dragging').forEach((c) => c.classList.remove('dragging'));
    clearDropStyles();
  });
  document.addEventListener('dragover', (e) => {
    const column = draggingId && e.target instanceof Element && e.target.closest('.column');
    if (!column) return;
    e.preventDefault();                              // required to allow dropping
    const problem = S.checkMove(S.getMs(draggingId), column.dataset.stage);
    e.dataTransfer.dropEffect = 'move';              // always allow the drop so we can explain *why* a move is refused
    clearDropStyles();
    column.classList.add(problem ? 'drop-no' : 'drop-ok');
  });
  document.addEventListener('drop', (e) => {
    const column = draggingId && e.target instanceof Element && e.target.closest('.column');
    if (!column) return;
    e.preventDefault();
    const id = draggingId;
    draggingId = null;
    clearDropStyles();
    if (column.dataset.stage !== S.getMs(id).stage) handle(S.moveStage(id, column.dataset.stage), 'Stage updated.');
  });

  /* ================================================================
     Start
     ================================================================ */
  (async function main() {
    initTheme();
    const source = await S.init();
    renderHeader();
    render({ focus: false });
    S.subscribe(() => { renderHeader(); render(); });
    if (source === 'fallback') {
      toast('Showing a small built-in sample. Open the site through a web server or GitHub Pages to load the full data set.', 'info');
    }
  })();
}());
