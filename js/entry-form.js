/**
 * The Add Entry form: loads the dropdown lists, adapts the fields to the
 * entry type, shows a live BDT preview and saves through the backend.
 * The same entryId is reused until a save succeeds, so a retry after a
 * lost connection can never create a duplicate row.
 *
 * The form starts itself: it wires its events when this file loads and
 * loads the lists whenever the main app screen becomes visible, so it
 * does not depend on the order or version of app.js.
 */
const EntryForm = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const SAVINGS = ['Deposit', 'Withdrawal'];
  const FIELDS = ['date', 'amount', 'currency', 'rate', 'category', 'institution', 'details'];

  let lists = null;       // { categories, institutions, currencies } from the server
  let type = 'Expense';   // currently selected entry type
  let entryId = '';       // id for the entry being typed
  let saving = false;     // blocks double taps
  let inited = false;     // init() runs only once
  let loadPromise = null; // shares one in-flight load between callers
  let toastTimer = null;

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

  /** Formats a number with 2 decimals and thousand separators. */
  function money(n) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  /** Shows a short message at the bottom of the screen. */
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3000);
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
    el.textContent = '\u2248 \u09F3 ' + money(Math.round(amount * rate * 100) / 100) + ' (BDT)';
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

  /** Fetches the lists and fills the dropdowns. Shows the reason on failure. */
  async function fetchLists() {
    try {
      lists = await Api.call('getLists');
      refreshCurrencies();
      refreshChoices();
      $('entry-msg').textContent = '';
    } catch (e) {
      lists = null;
      $('entry-msg').textContent = 'Could not load the lists: ' + e.message + ' Tap Save to try again.';
    }
  }

  /** Loads the dropdown lists; callers at the same moment share one request. */
  function load() {
    if (!loadPromise) {
      loadPromise = fetchLists().then(function () { loadPromise = null; });
    }
    return loadPromise;
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

  /** After a successful save: clear the typed values, keep type/date/currency. */
  function resetAfterSave() {
    $('f-amount').value = '';
    $('f-details').value = '';
    entryId = newId();
    updatePreview();
    $('f-amount').focus();
  }

  /** Form submit: validate, save, report. */
  async function onSubmit(ev) {
    ev.preventDefault();
    if (saving) return;
    if (!lists) { await load(); if (!lists) return; }
    if (!validateClient()) return;

    const payload = buildPayload();
    const btn = $('btn-save');
    saving = true;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const res = await Api.call('addEntry', payload);
      if (res.duplicate && !sameEntry(payload, res.entry)) {
        $('entry-msg').textContent = 'An earlier try was already saved with different values. Check the Entries tab, then retype.';
        entryId = newId();
        return;
      }
      toast(res.duplicate ? 'Already saved' : 'Saved \u2713  \u09F3 ' + money(res.entry.amountBdt));
      resetAfterSave();
    } catch (e) {
      const field = e.details && e.details.field;
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
      btn.textContent = 'Save entry';
    }
  }

  /** Forgets loaded data and typed values (used when locking). */
  function clear() {
    lists = null;
    $('form-entry').reset();
    $('f-date').value = todayLocal();
    clearErrors();
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

  return { init: init, load: load, clear: clear };
})();