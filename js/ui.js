/**
 * Small shared helpers used by several screens:
 * money formatting and the toast message (with an optional action button).
 */
const Ui = (function () {

  const $ = function (id) { return document.getElementById(id); };
  let timer = null;

  /** Formats a number with 2 decimals and thousand separators. */
  function money(n) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  /** Hides the toast. */
  function hide() {
    $('toast').classList.remove('show');
  }

  /**
   * Shows a short message at the bottom of the screen.
   * @param {string} text Message.
   * @param {{label: string, run: Function}=} action Optional button (for example Undo).
   */
  function toast(text, action) {
    const btn = $('toast-action');
    $('toast-text').textContent = text;
    if (action && action.label && typeof action.run === 'function') {
      btn.textContent = action.label;
      btn.hidden = false;
      btn.onclick = function () { hide(); action.run(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    $('toast').classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(hide, action ? 7000 : 3000);
  }

  return { money: money, toast: toast, hide: hide };
})();