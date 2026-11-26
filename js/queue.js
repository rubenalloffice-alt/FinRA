/**
 * The "waiting to be sent" box: entries saved on this phone because there
 * was no internet (or no login) at the time. Stored in IndexedDB, which
 * survives closing the app and restarting the phone.
 *
 * An item looks like:
 *   { entryId, payload, createdAt, status: 'pending' | 'rejected', error, hold }
 *  - payload: exactly what addEntry needs (it contains the entryId, so a
 *    repeated send can never create a duplicate row on the server)
 *  - rejected: the server refused it (for example the category was turned off)
 *  - hold: added without a PIN login; it is only sent after the owner
 *    reviews it and taps Send
 */
const Queue = (function () {

  const DB_NAME = 'ft_queue';
  const STORE = 'pending';
  let dbPromise = null;

  /** Opens (and on first use creates) the local database. */
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error('This browser cannot store entries on the phone.')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'entryId' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('Cannot open local storage.')); };
      });
      dbPromise.catch(function () { dbPromise = null; });
    }
    return dbPromise;
  }

  /**
   * Runs one request inside a transaction and resolves with its result.
   * @param {'readonly'|'readwrite'} mode
   * @param {function(IDBObjectStore): IDBRequest} fn
   */
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(STORE, mode);
        let req;
        try { req = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Local save was cancelled.')); };
      });
    });
  }

  /** Tells the screens that the list changed. */
  function changed() {
    window.dispatchEvent(new CustomEvent('queue-changed'));
  }

  /**
   * Saves an entry for later sending.
   * @param {Object} payload addEntry data (must contain entryId).
   * @param {{hold?: boolean}=} options hold = added without a PIN login.
   * @returns {Promise<Object>} The stored item.
   */
  async function add(payload, options) {
    const item = {
      entryId: payload.entryId,
      payload: payload,
      createdAt: new Date().toISOString(),
      status: 'pending',
      error: '',
      hold: !!(options && options.hold)
    };
    await run('readwrite', function (s) { return s.put(item); });
    changed();
    return item;
  }

  /** Replaces a stored item (used to mark it rejected or released). */
  async function put(item) {
    await run('readwrite', function (s) { return s.put(item); });
    changed();
  }

  /** Removes one item. */
  async function remove(entryId) {
    await run('readwrite', function (s) { return s.delete(entryId); });
    changed();
  }

  /** All items, oldest first. */
  async function all() {
    const items = await run('readonly', function (s) { return s.getAll(); });
    return (items || []).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }

  /** Gets one item by entryId. */
  async function get(entryId) {
    return await run('readonly', function (s) { return s.get(entryId); });
  }

  /** Updates the payload of an existing queued entry. */
  async function updatePayload(entryId, newPayload) {
    const item = await get(entryId);
    if (!item) return null;
    item.payload = newPayload;
    item.status = 'pending';
    item.error = '';
    await run('readwrite', function (s) { return s.put(item); });
    changed();
    return item;
  }

  /** Releases hold on all items so they can be synced. */
  async function releaseAll() {
    const items = await all();
    for (let i = 0; i < items.length; i++) {
      if (items[i].hold) {
        items[i].hold = false;
        await run('readwrite', function (s) { return s.put(items[i]); });
      }
    }
    changed();
  }

  /** Clears all items from the Queue. */
  async function removeAll() {
    await run('readwrite', function (s) { return s.clear(); });
    changed();
  }

  const api = {
    add: add,
    put: put,
    remove: remove,
    all: all,
    get: get,
    updatePayload: updatePayload,
    releaseAll: releaseAll,
    removeAll: removeAll
  };
  if (typeof window !== 'undefined') window.Queue = api;
  return api;
})();