/**
 * App shell: decides which screen to show (setup, PIN, or main app),
 * handles PIN login, tab switching and the online/offline pill.
 */
(function () {

  const $ = function (id) { return document.getElementById(id); };
  const TITLES = { dashboard: 'Dashboard', add: 'Add', entries: 'Entries', reports: 'Reports', settings: 'Settings' };
  let guest = false;   // true while the app is open without a PIN login (offline entry only)

  /** Shows exactly one of the three top-level screens. */
  function showScreen(name) {
    $('screen-setup').hidden = name !== 'setup';
    $('screen-login').hidden = name !== 'login';
    const recScreen = $('screen-recovery');
    if (recScreen) recScreen.hidden = name !== 'recovery';
    $('shell').hidden = name !== 'shell';
  }

  /** Switches the visible tab in the main app. */
  function showView(view) {
    if (guest && view !== 'add') {
      Ui.toast('This needs internet and your PIN.');
      return;
    }
    Object.keys(TITLES).forEach(function (v) {
      $('view-' + v).hidden = v !== view;
    });
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    $('view-title').textContent = TITLES[view];
    if (view === 'dashboard') DashboardView.show();
    if (view === 'settings') Settings.show();
    if (view === 'entries') Entries.show();
    if (view === 'reports') ReportsView.show();
  }

  /** Opens the main app and loads what the Add form needs. */
  function enterApp() {
    showScreen('shell');
    showView('dashboard');
    DashboardView.load();
    EntryForm.load();
    PendingView.refresh();
    Sync.run();
  }

  /** Opens the app without a PIN, only for noting entries while offline. */
  function enterGuest() {
    guest = true;
    showScreen('shell');
    showView('add');
    EntryForm.load();
    PendingView.refresh();
  }

  /** Leaves guest mode and asks for the PIN. */
  function leaveGuest(message) {
    guest = false;
    wipeScreens();
    $('login-msg').textContent = message || '';
    showScreen('login');
  }

  /** Clears everything that was loaded from the server. */
  function wipeScreens() {
    DashboardView.clear();
    EntryForm.clear();
    Entries.clear();
    ReportsView.clear();
    Settings.clear();
  }

  /** Sets the Online/Offline pill. */
  function updateNetPill() {
    const pill = $('net-pill');
    const online = navigator.onLine;
    pill.textContent = online ? 'Online' : 'Offline';
    pill.className = 'pill ' + (online ? 'ok' : 'off');
    $('guest-box').hidden = online || !Api.getUrl();
  }

  /** The internet came back: a guest must unlock so waiting entries can be reviewed and sent. */
  function onOnline() {
    updateNetPill();
    if (guest) leaveGuest('Back online. Unlock to review and send the entries you noted offline.');
  }

  /** Setup form: check the URL looks right, ping it, then save it. */
  async function onSetupSubmit(ev) {
    ev.preventDefault();
    const msg = $('setup-msg');
    const url = $('input-url').value.trim();
    msg.className = 'msg';
    if (url.indexOf(APP.URL_PREFIX) !== 0 || url.slice(-5) !== '/exec') {
      msg.textContent = 'That does not look like your server URL. It should start with ' +
        APP.URL_PREFIX + ' and end with /exec';
      return;
    }
    msg.textContent = 'Checking...';
    Api.setUrl(url);
    try {
      await Api.call('ping', {}, { noToken: true });
      $('input-url').value = '';
      msg.textContent = '';
      showScreen('login');
      $('input-pin').focus();
    } catch (e) {
      Api.clearUrl();
      msg.textContent = e.message;
    }
  }

  /** PIN form: log in and open the main app. */
  async function onLoginSubmit(ev) {
    ev.preventDefault();
    const msg = $('login-msg');
    const btn = $('btn-login');
    msg.className = 'msg';
    msg.textContent = '';
    btn.disabled = true;
    try {
      const res = await Api.call('login', { pin: $('input-pin').value }, { noToken: true });
      Api.setToken(res.token);
      $('input-pin').value = '';
      guest = false;
      enterApp();
    } catch (e) {
      if (e.code === 'BAD_PIN' && e.details.attemptsLeft !== undefined) {
        msg.textContent = 'Wrong PIN. Attempts left: ' + e.details.attemptsLeft;
      } else if (e.code === 'LOCKED') {
        const min = Math.ceil((e.details.retryAfterSec || 900) / 60);
        msg.textContent = 'Too many wrong attempts. Try again in about ' + min + ' minutes.';
      } else {
        msg.textContent = e.message;
      }
    } finally {
      btn.disabled = false;
    }
  }

  /** Ends the session on the server and shows the PIN screen. */
  async function lockNow() {
    try { await Api.call('logout'); } catch (e) { /* the token is dropped below anyway */ }
    Api.setToken('');
    guest = false;
    wipeScreens();
    showScreen('login');
  }

  /** Decides the first screen when the app opens. */
  async function start() {
    updateNetPill();
    if (!Api.getUrl()) { showScreen('setup'); return; }
    if (!Api.getToken()) { showScreen('login'); return; }
    if (!navigator.onLine) { enterApp(); return; }   // offline: stay in, entries wait on the phone
    try {
      await Api.call('whoami');
      enterApp();
    } catch (e) {
      if (e.code === 'NETWORK') enterApp();           // server not reachable: same as offline
      else showScreen('login');
    }
  }

  /* ---------- PIN Recovery Controller ---------- */
  let recTimerInt = null;
  let recResendInt = null;

  function clearRecoveryTimers() {
    if (recTimerInt) { clearInterval(recTimerInt); recTimerInt = null; }
    if (recResendInt) { clearInterval(recResendInt); recResendInt = null; }
  }

  function openRecovery() {
    clearRecoveryTimers();
    $('rec-msg').textContent = '';
    $('rec-otp-step1').hidden = false;
    $('form-rec-otp').hidden = true;
    $('form-rec-key').reset();
    $('form-rec-otp').reset();
    switchRecoveryTab('email');
    showScreen('recovery');
  }

  function closeRecovery() {
    clearRecoveryTimers();
    showScreen('login');
  }

  function switchRecoveryTab(mode) {
    const isEmail = mode === 'email';
    $('tab-rec-email').classList.toggle('active', isEmail);
    $('tab-rec-key').classList.toggle('active', !isEmail);
    $('tab-rec-email').setAttribute('aria-selected', isEmail ? 'true' : 'false');
    $('tab-rec-key').setAttribute('aria-selected', !isEmail ? 'true' : 'false');
    $('rec-pane-email').hidden = !isEmail;
    $('rec-pane-key').hidden = isEmail;
    $('rec-msg').textContent = '';
  }

  function startOtpCountdown(totalSec) {
    clearRecoveryTimers();
    let secLeft = totalSec;
    const disp = $('rec-timer-display');
    const badge = disp.closest('.rec-timer-badge');
    if (badge) badge.classList.remove('urgent');

    const updateDisp = function () {
      const m = Math.floor(secLeft / 60);
      const s = secLeft % 60;
      disp.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      if (secLeft <= 60 && badge) badge.classList.add('urgent');
    };
    updateDisp();

    recTimerInt = setInterval(function () {
      secLeft--;
      if (secLeft <= 0) {
        clearInterval(recTimerInt);
        recTimerInt = null;
        disp.textContent = 'Expired';
        $('rec-msg').textContent = 'Verification code has expired. Please request a new code.';
      } else {
        updateDisp();
      }
    }, 1000);
  }

  function startResendCooldown(cooldownSec) {
    const btn = $('btn-resend-otp');
    const count = $('rec-resend-count');
    btn.disabled = true;
    let sec = cooldownSec;
    count.textContent = '(' + sec + 's)';

    recResendInt = setInterval(function () {
      sec--;
      if (sec <= 0) {
        clearInterval(recResendInt);
        recResendInt = null;
        btn.disabled = false;
        count.textContent = '';
      } else {
        count.textContent = '(' + sec + 's)';
      }
    }, 1000);
  }

  async function onRequestOtp() {
    const msg = $('rec-msg');
    const btn = $('btn-send-otp');
    msg.className = 'msg';
    msg.textContent = '';
    btn.disabled = true;
    try {
      const res = await Api.call('requestPinReset', {}, { noToken: true });
      $('rec-otp-step1').hidden = true;
      $('form-rec-otp').hidden = false;
      startOtpCountdown(res.expiresInSec || 300);
      startResendCooldown(res.cooldownSec || 60);
      $('input-rec-otp').focus();
    } catch (e) {
      if (e.code === 'OTP_RATE_LIMITED' && e.details && e.details.retryAfterSec) {
        msg.textContent = 'Please wait ' + e.details.retryAfterSec + ' seconds before requesting again.';
      } else {
        msg.textContent = e.message;
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function onResendOtp() {
    const msg = $('rec-msg');
    msg.className = 'msg';
    msg.textContent = '';
    try {
      const res = await Api.call('requestPinReset', {}, { noToken: true });
      startOtpCountdown(res.expiresInSec || 300);
      startResendCooldown(res.cooldownSec || 60);
      Ui.toast('New verification code sent to your email.');
    } catch (e) {
      msg.textContent = e.message;
    }
  }

  async function onSubmitOtpReset(ev) {
    ev.preventDefault();
    const msg = $('rec-msg');
    const btn = $('btn-rec-otp-submit');
    const otp = $('input-rec-otp').value.trim();
    const pin = $('input-rec-newpin').value;
    const pin2 = $('input-rec-confirm').value;

    msg.className = 'msg';
    msg.textContent = '';

    if (pin !== pin2) {
      msg.textContent = 'New PIN and confirm PIN do not match.';
      return;
    }
    if (pin.length < 8) {
      msg.textContent = 'PIN must be at least 8 characters long.';
      return;
    }

    btn.disabled = true;
    try {
      const res = await Api.call('verifyPinReset', { otp: otp, newPin: pin }, { noToken: true });
      Api.setToken(res.token);
      clearRecoveryTimers();
      guest = false;
      enterApp();
      Ui.toast('PIN successfully updated! Logged in.');
    } catch (e) {
      if (e.code === 'BAD_OTP' && e.details && e.details.attemptsLeft !== undefined) {
        msg.textContent = 'Wrong code. Attempts left: ' + e.details.attemptsLeft;
      } else {
        msg.textContent = e.message;
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function onSubmitKeyReset(ev) {
    ev.preventDefault();
    const msg = $('rec-msg');
    const btn = $('btn-rec-key-submit');
    const key = $('input-rec-key').value.trim();
    const pin = $('input-rec-key-newpin').value;
    const pin2 = $('input-rec-key-confirm').value;

    msg.className = 'msg';
    msg.textContent = '';

    if (pin !== pin2) {
      msg.textContent = 'New PIN and confirm PIN do not match.';
      return;
    }
    if (pin.length < 8) {
      msg.textContent = 'PIN must be at least 8 characters long.';
      return;
    }

    btn.disabled = true;
    try {
      const res = await Api.call('verifyMasterKeyReset', { masterKey: key, newPin: pin }, { noToken: true });
      Api.setToken(res.token);
      clearRecoveryTimers();
      guest = false;
      enterApp();
      Ui.toast('PIN reset with Master Key! Logged in.');
    } catch (e) {
      if (e.code === 'BAD_RECOVERY_KEY' && e.details && e.details.attemptsLeft !== undefined) {
        msg.textContent = 'Wrong Master Key. Attempts left: ' + e.details.attemptsLeft;
      } else {
        msg.textContent = e.message;
      }
    } finally {
      btn.disabled = false;
    }
  }

  /** Wires all buttons and events once. */
  function init() {
    DashboardView.init();
    EntryForm.init();
    PendingView.init();
    Sync.start();
    $('btn-guest').addEventListener('click', enterGuest);
    $('form-setup').addEventListener('submit', onSetupSubmit);
    $('form-login').addEventListener('submit', onLoginSubmit);
    $('btn-lock').addEventListener('click', lockNow);
    const topLock = $('btn-top-lock');
    if (topLock) topLock.addEventListener('click', lockNow);
    const sideLock = $('btn-sidebar-lock');
    if (sideLock) sideLock.addEventListener('click', lockNow);

    // PIN Recovery Wiring
    const btnForgot = $('btn-to-recovery');
    if (btnForgot) btnForgot.addEventListener('click', openRecovery);
    const btnBackLogin = $('btn-rec-back-login');
    if (btnBackLogin) btnBackLogin.addEventListener('click', closeRecovery);
    $('tab-rec-email').addEventListener('click', function () { switchRecoveryTab('email'); });
    $('tab-rec-key').addEventListener('click', function () { switchRecoveryTab('key'); });
    $('btn-send-otp').addEventListener('click', onRequestOtp);
    $('btn-resend-otp').addEventListener('click', onResendOtp);
    $('form-rec-otp').addEventListener('submit', onSubmitOtpReset);
    $('form-rec-key').addEventListener('submit', onSubmitKeyReset);

    // Show/hide PIN toggles on recovery inputs
    const wireShowToggle = function (btnId, inputId) {
      const b = $(btnId);
      const inp = $(inputId);
      if (b && inp) {
        b.addEventListener('click', function () {
          const isPass = inp.type === 'password';
          inp.type = isPass ? 'text' : 'password';
          b.textContent = isPass ? 'Hide' : 'Show';
        });
      }
    };
    wireShowToggle('btn-show-rec-newpin', 'input-rec-newpin');
    wireShowToggle('btn-show-rec-keypin', 'input-rec-key-newpin');

    $('btn-change-url').addEventListener('click', function () {
      Api.clearUrl();
      wipeScreens();
      showScreen('setup');
    });
    $('btn-showpin').addEventListener('click', function () {
      const input = $('input-pin');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
    });
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });
    window.addEventListener('goto-view', function (ev) { showView(ev.detail); });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', updateNetPill);
    window.addEventListener('session-expired', function () {
      $('login-msg').textContent = 'Session ended. Please unlock again.';
      guest = false;
      wipeScreens();
      showScreen('login');
    });
    start();
  }

  init();
})();