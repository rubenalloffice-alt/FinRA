/**
 * Talks to the Apps Script backend.
 * - Sends text/plain JSON (no CORS preflight).
 * - Retries on network errors and on non-JSON replies (Google sometimes
 *   returns a transient HTML 500). This is safe because adding an entry
 *   uses a client-made entryId, so a repeated add never duplicates.
 */
const Api = (function () {

  /** Error thrown for every failed call. */
  class ApiError extends Error {
    constructor(code, message, details) {
      super(message);
      this.code = code;
      this.details = details || {};
    }
  }

  /** Reads the saved server URL (empty string if none). */
  function getUrl() {
    try { return localStorage.getItem(APP.URL_KEY) || ''; } catch (e) { return ''; }
  }

  /** Saves the server URL on this device. */
  function setUrl(url) {
    try { localStorage.setItem(APP.URL_KEY, url); } catch (e) { /* storage blocked */ }
  }

  /** Forgets the server URL and the session. */
  function clearUrl() {
    try { localStorage.removeItem(APP.URL_KEY); } catch (e) { /* ignore */ }
    setToken('');
  }

  /** Reads the session token (kept only until the tab or app is closed). */
  function getToken() {
    try { return sessionStorage.getItem(APP.TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  /** Saves or clears the session token. */
  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(APP.TOKEN_KEY, token);
      else sessionStorage.removeItem(APP.TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  /** Waits for the given milliseconds. */
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * One HTTP attempt. Returns the parsed JSON, or {_nonjson:true} when the
   * reply is not JSON (for example a Google error page).
   */
  async function postOnce(url, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, APP.TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        redirect: 'follow'
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { return { _nonjson: true }; }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Calls one backend action and returns its data.
   * Throws ApiError (code NETWORK when the server cannot be reached).
   */
  async function call(action, data, options) {
    const url = getUrl();
    if (!url) throw new ApiError('NO_URL', 'Server URL is not set.');
    const useToken = !(options && options.noToken);
    const body = { action: action, token: useToken ? getToken() : '', data: data || {} };

    let resp = null;
    for (let attempt = 1; attempt <= APP.RETRIES; attempt++) {
      try {
        resp = await postOnce(url, body);
        if (resp && !resp._nonjson) break;
      } catch (e) {
        resp = null;
      }
      if (attempt < APP.RETRIES) await sleep(700 * attempt);
    }
    if (!resp || resp._nonjson) {
      throw new ApiError('NETWORK', 'Cannot reach the server. Check your internet and try again.');
    }
    if (resp.ok === true) return resp.data;

    const err = resp.error || {};
    if (err.code === 'UNAUTHORIZED') {
      setToken('');
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    throw new ApiError(err.code || 'INTERNAL', err.message || 'Something went wrong.', err.details);
  }

  return {
    ApiError: ApiError,
    getUrl: getUrl, setUrl: setUrl, clearUrl: clearUrl,
    getToken: getToken, setToken: setToken,
    call: call
  };
})();
