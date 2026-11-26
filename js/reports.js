/**
 * The Reports screen: month totals, comparison with the previous month,
 * category bars, a daily expense chart, the biggest expenses, savings
 * balances and the month snapshot. Everything is drawn with plain DOM and
 * SVG (no chart library), and text from the Sheet is set with textContent.
 */
const ReportsView = (function () {

  const $ = function (id) { return document.getElementById(id); };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let month = currentMonth();
  let seq = 0;       // ignores answers of older requests
  let wired = false;

  /** Current month on this device as yyyy-MM. */
  function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /** Today on this device as yyyy-MM-dd. */
  function todayLocal() {
    const d = new Date();
    return currentMonth() + '-' + String(d.getDate()).padStart(2, '0');
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

  /** Last day of a yyyy-MM month as yyyy-MM-dd. */
  function lastDayOf(m) {
    const days = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    return m + '-' + String(days).padStart(2, '0');
  }

  /** Date up to which savings balances are counted: today for this month, month end otherwise. */
  function asOfFor(m) {
    return m >= currentMonth() ? todayLocal() : lastDayOf(m);
  }

  /** Formats a BDT amount, with a minus sign for negatives. */
  function taka(n) {
    return (n < 0 ? '\u2212 ' : '') + '\u09F3 ' + Ui.money(Math.abs(n));
  }

  /** Creates an element with a class and plain text. */
  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Creates an SVG element with attributes. */
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /** Updates the month label and the enabled state of the arrows. */
  function updateMonthBar() {
    const label = $('r-label');
    if (label) {
      label.innerHTML = monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }
    $('r-prev').disabled = month <= '2000-01';
    $('r-next').disabled = month >= currentMonth();
  }

  /** Shows the four numbers at the top. */
  function renderTiles(report) {
    const t = report ? report.totals : null;
    $('r-income').textContent = t ? taka(t.income) : '-';
    $('r-expense').textContent = t ? taka(t.expense) : '-';
    const net = $('r-net');
    net.textContent = t ? taka(t.netSaved) : '-';
    net.className = 'tile-v' + (t ? (t.netSaved < 0 ? ' bad' : ' ok') : '');
    $('r-count').textContent = t ? String(t.entryCount) : '-';
  }

  /** One line of the comparison card. */
  function compareLine(label, now, prev, upIsGood) {
    const row = make('div', 'cmp-line');
    row.appendChild(make('span', '', label));
    let text;
    let cls = '';
    if (prev === 0 && now === 0) {
      text = 'no data';
    } else if (prev === 0) {
      text = 'nothing last month';
    } else {
      const diff = now - prev;
      const pct = Math.round(Math.abs(diff) / Math.abs(prev) * 1000) / 10;
      const sign = diff >= 0 ? '+' : '\u2212';
      text = sign + pct + '% (' + sign + ' ' + taka(Math.abs(diff)) + ')';
      if (diff !== 0) cls = (diff > 0) === upIsGood ? ' pos' : ' neg';
    }
    row.appendChild(make('span', 'cmp-val' + cls, text));
    return row;
  }

  /** Comparison with the previous month. */
  function renderCompare(report) {
    const box = $('r-compare');
    box.textContent = '';
    if (!report) return;
    const t = report.totals;
    const p = report.previous;
    box.appendChild(make('h3', '', 'Compared with ' + monthLabel(p.month)));
    box.appendChild(compareLine('Income', t.income, p.income, true));
    box.appendChild(compareLine('Expense', t.expense, p.expense, false));
    box.appendChild(compareLine('Net saved', t.netSaved, p.netSaved, true));
  }

  /** Horizontal bars, one per category, biggest first. */
  function renderBars(boxId, rows, cls, emptyText) {
    const box = $(boxId);
    box.textContent = '';
    if (!rows || !rows.length) {
      box.appendChild(make('p', 'muted', emptyText));
      return;
    }
    const max = rows[0].amount;
    rows.forEach(function (r) {
      const row = make('div', 'bar-row');
      const top = make('div', 'bar-top');
      top.appendChild(make('span', '', r.category + ' (' + r.count + ')'));
      top.appendChild(make('span', 'list-amt', taka(r.amount) + ' \u00B7 ' + r.share + '%'));
      const track = make('div', 'bar-track');
      const fill = make('div', 'bar-fill ' + cls);
      fill.style.width = (max > 0 ? Math.max(2, r.amount / max * 100) : 0) + '%';
      track.appendChild(fill);
      row.appendChild(top);
      row.appendChild(track);
      box.appendChild(row);
    });
  }

  /** Daily expense bars as an SVG chart; tapping a bar shows its day below. */
  function renderDaily(report) {
    const box = $('r-daily');
    const note = $('r-daily-note');
    box.textContent = '';
    note.textContent = '';
    if (!report) return;

    const days = report.daily;
    const max = days.reduce(function (m, d) { return Math.max(m, d.expense); }, 0);
    if (!(max > 0)) {
      box.appendChild(make('p', 'muted', 'No expenses this month.'));
      return;
    }
    const total = days.reduce(function (s, d) { return s + d.expense; }, 0);
    const elapsed = month === currentMonth() ? Number(todayLocal().slice(8, 10)) : days.length;
    const defaultNote = 'Total ' + taka(total) + ' \u00B7 average ' + taka(total / elapsed) + ' per day';
    note.textContent = defaultNote;

    const W = 600;
    const H = 170;
    const padB = 18;
    const padT = 16;
    const slot = W / days.length;
    const bw = slot * 0.66;
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img', 'aria-label': 'Daily expenses' });
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: H - padB, y2: H - padB }));
    const maxLabel = svgEl('text', { x: 2, y: 10 });
    maxLabel.textContent = 'max ' + Ui.money(max);
    svg.appendChild(maxLabel);

    days.forEach(function (d, i) {
      const day = Number(d.date.slice(8, 10));
      if (day === 1 || day % 5 === 0) {
        const lbl = svgEl('text', { x: i * slot + slot / 2, y: H - 4, 'text-anchor': 'middle' });
        lbl.textContent = String(day);
        svg.appendChild(lbl);
      }
      if (!(d.expense > 0)) return;
      const h = (H - padB - padT) * d.expense / max;
      const bar = svgEl('rect', {
        x: i * slot + (slot - bw) / 2, y: H - padB - h, width: bw, height: h, rx: 2, 'class': 'bar'
      });
      const tip = svgEl('title', {});
      tip.textContent = d.date + ': ' + taka(d.expense);
      bar.appendChild(tip);
      bar.addEventListener('click', function () {
        svg.querySelectorAll('.bar.sel').forEach(function (b) { b.classList.remove('sel'); });
        bar.classList.add('sel');
        note.textContent = d.date + ': ' + taka(d.expense);
      });
      svg.appendChild(bar);
    });
    box.appendChild(svg);
  }

  /** The biggest expenses of the month. */
  function renderTop(report) {
    const box = $('r-top');
    box.textContent = '';
    if (!report) return;
    if (!report.topExpenses.length) {
      box.appendChild(make('p', 'muted', 'No expenses this month.'));
      return;
    }
    report.topExpenses.forEach(function (e) {
      const row = make('div', 'list-row');
      const main = make('div', 'list-main');
      main.appendChild(make('div', 'list-title', e.category));
      main.appendChild(make('div', 'list-sub', e.date + (e.details ? ' \u00B7 ' + e.details : '')));
      row.appendChild(main);
      row.appendChild(make('div', 'list-amt', taka(e.amountBdt)));
      box.appendChild(row);
    });
  }

  /** Savings balance per institution plus this month's movement. */
  function renderSavings(report, balances) {
    const box = $('r-savings');
    box.textContent = '';
    if (!report) return;
    if (!balances) {
      box.appendChild(make('p', 'muted', 'Could not load savings balances.'));
      return;
    }
    const move = {};
    report.savingsMovement.forEach(function (m) { move[m.institution] = m; });
    const rows = balances.institutions.filter(function (b) {
      return b.balance !== 0 || move[b.institution];
    });
    if (!rows.length) {
      box.appendChild(make('p', 'muted', 'No savings recorded yet.'));
      return;
    }
    rows.forEach(function (b) {
      const m = move[b.institution];
      const row = make('div', 'list-row');
      const main = make('div', 'list-main');
      main.appendChild(make('div', 'list-title', b.institution));
      main.appendChild(make('div', 'list-sub', m
        ? 'This month: deposited ' + taka(m.deposits) + ', withdrawn ' + taka(m.withdrawals)
        : 'No movement this month'));
      row.appendChild(main);
      row.appendChild(make('div', 'list-amt' + (b.isNegative ? ' neg' : ''), taka(b.balance)));
      box.appendChild(row);
    });
    const total = make('div', 'total-line');
    total.appendChild(make('span', '', 'Total as of ' + balances.asOf));
    total.appendChild(make('span', balances.totalBalance < 0 ? 'neg' : '', taka(balances.totalBalance)));
    box.appendChild(total);
  }

  /** Snapshot text and button. */
  function renderSnapshot(report) {
    const text = $('r-snap-text');
    const btn = $('r-snap-btn');
    if (!report) {
      text.textContent = '';
      btn.disabled = true;
      return;
    }
    const s = report.snapshot;
    if (!s) {
      text.textContent = 'No snapshot saved for this month yet. A snapshot keeps this month\u2019s totals in your Sheet.';
      btn.textContent = 'Save snapshot';
    } else {
      text.textContent = 'Saved ' + s.savedAt + ': income ' + taka(s.totalIncome) + ', expense ' +
        taka(s.totalExpense) + ', net ' + taka(s.netSaved) + '. ' +
        (s.matchesLive ? '\u2713 Matches the live numbers.' : '\u26A0 Entries changed since then. Update it to match.');
      btn.textContent = 'Update snapshot';
    }
    btn.disabled = month > currentMonth();
  }

  /** Draws every part of the screen (null clears it). */
  function renderAll(report, balances) {
    renderTiles(report);
    renderCompare(report);
    renderBars('r-exp-cats', report && report.expenseByCategory, 'exp', 'No expenses this month.');
    renderBars('r-inc-cats', report && report.incomeByCategory, 'inc', 'No income this month.');
    renderDaily(report);
    renderTop(report);
    renderSavings(report, balances);
    renderSnapshot(report);
    if (window.NotificationsManager && NotificationsManager.checkSnapshotStatus) {
      NotificationsManager.checkSnapshotStatus(month, report);
    }
  }

  const CACHE_TTL_MS = 180000;
  const cache = {};

  function invalidateCache() {
    Object.keys(cache).forEach(function (k) { delete cache[k]; });
  }

  function setLoadingState(loading) {
    const bar = $('r-label') ? $('r-label').closest('.month-bar') : null;
    if (bar) bar.classList.toggle('is-loading', loading);

    const label = $('r-label');
    if (label) {
      label.innerHTML = loading
        ? '<span class="spinner-sm"></span> ' + monthLabel(month)
        : monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }

    const prev = $('r-prev');
    const next = $('r-next');
    if (prev) prev.disabled = loading || month <= '2000-01';
    if (next) next.disabled = loading || month >= currentMonth();

    ['r-t-income', 'r-t-expense', 'r-t-net', 'r-t-rate'].forEach(function (id) {
      const el = $(id);
      if (el) el.classList.toggle('skeleton', loading);
    });

    if (loading) {
      $('r-status').textContent = 'Calculating report for ' + monthLabel(month) + '...';
      $('r-exp-cats').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
      $('r-inc-cats').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
    } else {
      $('r-status').textContent = '';
      ['r-t-income', 'r-t-expense', 'r-t-net', 'r-t-rate'].forEach(function (id) {
        const el = $(id);
        if (el) el.classList.add('fade-in');
      });
    }
  }

  /** Loads the report and balances for the current month. */
  async function load(force) {
    const my = ++seq;

    const cached = cache[month];
    if (!force && cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
      updateMonthBar();
      renderAll(cached.report, cached.balances);
      return;
    }

    setLoadingState(true);
    let report = null;
    let balances = null;
    let failure = null;
    try {
      const out = await Promise.all([
        Api.call('getReport', { month: month }),
        Api.call('getBalances', { asOf: asOfFor(month) }).catch(function () { return null; })
      ]);
      report = out[0];
      balances = out[1];
    } catch (e) {
      failure = e;
    }
    if (my !== seq) return;

    setLoadingState(false);
    if (failure) {
      $('r-status').textContent = 'Could not load the report: ' + failure.message;
      renderAll(null, null);
      return;
    }
    cache[month] = {
      report: report,
      balances: balances,
      time: Date.now()
    };
    renderAll(report, balances);
  }

  /** Saves (or updates) the snapshot of the shown month. */
  async function saveSnapshot() {
    const btn = $('r-snap-btn');
    btn.disabled = true;
    try {
      const res = await Api.call('saveReportSnapshot', { month: month });
      invalidateCache();
      Ui.toast(res.replaced ? 'Snapshot updated' : 'Snapshot saved');
    } catch (e) {
      Ui.toast(e.message);
    }
    load(true);
  }

  /** Wires the controls once. */
  function wire() {
    if (wired) return;
    wired = true;
    $('r-prev').addEventListener('click', function () { month = shiftMonth(month, -1); updateMonthBar(); load(); });
    $('r-next').addEventListener('click', function () { month = shiftMonth(month, 1); updateMonthBar(); load(); });
    const label = $('r-label');
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
    $('r-snap-btn').addEventListener('click', saveSnapshot);
  }

  /** Called when the Reports tab is opened. */
  function show() {
    wire();
    updateMonthBar();
    load();
  }

  /** Forgets everything on the screen (used when locking). */
  function clear() {
    seq++;
    month = currentMonth();
    $('r-status').textContent = '';
    renderAll(null, null);
  }

  return { show: show, clear: clear, refresh: load, invalidateCache: invalidateCache };
})();