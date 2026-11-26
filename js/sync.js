/**
 * Sends the entries waiting in the Queue to the server, oldest first.
 * Safe to run any number of times: addEntry uses the entry's own id, so
 * an entry that already reached the server comes back as "duplicate"
 * and is simply removed from the waiting box.
 *
 * Runs when: the internet comes back, the app opens, the user unlocks,
 * the app is shown again, and every 30 seconds while something waits.
 */
const Sync = (function () {

  const REJECT_CODES = ['VALIDATION', 'BAD_REQUEST', 'NOT_FOUND'];
  let running = false;
  let started = false;

  /**
   * Tries to send everything that can be sent right now.
   * @returns {Promise<number>} How many entries were sent.
   */
  async function run() {
    if (running || !navigator.onLine || !Api.getToken()) return 0;
    running = true;
    let sent = 0;
    try {
      const items = (await Queue.all()).filter(function (i) { return i.status === 'pending' && !i.hold; });
      for (let k = 0; k < items.length; k++) {
        const item = items[k];
        try {
          await Api.call('addEntry', item.payload);
          await Queue.remove(item.entryId);
          sent++;
        } catch (e) {
          if (REJECT_CODES.indexOf(e.code) !== -1) {
            item.status = 'rejected';
            item.error = e.message;
            await Queue.put(item);
            continue;
          }
          break; // no connection, busy server or expired login: keep the rest and retry later
        }
      }
    } catch (e) {
      /* the local box could not be read; nothing to do now */
    } finally {
      running = false;
    }
    if (sent > 0) Ui.toast(sent === 1 ? '1 waiting entry sent \u2713' : sent + ' waiting entries sent \u2713');
    return sent;
  }

  /** Starts the automatic triggers (once). */
  function start() {
    if (started) return;
    started = true;
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) run(); });
    setInterval(run, 30000);
  }

  return { run: run, start: start };
})();