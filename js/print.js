/**
 * Report printing: the "Save as PDF" button on the Reports tab opens the
 * browser's print dialog (choose "Save as PDF" as the printer). The page
 * title is set to "My Finance - Report <month>" while printing, so the
 * saved PDF gets a clear file name. Print layout comes from css/print.css.
 * No data leaves the device.
 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const btn = $('r-print');
  if (!btn) return;

  btn.addEventListener('click', function () {
    const label = $('r-label').textContent;
    const oldTitle = document.title;
    const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    $('r-print-sub').textContent = 'Monthly report: ' + label + '  |  Printed ' + printed;
    document.title = 'FinRA - Report ' + label;

    /** Puts the page title back once printing is over. */
    function restore() {
      document.title = oldTitle;
      window.removeEventListener('afterprint', restore);
    }
    window.addEventListener('afterprint', restore);
    window.print();
  });
})();
