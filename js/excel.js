/**
 * Excel tools (Settings tab): export all entries to .xlsx and download
 * an empty import template. The SheetJS library (js/vendor, version 0.18.5)
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

  /** Connects the buttons. */
  function init() {
    const be = $('btn-export'), bt = $('btn-template');
    if (!be || !bt) return;
    be.addEventListener('click', function () { exportAll(be); });
    bt.addEventListener('click', function () { downloadTemplate(bt); });
  }

  init();
  return { COLUMNS: COLUMNS, loadLib: loadLib, note: note };
})();
