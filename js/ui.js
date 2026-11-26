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
   * Shows a sleek top-floating message.
   * @param {string} text Message.
   * @param {{label: string, run: Function}=} action Optional button (for example Undo).
   * @param {'success'|'error'|'warn'|'info'=} type Toast variant.
   */
  function toast(text, action, type) {
    const toastEl = $('toast');
    const iconEl = $('toast-icon');
    const btn = $('toast-action');
    
    // Remove existing variant classes
    toastEl.classList.remove('toast-error', 'toast-warn');
    
    const isError = type === 'error' || /failed|error|wrong|mistake/i.test(text);
    const isWarn = type === 'warn' || /warning|lock|offline/i.test(text);
    
    if (iconEl) {
      if (isError) {
        toastEl.classList.add('toast-error');
        iconEl.textContent = '✕';
      } else if (isWarn) {
        toastEl.classList.add('toast-warn');
        iconEl.textContent = '!';
      } else {
        iconEl.textContent = '✓';
      }
    }

    // Clean up duplicate checkmark character if passed in text
    const cleanText = text.replace(/[\u2713\u2714]\s*/g, '').trim();
    $('toast-text').textContent = cleanText;

    if (action && action.label && typeof action.run === 'function') {
      btn.textContent = action.label;
      btn.hidden = false;
      btn.onclick = function () { hide(); action.run(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }

    toastEl.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(hide, action ? 7000 : 3200);
  }

  return { money: money, toast: toast, hide: hide };
})();