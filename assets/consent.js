/* Cookie consent and analytics for www.iriscan.com.
   Cloudflare Web Analytics sets no cookies and runs for everyone.
   Google Analytics loads only after the visitor accepts. */
(function () {
  var GA_ID = '';     // Google Analytics 4 measurement ID, e.g. 'G-XXXXXXXXXX'
  var CF_TOKEN = 'f89a9f45080e4acd8270363247924fef';  // Cloudflare Web Analytics site token
  var KEY = 'ck-consent';

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); localStorage.removeItem('ck-ok'); } catch (e) {} }

  function addScript(src, attrs) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    for (var k in attrs) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
  }

  if (CF_TOKEN) {
    addScript('https://static.cloudflareinsights.com/beacon.min.js', { 'defer': '', 'data-cf-beacon': JSON.stringify({ token: CF_TOKEN }) });
  }

  var gaLoaded = false;
  function loadGA() {
    if (!GA_ID || gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    addScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID, {});
  }

  function clearGACookies() {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n.indexOf('_ga') === 0) {
        ['', '; domain=.iriscan.com', '; domain=www.iriscan.com'].forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      }
    });
  }

  var bar = document.getElementById('ckbar');
  function show() { if (bar) bar.hidden = false; }
  function hide() { if (bar) bar.hidden = true; }

  if (bar) {
    var yes = document.getElementById('ckyes'), no = document.getElementById('ckno');
    if (yes) yes.onclick = function () { set('granted'); hide(); loadGA(); };
    if (no) no.onclick = function () {
      set('denied'); hide(); clearGACookies();
      if (gaLoaded) location.reload();
    };
  }

  var choice = get();
  if (choice === 'granted') loadGA();
  else if (choice !== 'denied' && GA_ID) show();

  // "Cookie settings" link in the footer reopens the banner
  var foot = document.querySelector('footer ul');
  if (foot && bar && GA_ID) {
    var li = document.createElement('li'), a = document.createElement('a');
    a.href = '#'; a.textContent = 'Cookie settings';
    a.onclick = function (e) { e.preventDefault(); show(); };
    li.appendChild(a); foot.insertBefore(li, foot.children[2] || null);
  }
})();
