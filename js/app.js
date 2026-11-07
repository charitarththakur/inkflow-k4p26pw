(function () {
  'use strict';

  const utils = PW.utils;
  const esc = utils.esc;
  const S = PW.store;
  const V = PW.views;

  function $(sel, root) {
    if (!root) {
      root = document;
    }
    return root.querySelector(sel);
  }

  const appEl = $('#app');
  const modal = $('#modal');
  const toasts = $('#toasts');

  function toast(message, type) {
    if (!type) {
      type = 'success';
    }
    let el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = type;
    el.textContent = message;
    toasts.appendChild(el);
    
    let delay = 3500;
    if (type === 'error') {
      delay = 6500;
    }
    
    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () {
        el.remove();
      }, 300);
    }, delay);
  }

  function handle(result, successMessage) {
    if (!result.ok) {
      toast(result.error, 'error');
      return false;
    }
    if (successMessage) {
      toast(successMessage);
    }
    return true;
  }

  const ROUTES = {
    dashboard: { title: 'Dashboard', view: function () { return V.dashboard(); } },
    board: { title: 'Board', view: function () { return V.board(); } },
    manuscripts: { title: 'Manuscripts', view: function () { return V.manuscripts(); } },
    manuscript: { title: 'Manuscript', view: function (id) { return V.detail(id); } },
    authors: { title: 'Authors', view: function () { return V.people('author'); } },
    editors: { title: 'Editors', view: function () { return V.people('editor'); } },
  };

  function parseRoute() {
    let hash = location.hash.replace(/^#\/?/, '');
    let parts = hash.split('/');
    let name = parts[0] || 'dashboard';
    let param = '';
    if (parts.length > 1) {
      param = decodeURIComponent(parts[1]);
    }
    return { name: name, param: param };
  }

  function render(options) {
    let focus = false;
    if (options && options.focus) {
      focus = options.focus;
    }
    
    let routeInfo = parseRoute();
    let name = routeInfo.name;
    let param = routeInfo.param;
    
    let route = ROUTES[name];
    let scroll = window.scrollY;
    
    if (name === 'board') {
      appEl.classList.add('wide');
    } else {
      appEl.classList.remove('wide');
    }
    
    if (!route) {
      appEl.innerHTML = V.notFound();
      document.title = 'Not found · InkFlow';
    } else {
      appEl.innerHTML = route.view(param);
      if (name === 'manuscript') {
        let ms = S.getMs(param);
        if (ms) {
          document.title = ms.title + ' · InkFlow';
        } else {
          document.title = 'Manuscript · InkFlow';
        }
      } else {
        document.title = route.title + ' · InkFlow';
      }
    }
    
    let links = document.querySelectorAll('#mainnav a');
    for (let i = 0; i < links.length; i++) {
      let a = links[i];
      let href = a.getAttribute('href');
      let targetHref = '#/' + name;
      if (name === 'manuscript') {
        targetHref = '#/manuscripts';
      }
      
      if (href === targetHref) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    }
    
    if (focus) {
      appEl.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, scroll);
    }
  }

  window.addEventListener('hashchange', function () {
    $('#mainnav').classList.remove('open');
    $('.nav-toggle').setAttribute('aria-expanded', 'false');
    render({ focus: true });
  });

  function renderHeader() {
    let select = $('#actingAs');
    let me = S.currentUser();
    
    let rolesToRender = ['admin', 'editor', 'author'];
    let groupsHtml = '';
    
    for (let i = 0; i < rolesToRender.length; i++) {
      let role = rolesToRender[i];
      let usersOfRole = S.usersByRole(role);
      let optsHtml = '';
      
      for (let j = 0; j < usersOfRole.length; j++) {
        let u = usersOfRole[j];
        let selected = '';
        if (me && u.id === me.id) {
          selected = ' selected';
        }
        optsHtml += '<option value="' + esc(u.id) + '"' + selected + '>' + esc(u.name) + '</option>';
      }
      
      if (optsHtml !== '') {
        groupsHtml += '<optgroup label="' + esc(S.ROLES[role]) + 's">' + optsHtml + '</optgroup>';
      }
    }
    
    select.innerHTML = groupsHtml;
    
    if (me) {
      $('#roleBadge').textContent = S.ROLES[me.role];
      $('#roleBadge').dataset.role = me.role;
    } else {
      $('#roleBadge').textContent = '';
      $('#roleBadge').dataset.role = '';
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    let isDark = theme === 'dark';
    $('#themeToggle').setAttribute('aria-pressed', String(isDark));
    if (isDark) {
      $('#themeToggle').textContent = '☀';
    } else {
      $('#themeToggle').textContent = '☾';
    }
    try {
      localStorage.setItem('inkflow.theme', theme);
    } catch (e) {
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem('inkflow.theme');
    } catch (e) {
    }
    if (saved) {
      applyTheme(saved);
    } else {
      let prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }

  let noteResolver = null;

  function openModal(html) {
    modal.innerHTML = html;
    if (!modal.open) {
      modal.showModal();
    }
    let first = modal.querySelector('input, textarea, select');
    if (first) {
      first.focus();
    }
  }

  function closeModal() {
    if (modal.open) {
      modal.close();
    }
  }

  modal.addEventListener('close', function () {
    if (noteResolver) {
      noteResolver(null);
      noteResolver = null;
    }
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) {
      closeModal();
    }
  });

  function askNote(options) {
    return new Promise(function (resolve) {
      noteResolver = resolve;
      openModal(V.noteForm(options));
    });
  }

  function confirmBox(title, text, confirmText) {
    return new Promise(function (resolve) {
      noteResolver = function () {
        resolve(false);
      };
      
      let html = '<form data-form="confirm" novalidate>';
      html += '<header class="modal-head"><h2>' + esc(title) + '</h2></header>';
      html += '<p>' + esc(text) + '</p>';
      html += '<footer class="modal-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>';
      html += '<button type="submit" class="btn danger">' + esc(confirmText) + '</button></footer></form>';
      
      openModal(html);
      
      let formEl = modal.querySelector('form');
      formEl.addEventListener('submit', function (e) {
        e.preventDefault();
        noteResolver = null;
        closeModal();
        resolve(true);
      }, { once: true });
    });
  }

  function showError(form, message) {
    let box = form.querySelector('.form-error');
    if (!box) {
      return;
    }
    box.textContent = message;
    if (message) {
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  document.addEventListener('click', async function (e) {
    let el = e.target.closest('[data-action]');
    if (!el) return;
    
    let action = el.dataset.action;
    let id = el.dataset.id;
    
    e.preventDefault();
    
    if (action === 'new-manuscript') {
      openModal(V.manuscriptForm(null));
    } else if (action === 'edit-manuscript') {
      let msToEdit = S.getMs(id);
      openModal(V.manuscriptForm(msToEdit));
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'move') {
      let stage = el.dataset.stage;
      handle(S.moveStage(id, stage), 'Stage updated.');
    } else if (action === 'delete-manuscript') {
      let ms = S.getMs(id);
      let confirmed = await confirmBox('Delete manuscript?', '“' + ms.title + '” and its comments will be removed permanently.', 'Delete');
      if (confirmed) {
        let deleted = handle(S.deleteManuscript(ms.id), 'Manuscript deleted.');
        if (deleted) {
          location.hash = '#/manuscripts';
        }
      }
    } else if (action === 'request-revision') {
      let note = await askNote({ title: 'Request a revision', label: 'What should the author change?', required: true, confirmText: 'Send request' });
      if (note !== null) {
        handle(S.requestRevision(id, note), 'Revision requested.');
      }
    } else if (action === 'start-revision') {
      handle(S.startRevision(id), 'Good luck with the revision!');
    } else if (action === 'submit-revision') {
      let note = await askNote({ title: 'Submit revised draft', label: 'Summary of what you changed', required: false, confirmText: 'Submit draft' });
      if (note !== null) {
        handle(S.submitRevision(id, note), 'Revised draft submitted.');
      }
    } else if (action === 'accept-revision') {
      handle(S.acceptRevision(id), 'Revision accepted.');
    } else if (action === 'approve') {
      let note = await askNote({ title: 'Approve for publication', label: 'Approval note', required: false, confirmText: 'Approve', tone: 'good' });
      if (note !== null) {
        handle(S.setApproval(id, 'approved', note), 'Approved ✔');
      }
    } else if (action === 'request-changes') {
      let note = await askNote({ title: 'Request changes', label: 'What needs to change before approval?', required: true, confirmText: 'Request changes' });
      if (note !== null) {
        handle(S.setApproval(id, 'changes_requested', note), 'Changes requested.');
      }
    } else if (action === 'reject') {
      let note = await askNote({ title: 'Reject manuscript', label: 'Reason for rejection', required: true, confirmText: 'Reject', tone: 'danger' });
      if (note !== null) {
        handle(S.setApproval(id, 'rejected', note), 'Manuscript rejected.');
      }
    } else if (action === 'remove-user') {
      let user = S.userById(id);
      let confirmed = await confirmBox('Remove person?', user.name + ' will be removed from the directory.', 'Remove');
      if (confirmed) {
        handle(S.removeUser(user.id), 'Person removed.');
      }
    } else if (action === 'clear-filters') {
      V.setFilters(Object.assign({}, V.DEFAULT_FILTERS));
      render();
    } else if (action === 'toggle-nav') {
      let nav = $('#mainnav');
      let isOpen = nav.classList.toggle('open');
      el.setAttribute('aria-expanded', String(isOpen));
    } else if (action === 'toggle-theme') {
      let currentTheme = document.documentElement.dataset.theme;
      if (currentTheme === 'dark') {
        applyTheme('light');
      } else {
        applyTheme('dark');
      }
    } else if (action === 'export') {
      let json = S.exportJSON();
      let blob = new Blob([json], { type: 'application/json' });
      let link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      let dateString = new Date().toISOString().slice(0, 10);
      link.download = 'inkflow-backup-' + dateString + '.json';
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Backup downloaded.');
    } else if (action === 'import') {
      $('#importFile').click();
    } else if (action === 'reset') {
      let confirmed = await confirmBox('Reset demo data?', 'All your changes will be replaced by the original sample data.', 'Reset');
      if (confirmed) {
        await S.resetDemo();
        toast('Sample data restored.');
      }
    }
  });

  document.addEventListener('submit', function (e) {
    let form = e.target.closest('form[data-form]');
    if (!form) return;
    
    e.preventDefault();
    
    let formData = new FormData(form);
    let data = {};
    for (let pair of formData.entries()) {
      data[pair[0]] = pair[1];
    }
    
    let id = form.dataset.id;
    let formType = form.dataset.form;

    if (formType === 'manuscript') {
      let result;
      if (id) {
        result = S.updateManuscript(id, data);
      } else {
        result = S.createManuscript(data);
      }
      
      if (!result.ok) {
        showError(form, result.error);
        return;
      }
      closeModal();
      if (id) {
        toast('Changes saved.');
      } else {
        toast('Manuscript submitted.');
        location.hash = '#/manuscript/' + result.id;
      }
      
    } else if (formType === 'note') {
      let note = '';
      if (data.note) {
        note = data.note.trim();
      }
      let field = form.querySelector('textarea');
      if (field.required && note.length < 5) {
        showError(form, 'Please write at least 5 characters.');
        return;
      }
      let resolve = noteResolver;
      noteResolver = null;
      closeModal();
      if (resolve) {
        resolve(note);
      }
      
    } else if (formType === 'assign') {
      handle(S.assignEditor(id, data.editorId), 'Editor assigned.');
      
    } else if (formType === 'schedule') {
      handle(S.schedulePublication(id, data.date), 'Publication scheduled.');
      
    } else if (formType === 'comment') {
      handle(S.postComment(id, data.text));
      form.reset();
      
    } else if (formType === 'person') {
      let result = S.addUser(data);
      if (!result.ok) {
        showError(form, result.error);
        return;
      }
      closeModal();
      toast('Person added.');
    }
  });

  function refreshList() {
    let filterForm = $('#filterForm');
    if (!filterForm) {
      return;
    }
    let formData = new FormData(filterForm);
    let filters = {};
    for (let pair of formData.entries()) {
      filters[pair[0]] = pair[1];
    }
    
    let combinedFilters = Object.assign({}, V.DEFAULT_FILTERS, filters);
    V.setFilters(combinedFilters);
    
    let visible = S.visibleManuscripts();
    let currentFilters = V.getFilters();
    let shown = V.applyFilters(visible, currentFilters);
    
    $('#manuscript-grid').innerHTML = V.manuscriptGrid(shown);
    $('#result-count').textContent = shown.length;
  }
  
  const refreshListSoon = utils.debounce(refreshList, 150);

  document.addEventListener('input', function (e) {
    if (e.target.closest('#filterForm')) {
      refreshListSoon();
    }
    if (e.target.name === 'synopsis') {
      let synCount = $('#synCount');
      if (synCount) {
        synCount.textContent = e.target.value.length;
      }
    }
  });
  
  document.addEventListener('change', async function (e) {
    if (e.target.closest('#filterForm')) {
      refreshList();
    }
    if (e.target.id === 'actingAs') {
      let userId = e.target.value;
      S.setSession(userId);
      let me = S.currentUser();
      let roleName = S.ROLES[me.role];
      toast('Now acting as ' + me.name + ' (' + roleName + ').', 'info');
    }
    if (e.target.id === 'importFile' && e.target.files.length > 0) {
      let file = e.target.files[0];
      let text = await file.text();
      handle(S.importJSON(text), 'Backup imported.');
      e.target.value = '';
    }
  });

  let draggingId = null;
  
  function clearDropStyles() {
    let columns = document.querySelectorAll('.column');
    for (let i = 0; i < columns.length; i++) {
      columns[i].classList.remove('drop-ok', 'drop-no');
    }
  }

  document.addEventListener('dragstart', function (e) {
    let card = null;
    if (e.target instanceof Element) {
      card = e.target.closest('.card[draggable="true"]');
    }
    if (!card) return;
    
    draggingId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
    
    requestAnimationFrame(function () {
      card.classList.add('dragging');
    });
  });
  
  document.addEventListener('dragend', function () {
    draggingId = null;
    let draggingCards = document.querySelectorAll('.card.dragging');
    for (let i = 0; i < draggingCards.length; i++) {
      draggingCards[i].classList.remove('dragging');
    }
    clearDropStyles();
  });
  
  document.addEventListener('dragover', function (e) {
    let column = null;
    if (draggingId && e.target instanceof Element) {
      column = e.target.closest('.column');
    }
    if (!column) return;
    
    e.preventDefault();
    
    let targetStage = column.dataset.stage;
    let ms = S.getMs(draggingId);
    let problem = S.checkMove(ms, targetStage);
    
    e.dataTransfer.dropEffect = 'move';
    clearDropStyles();
    
    if (problem) {
      column.classList.add('drop-no');
    } else {
      column.classList.add('drop-ok');
    }
  });
  
  document.addEventListener('drop', function (e) {
    let column = null;
    if (draggingId && e.target instanceof Element) {
      column = e.target.closest('.column');
    }
    if (!column) return;
    
    e.preventDefault();
    
    let id = draggingId;
    draggingId = null;
    clearDropStyles();
    
    let targetStage = column.dataset.stage;
    let ms = S.getMs(id);
    
    if (targetStage !== ms.stage) {
      handle(S.moveStage(id, targetStage), 'Stage updated.');
    }
  });

  async function main() {
    initTheme();
    let source = await S.init();
    
    renderHeader();
    render({ focus: false });
    
    S.subscribe(function () {
      renderHeader();
      render();
    });
    
    if (source === 'fallback') {
      toast('Showing a small built-in sample. Open the site through a web server or GitHub Pages to load the full data set.', 'info');
    }
  }
  
  main();

}());
