/**
 * Settings screen: manage categories, institutions and currencies,
 * run and list backups, sign out everywhere, and the connection card.
 * Nothing is ever deleted: items are switched off (inactive) so old
 * entries and reports keep working. After every change the Add form
 * lists are reloaded, so new items show up in its dropdowns at once.
 * All text is placed with textContent (no HTML injection).
 */
const Settings = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const INSTITUTION_TYPES = ['Cash', 'Bank', 'DPS', 'FDR', 'Wallet', 'Other'];

  let wired = false;
  let seq = 0;        // ignores answers that arrive after the screen was cleared
  let data = null;    // last result of getSettingsData

  /** Makes an element with optional class and text. */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** Shows a short note under a card. ok=true makes it green. */
  function note(id, text, ok) {
    const p = $(id);
    p.textContent = text || '';
    p.className = 'msg' + (ok ? ' ok' : '');
  }

  /** Reloads the Add form lists so new or switched-off items show there. */
  async function refreshFormLists() {
    try { await EntryForm.load(); } catch (e) { /* the Add form shows its own error */ }
  }

  /** Disables a button while a request runs. Returns a function that re-enables it. */
  function lock(btn) {
    btn.disabled = true;
    return function () { btn.disabled = false; };
  }

  // ---------- Lists ----------

  /** Builds one row: name, small sub text and an On/Off button. */
  function itemRow(name, sub, active, onToggle) {
    const row = el('div', 'list-row' + (active ? '' : ' is-off'));
    const main = el('div', 'list-main');
    const title = el('div', 'list-title', name);
    if (!active) title.appendChild(el('span', 'chip-off', 'Inactive'));
    main.appendChild(title);
    if (sub) main.appendChild(el('div', 'list-sub', sub));
    row.appendChild(main);
    if (onToggle) {
      const btn = el('button', 'btn ghost small', active ? 'Turn off' : 'Turn on');
      btn.type = 'button';
      btn.addEventListener('click', function () { onToggle(btn, !active); });
      row.appendChild(btn);
    }
    return row;
  }

  /** Draws the category list, grouped by type. */
  function renderCategories() {
    const box = $('set-cat-list');
    box.textContent = '';
    ['Income', 'Expense'].forEach(function (type) {
      box.appendChild(el('h4', 'group-title', type + ' categories'));
      const items = data.categories.filter(function (c) { return c.type === type; });
      if (!items.length) box.appendChild(el('p', 'muted small', 'None yet.'));
      items.forEach(function (c) {
        box.appendChild(itemRow(c.name, '', c.active, function (btn, next) {
          toggle('setCategoryActive', c.id, next, btn, 'msg-cat');
        }));
      });
    });
  }

  /** Draws the institution list. */
  function renderInstitutions() {
    const box = $('set-ins-list');
    box.textContent = '';
    data.institutions.forEach(function (i) {
      box.appendChild(itemRow(i.name, i.type, i.active, function (btn, next) {
        toggle('setInstitutionActive', i.id, next, btn, 'msg-ins');
      }));
    });
  }

  /** Draws the currency list (no switch: currencies cannot be removed). */
  function renderCurrencies() {
    const box = $('set-cur-list');
    box.textContent = '';
    data.currencies.forEach(function (c) {
      const sub = c.code === data.baseCurrency ? 'Base currency'
        : (c.lastRate ? 'Last rate used: ' + c.lastRate : 'No rate used yet');
      box.appendChild(itemRow(c.code + ' \u2013 ' + c.name, sub, true, null));
    });
  }

  /** Draws all three lists. */
  function renderAll() {
    renderCategories();
    renderInstitutions();
    renderCurrencies();
  }

  /** Loads the lists from the server and draws them. */
  async function loadData() {
    const mine = ++seq;
    try {
      const res = await Api.call('getSettingsData');
      if (mine !== seq) return;
      data = res;
      renderAll();
    } catch (e) {
      if (mine !== seq) return;
      note('msg-cat', 'Could not load the lists: ' + e.message);
    }
  }

  /** Switches a category or institution on or off, then refreshes. */
  async function toggle(action, id, active, btn, msgId) {
    const unlock = lock(btn);
    note(msgId, '');
    try {
      await Api.call(action, { id: id, active: active });
      await loadData();
      await refreshFormLists();
      Ui.toast(active ? 'Turned on.' : 'Turned off. Old entries are unchanged.');
    } catch (e) {
      note(msgId, e.message);
    } finally {
      unlock();
    }
  }

  // ---------- Add forms ----------

  /** Runs one add action, then clears the form and refreshes. */
  async function submitAdd(ev, action, payloadFn, msgId, resetFn) {
    ev.preventDefault();
    const btn = ev.target.querySelector('button[type="submit"]');
    const unlock = lock(btn);
    note(msgId, '');
    try {
      await Api.call(action, payloadFn());
      resetFn();
      await loadData();
      await refreshFormLists();
      note(msgId, 'Added.', true);
    } catch (e) {
      note(msgId, e.message);
    } finally {
      unlock();
    }
  }

  // ---------- Backups ----------

  /** Draws the backup list. */
  function renderBackups(list) {
    const box = $('set-backup-list');
    box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'muted small', 'No backups yet.')); return; }
    list.forEach(function (b) {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', b.createdAt || b.name));
      main.appendChild(el('div', 'list-sub', b.kind === 'manual' ? 'Manual backup' : 'Automatic backup'));
      row.appendChild(main);
      if (typeof b.url === 'string' && b.url.indexOf('https://') === 0) {
        const a = el('a', 'btn ghost small', 'Open');
        a.href = b.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        row.appendChild(a);
      }
      box.appendChild(row);
    });
  }

  /** Loads the backup list. */
  async function loadBackups() {
    const mine = seq;
    try {
      const res = await Api.call('listBackups');
      if (mine !== seq) return;
      renderBackups(res.backups || []);
    } catch (e) {
      if (mine !== seq) return;
      note('msg-backup', 'Could not load backups: ' + e.message);
    }
  }

  /** Makes a backup copy now. */
  async function runBackup() {
    const unlock = lock($('btn-backup'));
    note('msg-backup', 'Making a backup copy... this can take a few seconds.', true);
    try {
      await Api.call('runBackup');
      note('msg-backup', 'Backup created.', true);
      await loadBackups();
    } catch (e) {
      note('msg-backup', e.message);
    } finally {
      unlock();
    }
  }

  // ---------- Security and connection ----------

  /** Ends every session on every device. */
  async function signOutAll() {
    if (!window.confirm('Sign out on every device? You will need your PIN again here too.')) return;
    const unlock = lock($('btn-signout-all'));
    note('msg-security', '');
    try {
      await Api.call('signOutAll');
      Api.setToken('');
      window.dispatchEvent(new CustomEvent('session-expired'));
    } catch (e) {
      note('msg-security', e.message);
    } finally {
      unlock();
    }
  }

  /** Fills the connection text from the server. */
  async function loadAbout() {
    const p = $('about-text');
    try {
      const info = await Api.call('whoami');
      p.textContent = 'Connected to ' + info.app + ' (' + info.environment +
        '), base currency ' + info.baseCurrency + '.';
    } catch (e) {
      p.textContent = e.message;
    }
  }

  // ---------- Wiring ----------

  /** Connects the forms and buttons once. */
  function wire() {
    if (wired) return;
    wired = true;
    const cat = $('form-cat'), ins = $('form-ins'), cur = $('form-cur');
    cat.addEventListener('submit', function (ev) {
      submitAdd(ev, 'addCategory', function () {
        return { name: $('set-cat-name').value, type: $('set-cat-type').value };
      }, 'msg-cat', function () { $('set-cat-name').value = ''; });
    });
    ins.addEventListener('submit', function (ev) {
      submitAdd(ev, 'addInstitution', function () {
        return { name: $('set-ins-name').value, type: $('set-ins-type').value };
      }, 'msg-ins', function () { $('set-ins-name').value = ''; });
    });
    cur.addEventListener('submit', function (ev) {
      submitAdd(ev, 'addCurrency', function () {
        return { code: $('set-cur-code').value, name: $('set-cur-name').value };
      }, 'msg-cur', function () { $('set-cur-code').value = ''; $('set-cur-name').value = ''; });
    });
    const typeSel = $('set-ins-type');
    INSTITUTION_TYPES.forEach(function (t) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      if (t === 'Other') o.selected = true;
      typeSel.appendChild(o);
    });
    $('btn-backup').addEventListener('click', runBackup);
    $('btn-signout-all').addEventListener('click', signOutAll);
  }

  /** Called when the Settings tab opens. */
  function show() {
    wire();
    loadAbout();
    loadData();
    loadBackups();
  }

  /** Forgets everything on the screen (used when locking). */
  function clear() {
    seq++;
    data = null;
    ['set-cat-list', 'set-ins-list', 'set-cur-list', 'set-backup-list'].forEach(function (id) {
      $(id).textContent = '';
    });
    ['msg-cat', 'msg-ins', 'msg-cur', 'msg-backup', 'msg-security'].forEach(function (id) { note(id, ''); });
    ['set-cat-name', 'set-ins-name', 'set-cur-code', 'set-cur-name'].forEach(function (id) { $(id).value = ''; });
    $('about-text').textContent = 'Checking server...';
  }

  return { show: show, clear: clear };
})();