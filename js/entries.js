/**
 * The Entries screen: month navigation, month totals, filters and the
 * list of entry cards with Edit, Delete (with Undo) and Restore.
 * Text from the Sheet is always put in with textContent, never as HTML.
 */
const Entries = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const PAGE_LIMIT = 500;
  const SAVINGS = ['Deposit', 'Withdrawal'];

  let month = currentMonth();
  let seq = 0;            // ignores answers of older requests
  let searchTimer = null;
  let filledFor = null;   // the lists object the filter dropdowns were built from
  let wired = false;

  /** Current month on this device as yyyy-MM. */
  function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /** Moves a yyyy-MM month by a number of months. */
  function shiftMonth(m, delta) {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /** Human label such as "November 2026". */
  function monthLabel(m) {
    return new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /** Creates an element with a class and plain text. */
  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Updates the month label and the enabled state of the arrows. */
  function updateMonthBar() {
    const label = $('m-label');
    if (label) {
      label.innerHTML = monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }
    $('m-prev').disabled = month <= '2000-01';
    $('m-next').disabled = month >= currentMonth();
  }

  /** Reads the filter controls. */
  function readFilters() {
    return {
      type: $('q-type').value,
      category: $('q-category').value,
      institution: $('q-institution').value,
      search: $('q-search').value.trim().slice(0, 100),
      includeDeleted: $('q-deleted').checked
    };
  }

  /** Replaces a filter dropdown's options, keeping the chosen value if possible. */
  function fillOptions(select, names) {
    const keep = select.value;
    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All';
    select.appendChild(all);
    names.forEach(function (n) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });
    select.value = keep;
  }

  /** Builds the category and institution filters from the loaded lists. */
  function fillFilterLists() {
    const lists = EntryForm.getLists();
    if (!lists || filledFor === lists) return;
    filledFor = lists;
    fillOptions($('q-category'), lists.categories.map(function (c) { return c.name; }));
    fillOptions($('q-institution'), lists.institutions.map(function (i) { return i.name; }));
  }

  /** Shows the month totals (or dashes when they are not available). */
  function renderTiles(report) {
    const inc = $('t-income');
    const exp = $('t-expense');
    const net = $('t-net');
    if (!report) {
      inc.textContent = exp.textContent = net.textContent = '-';
      net.className = 'tile-v';
      return;
    }
    const t = report.totals;
    inc.textContent = '\u09F3 ' + Ui.money(t.income);
    exp.textContent = '\u09F3 ' + Ui.money(t.expense);
    net.textContent = (t.netSaved < 0 ? '\u2212 ' : '') + '\u09F3 ' + Ui.money(Math.abs(t.netSaved));
    net.className = 'tile-v ' + (t.netSaved < 0 ? 'bad' : 'ok');
  }

  /** Builds one entry card. */
  function card(e) {
    const isSavings = SAVINGS.indexOf(e.type) !== -1;
    const plus = e.type === 'Income' || e.type === 'Deposit';

    const el = make('article', 'entry' + (e.isDeleted ? ' is-deleted' : ''));
    el.dataset.type = e.type;

    const main = make('div', 'entry-main');
    main.addEventListener('click', function () { el.classList.toggle('open'); });
    const top = make('div', 'entry-top');
    top.appendChild(make('span', 'chip', e.type));
    top.appendChild(make('span', '', e.date));
    if (e.isDeleted) top.appendChild(make('span', '', '\u00B7 deleted'));
    main.appendChild(top);
    main.appendChild(make('div', 'entry-title', (isSavings ? e.institution : e.category) || '-'));
    if (!isSavings && e.institution) main.appendChild(make('div', 'entry-sub', e.institution));
    if (e.details) main.appendChild(make('p', 'entry-details', e.details));
    el.appendChild(main);

    const amt = make('div', 'entry-amt');
    amt.appendChild(make('div', 'amt', (plus ? '+ ' : '\u2212 ') + '\u09F3 ' + Ui.money(e.amountBdt)));
    if (e.currency !== 'BDT') {
      amt.appendChild(make('div', 'amt-sub', e.currency + ' ' + Ui.money(e.amount) + ' \u00D7 ' + e.rate));
    }
    el.appendChild(amt);

    const actions = make('div', 'entry-actions');
    if (e.isDeleted) {
      const restore = make('button', 'btn small', 'Restore');
      restore.type = 'button';
      restore.addEventListener('click', function () { restoreEntry(e); });
      actions.appendChild(restore);
    } else {
      const edit = make('button', 'btn small', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () { EntryForm.startEdit(e); });
      const del = make('button', 'btn small', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () { removeEntry(e, del); });
      actions.appendChild(edit);
      actions.appendChild(del);
    }
    el.appendChild(actions);
    return el;
  }

  /** Draws the list and the info line. */
  function renderList(res) {
    const list = $('entry-list');
    list.textContent = '';
    if (!res.entries.length) {
      list.appendChild(make('div', 'empty', 'No entries found for this month and filter.'));
      $('list-info').textContent = '';
      return;
    }
    res.entries.forEach(function (e) { list.appendChild(card(e)); });
    $('list-info').textContent = res.total + (res.total === 1 ? ' entry' : ' entries') +
      (res.total > res.entries.length ? ' (showing the first ' + res.entries.length + ', use filters to narrow down)' : '');
  }

  const CACHE_TTL_MS = 180000;
  const cache = {};

  function invalidateCache() {
    Object.keys(cache).forEach(function (k) { delete cache[k]; });
  }

  function setLoadingState(loading) {
    const bar = $('m-label') ? $('m-label').closest('.month-bar') : null;
    if (bar) bar.classList.toggle('is-loading', loading);

    const label = $('m-label');
    if (label) {
      label.innerHTML = loading
        ? '<span class="spinner-sm"></span> ' + monthLabel(month)
        : monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }

    const prev = $('m-prev');
    const next = $('m-next');
    if (prev) prev.disabled = loading || month <= '2000-01';
    if (next) next.disabled = loading || month >= currentMonth();

    ['t-income', 't-expense', 't-net'].forEach(function (id) {
      const el = $(id);
      if (el) el.classList.toggle('skeleton', loading);
    });

    if (loading) {
      $('list-info').textContent = 'Fetching entries for ' + monthLabel(month) + '...';
      $('entry-list').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
    } else {
      ['t-income', 't-expense', 't-net'].forEach(function (id) {
        const el = $(id);
        if (el) el.classList.add('fade-in');
      });
      $('entry-list').classList.add('fade-in');
    }
  }

  /** Loads the list and the month totals for the current month and filters. */
  async function load(force) {
    const my = ++seq;
    const f = readFilters();
    const query = { month: month, limit: PAGE_LIMIT };
    if (f.type) query.type = f.type;
    if (f.category) query.category = f.category;
    if (f.institution) query.institution = f.institution;
    if (f.search) query.search = f.search;
    if (f.includeDeleted) query.includeDeleted = true;

    const cacheKey = JSON.stringify(query);
    const cached = cache[cacheKey];
    if (!force && cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
      updateMonthBar();
      renderTiles(cached.report);
      renderList(cached.listRes);
      return;
    }

    setLoadingState(true);
    let listRes = null;
    let report = null;
    let failure = null;
    try {
      const results = await Promise.all([
        Api.call('listEntries', query),
        Api.call('getReport', { month: month }).catch(function () { return null; })
      ]);
      listRes = results[0];
      report = results[1];
    } catch (e) {
      failure = e;
    }
    if (my !== seq) return;

    setLoadingState(false);
    renderTiles(report);
    if (failure) {
      $('entry-list').textContent = '';
      $('list-info').textContent = 'Could not load entries: ' + failure.message;
      return;
    }
    cache[cacheKey] = {
      listRes: listRes,
      report: report,
      time: Date.now()
    };
    renderList(listRes);
  }

  /** Soft-deletes an entry and offers Undo. */
  async function removeEntry(e, btn) {
    btn.disabled = true;
    try {
      await Api.call('deleteEntry', { entryId: e.entryId });
      invalidateCache();
      if (window.DashboardView && DashboardView.invalidateCache) DashboardView.invalidateCache();
      Ui.toast('Entry deleted', { label: 'Undo', run: function () { restoreEntry(e); } });
      load(true);
    } catch (err) {
      btn.disabled = false;
      Ui.toast(err.message);
    }
  }

  /** Brings a deleted entry back. */
  async function restoreEntry(e) {
    try {
      await Api.call('deleteEntry', { entryId: e.entryId, restore: true });
      invalidateCache();
      if (window.DashboardView && DashboardView.invalidateCache) DashboardView.invalidateCache();
      Ui.toast('Restored');
    } catch (err) {
      Ui.toast(err.message);
    }
    load(true);
  }

  /** Wires the controls once. */
  function wire() {
    if (wired) return;
    wired = true;
    $('m-prev').addEventListener('click', function () { month = shiftMonth(month, -1); updateMonthBar(); load(); });
    $('m-next').addEventListener('click', function () { month = shiftMonth(month, 1); updateMonthBar(); load(); });
    const label = $('m-label');
    if (label) {
      label.addEventListener('click', function () {
        if (window.MonthPicker) {
          MonthPicker.open(month, function (selectedMonth) {
            if (selectedMonth && selectedMonth !== month) {
              month = selectedMonth;
              updateMonthBar();
              load();
            }
          });
        }
      });
    }
    ['q-type', 'q-category', 'q-institution', 'q-deleted'].forEach(function (id) {
      $(id).addEventListener('change', load);
    });
    $('q-search').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(load, 350);
    });
  }

  /** Called when the Entries tab is opened. */
  async function show() {
    wire();
    updateMonthBar();
    if (!EntryForm.getLists()) await EntryForm.load();
    fillFilterLists();
    load();
  }

  /** Forgets everything on the screen (used when locking). */
  function clear() {
    seq++;
    month = currentMonth();
    filledFor = null;
    $('q-type').value = '';
    $('q-search').value = '';
    $('q-deleted').checked = false;
    fillOptions($('q-category'), []);
    fillOptions($('q-institution'), []);
    $('entry-list').textContent = '';
    $('list-info').textContent = '';
    renderTiles(null);
  }

  const api = { show: show, clear: clear, refresh: load, invalidateCache: invalidateCache };
  if (typeof window !== 'undefined') window.Entries = api;
  return api;
})();