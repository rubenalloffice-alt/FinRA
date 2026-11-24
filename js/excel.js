/**
 * Excel tools (Settings tab): export all entries to .xlsx, download an empty
 * import template, and import entries from a filled file (preview first, then
 * send in chunks of 100 rows to the importEntries action). The SheetJS library (js/vendor, version 0.18.5)
 * is loaded only when a button is first used, so the app opens fast.
 * The Excel column order is the same for export, template and import:
 * Date, Type, Category, Institution, Amount, Currency, Rate, Details.
 * All text is placed with textContent (no HTML injection).
 */
const ExcelTools = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const COLUMNS = ['Date', 'Type', 'Category', 'Institution', 'Amount', 'Currency', 'Rate', 'Details'];
  const PAGE = 1000;
  let libPromise = null;

  /** Loads the SheetJS script once. Resolves with the XLSX object. */
  function loadLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!libPromise) {
      libPromise = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = 'js/vendor/xlsx.full.min.js';
        s.onload = function () { resolve(window.XLSX); };
        s.onerror = function () { libPromise = null; reject(new Error('Could not load the Excel library.')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  /** Shows a short note under the Excel card. ok=true makes it green. */
  function note(text, ok) {
    const p = $('msg-excel');
    p.textContent = text || '';
    p.className = 'msg' + (ok ? ' ok' : '');
  }

  /** Today as yyyy-mm-dd in the device's local time (used in file names). */
  function today() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** Fetches every not-deleted entry, oldest first, page by page. */
  async function fetchAllEntries() {
    let all = [];
    let offset = 0;
    for (;;) {
      const r = await Api.call('listEntries', { limit: PAGE, offset: offset });
      all = all.concat(r.entries);
      offset += r.entries.length;
      if (!r.entries.length || offset >= r.total) break;
    }
    return all.reverse();
  }

  /** Sets column widths on a sheet from a list of numbers. */
  function widths(ws, list) {
    ws['!cols'] = list.map(function (w) { return { wch: w }; });
  }

  /** Exports every entry to Entries (import format) and keeps Amount_BDT as an extra last column. */
  async function exportAll(btn) {
    btn.disabled = true;
    note('Preparing the file...', true);
    try {
      const results = await Promise.all([fetchAllEntries(), loadLib()]);
      const entries = results[0];
      const XLSX = results[1];
      const rows = entries.map(function (e) {
        return [e.date, e.type, e.category, e.institution, e.amount, e.currency,
                e.currency === 'BDT' ? '' : e.rate, e.details, e.amountBdt];
      });
      const ws = XLSX.utils.aoa_to_sheet([COLUMNS.concat(['Amount_BDT'])].concat(rows));
      widths(ws, [12, 12, 20, 22, 14, 9, 10, 60, 14]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Entries');
      XLSX.writeFile(wb, 'my-finance-export-' + today() + '.xlsx');
      note('Exported ' + entries.length + ' entries.', true);
    } catch (e) {
      note(e.message || 'Export failed.', false);
    } finally {
      btn.disabled = false;
    }
  }

  /** Downloads an empty template with the exact columns, plus Lists and Help sheets. */
  async function downloadTemplate(btn) {
    btn.disabled = true;
    note('Preparing the template...', true);
    try {
      const results = await Promise.all([Api.call('getLists'), loadLib()]);
      const lists = results[0];
      const XLSX = results[1];
      const wb = XLSX.utils.book_new();

      const ws = XLSX.utils.aoa_to_sheet([COLUMNS]);
      widths(ws, [12, 12, 20, 22, 14, 9, 10, 60]);
      XLSX.utils.book_append_sheet(wb, ws, 'Entries');

      const n = Math.max(lists.categories.length, lists.institutions.length, lists.currencies.length);
      const grid = [['Category', 'Category type', 'Institution', 'Currency']];
      for (let i = 0; i < n; i++) {
        const c = lists.categories[i], s = lists.institutions[i], u = lists.currencies[i];
        grid.push([c ? c.name : '', c ? c.type : '', s ? s.name : '', u ? u.code : '']);
      }
      const wl = XLSX.utils.aoa_to_sheet(grid);
      widths(wl, [22, 14, 24, 10]);
      XLSX.utils.book_append_sheet(wb, wl, 'Lists');

      const help = [
        ['How to fill the Entries sheet'],
        ['Date', 'yyyy-mm-dd, for example 2026-11-17 (not in the future)'],
        ['Type', 'Income, Expense, Deposit or Withdrawal'],
        ['Category', 'Required for Income and Expense; must match the Lists sheet and the type. Leave empty for Deposit and Withdrawal.'],
        ['Institution', 'Required for Deposit and Withdrawal; optional for Income and Expense. Must match the Lists sheet.'],
        ['Amount', 'A positive number'],
        ['Currency', 'A code from the Lists sheet, for example BDT or USD'],
        ['Rate', 'Required for a foreign currency (BDT per 1 unit). Leave empty for BDT.'],
        ['Details', 'Free text, Bangla is fine (up to 5000 characters)'],
        ['Note', 'Do not rename the columns. Do not delete the header row. Do not add example rows here.']
      ];
      const wh = XLSX.utils.aoa_to_sheet(help);
      widths(wh, [14, 100]);
      XLSX.utils.book_append_sheet(wb, wh, 'Help');

      XLSX.writeFile(wb, 'my-finance-import-template.xlsx');
      note('Template downloaded.', true);
    } catch (e) {
      note(e.message || 'Could not make the template.', false);
    } finally {
      btn.disabled = false;
    }
  }


  // ---------- Import ----------

  const CHUNK = 100;            // rows per server call (server limit)
  const MAX_IMPORT_ROWS = 2000; // safety limit per file
  const MAX_SHOWN_ERRORS = 30;
  const TYPES = ['Income', 'Expense', 'Deposit', 'Withdrawal'];
  let ready = null;             // { batchId, rows } waiting for the Import button
  let busy = false;

  /** Shows a short note in the import card. ok=true makes it green. */
  function impNote(text, ok) {
    const p = $('msg-import');
    p.textContent = text || '';
    p.className = 'msg' + (ok ? ' ok' : '');
  }

  /** Text of a cell ('' when empty). */
  function cellText(cell) {
    return cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
  }

  /** Date cell -> yyyy-mm-dd. Excel date serials are formatted without any time zone shift. */
  function cellDate(XLSX, cell) {
    if (!cell || cell.v === undefined || cell.v === null) return '';
    if (cell.t === 'n') return XLSX.SSF.format('yyyy-mm-dd', cell.v);
    return String(cell.v).trim();
  }

  /** Number cell -> number, or text with thousands commas removed ('' when empty). */
  function cellNumber(cell) {
    if (!cell || cell.v === undefined || cell.v === null) return '';
    if (cell.t === 'n') return cell.v;
    return String(cell.v).replace(/[,\s]/g, '');
  }

  /**
   * Turns a workbook file into import rows. Pure function (no screen access).
   * Looks for a sheet named Entries (else the first sheet) and checks the header.
   * Category, institution, type and currency are matched ignoring upper/lower case.
   * @param {Object} XLSX The SheetJS library.
   * @param {ArrayBuffer} buf File bytes.
   * @param {{categories: Object[], institutions: Object[]}} lists From getLists.
   * @returns {{rows?: Object[], error?: string}} Rows carry n = the Excel row number.
   */
  function parseWorkbook(XLSX, buf, lists) {
    let wb;
    try {
      wb = XLSX.read(buf, { type: 'array' });
    } catch (e) {
      return { error: 'This file could not be read. Use the template (.xlsx).' };
    }
    const name = wb.SheetNames.indexOf('Entries') !== -1 ? 'Entries' : wb.SheetNames[0];
    const ws = name ? wb.Sheets[name] : null;
    if (!ws || !ws['!ref']) return { error: 'The sheet is empty.' };
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (let c = 0; c < COLUMNS.length; c++) {
      const head = cellText(ws[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + c })]);
      if (head.toLowerCase() !== COLUMNS[c].toLowerCase()) {
        return { error: 'Column ' + (c + 1) + ' of the first row must be "' + COLUMNS[c] + '". Please use the template.' };
      }
    }

    const byLower = function (items) {
      const m = {};
      items.forEach(function (i) { m[i.name.toLowerCase()] = i.name; });
      return m;
    };
    const cats = byLower(lists.categories), inst = byLower(lists.institutions);
    const rows = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cell = function (c) { return ws[XLSX.utils.encode_cell({ r: r, c: range.s.c + c })]; };
      const blank = COLUMNS.every(function (_, c) { return cellText(cell(c)) === ''; });
      if (blank) continue;
      const type = cellText(cell(1));
      const category = cellText(cell(2)), institution = cellText(cell(3));
      const currency = cellText(cell(5)).toUpperCase();
      const row = {
        n: r + 1,
        date: cellDate(XLSX, cell(0)),
        type: TYPES.filter(function (t) { return t.toLowerCase() === type.toLowerCase(); })[0] || type,
        category: cats[category.toLowerCase()] || category,
        institution: inst[institution.toLowerCase()] || institution,
        amount: cellNumber(cell(4)),
        currency: currency,
        details: cellText(cell(7))
      };
      const rate = cellNumber(cell(6));
      if (rate !== '') row.rate = rate;
      rows.push(row);
      if (rows.length > MAX_IMPORT_ROWS) return { error: 'Too many rows. Import at most ' + MAX_IMPORT_ROWS + ' rows per file.' };
    }
    if (!rows.length) return { error: 'No entries found below the header row.' };
    return { rows: rows };
  }

  /** SHA-256 of the file as hex (first 32 characters): the same file always gives the same batch id. */
  async function fileBatchId(buf) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 32);
  }

  /** Splits a list into pieces of at most `size`. */
  function chunks(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  /** Shows the first errors as small rows under the import card. */
  function showErrors(errors) {
    const box = $('imp-errors');
    box.textContent = '';
    errors.slice(0, MAX_SHOWN_ERRORS).forEach(function (e) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const main = document.createElement('div');
      main.className = 'list-main';
      const t = document.createElement('div');
      t.className = 'list-title';
      t.textContent = (e.n ? 'Row ' + e.n : 'File') + (e.field ? ' - ' + e.field : '');
      const s = document.createElement('div');
      s.className = 'list-sub';
      s.textContent = e.message;
      main.appendChild(t);
      main.appendChild(s);
      row.appendChild(main);
      box.appendChild(row);
    });
    if (errors.length > MAX_SHOWN_ERRORS) {
      const more = document.createElement('p');
      more.className = 'muted small';
      more.textContent = '...and ' + (errors.length - MAX_SHOWN_ERRORS) + ' more problems.';
      box.appendChild(more);
    }
  }

  /** Clears the preview and hides the Import button. */
  function resetImport() {
    ready = null;
    $('imp-errors').textContent = '';
    $('btn-import-go').hidden = true;
  }

  /** Reads the chosen file, checks it with the server (dry run) and shows the preview. */
  async function onFileChosen(file) {
    resetImport();
    if (!file) return;
    if (!navigator.onLine) { impNote('Import needs internet. Try again when you are online.', false); return; }
    busy = true;
    $('btn-import-pick').disabled = true;
    try {
      impNote('Reading the file...', true);
      const results = await Promise.all([file.arrayBuffer(), loadLib(), Api.call('getLists')]);
      const buf = results[0], XLSX = results[1], lists = results[2];
      const parsed = parseWorkbook(XLSX, buf, lists);
      if (parsed.error) { impNote(parsed.error, false); return; }

      const batchId = await fileBatchId(buf);
      const parts = chunks(parsed.rows, CHUNK);
      let errors = [], wouldImport = 0, duplicates = 0;
      for (let i = 0; i < parts.length; i++) {
        impNote('Checking rows... ' + Math.min((i + 1) * CHUNK, parsed.rows.length) + ' of ' + parsed.rows.length, true);
        const r = await Api.call('importEntries', { batchId: batchId, rows: parts[i], dryRun: true });
        errors = errors.concat(r.errors);
        wouldImport += r.wouldImport;
        duplicates += r.duplicates;
      }
      if (errors.length) {
        showErrors(errors);
        impNote(errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ' found. Nothing was imported. Fix the file and choose it again.', false);
        return;
      }
      if (!wouldImport) {
        impNote('Nothing new: all ' + duplicates + ' rows of this file were already imported.', true);
        return;
      }
      ready = { batchId: batchId, rows: parsed.rows };
      impNote('Ready: ' + wouldImport + ' new entries' + (duplicates ? ' (' + duplicates + ' already imported will be skipped)' : '') + '. Press Import to save them.', true);
      $('btn-import-go').textContent = 'Import ' + wouldImport + ' entries';
      $('btn-import-go').hidden = false;
    } catch (e) {
      impNote(e.message || 'Could not check the file.', false);
    } finally {
      busy = false;
      $('btn-import-pick').disabled = false;
      $('imp-file').value = '';
    }
  }

  /** Sends the checked rows to the server in chunks. Safe to repeat: known rows are skipped. */
  async function runImport() {
    if (!ready || busy) return;
    if (!navigator.onLine) { impNote('Import needs internet. Try again when you are online.', false); return; }
    busy = true;
    const job = ready;
    $('btn-import-go').disabled = true;
    $('btn-import-pick').disabled = true;
    let imported = 0, duplicates = 0;
    try {
      const parts = chunks(job.rows, CHUNK);
      for (let i = 0; i < parts.length; i++) {
        impNote('Importing... ' + Math.min((i + 1) * CHUNK, job.rows.length) + ' of ' + job.rows.length, true);
        const r = await Api.call('importEntries', { batchId: job.batchId, rows: parts[i] });
        if (r.errors.length) { showErrors(r.errors); throw new Error('A row was rejected. Choose the same file again to continue.'); }
        imported += r.imported;
        duplicates += r.duplicates;
      }
      resetImport();
      impNote('Imported ' + imported + ' entries' + (duplicates ? ' (' + duplicates + ' skipped, already there)' : '') + '.', true);
      try { await EntryForm.load(); } catch (e) { /* the Add form shows its own error */ }
    } catch (e) {
      impNote((e.message || 'Import stopped.') + (imported ? ' ' + imported + ' entries were saved before it stopped. Choose the same file again to finish; saved rows are skipped.' : ''), false);
    } finally {
      busy = false;
      $('btn-import-go').disabled = false;
      $('btn-import-pick').disabled = false;
    }
  }

  /** Connects the buttons. */
  function init() {
    const be = $('btn-export'), bt = $('btn-template');
    if (!be || !bt) return;
    be.addEventListener('click', function () { exportAll(be); });
    bt.addEventListener('click', function () { downloadTemplate(bt); });
    $('btn-import-pick').addEventListener('click', function () { if (!busy) $('imp-file').click(); });
    $('imp-file').addEventListener('change', function (ev) { onFileChosen(ev.target.files[0]); });
    $('btn-import-go').addEventListener('click', runImport);
  }

  init();
  return { COLUMNS: COLUMNS, loadLib: loadLib, note: note, parseWorkbook: parseWorkbook };
})();
