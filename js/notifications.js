/**
 * FinRA Notification Center & Smart Task Manager
 * Manages the topbar Bell notification drawer, unread badge counter,
 * offline outbox 1-click sync & preview, and month-end snapshot to-do reminders.
 */
const NotificationsManager = (function () {
  const $ = function (id) { return document.getElementById(id); };

  let wired = false;
  let offlineItems = [];
  let snapshotTask = null; // { month, label, status: 'pending'|'out-of-sync', title, desc }
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

  /** Switches to a view cleanly via the app shell's goto-view event and scrolls to target. */
  function navigateTo(viewName, scrollTargetId, highlightBox) {
    close();
    window.dispatchEvent(new CustomEvent('goto-view', { detail: viewName }));
    if (scrollTargetId) {
      setTimeout(function () {
        const el = $(scrollTargetId);
        if (el && !el.hidden) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (highlightBox) {
            el.classList.remove('pulse-highlight');
            void el.offsetWidth;
            el.classList.add('pulse-highlight');
          }
        }
      }, 120);
    }
  }

  /** Calculates total unread actionable items. */
  function getUnreadCount() {
    let count = 0;
    if (offlineItems.length > 0) count += offlineItems.length;
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

  /** Refreshes offline queue items directly from Queue. */
  async function refreshQueue() {
    try {
      offlineItems = (typeof Queue !== 'undefined' && Queue.all) ? await Queue.all() : [];
    } catch (e) {
      offlineItems = [];
    }
    checkSmartAlerts();
    render();
    updateBadge();
  }

  /** Checks for foreign currency rate issues and monthly rollover notice. */
  function checkSmartAlerts() {
    alerts = [];
    const missingRates = offlineItems.filter(function (i) {
      const p = i.payload || {};
      return p.currency && p.currency !== 'BDT' && (!p.rate || p.rate === 1);
    });
    if (missingRates.length > 0) {
      alerts.push({
        id: 'rate-warning',
        title: '⚠️ Exchange Rate Check',
        desc: missingRates.length + ' offline entry has conversion rate = 1. Click to edit & verify.',
        actionLabel: 'Review Offline Entries →',
        onAction: function () { navigateTo('add', 'pending-box', true); }
      });
    }

    // Monthly rollover notice on days 1 to 3
    const today = new Date();
    if (today.getDate() <= 3) {
      const pName = formatMonthName(prevMonthStr());
      alerts.push({
        id: 'monthly-close',
        title: '🎉 New Month Started',
        desc: pName + ' has ended. Review your monthly savings and report.',
        actionLabel: 'View Reports →',
        onAction: function () { navigateTo('reports'); }
      });
    }
  }

  /**
   * ReportsView or DashboardView calls this when report data is loaded.
   * Snapshot reminder triggers specifically on the month-end date (last day of the month),
   * or during the first 7 days of a new month if the previous month has no saved snapshot.
   */
  function checkSnapshotStatus(monthStr, report) {
    if (!report) return;
    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isMonthEndDate = today.getDate() === lastDayOfMonth;

    const nowMonth = currentMonthStr();
    const prevMonth = prevMonthStr();

    const isTargetCurrent = (monthStr === nowMonth && isMonthEndDate);
    const isTargetPrev = (monthStr === prevMonth && today.getDate() <= 7);

    if (!isTargetCurrent && !isTargetPrev) {
      if (snapshotTask && snapshotTask.month === monthStr) {
        snapshotTask = null;
        render();
        updateBadge();
      }
      return;
    }

    const s = report.snapshot;
    const mLabel = formatMonthName(monthStr);

    if (!s) {
      snapshotTask = {
        month: monthStr,
        label: mLabel,
        status: 'pending',
        title: '📸 ' + mLabel + ' Snapshot Due' + (isMonthEndDate ? ' Today (Month End)' : ''),
        desc: 'Save ' + mLabel + '’s final balances & totals to your Google Sheet.'
      };
    } else if (!s.matchesLive) {
      snapshotTask = {
        month: monthStr,
        label: mLabel,
        status: 'out-of-sync',
        title: '⚠️ ' + mLabel + ' Snapshot Out of Sync',
        desc: 'Entries were modified since last snapshot. Tap to update snapshot in Sheet.'
      };
    } else {
      if (snapshotTask && snapshotTask.month === monthStr) {
        snapshotTask = null;
      }
    }

    render();
    updateBadge();
  }

  /** Formats a one-line summary for an offline entry preview row. */
  function formatEntrySummary(p) {
    const amt = typeof Ui !== 'undefined' && Ui.money ? Ui.money(p.amount) : p.amount;
    const what = p.category || p.institution || '';
    return p.type + ' · ' + amt + ' ' + p.currency + (what ? ' · ' + what : '');
  }

  /** Renders the contents of the notification drawer. */
  function render() {
    const outboxSec = $('notif-section-outbox');
    const outboxCount = $('notif-outbox-count');
    const outboxSummary = $('notif-outbox-summary');
    const outboxList = $('notif-outbox-list');
    const sendAllBtn = $('notif-btn-send-all');

    const snapSec = $('notif-section-snapshot');
    const snapTitle = $('notif-snap-title');
    const snapDesc = $('notif-snap-desc');
    const alertsSec = $('notif-section-alerts');
    const alertList = $('notif-alert-list');
    const emptySec = $('notif-empty');

    let hasAny = false;
    const loggedIn = (typeof Api !== 'undefined' && Api.getToken) ? !!Api.getToken() : false;

    // 1. Outbox
    if (outboxSec) {
      if (offlineItems.length > 0) {
        outboxSec.hidden = false;
        hasAny = true;

        if (outboxCount) {
          outboxCount.textContent = offlineItems.length + (offlineItems.length === 1 ? ' entry' : ' entries') + ' waiting';
        }

        if (outboxSummary) {
          if (loggedIn) {
            let totalBdt = 0;
            offlineItems.forEach(function (i) {
              const amt = Number(i.payload.amount) || 0;
              const rate = Number(i.payload.rate) || 1;
              totalBdt += (i.payload.currency === 'BDT' ? amt : amt * rate);
            });
            const formatted = typeof Ui !== 'undefined' && Ui.money ? Ui.money(totalBdt) : String(totalBdt);
            outboxSummary.textContent = '📥 ' + offlineItems.length + ' Offline ' +
              (offlineItems.length === 1 ? 'Entry' : 'Entries') + ' (~ \u09F3 ' + formatted + ')';
          } else {
            outboxSummary.textContent = '🔒 ' + offlineItems.length + ' Offline ' +
              (offlineItems.length === 1 ? 'Entry' : 'Entries') + ' (Unlock PIN to manage)';
          }
        }

        if (outboxList) {
          outboxList.innerHTML = '';
          if (loggedIn) {
            offlineItems.forEach(function (item) {
              const p = item.payload || {};
              const row = document.createElement('div');
              row.className = 'notif-outbox-row';
              row.title = 'Click to edit or manage this offline entry';

              const info = document.createElement('div');
              info.className = 'notif-outbox-row-info';

              const t = document.createElement('div');
              t.className = 'notif-outbox-row-title';
              t.textContent = formatEntrySummary(p);
              info.appendChild(t);

              const sub = document.createElement('div');
              sub.className = 'notif-outbox-row-sub';
              const statusTxt = item.status === 'rejected'
                ? 'Rejected: ' + (item.error || 'Check details')
                : (item.hold ? 'Draft (Hold) · Tap to edit' : (navigator.onLine ? 'Ready to send' : 'Waiting for internet'));
              sub.textContent = (p.date || '') + ' · ' + statusTxt;
              info.appendChild(sub);

              row.appendChild(info);

              const tag = document.createElement('span');
              tag.className = 'btn ghost small';
              tag.style.padding = '3px 8px';
              tag.style.fontSize = '0.75rem';
              tag.textContent = '✏️ Edit';
              row.appendChild(tag);

              row.addEventListener('click', function (e) {
                e.stopPropagation();
                close();
                if (typeof EntryForm !== 'undefined' && EntryForm.startEditOffline) {
                  EntryForm.startEditOffline(item);
                } else {
                  navigateTo('add', 'pending-box', true);
                }
              });

              outboxList.appendChild(row);
            });
          }
        }

        if (sendAllBtn) {
          sendAllBtn.hidden = !(navigator.onLine && loggedIn);
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
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              a.onAction();
            });
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

    // Net-pill icon also opens notifications
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

    // Clicking anywhere on the Offline Outbox notification section opens the Offline page
    const outboxSec = $('notif-section-outbox');
    if (outboxSec) {
      outboxSec.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        navigateTo('add', 'pending-box', true);
      });
    }

    // Send All Now inside Drawer
    const sendAllBtn = $('notif-btn-send-all');
    if (sendAllBtn) {
      sendAllBtn.addEventListener('click', async function (e) {
        e.stopPropagation();
        sendAllBtn.disabled = true;
        sendAllBtn.textContent = 'Syncing...';
        try {
          if (typeof Sync !== 'undefined' && Sync.sendAll) {
            await Sync.sendAll();
          } else if (typeof Sync !== 'undefined' && Sync.run) {
            await Sync.run({ releaseHold: true });
          }
        } finally {
          sendAllBtn.disabled = false;
          sendAllBtn.textContent = '🚀 Send All Now';
          refreshQueue();
        }
      });
    }

    // Open Offline Page button inside Drawer
    const viewOutboxBtn = $('notif-btn-view-outbox');
    if (viewOutboxBtn) {
      viewOutboxBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        navigateTo('add', 'pending-box', true);
      });
    }

    // Clicking Snapshot notification section or button goes to Reports -> Snapshot
    const snapSec = $('notif-section-snapshot');
    if (snapSec) {
      snapSec.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        navigateTo('reports', 'r-snap-btn', false);
      });
    }
    const goSnapBtn = $('notif-btn-go-snap');
    if (goSnapBtn) {
      goSnapBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        navigateTo('reports', 'r-snap-btn', false);
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
    init: init,
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
