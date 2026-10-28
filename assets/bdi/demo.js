/* Iriscan BDI — in-browser conversion demo.
 * WebAssembly build of NIST NBIS (WSQ, MINDTCT) + NIST BiomDI (FMR),
 * following biometric-technologies/biometric-converter. Nothing is uploaded. */
(function () {
  'use strict';
  var root = document.getElementById('bdi');
  if (!root) return;
  var $ = function (s) { return root.querySelector(s); };
  var BASE = '/assets/bdi/';
  var M = null, loading = null;

  var state = {
    img: null,   // {raw:Uint8Array, w, h, ppi, name, srcFmt, srcBytes}
    tpl: null,   // {bytes:Uint8Array, info, name}
    overlay: true
  };

  /* ---------- wasm ---------- */
  function loadModule() {
    if (M) return Promise.resolve(M);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      function init() {
        window.BiometricConverter({ locateFile: function (p) { return BASE + p; },
          print: function () {}, printErr: function (t) { console.debug('[bdi]', t); } })
          .then(function (m) { M = m; loading = null; res(m); }, rej);
      }
      if (window.BiometricConverter) return init();
      var s = document.createElement('script');
      s.src = BASE + 'bc.js'; s.onload = init;
      s.onerror = function () { rej(new Error('Could not load the converter.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function put(bytes) { var p = M._bc_malloc(bytes.length || 1); M.HEAPU8.set(bytes, p); return p; }
  function ptrs(n) { var a = []; for (var i = 0; i < n; i++) a.push(M._bc_malloc(4)); return a; }
  function i32(p) { return M.getValue(p, 'i32'); }
  function take(p, len) { var out = M.HEAPU8.slice(p, p + len); M._bc_free(p); return out; }
  function freeAll(list) { list.forEach(function (p) { if (p) M._bc_free(p); }); }
  function cerr(code) { return new Error(M.UTF8ToString(M._bc_last_error()) || ('error ' + code)); }
  function guarded(fn) {
    return loadModule().then(function () {
      try { return fn(); }
      catch (e) { M = null; throw (e && e.message) ? e : new Error('The converter stopped on this input.'); }
    });
  }

  function wsqDecode(bytes) {
    return guarded(function () {
      var pin = put(bytes), p = ptrs(4), r;
      try {
        r = M.ccall('bc_wsq_decode', 'number', ['number', 'number', 'number', 'number', 'number', 'number'],
          [pin, bytes.length, p[0], p[1], p[2], p[3]]);
        if (r) throw cerr(r);
        var w = i32(p[1]), h = i32(p[2]);
        return { raw: take(i32(p[0]), w * h), w: w, h: h, ppi: i32(p[3]) };
      } finally { freeAll([pin].concat(p)); }
    });
  }
  function wsqEncode(img) {
    return guarded(function () {
      var pin = put(img.raw), p = ptrs(2), r;
      try {
        r = M.ccall('bc_wsq_encode', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [pin, img.w, img.h, img.ppi || 500, 0.75, p[0], p[1]]);
        if (r) throw cerr(r);
        return take(i32(p[0]), i32(p[1]));
      } finally { freeAll([pin].concat(p)); }
    });
  }
  function extract(img, fmt) {
    return guarded(function () {
      var pin = put(img.raw), p = ptrs(3), r;
      try {
        r = M.ccall('bc_raw2fmr', 'number', ['number', 'number', 'number', 'number', 'string', 'number', 'number', 'number'],
          [pin, img.w, img.h, img.ppi || 500, fmt, p[0], p[1], p[2]]);
        if (r) throw cerr(r);
        return take(i32(p[0]), i32(p[1]));
      } finally { freeAll([pin].concat(p)); }
    });
  }
  function fmr2fmr(bytes, from, to) {
    return guarded(function () {
      var pin = put(bytes), p = ptrs(2), r;
      try {
        r = M.ccall('bc_fmr2fmr', 'number', ['number', 'number', 'string', 'string', 'number', 'number'],
          [pin, bytes.length, from, to, p[0], p[1]]);
        if (r) throw cerr(r);
        return take(i32(p[0]), i32(p[1]));
      } finally { freeAll([pin].concat(p)); }
    });
  }

  /* ---------- FMR parsing (ISO/IEC 19794-2:2005, ANSI INCITS 378-2004) ---------- */
  function parseFMR(b) {
    if (b.length < 24 || b[0] !== 0x46 || b[1] !== 0x4D || b[2] !== 0x52 || b[3] !== 0)
      throw new Error('Not a finger minutiae record (no “FMR” header).');
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), std, o;
    if (dv.getUint32(8) === b.length) { std = 'ISO'; o = 12; }
    else if (dv.getUint16(8) === b.length) { std = 'ANSI'; o = 14; }
    else if (dv.getUint16(8) === 0 && b.length >= 30 && dv.getUint32(10) === b.length) { std = 'ANSI'; o = 18; }
    else throw new Error('Record length does not match the file size.');
    var info = { std: std, version: String.fromCharCode(b[4], b[5], b[6]).trim(), length: b.length };
    o += 2; // capture equipment
    info.w = dv.getUint16(o); info.h = dv.getUint16(o + 2);
    info.xres = dv.getUint16(o + 4); info.yres = dv.getUint16(o + 6);
    info.views = b[o + 8];
    o += 10;
    if (!info.views || o + 4 > b.length) throw new Error('The record contains no finger views.');
    info.finger = b[o]; info.quality = b[o + 2];
    var n = b[o + 3], list = [];
    o += 4;
    for (var i = 0; i < n && o + 6 <= b.length; i++, o += 6) {
      var a = b[o + 4];
      list.push({
        type: b[o] >> 6,
        x: ((b[o] & 0x3f) << 8) | b[o + 1],
        y: ((b[o + 2] & 0x3f) << 8) | b[o + 3],
        deg: std === 'ISO' ? a * 360 / 256 : a * 2,
        q: b[o + 5]
      });
    }
    info.minutiae = list;
    return info;
  }

  /* ---------- image I/O ---------- */
  function isWSQ(b) { return b.length > 2 && b[0] === 0xFF && b[1] === 0xA0; }
  function decodeRaster(file) {
    return createImageBitmap(file).then(function (bmp) {
      if (bmp.width * bmp.height > 4e6) throw new Error('Image is too large for the demo (max 4 MP).');
      var c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
      var d = g.getImageData(0, 0, c.width, c.height).data, raw = new Uint8Array(c.width * c.height);
      for (var i = 0, j = 0; j < raw.length; i += 4, j++)
        raw[j] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      return { raw: raw, w: c.width, h: c.height, ppi: 0 };
    });
  }
  function grayCanvas(img) {
    var c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    var g = c.getContext('2d'), id = g.createImageData(img.w, img.h), d = id.data;
    for (var i = 0, j = 0; j < img.raw.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = img.raw[j]; d[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- rendering ---------- */
  var cv = $('#bdi-canvas');
  function draw() {
    var img = state.img, tpl = state.tpl, info = tpl && tpl.info;
    var w = img ? img.w : (info && info.w) || 400, h = img ? img.h : (info && info.h) || 480;
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    if (img) g.drawImage(grayCanvas(img), 0, 0);
    else { g.fillStyle = '#0f0f11'; g.fillRect(0, 0, w, h); }
    if (info && (state.overlay || !img)) {
      var r = Math.max(4, Math.round(Math.min(w, h) / 90)), L = r * 2.6;
      g.lineWidth = Math.max(1.5, r / 3);
      info.minutiae.forEach(function (m) {
        g.strokeStyle = m.type === 2 ? '#889ce7' : '#fd6262';
        var t = m.deg * Math.PI / 180;
        g.beginPath(); g.arc(m.x, m.y, r, 0, 2 * Math.PI); g.stroke();
        g.beginPath(); g.moveTo(m.x + Math.cos(t) * r, m.y - Math.sin(t) * r);
        g.lineTo(m.x + Math.cos(t) * (r + L), m.y - Math.sin(t) * (r + L)); g.stroke();
      });
    }
    $('#bdi-img-empty').hidden = !!(img || info);
    cv.hidden = !(img || info);
  }
  function kb(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }
  function renderImageMeta() {
    var img = state.img, el = $('#bdi-img-meta');
    $('#bdi-ppi-row').hidden = !img || img.srcFmt === 'WSQ';
    ['#bdi-save-wsq', '#bdi-save-png', '#bdi-extract'].forEach(function (s) { $(s).disabled = !img; });
    if (!img) { el.textContent = 'No image loaded'; return; }
    el.textContent = img.name + ' · ' + img.srcFmt + ' · ' + img.w + '×' + img.h + ' px · ' +
      (img.ppi ? img.ppi + ' ppi' : 'resolution unknown') + (img.srcBytes ? ' · ' + kb(img.srcBytes) : '');
  }
  function renderTemplate() {
    var tpl = state.tpl, box = $('#bdi-tpl');
    ['#bdi-to-iso', '#bdi-to-ansi', '#bdi-save-tpl', '#bdi-copy', '#bdi-overlay'].forEach(function (s) { $(s).disabled = !tpl; });
    if (!tpl) { box.hidden = true; $('#bdi-tpl-empty').hidden = false; return; }
    var i = tpl.info, names = { ISO: 'ISO/IEC 19794-2:2005', ANSI: 'ANSI INCITS 378-2004' };
    $('#bdi-tpl-empty').hidden = true; box.hidden = false;
    $('#bdi-tpl-std').textContent = names[i.std];
    $('#bdi-tpl-len').textContent = i.length + ' bytes';
    $('#bdi-tpl-size').textContent = i.w + '×' + i.h + ' px';
    $('#bdi-tpl-res').textContent = i.xres + '×' + i.yres + ' px/cm (' + Math.round(i.xres * 2.54) + ' ppi)';
    $('#bdi-tpl-n').textContent = i.minutiae.length + ' (' +
      i.minutiae.filter(function (m) { return m.type === 1; }).length + ' ridge endings, ' +
      i.minutiae.filter(function (m) { return m.type === 2; }).length + ' bifurcations)';
    $('#bdi-tpl-q').textContent = i.quality;
    $('#bdi-b64').textContent = b64(tpl.bytes);
    $('#bdi-to-iso').disabled = i.std === 'ISO';
    $('#bdi-to-ansi').disabled = i.std === 'ANSI';
  }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function setTemplate(bytes, name) {
    state.tpl = { bytes: bytes, info: parseFMR(bytes), name: name };
    renderTemplate(); draw();
  }

  var statusEl = $('#bdi-status');
  function status(msg, isErr) { statusEl.textContent = msg || ''; statusEl.classList.toggle('err', !!isErr); }
  function busy(btn, p, okMsg) {
    var all = root.querySelectorAll('button'); all.forEach(function (b) { b.dataset.was = b.disabled; b.disabled = true; });
    status('Working…');
    return new Promise(function (r) { setTimeout(r, 30); }).then(function () { return p(); })
      .then(function (m) { status(typeof m === 'string' ? m : okMsg || ''); },
            function (e) { status(e && e.message ? e.message : String(e), true); })
      .then(function () { all.forEach(function (b) { b.disabled = b.dataset.was === 'true'; }); renderImageMeta(); renderTemplate(); });
  }
  function download(bytes, name, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function stem() { return state.img ? state.img.name.replace(/\.[^.]+$/, '') : 'fingerprint'; }

  /* ---------- actions ---------- */
  function loadImageBytes(bytes, name, file) {
    if (isWSQ(bytes)) return wsqDecode(bytes).then(function (img) {
      img.name = name; img.srcFmt = 'WSQ'; img.srcBytes = bytes.length; return img;
    });
    return decodeRaster(file || new Blob([bytes])).then(function (img) {
      img.name = name; img.srcFmt = (name.split('.').pop() || 'image').toUpperCase(); img.srcBytes = bytes.length;
      img.ppi = parseInt($('#bdi-ppi').value, 10) || 500; return img;
    });
  }
  function useImage(img) {
    state.img = img; state.tpl = null; renderImageMeta(); renderTemplate(); draw();
  }
  function loadSample() {
    return fetch(BASE + 'sample.wsq').then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { return loadImageBytes(new Uint8Array(ab), 'sample.wsq'); })
      .then(function (img) { useImage(img); return 'Sample fingerprint loaded (WSQ, NIST). Press “Extract minutiae”.'; });
  }

  $('#bdi-sample').addEventListener('click', function () { busy(this, loadSample); });
  $('#bdi-open-img').addEventListener('click', function () { $('#bdi-file-img').click(); });
  $('#bdi-file-img').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    busy(null, function () {
      return f.arrayBuffer().then(function (ab) { return loadImageBytes(new Uint8Array(ab), f.name, f); })
        .then(function (img) { useImage(img); return 'Image loaded.' + (img.srcFmt !== 'WSQ' ? ' Check the resolution: minutiae detection expects about 500 ppi.' : ''); });
    });
  });
  $('#bdi-ppi').addEventListener('change', function () {
    if (state.img && state.img.srcFmt !== 'WSQ') { state.img.ppi = parseInt(this.value, 10) || 500; renderImageMeta(); }
  });
  $('#bdi-extract').addEventListener('click', function () {
    var fmt = $('#bdi-fmt').value;
    busy(this, function () {
      var t0 = performance.now();
      return extract(state.img, fmt).then(function (bytes) {
        state.overlay = true; $('#bdi-overlay').checked = true;
        setTemplate(bytes, stem() + (fmt === 'ISO' ? '.ist' : '.ansi'));
        return state.tpl.info.minutiae.length + ' minutiae extracted in ' + Math.round(performance.now() - t0) + ' ms.';
      });
    });
  });
  $('#bdi-save-wsq').addEventListener('click', function () {
    busy(this, function () {
      return wsqEncode(state.img).then(function (bytes) {
        download(bytes, stem() + '.wsq', 'image/x-wsq');
        return 'WSQ saved: ' + kb(bytes.length) + ' (' + (state.img.w * state.img.h / bytes.length).toFixed(1) + ':1 compression).';
      });
    });
  });
  $('#bdi-save-png').addEventListener('click', function () {
    grayCanvas(state.img).toBlob(function (b) {
      b.arrayBuffer().then(function (ab) { download(new Uint8Array(ab), stem() + '.png', 'image/png'); status('PNG saved.'); });
    }, 'image/png');
  });
  $('#bdi-open-tpl').addEventListener('click', function () { $('#bdi-file-tpl').click(); });
  $('#bdi-file-tpl').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    busy(null, function () {
      return f.arrayBuffer().then(function (ab) {
        setTemplate(new Uint8Array(ab), f.name);
        return 'Template loaded: ' + state.tpl.info.minutiae.length + ' minutiae.' + (state.img ? '' : ' A template has no image, so only its minutiae are drawn.');
      });
    });
  });
  function convertTo(to) {
    var from = state.tpl.info.std;
    busy(null, function () {
      return fmr2fmr(state.tpl.bytes, from, to).then(function (bytes) {
        setTemplate(bytes, stem() + (to === 'ISO' ? '.ist' : '.ansi'));
        return 'Converted ' + from + ' → ' + to + '.';
      });
    });
  }
  $('#bdi-to-iso').addEventListener('click', function () { convertTo('ISO'); });
  $('#bdi-to-ansi').addEventListener('click', function () { convertTo('ANSI'); });
  $('#bdi-save-tpl').addEventListener('click', function () { download(state.tpl.bytes, state.tpl.name); status('Template saved.'); });
  $('#bdi-copy').addEventListener('click', function () {
    navigator.clipboard.writeText(b64(state.tpl.bytes)).then(function () { status('Base64 copied.'); }, function () { status('Copy failed.', true); });
  });
  $('#bdi-overlay').addEventListener('change', function () { state.overlay = this.checked; draw(); });

  renderImageMeta(); renderTemplate(); draw();
  var io = new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) {
      io.disconnect();
      busy(null, function () { return loadModule().then(loadSample); });
    }
  }, { rootMargin: '300px' });
  io.observe(root);
})();
