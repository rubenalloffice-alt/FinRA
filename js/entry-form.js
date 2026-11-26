/**
 * The Add/Edit Entry form: loads the dropdown lists, adapts the fields to
 * the entry type, shows a live BDT preview and saves through the backend.
 * The same entryId is reused until a save succeeds, so a retry after a
 * lost connection can never create a duplicate row.
 *
 * The form starts itself: it wires its events when this file loads and
 * loads the lists whenever the main app screen becomes visible.
 *
 * Offline: the lists are remembered on the phone (LISTS_KEY). When there is
 * no internet (or no login), a new entry is saved in the Queue and sent
 * later by Sync. Editing an existing entry always needs internet.
 */
const EntryForm = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const SAVINGS = ['Deposit', 'Withdrawal'];
  const FIELDS = ['date', 'amount', 'currency', 'rate', 'category', 'institution', 'details'];
  const LISTS_KEY = 'ft_lists';   // localStorage: last lists from the server (not secret)

  let lists = null;       // { categories, institutions, currencies } from the server
  let type = 'Expense';   // currently selected entry type
  let mode = 'add';       // 'add' or 'edit'
  let entryId = '';       // id for the entry being typed or edited
  let saving = false;     // blocks double taps
  let inited = false;     // init() runs only once
  let loadPromise = null; // shares one in-flight load between callers

  /** Makes a new random entry id (letters and digits, 33 chars). */
  function newId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = '';
    bytes.forEach(function (b) { hex += b.toString(16).padStart(2, '0'); });
    return 'e' + hex;
  }

  /** Today's date on this device as yyyy-mm-dd. */
  function todayLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Turns Bangla digits into 0-9. */
  function toAsciiDigits(text) {
    return String(text).replace(/[\u09E6-\u09EF]/g, function (ch) {
      return String(ch.charCodeAt(0) - 0x09E6);
    });
  }

  /** Reads a positive-looking number from text; NaN when it is not one. */
  function parseNumber(text) {
    const s = toAsciiDigits(text).replace(/[,\s]/g, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  /** Asks the app shell to show another tab. */
  function gotoView(name) {
    window.dispatchEvent(new CustomEvent('goto-view', { detail: name }));
  }

  /** Shows or clears the error text under one field. */
  function setFieldError(field, text) {
    const el = document.querySelector('.ferr[data-for="' + field + '"]');
    if (el) el.textContent = text || '';
  }

  /** Clears every field error and the general message. */
  function clearErrors() {
    FIELDS.forEach(function (f) { setFieldError(f, ''); });
    $('entry-msg').textContent = '';
  }

  /** Replaces the options of a select element. */
  function fillSelect(select, options, placeholder) {
    select.innerHTML = '';
    if (placeholder !== null) {
      const first = document.createElement('option');
      first.value = '';
      first.textContent = placeholder;
      select.appendChild(first);
    }
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
  }

  /** Text of the save button for the current mode. */
  function saveLabel() {
    return mode === 'edit' ? 'Update entry' : 'Save entry';
  }

  /** Updates the title, the save button and the cancel button for the mode. */
  function applyMode() {
    $('form-title').textContent = mode === 'edit' ? 'Edit entry' : 'Add entry';
    $('btn-save').textContent = saveLabel();
    $('btn-cancel-edit').hidden = mode !== 'edit';
  }

  /** Rebuilds category and institution choices for the current type. */
  function refreshChoices() {
    if (!lists) return;
    const isSavings = SAVINGS.indexOf(type) !== -1;
    $('field-category').hidden = isSavings;

    const cats = lists.categories
      .filter(function (c) { return c.type === type; })
      .map(function (c) { return { value: c.name, label: c.name }; });
    fillSelect($('f-category'), cats, 'Choose a category');

    const insts = lists.institutions.map(function (i) { return { value: i.name, label: i.name }; });
    fillSelect($('f-institution'), insts, isSavings ? 'Choose an institution' : 'None');
    $('lbl-institution').textContent = isSavings ? 'Institution' : 'Institution (optional)';
  }

  /** Fills the currency dropdown once the lists are loaded. */
  function refreshCurrencies() {
    const opts = lists.currencies.map(function (c) { return { value: c.code, label: c.code + ' - ' + c.name }; });
    fillSelect($('f-currency'), opts, null);
    $('f-currency').value = 'BDT';
    onCurrencyChange();
  }

  /** Shows the rate field for foreign currencies and pre-fills the last rate. */
  function onCurrencyChange() {
    if (!lists) return;
    const code = $('f-currency').value;
    const foreign = code !== 'BDT';
    $('field-rate').hidden = !foreign;
    if (foreign) {
      const cur = lists.currencies.filter(function (c) { return c.code === code; })[0];
      $('f-rate').value = cur && cur.lastRate ? String(cur.lastRate) : '';
    } else {
      $('f-rate').value = '';
    }
    updatePreview();
  }

  /** Updates the "= BDT" line under the amount. */
  function updatePreview() {
    const el = $('bdt-preview');
    const code = $('f-currency').value;
    const amount = parseNumber($('f-amount').value);
    const rate = parseNumber($('f-rate').value);
    if (code === 'BDT' || !(amount > 0) || !(rate > 0)) { el.hidden = true; return; }
    el.textContent = '\u2248 \u09F3 ' + Ui.money(Math.round(amount * rate * 100) / 100) + ' (BDT)';
    el.hidden = false;
  }

  /** Switches the entry type and adapts the form. */
  function setType(next) {
    type = next;
    $('form-entry').dataset.type = type;
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.type === type);
    });
    clearErrors();
    refreshChoices();
  }

  /** Remembers the lists on the phone so they are available offline. */
  function saveListsCache(value) {
    try { localStorage.setItem(LISTS_KEY, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }

  /** Reads the remembered lists (or null). */
  function readListsCache() {
    try {
      const v = JSON.parse(localStorage.getItem(LISTS_KEY) || 'null');
      return v && Array.isArray(v.categories) && Array.isArray(v.institutions) && Array.isArray(v.currencies) ? v : null;
    } catch (e) { return null; }
  }

  /** Uses the remembered lists. Returns true when there were some. */
  function useCachedLists() {
    const cached = readListsCache();
    if (!cached) return false;
    lists = cached;
    refreshCurrencies();
    refreshChoices();
    $('entry-msg').textContent = '';
    return true;
  }

  /** Fetches the lists and fills the dropdowns. Falls back to the remembered lists offline. */
  async function fetchLists() {
    if (!navigator.onLine && useCachedLists()) return;
    try {
      lists = await Api.call('getLists');
      saveListsCache(lists);
      refreshCurrencies();
      refreshChoices();
      $('entry-msg').textContent = '';
    } catch (e) {
      if (e.code === 'NETWORK' && useCachedLists()) return;
      lists = null;
      $('entry-msg').textContent = !navigator.onLine
        ? 'Open the app once with internet to load your categories.'
        : 'Could not load the lists: ' + e.message + ' Tap Save to try again.';
    }
  }

  /** Loads the dropdown lists; callers at the same moment share one request. */
  function load() {
    if (!loadPromise) {
      loadPromise = fetchLists().then(function () { loadPromise = null; });
    }
    return loadPromise;
  }

  /** Returns the loaded lists (or null). Used by the Entries screen. */
  function getLists() {
    return lists;
  }

  /** Quick checks so obvious mistakes show up instantly. Returns true when fine. */
  function validateClient() {
    clearErrors();
    let ok = true;
    const fail = function (field, text) { setFieldError(field, text); ok = false; };
    const isSavings = SAVINGS.indexOf(type) !== -1;

    if (!$('f-date').value) fail('date', 'Pick a date.');
    const amount = parseNumber($('f-amount').value);
    if (!(amount > 0)) fail('amount', 'Enter an amount greater than zero.');
    if ($('f-currency').value !== 'BDT' && !(parseNumber($('f-rate').value) > 0)) {
      fail('rate', 'Enter the conversion rate.');
    }
    if (!isSavings && !$('f-category').value) fail('category', 'Choose a category.');
    if (isSavings && !$('f-institution').value) fail('institution', 'Choose an institution.');
    return ok;
  }

  /** Collects the form values into the request data. */
  function buildPayload() {
    const code = $('f-currency').value;
    const isSavings = SAVINGS.indexOf(type) !== -1;
    const data = {
      entryId: entryId,
      type: type,
      date: $('f-date').value,
      amount: parseNumber($('f-amount').value),
      currency: code,
      institution: $('f-institution').value,
      details: $('f-details').value,
      source: 'app'
    };
    if (code !== 'BDT') data.rate = parseNumber($('f-rate').value);
    if (!isSavings) data.category = $('f-category').value;
    return data;
  }

  /** True when the stored entry matches what we sent. */
  function sameEntry(sent, stored) {
    return sent.type === stored.type && sent.date === stored.date &&
      sent.amount === stored.amount && sent.currency === stored.currency &&
      (sent.category || '') === stored.category && (sent.institution || '') === stored.institution &&
      sent.details.trim() === stored.details;
  }

  /** Clears the typed amount, details, category, institution, and returns the currency to BDT. */
  function resetFields() {
    $('f-amount').value = '';
    $('f-details').value = '';
    $('f-category').value = '';
    $('f-institution').value = '';
    $('f-currency').value = 'BDT';
    onCurrencyChange();
    clearErrors();
    entryId = newId();
  }

  /** Leaves edit mode and returns the form to a clean "add" state. */
  function leaveEdit() {
    mode = 'add';
    resetFields();
    $('f-category').value = '';
    $('f-institution').value = '';
    $('f-date').value = todayLocal();
    clearErrors();
    applyMode();
  }

  /** Fills the form with an existing entry and switches to edit mode. */
  function startEdit(entry) {
    if (!lists) return;
    mode = 'edit';
    entryId = entry.entryId;
    setType(entry.type);
    $('f-date').value = entry.date;
    $('f-currency').value = entry.currency;
    onCurrencyChange();
    $('f-rate').value = entry.currency === 'BDT' ? '' : String(entry.rate);
    $('f-amount').value = String(entry.amount);
    if (entry.category) $('f-category').value = entry.category;
    $('f-institution').value = entry.institution || '';
    $('f-details').value = entry.details;
    updatePreview();
    applyMode();
    gotoView('add');
  }

  /** Puts a not-accepted waiting entry back into the form so it can be corrected. */
  function loadDraft(p) {
    if (!lists) return;
    mode = 'add';
    entryId = newId();
    setType(p.type);
    $('f-date').value = p.date;
    $('f-currency').value = p.currency;
    onCurrencyChange();
    if (p.currency !== 'BDT' && p.rate) $('f-rate').value = String(p.rate);
    $('f-amount').value = String(p.amount);
    if (p.category) $('f-category').value = p.category;
    $('f-institution').value = p.institution || '';
    $('f-details').value = p.details || '';
    updatePreview();
    applyMode();
    gotoView('add');
    $('entry-msg').textContent = 'Fix the highlighted problem, then save again.';
  }

  /** Briefly flashes the save button green with a tactile success confirmation. */
  function flashSaveSuccess(msg) {
    const btn = $('btn-save');
    if (!btn) return;
    btn.classList.add('btn-success-flash');
    btn.textContent = msg || '✓ Saved!';
    setTimeout(function () {
      btn.classList.remove('btn-success-flash');
      btn.textContent = saveLabel();
    }, 1500);
  }

  /**
   * Saves a new entry on the phone for later sending.
   * @param {Object} payload addEntry data.
   * @param {boolean} hold true when added without a PIN login.
   * @returns {Promise<boolean>} true when it was stored.
   */
  async function saveOffline(payload, hold) {
    try {
      await Queue.add(payload, { hold: hold });
    } catch (e) {
      $('entry-msg').textContent = 'Could not save on this phone: ' + e.message;
      return false;
    }
    flashSaveSuccess('✓ Saved!');
    Ui.toast(hold
      ? 'Saved on this phone (Pending unlock)'
      : 'Saved on phone: queued for sync');
    resetFields();
    $('f-amount').focus();
    return true;
  }

  /** Cancel button in edit mode. */
  function cancelEdit() {
    leaveEdit();
    gotoView('entries');
  }

  /** Form submit: validate, save (add or update), report. */
  async function onSubmit(ev) {
    ev.preventDefault();
    if (saving) return;
    if (!lists) { await load(); if (!lists) return; }
    if (!validateClient()) return;

    const payload = buildPayload();
    if (payload.currency !== 'BDT' && payload.rate === 1) {
      if (!window.confirm('The rate for ' + payload.currency + ' is 1. Is that correct?')) return;
    }

    const btn = $('btn-save');
    saving = true;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      if (mode === 'edit') {
        if (!navigator.onLine) {
          $('entry-msg').textContent = 'Editing needs internet. Try again when you are online.';
          return;
        }
        const upd = await Api.call('updateEntry', payload);
        flashSaveSuccess('✓ Updated!');
        Ui.toast('Updated: \u09F3 ' + Ui.money(upd.entry.amountBdt));
        leaveEdit();
        gotoView('entries');
        return;
      }
      if (!navigator.onLine || !Api.getToken()) {
        await saveOffline(payload, !Api.getToken());
        return;
      }
      const res = await Api.call('addEntry', payload);
      if (res.duplicate && !sameEntry(payload, res.entry)) {
        $('entry-msg').textContent = 'An earlier try was already saved with different values. Check the Entries tab, then retype.';
        entryId = newId();
        return;
      }
      flashSaveSuccess('✓ Saved!');
      Ui.toast(res.duplicate ? 'Already saved' : 'Saved: \u09F3 ' + Ui.money(res.entry.amountBdt));
      resetFields();
      $('f-amount').focus();
    } catch (e) {
      const field = e.details && e.details.field;
      if (mode !== 'edit' && (e.code === 'NETWORK' || e.code === 'UNAUTHORIZED')) {
        // The server could not be reached, or the login ended: keep the entry safe on the phone.
        await saveOffline(payload, false);
        return;
      }
      if (e.code === 'VALIDATION' && FIELDS.indexOf(field) !== -1) {
        setFieldError(field, e.message);
      } else if (e.code === 'NETWORK') {
        $('entry-msg').textContent = 'No connection. Nothing was lost: fix the connection and tap Save again.';
      } else {
        $('entry-msg').textContent = e.message;
      }
    } finally {
      saving = false;
      btn.disabled = false;
      btn.textContent = saveLabel();
    }
  }

  /** Forgets loaded data and typed values (used when locking). */
  function clear() {
    lists = null;
    mode = 'add';
    $('form-entry').reset();
    $('f-date').value = todayLocal();
    clearErrors();
    applyMode();
  }

  /** Wires the form once; calling it again does nothing. */
  function init() {
    if (inited) return;
    inited = true;
    entryId = newId();
    $('f-date').value = todayLocal();
    $('f-date').max = todayLocal();
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { setType(b.dataset.type); });
    });
    $('f-currency').addEventListener('change', onCurrencyChange);
    $('f-amount').addEventListener('input', updatePreview);
    $('f-rate').addEventListener('input', updatePreview);
    $('form-entry').addEventListener('submit', onSubmit);
    $('btn-cancel-edit').addEventListener('click', cancelEdit);
    applyMode();
    watchShell();
  }

  /** Loads the lists whenever the main app screen becomes visible. */
  function watchShell() {
    const shell = $('shell');
    new MutationObserver(function () {
      if (!shell.hidden && !lists) load();
    }).observe(shell, { attributes: true, attributeFilter: ['hidden'] });
    if (!shell.hidden && !lists) load();
  }

  // Start right away: this script is loaded at the end of the page.
  init();

  return { init: init, load: load, clear: clear, getLists: getLists, startEdit: startEdit, loadDraft: loadDraft };
})();