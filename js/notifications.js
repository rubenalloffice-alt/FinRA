/**
 * FinRA Notification Center & Smart Task Manager
 * Manages the topbar Bell notification drawer, unread badge counter,
 * offline outbox 1-click sync, and end-of-month snapshot to-do reminders.
 */
const NotificationsManager = (function () {
  const $ = function (id) { return document.getElementById(id); };

  let wired = false;
  let offlineItems = [];
  let snapshotTask = null; // { month, label, status: 'pending'|'out-of-sync' }
  let alerts = [];

  function currentMonthStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function prevMonthStr() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatMonthName(mStr) {
    if (!mStr || mStr.length < 7) return mStr;
    const y = Number(mStr.slice(0, 4));
    const m = Number(mStr.slice(5, 7)) - 1;
    return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /** Calculates total unread actionable items. */
  function getUnreadCount() {
    let count = 0;
    if (offlineItems.length > 0) count += 1;
    if (snapshotTask) count += 1;
    count += alerts.length;
    return count;
  }

  /** Updates the badge on the topbar Bell icon. */
  function updateBadge() {
    const badge = $('notif-badge');
    if (!badge) return;
    const total = getUnreadCount();
    if (total > 0) {
      badge.hidden = false;
      badge.textContent = total > 9 ? '9+' : String(total);
    } else {
      badge.hidden = true;
    }
  }

  /** Refreshes offline queue items. */
  async function refreshQueue() {
    try {
      offlineItems = (window.Queue && Queue.all) ? await Queue.all() : [];
    } catch (e) {
      offlineItems = [];
    }
    checkRateAlerts();
    render();
    updateBadge();
  }

  /** Checks for foreign currency entries with suspicious/missing rate. */
  function checkRateAlerts() {
    alerts = [];
    const missingRates = offlineItems.filter(function (i) {
      const p = i.payload || {};
      return p.currency && p.currency !== 'BDT' && (!p.rate || p.rate === 1);
    });
    if (missingRates.length > 0) {
      alerts.push({
        id: 'rate-warning',
        type: 'warning',
        title: '⚠️ Exchange Rate Check',
        desc: missingRates.length + ' offline entry has conversion rate = 1. Please edit and verify.',
        actionLabel: 'Edit in Add Form',
        onAction: function () {
          close();
          if (window.gotoView) gotoView('add');
        }
      });
    }

    // Monthly rollover notice on days 1 to 5
    const today = new Date();
    if (today.getDate() <= 5) {
      const pName = formatMonthName(prevMonthStr());
      alerts.push({
        id: 'monthly-close',
        type: 'ok',
        title: '🎉 New Month Started',
        desc: pName + ' has ended. Review your monthly savings and expense report.',
        actionLabel: 'View Reports',
        onAction: function () {
          close();
          if (window.gotoView) gotoView('reports');
        }
      });
    }
  }

  /**
   * ReportsView or DashboardView calls this when report data is loaded.
   * Checks if monthly snapshot is pending or out of sync.
   */
  function checkSnapshotStatus(monthStr, report) {
    if (!report) return;
    const nowMonth = currentMonthStr();
    const prevMonth = prevMonthStr();
    const todayDay = new Date().getDate();

    // Check if snapshot is needed:
    // 1) For previous month if not saved
    // 2) For current month if day >= 25
    const isTargetMonth = (monthStr === prevMonth) || (monthStr === nowMonth && todayDay >= 25);
    if (!isTargetMonth) return;

    const s = report.snapshot;
    const mLabel = formatMonthName(monthStr);

    if (!s) {
      snapshotTask = {
        month: monthStr,
        label: mLabel,
        status: 'pending',
        title: '📸 ' + mLabel + ' Snapshot Pending',
        desc: 'Save ' + mLabel + '’s final balances & totals to your Google Sheet.'
      };
    } else if (!s.matchesLive) {
      snapshotTask = {
        month: monthStr,
        label: mLabel,
        status: 'out-of-sync',
        title: '⚠️ ' + mLabel + ' Snapshot Out of Sync',
        desc: 'Entries were modified since last snapshot. Update snapshot in Sheet.'
      };
    } else {
      // Snapshot is up to date
      if (snapshotTask && snapshotTask.month === monthStr) {
        snapshotTask = null;
      }
    }

    render();
    updateBadge();
  }

  /** Renders the contents of the notification drawer. */
  function render() {
    const outboxSec = $('notif-section-outbox');
    const outboxCount = $('notif-outbox-count');
    const snapSec = $('notif-section-snapshot');
    const snapTitle = $('notif-snap-title');
    const snapDesc = $('notif-snap-desc');
    const alertsSec = $('notif-section-alerts');
    const alertList = $('notif-alert-list');
    const emptySec = $('notif-empty');

    let hasAny = false;

    // 1. Outbox
    if (outboxSec) {
      if (offlineItems.length > 0) {
        outboxSec.hidden = false;
        hasAny = true;
        if (outboxCount) {
          outboxCount.textContent = offlineItems.length + (offlineItems.length === 1 ? ' entry' : ' entries') + ' waiting';
        }
      } else {
        outboxSec.hidden = true;
      }
    }

    // 2. Snapshot
    if (snapSec) {
      if (snapshotTask) {
        snapSec.hidden = false;
        hasAny = true;
        if (snapTitle) snapTitle.textContent = snapshotTask.title;
        if (snapDesc) snapDesc.textContent = snapshotTask.desc;
      } else {
        snapSec.hidden = true;
      }
    }

    // 3. Alerts
    if (alertsSec && alertList) {
      alertList.innerHTML = '';
      if (alerts.length > 0) {
        alertsSec.hidden = false;
        hasAny = true;
        alerts.forEach(function (a) {
          const item = document.createElement('div');
          item.className = 'notif-alert-item';
          item.style.marginBottom = '8px';

          const title = document.createElement('div');
          title.className = 'notif-item-title';
          title.textContent = a.title;
          item.appendChild(title);

          const desc = document.createElement('p');
          desc.className = 'notif-section-desc';
          desc.textContent = a.desc;
          item.appendChild(desc);

          if (a.actionLabel && a.onAction) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn ghost small';
            btn.style.marginTop = '6px';
            btn.textContent = a.actionLabel;
            btn.addEventListener('click', a.onAction);
            item.appendChild(btn);
          }
          alertList.appendChild(item);
        });
      } else {
        alertsSec.hidden = true;
      }
    }

    // 4. Empty state
    if (emptySec) {
      emptySec.hidden = hasAny;
    }
  }

  function open() {
    wire();
    refreshQueue();
    const overlay = $('notif-drawer-overlay');
    if (overlay) overlay.hidden = false;
  }

  function close() {
    const overlay = $('notif-drawer-overlay');
    if (overlay) overlay.hidden = true;
  }

  function toggle() {
    const overlay = $('notif-drawer-overlay');
    if (overlay && !overlay.hidden) {
      close();
    } else {
      open();
    }
  }

  function wire() {
    if (wired) return;
    wired = true;

    // Bell button
    const bellBtn = $('btn-top-notif');
    if (bellBtn) {
      bellBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle();
      });
    }

    // Net-pill also opens notifications
    const netPill = $('net-pill');
    if (netPill) {
      netPill.addEventListener('click', function (e) {
        e.stopPropagation();
        open();
      });
    }

    // Close button
    const closeBtn = $('notif-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        close();
      });
    }

    // Overlay background click
    const overlay = $('notif-drawer-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
    }

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) {
        close();
      }
    });

    // Send All Now inside Drawer
    const sendAllBtn = $('notif-btn-send-all');
    if (sendAllBtn) {
      sendAllBtn.addEventListener('click', async function () {
        sendAllBtn.disabled = true;
        sendAllBtn.textContent = 'Syncing...';
        if (window.Sync && Sync.sendAll) {
          await Sync.sendAll();
        } else if (window.Sync && Sync.run) {
          await Sync.run();
        }
        sendAllBtn.disabled = false;
        sendAllBtn.textContent = '🚀 Send All Now';
        refreshQueue();
      });
    }

    // View Outbox inside Drawer
    const viewOutboxBtn = $('notif-btn-view-outbox');
    if (viewOutboxBtn) {
      viewOutboxBtn.addEventListener('click', function () {
        close();
        if (window.gotoView) gotoView('add');
        const pBox = $('pending-box');
        if (pBox) pBox.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Go to Snapshot button
    const goSnapBtn = $('notif-btn-go-snap');
    if (goSnapBtn) {
      goSnapBtn.addEventListener('click', function () {
        close();
        if (window.gotoView) gotoView('reports');
        const snapBtn = $('r-snap-btn');
        if (snapBtn) snapBtn.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Global listeners
    window.addEventListener('queue-changed', refreshQueue);
    window.addEventListener('online', refreshQueue);
    window.addEventListener('offline', refreshQueue);
  }

  function init() {
    wire();
    refreshQueue();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  const api = {
    open: open,
    close: close,
    toggle: toggle,
    refreshQueue: refreshQueue,
    checkSnapshotStatus: checkSnapshotStatus
  };

  if (typeof window !== 'undefined') {
    window.NotificationsManager = api;
  }

  return api;
})();
