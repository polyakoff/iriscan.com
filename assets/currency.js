/* Prices are written in US dollars. Visitors in the EU see the same amounts in euros. */
(function () {
  var EU = /^(Europe\/(Amsterdam|Athens|Berlin|Bratislava|Brussels|Bucharest|Budapest|Busingen|Copenhagen|Dublin|Helsinki|Lisbon|Ljubljana|Luxembourg|Madrid|Malta|Mariehamn|Nicosia|Paris|Prague|Riga|Rome|Sofia|Stockholm|Tallinn|Vienna|Vilnius|Warsaw|Zagreb)|Asia\/(Nicosia|Famagusta)|Atlantic\/(Canary|Madeira|Azores))$/;
  var tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var cur = EU.test(tz) ? 'EUR' : 'USD';
  try { localStorage.removeItem('cur'); } catch (e) {}
  window.IRISCAN_CUR = cur;
  window.iriscanMoney = function (s) { return cur === 'EUR' ? String(s).replace(/\$(?=\d)/g, '€') : String(s); };

  // Only our prices switch to euros; amounts quoted from reports and articles stay as written.
  var PRICE = '[data-cur], .price-card, .plans, .plans-mini, .kit, .calc, .cta-kit, .price-note';
  function convertAll() {
    if (cur !== 'EUR') return;
    var roots = document.body.hasAttribute('data-cur') ? [document.body] : [].slice.call(document.querySelectorAll(PRICE));
    roots.forEach(convert);
  }
  function convert(root) {
    if (cur !== 'EUR') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        return /\$\d/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) { t.nodeValue = t.nodeValue.replace(/\$(?=\d)/g, '€'); });
    root.querySelectorAll('[aria-label*="$"]').forEach(function (e) {
      e.setAttribute('aria-label', e.getAttribute('aria-label').replace(/\$(?=\d)/g, '€'));
    });
  }

  function init() {
    convertAll();
    document.dispatchEvent(new Event('iriscan:currency'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
