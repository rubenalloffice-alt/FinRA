/**
 * Registers the service worker so the app can open offline and be
 * installed to the home screen. Silent when the browser does not
 * support it (the app works the same, just online only).
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works online */ });
  });
})();