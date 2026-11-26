/**
 * The "Waiting to be sent" card on the Add tab, plus the "N waiting"
 * note on the Online/Offline pill. Shows every entry in the Queue and
 * lets the owner send, fix or discard them.
 * All text is placed with textContent (no HTML injection).
 */
const PendingView = (function () {

  const $ = function (id) { return document.getElementById(id); };
  let wired = false;
  let seq = 0;

  /** Makes an element with optional class and text. */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** Makes a small button. */
  function button(text, cls, onClick) {
    const b = el('button', 'btn small ' + cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /** One-line summary of an entry: "Expense · 12.34 BDT · 2026-11-21 · Food". */
  function summary(p) {
    const what = p.category || p.institution || '';
    return p.type + ' · ' + Ui.money(p.amount) + ' ' + p.currency + ' · ' + p.date + (what ? ' · ' + what : '');
  }

  /** Builds the card row for one waiting entry. */
  function row(item, loggedIn) {
    const p = item.payload;
    const r = el('div', 'pending-row');
    const main = el('div', 'pending-main');
    if (!loggedIn) {
      // Without a PIN login nothing about the entries is shown, only that one is waiting.
      main.appendChild(el('div', 'pending-title', 'An entry is waiting'));
      main.appendChild(el('div', 'pending-state', 'Unlock with your PIN to see and send it.'));
      r.appendChild(main);
      return r;
    }
    main.appendChild(el('div', 'pending-title', summary(p)));
    if (p.details) main.appendChild(el('div', 'pending-sub', p.details));
    if (item.status === 'rejected') {
      main.appendChild(el('div', 'pending-state bad', 'Not accepted: ' + item.error));
    } else if (item.hold) {
      main.appendChild(el('div', 'pending-state warn', 'Added without the PIN. Check it, then tap Send.'));
    } else {
      main.appendChild(el('div', 'pending-state', navigator.onLine ? 'Sending soon...' : 'Waiting for internet'));
    }
    r.appendChild(main);

    const actions = el('div', 'pending-actions');
    if (item.status === 'rejected') {
      actions.appendChild(button('Fix', 'ghost', function () { fix(item); }));
    } else {
      actions.appendChild(button('✏️ Edit', 'ghost', function () { edit(item); }));
      actions.appendChild(button('🚀 Send', 'ghost', function () { sendOne(item); }));
    }
    actions.appendChild(button('🗑️ Discard', 'ghost danger-text', function () { discard(item); }));
    r.appendChild(actions);
    return r;
  }

  /** Opens an offline entry in the Form for editing. */
  function edit(item) {
    if (window.EntryForm && EntryForm.startEditOffline) {
      EntryForm.startEditOffline(item);
    }
  }

  /** Sends a single waiting entry immediately. */
  async function sendOne(item) {
    item.hold = false;
    await Queue.put(item);
    Sync.run();
  }

  /** Opens a rejected entry in the Add form so it can be corrected. */
  async function fix(item) {
    await Queue.remove(item.entryId);
    EntryForm.loadDraft(item.payload);
  }

  /** Releases a held entry so it can be sent, then sends it. */
  async function release(item) {
    item.hold = false;
    await Queue.put(item);
    Sync.run();
  }

  /** Throws an entry away after a confirmation. */
  async function discard(item) {
    if (!window.confirm('Discard this waiting entry? It will not be saved anywhere.')) return;
    await Queue.remove(item.entryId);
  }

  /** Discards all waiting entries at once. */
  async function discardAll() {
    if (!window.confirm('Discard all waiting entries? None of them will be saved.')) return;
    if (Queue.removeAll) {
      await Queue.removeAll();
      Ui.toast('All waiting entries discarded');
    }
  }

  /** Redraws the card from the Queue. */
  async function refresh() {
    const mine = ++seq;
    let items = [];
    try { items = await Queue.all(); } catch (e) { items = []; }
    if (mine !== seq) return;
    const box = $('pending-box');
    const list = $('pending-list');
    list.textContent = '';
    if (!items.length) {
      box.hidden = true;
      return;
    }
    const loggedIn = !!Api.getToken();
    box.hidden = false;
    $('pending-title').textContent = 'Waiting to be sent (' + items.length + ')';
    const subSummary = $('pending-sub-summary');
    if (subSummary) {
      let totalBdt = 0;
      items.forEach(function (i) {
        const amt = Number(i.payload.amount) || 0;
        const rate = Number(i.payload.rate) || 1;
        totalBdt += (i.payload.currency === 'BDT' ? amt : amt * rate);
      });
      subSummary.textContent = items.length + (items.length === 1 ? ' entry' : ' entries') +
        ' waiting \u00B7 Total ~ \u09F3 ' + Ui.money(totalBdt);
    }
    items.forEach(function (i) { list.appendChild(row(i, loggedIn)); });
    $('btn-send-now').hidden = !(navigator.onLine && loggedIn);
    const discardAllBtn = $('btn-discard-all');
    if (discardAllBtn) discardAllBtn.hidden = !loggedIn;
  }

  /** Connects the card once. */
  function wire() {
    if (wired) return;
    wired = true;
    window.addEventListener('queue-changed', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    $('btn-send-now').addEventListener('click', function () {
      if (Sync.sendAll) Sync.sendAll();
      else Sync.run();
    });
    const discardAllBtn = $('btn-discard-all');
    if (discardAllBtn) {
      discardAllBtn.addEventListener('click', discardAll);
    }
  }

  /** Starts the view (call once when the page loads). */
  function init() {
    wire();
    refresh();
  }

  const api = { init: init, refresh: refresh };
  if (typeof window !== 'undefined') window.PendingView = api;
  return api;
})();