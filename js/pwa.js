/**
 * PWA Service Worker Registration & One-Click Install Prompt Controller
 */
const PwaManager = (function () {
  let deferredPrompt = null;

  function updateInstallButtons() {
    const btns = document.querySelectorAll('.btn-pwa-install');
    btns.forEach(function (btn) {
      btn.hidden = !deferredPrompt;
    });
  }

  async function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      if (window.Ui && Ui.toast) Ui.toast('Installing FinRA...');
    }
    deferredPrompt = null;
    updateInstallButtons();
  }

  function init() {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (secure) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js').catch(function () { /* safe fallback */ });
        });
      }
    }

    // Capture Install Prompt
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      updateInstallButtons();
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      updateInstallButtons();
      if (window.Ui && Ui.toast) Ui.toast('FinRA is installed! 🎉');
    });

    // Wire any element with .btn-pwa-install
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.btn-pwa-install');
      if (btn) {
        e.preventDefault();
        triggerInstall();
      }
    });
  }

  init();

  return {
    triggerInstall: triggerInstall,
    isInstallable: function () { return !!deferredPrompt; }
  };
})();
