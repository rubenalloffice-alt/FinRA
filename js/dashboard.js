/**
 * Dashboard (Overview) View Controller
 * Inspired by FinTrack, Velmo & Finora modern finance dashboard UI.
 */
const DashboardView = (function () {
  const $ = function (id) { return document.getElementById(id); };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SAVINGS = ['Deposit', 'Withdrawal'];

  let month = currentMonth();
  let seq = 0;
  let wired = false;

  function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function todayLocal() {
    const d = new Date();
    return currentMonth() + '-' + String(d.getDate()).padStart(2, '0');
  }

  function shiftMonth(m, delta) {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function monthLabel(m) {
    return new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function taka(n) {
    return (n < 0 ? '\u2212 \u09F3 ' : '\u09F3 ') + Ui.money(Math.abs(n));
  }

  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function updateMonthBar() {
    const label = $('dash-month-label');
    if (label) {
      label.innerHTML = monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }
    $('dash-prev').disabled = month <= '2000-01';
    $('dash-next').disabled = month >= currentMonth();
  }

  function updateGreeting() {
    const h = new Date().getHours();
    let greet = 'Good evening';
    if (h >= 5 && h < 12) greet = 'Good morning';
    else if (h >= 12 && h < 17) greet = 'Good afternoon';
    const el = $('dash-greeting');
    if (el) el.textContent = greet + ', RA Finance!';
  }

  function renderHero(totals) {
    const balEl = $('dash-hero-balance');
    const badgeEl = $('dash-hero-badge');
    if (!totals) {
      balEl.textContent = '\u09F3 0.00';
      badgeEl.textContent = '0% Saved';
      return;
    }

    balEl.textContent = taka(totals.netSaved);
    if (totals.income > 0) {
      const rate = Math.round((totals.netSaved / totals.income) * 100);
      badgeEl.textContent = (rate >= 0 ? '+' : '') + rate + '% Saved this month';
      badgeEl.className = 'dash-hero-badge ' + (rate >= 0 ? 'pos' : 'neg');
    } else {
      badgeEl.textContent = totals.netSaved >= 0 ? 'Balanced' : 'Deficit';
      badgeEl.className = 'dash-hero-badge';
    }
  }

  function renderMetrics(totals) {
    const incEl = $('dash-income');
    const expEl = $('dash-expense');
    const rateEl = $('dash-savings-rate');
    const countEl = $('dash-entries-count');

    if (!totals) {
      incEl.textContent = expEl.textContent = rateEl.textContent = countEl.textContent = '-';
      return;
    }

    incEl.textContent = '+ \u09F3 ' + Ui.money(totals.income);
    expEl.textContent = '\u2212 \u09F3 ' + Ui.money(totals.expense);
    
    if (totals.income > 0) {
      const rate = Math.round((totals.netSaved / totals.income) * 100);
      rateEl.textContent = rate + '%';
      rateEl.className = 'dash-metric-v ' + (rate >= 0 ? 'pos' : 'neg');
    } else {
      rateEl.textContent = '0%';
      rateEl.className = 'dash-metric-v';
    }

    countEl.textContent = String(totals.entryCount || 0);
  }

  function renderDailyChart(days) {
    const box = $('dash-daily-chart');
    const note = $('dash-chart-note');
    box.textContent = '';
    if (!days || !days.length) {
      box.appendChild(make('p', 'muted small', 'No expenses recorded for this month.'));
      note.textContent = '';
      return;
    }

    const max = Math.max.apply(null, days.map(function (d) { return d.expense; }));
    if (max <= 0) {
      box.appendChild(make('p', 'muted small', 'No expenses recorded yet this month.'));
      note.textContent = 'Zero expense this month';
      return;
    }

    const total = days.reduce(function (s, d) { return s + d.expense; }, 0);
    const elapsed = month === currentMonth() ? Number(todayLocal().slice(8, 10)) : days.length;
    note.textContent = 'Total ' + taka(total) + ' spent \u00B7 avg ' + taka(total / (elapsed || 1)) + '/day';

    const W = 560;
    const H = 140;
    const padB = 16;
    const padT = 12;
    const slot = W / days.length;
    const bw = Math.max(3, slot * 0.65);

    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img', 'aria-label': 'Daily cashflow' });
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: H - padB, y2: H - padB }));

    days.forEach(function (d, i) {
      const day = Number(d.date.slice(8, 10));
      if (day === 1 || day % 5 === 0 || day === days.length) {
        const lbl = svgEl('text', { x: i * slot + slot / 2, y: H - 2, 'text-anchor': 'middle' });
        lbl.textContent = String(day);
        svg.appendChild(lbl);
      }
      if (!(d.expense > 0)) return;
      const h = (H - padB - padT) * d.expense / max;
      const bar = svgEl('rect', {
        x: i * slot + (slot - bw) / 2, y: H - padB - h, width: bw, height: h, rx: 3, 'class': 'bar'
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

  function renderCategories(cats, totalExp) {
    const box = $('dash-category-list');
    box.textContent = '';
    if (!cats || !cats.length || (totalExp !== undefined && totalExp <= 0)) {
      box.appendChild(make('p', 'muted small', 'No expense breakdown available.'));
      return;
    }

    const topCats = cats.slice(0, 5);
    topCats.forEach(function (c) {
      const pct = c.share !== undefined ? Math.round(c.share) : (totalExp > 0 ? Math.round((c.amount / totalExp) * 100) : 0);
      const row = make('div', 'dash-cat-row');
      const top = make('div', 'dash-cat-top');
      top.appendChild(make('span', 'dash-cat-name', c.category + (c.count ? ' (' + c.count + ')' : '')));
      top.appendChild(make('span', 'dash-cat-amt', taka(c.amount) + ' \u00B7 ' + pct + '%'));
      row.appendChild(top);

      const track = make('div', 'bar-track');
      const fill = make('div', 'bar-fill exp');
      fill.style.width = Math.min(100, Math.max(3, pct)) + '%';
      track.appendChild(fill);
      row.appendChild(track);

      box.appendChild(row);
    });
  }

  function renderRecent(entries) {
    const box = $('dash-recent-list');
    box.textContent = '';
    if (!entries || !entries.length) {
      box.appendChild(make('p', 'muted small', 'No recent transactions. Click "+ Add Entry" to start recording!'));
      return;
    }

    entries.forEach(function (e) {
      const isSavings = SAVINGS.indexOf(e.type) !== -1;
      const plus = e.type === 'Income' || e.type === 'Deposit';

      const row = make('div', 'dash-recent-row');
      row.dataset.type = e.type;

      const left = make('div', 'dash-recent-left');
      const badge = make('span', 'chip', e.type);
      left.appendChild(badge);

      const info = make('div', 'dash-recent-info');
      info.appendChild(make('div', 'dash-recent-title', (isSavings ? e.institution : e.category) || 'Transaction'));
      info.appendChild(make('div', 'dash-recent-sub', e.date + (e.details ? ' \u00B7 ' + e.details : '')));
      left.appendChild(info);
      row.appendChild(left);

      const amt = make('div', 'dash-recent-amt ' + (plus ? 'pos' : 'neg'));
      amt.textContent = (plus ? '+ ' : '\u2212 ') + '\u09F3 ' + Ui.money(e.amountBdt);
      row.appendChild(amt);

      box.appendChild(row);
    });
  }

  function renderSavings(balances, movement) {
    const box = $('dash-savings-list');
    box.textContent = '';
    if (!balances || !balances.institutions || !balances.institutions.length) {
      box.appendChild(make('p', 'muted small', 'No savings institutions recorded.'));
      return;
    }

    const moveMap = {};
    if (movement) {
      movement.forEach(function (m) { moveMap[m.institution] = m; });
    }

    balances.institutions.slice(0, 5).forEach(function (b) {
      const row = make('div', 'list-row');
      const main = make('div', 'list-main');
      main.appendChild(make('div', 'list-title', b.institution));
      const m = moveMap[b.institution];
      const subText = m ? 'This month: +' + taka(m.deposits) + ' / -' + taka(m.withdrawals) : 'No movement this month';
      main.appendChild(make('div', 'list-sub', subText));
      row.appendChild(main);

      const amt = make('div', 'list-amt' + (b.isNegative ? ' neg' : ''));
      amt.textContent = taka(b.balance);
      row.appendChild(amt);

      box.appendChild(row);
    });
  }

  const CACHE_TTL_MS = 180000; // 3 minutes quick cache
  const cache = {};

  function invalidateCache() {
    Object.keys(cache).forEach(function (k) { delete cache[k]; });
  }

  function setLoadingState(loading) {
    const bar = $('dash-month-bar') || ($('dash-month-label') ? $('dash-month-label').closest('.month-bar') : null);
    if (bar) bar.classList.toggle('is-loading', loading);

    const label = $('dash-month-label');
    if (label) {
      label.innerHTML = loading
        ? '<span class="spinner-sm"></span> ' + monthLabel(month)
        : monthLabel(month) + ' <span class="ml-chevron">▾</span>';
    }

    const prev = $('dash-prev');
    const next = $('dash-next');
    if (prev) prev.disabled = loading || month <= '2000-01';
    if (next) next.disabled = loading || month >= currentMonth();

    const heroVal = $('dash-hero-balance');
    const heroBadge = $('dash-hero-badge');
    const metricIds = ['dash-income', 'dash-expense', 'dash-savings-rate', 'dash-entries-count'];

    if (loading) {
      if (heroVal) heroVal.classList.add('skeleton');
      if (heroBadge) heroBadge.classList.add('skeleton');
      metricIds.forEach(function (id) {
        const el = $(id);
        if (el) el.classList.add('skeleton');
      });
      $('dash-daily-chart').innerHTML = '<div class="skeleton skeleton-box"></div>';
      $('dash-category-list').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
      $('dash-recent-list').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
      $('dash-savings-list').innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
    } else {
      if (heroVal) { heroVal.classList.remove('skeleton'); heroVal.classList.add('fade-in'); }
      if (heroBadge) { heroBadge.classList.remove('skeleton'); heroBadge.classList.add('fade-in'); }
      metricIds.forEach(function (id) {
        const el = $(id);
        if (el) { el.classList.remove('skeleton'); el.classList.add('fade-in'); }
      });
    }
  }

  function applyData(report, listRes, balances) {
    if (report && report.totals) {
      renderHero(report.totals);
      renderMetrics(report.totals);
      renderDailyChart(report.daily);
      renderCategories(report.expenseByCategory || [], report.totals.expense);
      renderSavings(balances, report.savingsMovement);
    } else {
      renderHero(null);
      renderMetrics(null);
      renderDailyChart(null);
      renderCategories([], 0);
      renderSavings(balances, null);
    }
    renderRecent(listRes ? listRes.entries : []);
  }

  async function load(force) {
    const my = ++seq;
    updateGreeting();

    // Instant switch if present in fresh cache
    const cached = cache[month];
    if (!force && cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
      updateMonthBar();
      applyData(cached.report, cached.listRes, cached.balances);
      return;
    }

    setLoadingState(true);

    try {
      const [report, listRes, balances] = await Promise.all([
        Api.call('getReport', { month: month }).catch(function () { return null; }),
        Api.call('listEntries', { month: month, limit: 5 }).catch(function () { return { entries: [] }; }),
        Api.call('getBalances', { asOf: todayLocal() }).catch(function () { return null; })
      ]);

      if (my !== seq) return;

      cache[month] = {
        report: report,
        listRes: listRes,
        balances: balances,
        time: Date.now()
      };

      setLoadingState(false);
      applyData(report, listRes, balances);

    } catch (e) {
      if (my === seq) {
        setLoadingState(false);
        renderHero(null);
        renderMetrics(null);
      }
    }
  }

  function clear() {
    renderHero(null);
    renderMetrics(null);
    $('dash-daily-chart').textContent = '';
    $('dash-category-list').textContent = '';
    $('dash-recent-list').textContent = '';
    $('dash-savings-list').textContent = '';
  }

  function show() {
    month = currentMonth();
    load();
  }

  function init() {
    if (wired) return;
    wired = true;

    const prev = $('dash-prev');
    const next = $('dash-next');
    const label = $('dash-month-label');
    if (prev) prev.addEventListener('click', function () { month = shiftMonth(month, -1); load(); });
    if (next) next.addEventListener('click', function () { month = shiftMonth(month, 1); load(); });
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

    // Handle data-goto quick buttons
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-goto]');
      if (btn && btn.dataset.goto) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('goto-view', { detail: btn.dataset.goto }));
      }
    });
  }

  return {
    init: init,
    show: show,
    clear: clear,
    load: load,
    invalidateCache: invalidateCache
  };
})();
