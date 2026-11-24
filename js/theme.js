/**
 * 3-Way Theme Switcher (System | Light | Dark)
 * Persisted in localStorage and syncs with OS preferences when in 'system' mode.
 */
const ThemeManager = (function () {
  const THEME_KEY = 'ft_theme';
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  function getSaved() {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function apply(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
      root.dataset.theme = 'light';
      if (metaTheme) metaTheme.setAttribute('content', '#0d9488');
    } else if (theme === 'dark') {
      root.dataset.theme = 'dark';
      if (metaTheme) metaTheme.setAttribute('content', '#090e11');
    } else {
      delete root.dataset.theme;
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (metaTheme) metaTheme.setAttribute('content', isDark ? '#090e11' : '#0d9488');
    }

    // Sync all theme buttons in the UI
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  function set(theme) {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') theme = 'system';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) { /* ignore */ }
    apply(theme);
  }

  function init() {
    const current = getSaved();
    apply(current);

    // Watch for OS preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (getSaved() === 'system') apply('system');
    });

    // Wire clicks on theme buttons
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.theme-btn');
      if (btn && btn.dataset.theme) {
        e.preventDefault();
        set(btn.dataset.theme);
      }
    });
  }

  init();

  return {
    get: getSaved,
    set: set
  };
})();
