/**
 * MonthPicker - Dynamic Month & Year Grid Selector Popover
 * Allows jumping to any month and year (e.g. from 2000 to current year) in 1 click.
 */
const MonthPicker = (function () {
  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  let currentSelectedMonth = '';
  let activeYear = new Date().getFullYear();
  let onSelectCallback = null;
  let wired = false;

  const $ = function (id) { return document.getElementById(id); };

  function getTodayMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function getTodayYear() {
    return new Date().getFullYear();
  }

  function render() {
    const yearLabel = $('mp-year-label');
    const grid = $('mp-grid');
    const prevBtn = $('mp-prev-year');
    const nextBtn = $('mp-next-year');

    if (!yearLabel || !grid) return;

    yearLabel.textContent = String(activeYear);

    const maxYear = getTodayYear();
    const nowMonthStr = getTodayMonth();

    if (prevBtn) prevBtn.disabled = activeYear <= 2000;
    if (nextBtn) nextBtn.disabled = activeYear >= maxYear;

    grid.innerHTML = '';

    MONTH_NAMES.forEach(function (name, idx) {
      const monthNum = idx + 1;
      const monthStr = activeYear + '-' + String(monthNum).padStart(2, '0');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mp-month-btn';
      btn.textContent = name;

      // Future months cannot have entries
      if (monthStr > nowMonthStr) {
        btn.disabled = true;
      }

      if (monthStr === currentSelectedMonth) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', function () {
        const chosen = monthStr;
        const cb = onSelectCallback;
        close();
        if (typeof cb === 'function') {
          cb(chosen);
        }
      });

      grid.appendChild(btn);
    });
  }

  function wire() {
    if (wired) return;
    wired = true;

    const overlay = $('month-picker-overlay');
    const card = $('month-picker-card');
    const prevBtn = $('mp-prev-year');
    const nextBtn = $('mp-next-year');
    const thisMonthBtn = $('mp-btn-this-month');
    const closeBtn = $('mp-btn-close');

    if (prevBtn) {
      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (activeYear > 2000) {
          activeYear--;
          render();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (activeYear < getTodayYear()) {
          activeYear++;
          render();
        }
      });
    }

    if (thisMonthBtn) {
      thisMonthBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const now = getTodayMonth();
        const cb = onSelectCallback;
        close();
        if (typeof cb === 'function') {
          cb(now);
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        close();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          close();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) {
        close();
      }
    });
  }

  function open(monthStr, onSelect) {
    wire();
    currentSelectedMonth = monthStr || getTodayMonth();
    activeYear = parseInt(currentSelectedMonth.slice(0, 4), 10) || getTodayYear();
    onSelectCallback = onSelect;

    render();

    const overlay = $('month-picker-overlay');
    if (overlay) {
      overlay.hidden = false;
    }
  }

  function close() {
    const overlay = $('month-picker-overlay');
    if (overlay) {
      overlay.hidden = true;
    }
    onSelectCallback = null;
  }

  const api = {
    open: open,
    close: close
  };

  if (typeof window !== 'undefined') {
    window.MonthPicker = api;
  }

  return api;
})();
