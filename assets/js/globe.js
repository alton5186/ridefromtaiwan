/* 首頁地球儀(他 09-24)—— d3-geo 畫在 canvas 上,不加新函式庫(由 shortcodes/globe.html 以內容雜湊檔名載入)
   1. 顏色跟首頁照片的灰藍走;台灣柿橙 #ee7d55 是整顆球唯一的暖色,去過的國家是安靜的淡藍小燈
   2. 球的光影是預先畫好的兩張圖層(背後的暈 + 正面明暗),每格只 drawImage
   3. 停靠點巡覽取代一直自轉:歐洲 → 南美…每站讓 logo 小人從台灣沿航線騎到目的地,講兩輪就停在看得到台灣的那一面
   4. 滑過國家 → 旁邊浮出國名;點一下(手機:點一下看名字、再點一下)→ 那個國家放大成有弧度的地圖,
      畫出騎過的路線,每篇遊記一個有名字的點,點了進文章;「回到地球」或 Esc 縮回來
   5. 照片裡的騎士 → 地球上那個國家的方向線(桌機)
   離開畫面、分頁隱藏、沒東西在動 → 不重畫;prefers-reduced-motion → 不巡覽、靜止面向台灣
   美術規格:工作流 globe-art-review(wf_0866a351-67d) */
(function () {
  'use strict';
  var cv = document.getElementById('globe');
  if (!cv || !cv.getContext || !window.d3 || !window.topojson) return;
  var d3 = window.d3, ctx = cv.getContext('2d');
  var stage = document.getElementById('globe-stage') || cv.parentElement;
  var wrap = document.getElementById('globe-wrap') || stage;
  var tipEl = document.getElementById('globe-tip');
  var pinsEl = document.getElementById('globe-pins');
  var backEl = document.getElementById('globe-back');
  var labelEl = document.getElementById('globe-label');
  var PTS = window.GLOBE_POINTS || [];
  var META = window.GLOBE_META || {};
  var HOME = [121.0, 23.7];                         // 台灣
  var PI = Math.PI, HALF = PI / 2, TAU = 2 * PI, RAD = PI / 180, DEG = 180 / PI;
  // 放大後的國界(第一次點國家才載)。09-24 他裁:放自己網站,不靠外部來源(world-atlas@2.0.2 countries-50m,源自 Natural Earth 公有領域)
  var DETAIL_URL = META.detail || '/data/countries-50m.json';
  var FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';
  var N = 48;            // 每條航線切幾段
  var ZDUR = 1500;       // 放大 / 縮回的時間(ms)

  // ── 小工具
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function eSine(t) { return (1 - Math.cos(PI * t)) / 2; }
  function eCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2; }
  function eOut(t) { return 1 - Math.pow(1 - t, 3); }
  function ease(v, to, dt, tau) { return v + (to - v) * (1 - Math.exp(-dt / tau)); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? c[3] : a) + ')'; }
  function mix(a, b, t) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mq(q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; }
  function onMq(q, fn) { if (q.addEventListener) q.addEventListener('change', fn); else if (q.addListener) q.addListener(fn); }
  function now() { return window.performance ? performance.now() : Date.now(); }

  // ── 顏色:dark = 放在首頁照片上(桌機、手機都是);light 只給「不在照片上、淺色主題」時用
  var PAL = {
    dark: {
      sea: '#1b2534', land: '#56677c', landHi: '#71849b', edge: 'rgba(20,29,42,.55)', edgeHi: 'rgba(230,240,251,.5)',
      grid: 'rgba(203,213,225,.05)', gridFine: 'rgba(203,213,225,.11)',
      dot: [147, 197, 253], dotOn: [230, 240, 251], key: '#1b2534',
      home: '#ee7d55', homeLt: '#f6b89c', homeDisc: 'rgba(238,125,85,.18)', halo: 'rgba(27,37,52,.85)',
      arcA: [238, 125, 85, .35], arcB: [147, 197, 253, .55],
      route: '#f6b89c', routeOn: '#fff4ec', casing: 'rgba(12,18,28,.6)',
      sep: [10, 15, 24, .38], atmo: [169, 187, 209, .30], hi: [255, 255, 255, .08], lim1: [4, 8, 15, .18], lim2: [4, 8, 15, .48],
      limb: 'rgba(174,189,208,.35)', bike: '#f7f6f1', bikeEdge: 'rgba(12,18,28,.85)', bag: '#ee7d55'
    },
    light: {
      sea: '#dde5ee', land: '#a9b7c7', landHi: '#c3cedb', edge: 'rgba(255,255,255,.75)', edgeHi: 'rgba(30,58,138,.5)',
      grid: 'rgba(30,41,59,.06)', gridFine: 'rgba(30,41,59,.10)',
      dot: [47, 109, 181], dotOn: [30, 58, 138], key: '#ffffff',
      home: '#d4552e', homeLt: '#b8441f', homeDisc: 'rgba(212,85,46,.16)', halo: 'rgba(255,255,255,.85)',
      arcA: [212, 85, 46, .45], arcB: [47, 109, 181, .60],
      route: '#d4552e', routeOn: '#8a2f12', casing: 'rgba(255,255,255,.75)',
      sep: [15, 23, 42, .10], atmo: [127, 147, 171, .28], hi: [255, 255, 255, .18], lim1: [30, 41, 59, .06], lim2: [30, 41, 59, .20],
      limb: 'rgba(71,85,105,.30)', bike: '#1a1a1a', bikeEdge: 'rgba(255,255,255,.85)', bag: '#d4552e'
    }
  };

  // ── 狀態
  var W = 640, k = 1, u = 1, R = 280, cx = 320, cy = 320, cssW = 340;
  var rot = [-HOME[0], -HOME[1]], m = 1;           // m = 放大倍率(1 = 整顆地球)
  var C = PAL.dark, onPhoto = true, lowPower = false;
  var land = null, detail = null, routes = null, routesP = null, detailP = null;
  var reduceMq = mq('(prefers-reduced-motion: reduce)'), reduce = reduceMq.matches;
  var desk = mq('(min-width: 1024px)');
  var ready = false, visible = false, raf = 0, last = null, perf = { n: 0, sum: 0 };
  var s = 1, holdUntil = 0;                         // 巡覽速度係數:滑過/選中/拖曳/放大時 → 0
  var hover = null, sel = null, selT = 0, selTimer = 0;
  var drag = null, down = null, vel = null, cam = null;
  var intro = null, homePop = 1, ringT = 1e9;
  var home = { a: 0, x: null, y: null };
  var tour = { steps: [], i: 0, t: 0, done: true };
  var Z = { on: false, t: 0, anim: false, show: 0 };
  var baseVer = 0, baseKey = '';
  var backL = null, frontL = null, base = null, baseCtx = null, sprite = {};

  // ── 投影:放大版正射投影。m=1 就是一般地球;m>1 把中心附近「放大後仍貼在球面上」,邊緣自然帶弧度
  function magRaw(mm) {
    return function (x, y) {
      var cy_ = Math.cos(y), cc = cy_ * Math.cos(x);
      var c = Math.acos(cc > 1 ? 1 : cc < -1 ? -1 : cc);
      var f = c < 1e-9 ? mm : Math.sin(Math.min(mm * c, HALF)) / Math.sin(c);
      return [f * cy_ * Math.sin(x), f * Math.sin(y)];
    };
  }
  var mutate = d3.geoProjectionMutator(magRaw);
  var proj = mutate(1).clipAngle(90).precision(.4);
  var path = d3.geoPath(proj);
  function setView() { mutate(m); proj.rotate(rot).clipAngle(Math.min(90, 90 / m)).scale(R).translate([cx, cy]); }
  function center() { return [-rot[0], -rot[1]]; }
  function faceZ(ll) { var md = m * d3.geoDistance(ll, center()); return md >= HALF ? -1 : Math.cos(md); }
  var grid30 = d3.geoGraticule().step([30, 30])();

  // ── 航線(抬離地表的弧):台灣 → 每個國家
  var arcs = [];
  PTS.forEach(function (p) {
    p.hv = 0; p.pop = 1; p.a = 0; p.sx = -1e4; p.sy = 0; p.sr = 0; p.z = -1;
    var dest = [p.lon, p.lat], ang = d3.geoDistance(HOME, dest);
    if (ang < .02) return;                          // 有人標「台灣」就不畫線
    var ip = d3.geoInterpolate(HOME, dest), lift = .04 + .07 * ang / PI, ll = [], h = [];
    for (var j = 0; j <= N; j++) { ll.push(ip(j / N)); h.push(lift * Math.sin(PI * j / N)); }
    p.arc = { p: p, ang: ang, ll: ll, h: h, xy: new Float64Array(2 * N + 2), vis: new Uint8Array(N + 1), grow: 1, j: 0 };
    arcs.push(p.arc);
  });
  arcs.slice().sort(function (a, b) { return a.ang - b.ang; }).forEach(function (a, j) { a.j = j; });

  function projectArcs() {
    var rr = d3.geoRotation(rot);
    arcs.forEach(function (a) {
      for (var i = 0; i <= N; i++) {
        var r = rr(a.ll[i]), l = r[0] * RAD, f = r[1] * RAD, cf = Math.cos(f);
        var x = cf * Math.sin(l), y = -Math.sin(f), z = cf * Math.cos(l), sc = 1 + a.h[i], v;
        if (m !== 1) {
          var c = Math.acos(clamp(z, -1, 1)), q = c < 1e-9 ? m : Math.sin(Math.min(m * c, HALF)) / Math.sin(c);
          x *= q; y *= q; v = m * c < HALF;
        } else v = z > 0 || sc * Math.sqrt(x * x + y * y) > 1;   // 在球後面、但拱出球緣的那段也看得到
        a.xy[2 * i] = cx + R * sc * x; a.xy[2 * i + 1] = cy + R * sc * y; a.vis[i] = v ? 1 : 0;
      }
    });
  }
  function ptAt(a, t) {                              // t = 0..N 的小數索引 → [x, y, 看得到嗎]
    var j = Math.min(N - 1, Math.floor(t)), f = t - j;
    return [a.xy[2 * j] + (a.xy[2 * j + 2] - a.xy[2 * j]) * f, a.xy[2 * j + 1] + (a.xy[2 * j + 3] - a.xy[2 * j + 1]) * f, f < .5 ? a.vis[j] : a.vis[j + 1]];
  }
  function strokeArc(a, t0, t1) {
    if (t1 <= t0) return;
    var ts = [t0], pen = false;
    for (var j = Math.floor(t0) + 1; j < t1; j++) ts.push(j);
    ts.push(t1);
    ctx.beginPath();
    for (var i = 0; i < ts.length; i++) {
      var P = ptAt(a, ts[i]);
      if (!P[2]) { pen = false; continue; }
      if (pen) ctx.lineTo(P[0], P[1]); else { ctx.moveTo(P[0], P[1]); pen = true; }
    }
    ctx.stroke();
  }
  function arcGrad(a, on) {
    var g = ctx.createLinearGradient(a.xy[0], a.xy[1], a.xy[2 * N], a.xy[2 * N + 1]);
    g.addColorStop(0, rgba(C.arcA, on ? .7 : null)); g.addColorStop(1, rgba(C.arcB, on ? .95 : null));
    return g;
  }

  // ── 尺寸與預先畫好的圖層
  function layer() { var c = document.createElement('canvas'); c.width = c.height = W; return c; }
  function resize() {
    var w = cv.getBoundingClientRect().width;
    if (!w) return false;
    cssW = w;
    var coarse = mq('(pointer: coarse)').matches;
    var dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    if (lowPower && coarse) dpr = 1;
    W = Math.max(200, Math.round(w * dpr));
    cv.width = cv.height = W;
    k = W / w; u = W / 640; R = 280 * u; cx = cy = W / 2;
    buildLayers(); buildSprites(); baseVer++;
    measure();
    return true;
  }
  function buildLayers() {
    backL = layer(); frontL = layer(); base = layer(); baseCtx = base.getContext('2d');
    var g = backL.getContext('2d'), gr;
    gr = g.createRadialGradient(cx, cy, .98 * R, cx, cy, 1.13 * R);       // 和照片分開的暗暈
    gr.addColorStop(0, rgba(C.sep)); gr.addColorStop(1, rgba(C.sep, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    gr = g.createRadialGradient(cx, cy, .99 * R, cx, cy, 1.07 * R);       // 大氣光
    gr.addColorStop(0, rgba(C.atmo)); gr.addColorStop(1, rgba(C.atmo, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = C.sea; g.fill();
    g = frontL.getContext('2d');                                            // 正面明暗:左上亮、球緣暗
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    gr = g.createRadialGradient(cx - .38 * R, cy - .42 * R, .05 * R, cx, cy, R);
    gr.addColorStop(0, rgba(C.hi)); gr.addColorStop(.55, rgba(C.hi, 0));
    gr.addColorStop(.85, rgba(C.lim1)); gr.addColorStop(1, rgba(C.lim2));
    g.fillStyle = gr; g.fillRect(0, 0, W, W); g.restore();
    g.beginPath(); g.arc(cx, cy, R - u, 0, TAU); g.lineWidth = 1.9 * u; g.strokeStyle = C.limb; g.stroke();
  }

  // ── logo 的騎車小人(座標取自 assets/img/logo-full.svg),先畫成小圖,每格只 drawImage
  var BIKE = [
    [0, 228, 272, 58, 1.25], [0, 478, 272, 58, 1.25],
    [1, 'M228 272 L326 182 L428 182 L478 272 M326 182 L356 272 L228 272 M356 272 L428 182', 1.1],
    [1, 'M326 182 L320 160', 1.3], [1, 'M428 182 L436 156 L460 150', 1.2],
    [1, 'M322 166 C 326 130, 334 106, 342 88', 2.1],
    [1, 'M342 90 C 380 108, 420 132, 456 152', 1.4],
    [1, 'M322 166 C 334 200, 366 232, 356 268', 1.8]
  ];
  var BX = 168, BY = 41, BW = 370, BH = 292, GX = 353, GY = 330;   // 外框、落地點(兩輪中間)
  function buildSprites() {
    var wcss = clamp(cssW * .078, 20, 30), sc = wcss * k / BW, pad = Math.ceil(3 * k);
    var w = Math.ceil(BW * sc) + 2 * pad, h = Math.ceil(BH * sc) + 2 * pad;
    function make(flip) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d');
      g.translate(pad, pad);
      if (flip) { g.translate(BW * sc, 0); g.scale(-1, 1); }
      g.scale(sc, sc); g.translate(-BX, -BY);
      g.lineCap = g.lineJoin = 'round';
      [[C.bikeEdge, 1.5], [C.bike, 0]].forEach(function (pass) {
        var ex = pass[1] * k / sc;
        g.strokeStyle = g.fillStyle = pass[0];
        BIKE.forEach(function (b) {
          g.lineWidth = b[b.length - 1] * k / sc + ex;
          if (b[0] === 0) { g.beginPath(); g.arc(b[1], b[2], b[3], 0, TAU); g.stroke(); }
          else g.stroke(new Path2D(b[1]));
        });
        g.beginPath(); g.arc(348, 60, Math.max(17, 2.2 * k / sc) + ex / 2, 0, TAU); g.fill();   // 頭
        g.fillStyle = pass[1] ? pass[0] : C.bag;                                             // 馬鞍袋:柿橙
        g.fillRect(182 - ex / 2, 210 - ex / 2, 34 + ex, 34 + ex);
      });
      return c;
    }
    sprite = { r: make(false), l: make(true), ax: pad + (GX - BX) * sc, axl: pad + BW * sc - (GX - BX) * sc, ay: pad + (GY - BY) * sc };
  }
  function putRider(x, y, ang, flip, al) {
    if (al < .01 || !sprite.r) return;
    ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); if (ang) ctx.rotate(ang);
    ctx.drawImage(flip ? sprite.l : sprite.r, -(flip ? sprite.axl : sprite.ax), -sprite.ay);
    ctx.restore();
  }

  // ── 底圖(背光 + 經緯網 + 陸地 + 正面明暗):只在鏡頭或資料變了才重畫
  function drawBase() {
    var key = rot[0].toFixed(3) + ',' + rot[1].toFixed(3) + ',' + m.toFixed(4) + ',' + baseVer;
    if (key === baseKey) return;
    baseKey = key;
    var g = baseCtx;
    g.clearRect(0, 0, W, W);
    g.drawImage(backL, 0, 0);
    path.context(g);
    if (!lowPower) { g.beginPath(); path(grid30); g.strokeStyle = C.grid; g.lineWidth = 1.2 * u; g.stroke(); }
    var fine = Z.on && Z.grid ? smooth(3, 8, m) : 0;
    if (fine > 0) { g.globalAlpha = fine; g.beginPath(); path(Z.grid); g.strokeStyle = C.gridFine; g.lineWidth = .8 * k; g.stroke(); g.globalAlpha = 1; }
    var dA = detail ? smooth(2.5, 3.5, m) : 0;
    if (land && dA < 1) { g.globalAlpha = 1 - dA; g.beginPath(); path(land); g.fillStyle = C.land; g.fill(); g.globalAlpha = 1; }
    if (dA > 0) {
      var ctr = center(), V = Math.min(HALF, HALF / m);
      g.globalAlpha = dA; g.beginPath();
      detail.forEach(function (f) { if (d3.geoDistance(f.c, ctr) < V + f.r) path(f); });
      g.fillStyle = C.land; g.fill(); g.lineWidth = .8 * k; g.strokeStyle = C.edge; g.stroke();
      if (Z.on && Z.feat) { g.beginPath(); path(Z.feat); g.fillStyle = C.landHi; g.fill(); g.lineWidth = 1.3 * k; g.strokeStyle = C.edgeHi; g.stroke(); }
      g.globalAlpha = 1;
    }
    g.drawImage(frontL, 0, 0);
    path.context(ctx);
  }

  // ── 每一格
  function draw() {
    setView();
    drawBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(base, 0, 0);
    var gA = Z.on ? 1 - smooth(0, .35, Z.t) : 1;
    if (gA > .001) drawDecor(gA);
    else { home.x = null; PTS.forEach(function (p) { p.a = 0; p.sx = -1e4; }); }
    if (Z.on && Z.show > .001) drawTracks(Z.show);
    placeTip(); placePins(); pointer();
  }

  function drawDecor(A) {
    projectArcs();
    var st = rideStep(), q = st ? eSine(clamp((tour.t - 400) / st.D, 0, 1)) : 0;
    var focus = hover || sel;
    ctx.lineCap = ctx.lineJoin = 'round';
    arcs.forEach(function (a) {
      if (a.grow <= 0) return;
      var on = focus === a.p;
      ctx.globalAlpha = A * (focus && !on ? .45 : 1);
      ctx.strokeStyle = lowPower ? rgba(C.dot, .45) : arcGrad(a, on);
      ctx.lineWidth = (on ? 3.4 : 1.9) * u;
      strokeArc(a, 0, a.grow * N);
    });
    if (st && q > 0) {                               // 小人騎過的那一段亮起來
      ctx.globalAlpha = A; ctx.strokeStyle = arcGrad(st.p.arc, true); ctx.lineWidth = 3.4 * u;
      strokeArc(st.p.arc, 0, q * N);
    }
    drawMarkers(A);
    if (st && tour.t >= st.A && tour.t < st.A + 900 && st.p.a > 0) {     // 抵達漣漪
      var e = eOut((tour.t - st.A) / 900);
      ctx.globalAlpha = A * st.p.a * .7 * (1 - e);
      ctx.beginPath(); ctx.arc(st.p.sx, st.p.sy, st.p.sr + 22 * u * e, 0, TAU);
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(C.dot, 1); ctx.stroke();
    }
    drawHome(A);
    drawRider(A, st, q);
    ctx.globalAlpha = 1;
  }

  function drawMarkers(A) {
    var list = [];
    PTS.forEach(function (p) {
      if (!p.arc) { p.a = 0; return; }
      var z = faceZ([p.lon, p.lat]);
      p.a = smooth(0, .22, z) * p.pop; p.z = z;
      if (p.a <= 0) { p.sx = -1e4; return; }
      var xy = proj([p.lon, p.lat]); p.sx = xy[0]; p.sy = xy[1];
      list.push(p);
    });
    list.sort(function (a, b) { return a.z - b.z; });  // 遠的先畫
    list.forEach(function (p) {
      var r = (4.9 + 2.1 * Math.sqrt(p.n)) * u * (.6 + .4 * p.a), hv = p.hv;
      p.sr = r;
      if (hv > .01) {
        ctx.globalAlpha = A * p.a * hv;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 7.5 * u, 0, TAU);
        ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(C.dot, 1); ctx.stroke();
      }
      ctx.globalAlpha = A * p.a;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 2.8 * u * hv, 0, TAU);
      ctx.fillStyle = mix(C.dot, C.dotOn, hv); ctx.fill();
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = C.key; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawHome(A) {
    home.a = smooth(0, .22, faceZ(HOME)) * homePop;
    if (home.a <= 0) { home.x = null; return; }
    var xy = proj(HOME), x = xy[0], y = xy[1], al = A * home.a;
    home.x = x; home.y = y;
    ctx.globalAlpha = al;
    ctx.beginPath(); ctx.arc(x, y, 17 * u, 0, TAU); ctx.fillStyle = C.homeDisc; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 12 * u, 0, TAU); ctx.lineWidth = 2.8 * u; ctx.strokeStyle = C.home; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 6 * u, 0, TAU); ctx.fillStyle = C.home; ctx.fill();
    ctx.lineWidth = 1.9 * u; ctx.strokeStyle = C.key; ctx.stroke();
    if (ringT < 1400) {                              // 出發光環
      var q = ringT / 1400;
      ctx.globalAlpha = al * .6 * Math.pow(1 - q, 1.5);
      ctx.beginPath(); ctx.arc(x, y, (12 + 29 * eOut(q)) * u, 0, TAU);
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = C.home; ctx.stroke();
      ctx.globalAlpha = al;
    }
    var hasLS = 'letterSpacing' in ctx;
    ctx.font = '700 ' + Math.max(23 * u, 12 * k).toFixed(1) + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (hasLS) ctx.letterSpacing = (3.4 * u).toFixed(1) + 'px';
    ctx.lineJoin = 'round'; ctx.lineWidth = 5.6 * u; ctx.strokeStyle = C.halo;
    ctx.strokeText('台灣', x, y + 20 * u);
    ctx.fillStyle = C.homeLt; ctx.fillText('台灣', x, y + 20 * u);
    if (hasLS) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  // 小人:平常停在台灣;講一趟時沿航線騎到目的地,停一下,淡出,回到台灣
  function drawRider(A, st, q) {
    var t = tour.t;
    function park(al) { if (home.x != null) putRider(home.x, home.y, 0, false, A * al * home.a); }
    if (!st || t < 400) return park(1);
    var arc = st.p.arc;
    if (t < st.A + 1600) {
      var ti = (t < st.A ? q : 1) * N, P = ptAt(arc, ti);
      if (!P[2]) return;
      var P0 = ptAt(arc, Math.max(0, Math.min(ti, N - 1) - .8)), P1 = ptAt(arc, Math.min(N, Math.max(ti, 1) + .8));
      var dx = P1[0] - P0[0], dy = P1[1] - P0[1], flip = dx < 0;
      var ang = clamp(flip ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx), -.9, .9);
      var al = t < st.A ? 1 : st.p.a * (t < st.A + 1200 ? 1 : 1 - (t - st.A - 1200) / 400);
      return putRider(P[0], P[1], ang, flip, A * al);
    }
    park(t < st.A + 2000 ? (t - st.A - 1600) / 400 : 1);
  }

  // ── 放大地圖:騎過的路線
  function drawTracks(A) {
    if (!Z.arts) return;
    path.context(ctx);
    ctx.lineJoin = ctx.lineCap = 'round';
    var list = Z.arts.filter(function (a) { return a.lines.length; });
    if (Z.hi) list.sort(function (a, b) { return (a === Z.hi) - (b === Z.hi); });   // 滑到的那篇畫在最上面
    var ctr = center(), lim = HALF / m;
    list.forEach(function (a) {
      var on = Z.hi === a, al = A * (Z.hi && !on ? .45 : 1);
      ctx.beginPath(); a.lines.forEach(function (l) { path(l); });
      if (a.src !== 'photo') {                       // GPX:實線
        ctx.globalAlpha = al;
        ctx.strokeStyle = C.casing; ctx.lineWidth = (on ? 5.6 : 4.2) * k; ctx.stroke();
        ctx.strokeStyle = on ? C.routeOn : C.route; ctx.lineWidth = (on ? 3 : 2.2) * k; ctx.stroke();
        return;
      }
      // 沒有 GPX、只有照片的 GPS:每張照片一個小點,中間淡淡的細線(不假裝是騎過的軌跡)
      ctx.globalAlpha = al * .55; ctx.strokeStyle = on ? C.routeOn : C.route; ctx.lineWidth = 1.1 * k; ctx.stroke();
      ctx.globalAlpha = al;
      ctx.beginPath();
      a.lines.forEach(function (l) {
        l.coordinates.forEach(function (c) {
          if (d3.geoDistance(c, ctr) >= lim) return;
          var xy = proj(c); ctx.moveTo(xy[0] + 2.6 * k, xy[1]); ctx.arc(xy[0], xy[1], 2.6 * k, 0, TAU);
        });
      });
      ctx.fillStyle = on ? C.routeOn : C.route; ctx.fill();
      ctx.lineWidth = 1.2 * k; ctx.strokeStyle = C.casing; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // ── 巡覽:停靠點(把國家分群)→ 每站讓小人騎幾趟 → 兩輪後停在看得到台灣的那一面
  function vecOf(ll) { var l = ll[0] * RAD, f = ll[1] * RAD; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; }
  function llOf(v) { return [Math.atan2(v[1], v[0]) * DEG, Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * DEG]; }
  function buildTour() {
    var list = PTS.filter(function (p) { return p.arc; }).sort(function (a, b) { return b.n - a.n || (b.last || 0) - (a.last || 0); });
    var cl = [];
    list.forEach(function (p) {
      var ll = [p.lon, p.lat], best = null, bd = .52;           // 30° 內算同一群
      cl.forEach(function (c) { var d = d3.geoDistance(c.center, ll); if (d < bd) { bd = d; best = c; } });
      if (!best) { best = { pts: [], v: [0, 0, 0] }; cl.push(best); }
      var v = vecOf(ll); best.pts.push(p);
      best.v = [best.v[0] + v[0], best.v[1] + v[1], best.v[2] + v[2]]; best.center = llOf(best.v);
    });
    if (!cl.length) { tour = { steps: [], i: 0, t: 0, done: true, home: { stop: HOME } }; return; }
    cl.forEach(function (c) {
      var d = d3.geoDistance(c.center, HOME), st = d > .01 ? d3.geoInterpolate(c.center, HOME)(Math.min(.5, .8 / d)) : c.center.slice();
      st[1] = clamp(st[1], -40, 45);
      c.stop = st; c.homeD = d3.geoDistance(st, HOME); c.per = Math.min(3, Math.ceil(c.pts.length / 2));
    });
    var first = cl.slice().sort(function (a, b) { return a.homeD - b.homeD; })[0];   // 台灣最靠中間的那一站
    var order = [first], rest = cl.filter(function (c) { return c !== first; });
    while (rest.length) {
      var lc = order[order.length - 1];
      rest.sort(function (a, b) { return d3.geoDistance(lc.stop, a.stop) - d3.geoDistance(lc.stop, b.stop); });
      order.push(rest.shift());
    }
    var steps = [];
    for (var round = 0; round < 2; round++) {
      order.forEach(function (c, ci) {
        steps.push({ type: 'fly', to: c.stop, c: c }, { type: 'wait', dur: round === 0 && ci === 0 ? 1200 : 600, c: c });
        for (var i = 0; i < c.per; i++) steps.push({ type: 'ride', p: c.pts[(round * c.per + i) % c.pts.length], c: c });
      });
    }
    steps.push({ type: 'fly', to: first.stop, c: first });
    tour = { steps: steps, i: 0, t: 0, done: false, home: first, moved: false };
  }
  function curStep() { return (!intro && !tour.done) ? tour.steps[tour.i] : null; }
  function rideStep() { var st = curStep(); return st && st.type === 'ride' && st.started ? st : null; }
  function storyP() { var st = rideStep(); return st ? st.p : null; }
  function storyTipOn() { var st = rideStep(); return !!st && tour.t >= st.A + 250 && tour.t < st.A + 1800; }
  function startStep(st) {
    if (st.type === 'fly') {
      var from = center(), ang = d3.geoDistance(from, st.to) * DEG;
      st.ip = d3.geoInterpolate(from, st.to);
      st.dur = ang < .5 ? 0 : clamp(1600 + 18 * ang, 1600, 3800);
    } else if (st.type === 'ride') {
      st.D = 1400 + 1400 * st.p.arc.ang / PI; st.A = 400 + st.D; st.dur = st.A + 2300; ringT = 0;
    }
    st.started = true;
  }
  function reanchor() {                              // 使用者轉過地球:先飛回這一站再接著講
    var st = tour.steps[tour.i];
    if (!st) return;
    st.started = false;
    if (st.type !== 'fly') tour.steps.splice(tour.i, 0, { type: 'fly', to: st.c.stop, c: st.c });
    tour.t = 0;
  }
  function updTour(dt) {
    if (tour.moved) { tour.moved = false; reanchor(); }
    var st = tour.steps[tour.i];
    if (!st) { tour.done = true; return false; }
    if (!st.started) startStep(st);
    tour.t += dt;
    if (st.type === 'fly') {
      var c = st.ip(st.dur ? eSine(clamp(tour.t / st.dur, 0, 1)) : 1);
      rot[0] = -c[0]; rot[1] = -c[1];
    }
    if (tour.t >= st.dur) {
      tour.i++; tour.t = 0;
      if (tour.i >= tour.steps.length) { tour.done = true; prefetch(); }
    }
    return true;
  }

  // ── 開場(每個瀏覽階段一次):鏡頭從台灣轉向第一站,航線一條條長出來
  function startIntro() {
    var to = tour.steps.length ? tour.steps[0].to : HOME;
    intro = { t: 0, ip: d3.geoInterpolate(HOME, to), rang: false };
    rot = [-HOME[0], -HOME[1]]; homePop = 0;
    arcs.forEach(function (a) { a.grow = 0; a.p.pop = 0; });
    try { sessionStorage.setItem('globeIntro', '1'); } catch (e) { /* 無痕模式 */ }
  }
  function updIntro(dt) {
    var t = (intro.t += dt);
    homePop = eOut(clamp(t / 300, 0, 1));
    if (t >= 300 && !intro.rang) { intro.rang = true; ringT = 0; }
    var c = intro.ip(eCubic(clamp((t - 500) / 2800, 0, 1)));
    rot[0] = -c[0]; rot[1] = -c[1];
    arcs.forEach(function (a) {
      var d = 1100 + 900 * a.ang / PI, t0 = 500 + 120 * a.j;
      a.grow = eOut(clamp((t - t0) / d, 0, 1));
      a.p.pop = eOut(clamp((t - t0 - d) / 300, 0, 1));
    });
    if (t >= 3400) endIntro();
  }
  function endIntro() {
    if (!intro) return;
    var c = intro.ip(1);
    intro = null; homePop = 1; rot = [-c[0], -c[1]];
    arcs.forEach(function (a) { a.grow = 1; a.p.pop = 1; });
  }
  function restPose() {                              // 減少動態 / 講完:停在看得到台灣的那一面
    endIntro();
    tour.done = true;
    var st = tour.home ? tour.home.stop : HOME;
    rot = [-st[0], -st[1]];
    arcs.forEach(function (a) { a.grow = 1; a.p.pop = 1; }); homePop = 1;
  }

  // ── 主迴圈:有東西在動才要下一格
  function running() { return ready && visible && !document.hidden; }
  function kick() { if (!raf && running()) raf = requestAnimationFrame(loop); }
  function loop(ts) {
    raf = 0;
    if (!running()) { last = null; return; }
    if (last == null) last = ts - 16;
    if (lowPower && ts - last < 31) { raf = requestAnimationFrame(loop); return; }   // 降級:30fps
    var dt = Math.min(50, ts - last); last = ts;
    var busy = update(dt);
    if (busy && perf.n < 90) {                       // 量前 90 格的間隔,太慢就降級
      perf.sum += dt;
      if (++perf.n === 90 && perf.sum / 90 > 22) { lowPower = true; baseVer++; }
    }
    draw();
    if (busy) raf = requestAnimationFrame(loop); else last = null;
  }
  function update(dt) {
    var busy = false, tn = now();
    var target = (hover || sel || drag || vel || cam || Z.on || tn < holdUntil) ? 0 : 1;
    if (s !== target) { s = Math.abs(s - target) < .01 ? target : ease(s, target, dt, 250); busy = true; }
    if (intro) { updIntro(dt); busy = true; }
    else if (!tour.done && s > 0) busy = updTour(dt * s) || busy;
    if (ringT < 1400) { ringT += dt; busy = true; }
    if (cam) {
      cam.t += dt;
      var c = cam.ip(eSine(clamp(cam.t / cam.dur, 0, 1))); rot[0] = -c[0]; rot[1] = -c[1];
      if (cam.t >= cam.dur) cam = null;
      busy = true;
    }
    if (vel) {                                       // 放手後的慣性
      rot[0] += vel[0] * dt; rot[1] = clamp(rot[1] + vel[1] * dt, -80, 80);
      var f = Math.exp(-dt / 350); vel[0] *= f; vel[1] *= f;
      if (Math.hypot(vel[0], vel[1]) < .005) vel = null;
      busy = true;
    }
    if (Z.anim) { updZoom(dt); busy = true; }
    var stp = storyTipOn() ? storyP() : null;
    PTS.forEach(function (p) {
      var tg = (p === hover || p === sel || p === stp) ? 1 : 0;
      if (p.hv !== tg) { p.hv = Math.abs(p.hv - tg) < .01 ? tg : ease(p.hv, tg, dt, 90); busy = true; }
    });
    return busy || !!drag;
  }
  function holdFor(ms) { holdUntil = now() + ms; setTimeout(kick, ms + 30); }

  // ── 國名提示(滑過 / 手機點一下 / 正在講的那一國 / 桌機靜止時方向線指著的那一國)
  function tipTarget() {
    if (Z.on || intro) return null;
    if (hover) return hover;
    if (sel) return sel;
    if (storyTipOn()) return storyP();
    if (tour.done && svg && desk.matches) return ptr.cur;
    return null;
  }
  function placeTip() {
    if (!tipEl) return;
    var p = tipTarget();
    if (!p || p.a < .3 || p.sx < -1e3) { tipEl.classList.remove('on'); return; }
    if (tipEl._p !== p) { tipEl.innerHTML = '<b>' + esc(p.name) + '</b> · <span>' + p.n + '</span> 篇'; tipEl._p = p; }
    var x = p.sx / k, y = p.sy / k, r = p.sr / k + 8, left = x > cssW * .6;
    tipEl.style.transform = 'translate(' + (left ? x - r : x + r).toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + (left ? '-100%' : '0') + ',-50%)';
    tipEl.classList.add('on');
  }
  function summaryHTML() {
    return '從台灣出發 · <b>' + (META.countries || PTS.length) + '</b> 個國家 · <b>' + (META.articles || 0) + '</b> 篇遊記';
  }
  function updateLabel() {
    if (!labelEl) return;
    var h;
    if (Z.on && Z.p) h = '<b>' + esc(Z.p.name) + '</b> · ' + Z.p.n + ' 篇遊記 · ' + (Z.loading ? '載入路線…' : '點編號進那一篇');
    else if (hover) h = '點一下,放大看 <b>' + esc(hover.name) + '</b> 騎過的路線';
    else if (sel) h = '再點一次,放大看 <b>' + esc(sel.name) + '</b> 騎過的路線';
    else h = summaryHTML();
    if (labelEl._h !== h) { labelEl.innerHTML = h; labelEl._h = h; }
  }

  // ── 照片裡的騎士 → 地球上的國家(他 09-24 手畫的方向線;桌機才有)
  var RIDER = { x: .305, y: .36 };                  // 騎士頭盔在原圖的比例位置
  var box = wrap.offsetParent, bgImg = document.querySelector('img[src*="home-bg"]');
  var svg = null, gp = {}, ptr = { cur: null, swapping: false }, L = { ok: false };
  if (box && box !== document.body) {
    var NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg'); svg.id = 'globe-pointer'; svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><linearGradient id="gp-grad" gradientUnits="userSpaceOnUse">'
      + '<stop offset="0" stop-color="#ee7d55" stop-opacity=".85"/><stop offset="1" stop-color="#93c5fd" stop-opacity=".95"/></linearGradient></defs>'
      + '<path id="gp-path" fill="none" stroke="url(#gp-grad)" stroke-width="2" stroke-dasharray="6 7" stroke-linecap="round"/>'
      + '<circle id="gp-a" r="4" fill="#ee7d55"/><circle id="gp-b" r="6" fill="none" stroke="#93c5fd" stroke-width="2"/>';
    box.appendChild(svg);
    ['grad', 'path', 'a', 'b'].forEach(function (id) { gp[id] = svg.querySelector('#gp-' + id); });
  }
  onPhoto = !!(bgImg && box && box.parentElement && box.parentElement.contains(bgImg));
  function measure() {                               // 位置只在尺寸改變時量,捲動不影響相對位置
    if (!svg) return;
    var br = box.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    L.ox = cr.left - br.left; L.oy = cr.top - br.top;
    if (bgImg && bgImg.naturalWidth) {               // 照片是 object-fit:cover,換算裁切後騎士在哪
      var ir = bgImg.getBoundingClientRect(), nw = bgImg.naturalWidth, nh = bgImg.naturalHeight;
      var sc = Math.max(ir.width / nw, ir.height / nh), dw = nw * sc, dh = nh * sc;
      var op = (getComputedStyle(bgImg).objectPosition || '50% 50%').split(' ');
      var px = parseFloat(op[0]) / 100, py = parseFloat(op[1] || op[0]) / 100;
      if (!isFinite(px)) px = .5;
      if (!isFinite(py)) py = .5;
      L.ax = ir.left - br.left + (ir.width - dw) * px + RIDER.x * dw;
      L.ay = ir.top - br.top + (ir.height - dh) * py + RIDER.y * dh;
      L.ok = L.ax > ir.left - br.left + 8 && L.ax < ir.right - br.left - 8;
    } else { L.ax = RIDER.x * br.width; L.ay = RIDER.y * br.height; L.ok = true; }
  }
  function frontMost() {
    var best = null;
    PTS.forEach(function (p) { if (p.a > .6 && (!best || p.z > best.z)) best = p; });
    return best;
  }
  function pointerTarget() {
    if (Z.on || intro) return null;
    return hover || sel || storyP() || (tour.done ? frontMost() : null);
  }
  function pointer() {
    if (!svg) return;
    if (!desk.matches) { ptr.cur = null; svg.style.opacity = 0; return; }
    var want = pointerTarget();
    if (want !== ptr.cur) {                          // 換目標:先淡出、換線、再淡入
      if (!ptr.swapping) {
        ptr.swapping = true; svg.style.opacity = 0;
        setTimeout(function () { ptr.swapping = false; ptr.cur = pointerTarget(); geom(); placeTip(); }, ptr.cur ? 220 : 0);
      }
      return;
    }
    geom();
  }
  function geom() {
    var p = ptr.cur;
    if (!p || p.a < .3 || p.sx < -1e3 || !L.ok || !desk.matches) { svg.style.opacity = 0; return; }
    var bx = L.ox + p.sx / k, by = L.oy + p.sy / k, ax = L.ax, ay = L.ay;
    var mx = (ax + bx) / 2, my = Math.min(ay, by) - 60;          // 往上拱的弧線
    gp.path.setAttribute('d', 'M' + ax.toFixed(1) + ',' + ay.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + bx.toFixed(1) + ',' + by.toFixed(1));
    gp.grad.setAttribute('x1', ax.toFixed(1)); gp.grad.setAttribute('y1', ay.toFixed(1));
    gp.grad.setAttribute('x2', bx.toFixed(1)); gp.grad.setAttribute('y2', by.toFixed(1));
    gp.a.setAttribute('cx', ax.toFixed(1)); gp.a.setAttribute('cy', ay.toFixed(1));
    gp.b.setAttribute('cx', bx.toFixed(1)); gp.b.setAttribute('cy', by.toFixed(1));
    svg.style.opacity = 1;
  }

  // ── 放大地圖
  function loadRoutes() {
    if (!routesP) {
      routesP = (META.routes ? fetch(META.routes).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }) : Promise.resolve({ articles: [] }))
        .then(function (d) { routes = d.articles || []; return routes; }, function () { routes = []; return routes; });
    }
    return routesP;
  }
  function loadDetail() {
    if (!detailP) {
      detailP = fetch(DETAIL_URL).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (topo) {
        // 分小批處理(每批 25 國,中間讓出主執行緒),避免一次卡 100ms 以上
        var geos = topo.objects.countries.geometries, out = [], i = 0;
        return new Promise(function (done) {
          (function chunk() {
            var end = Math.min(geos.length, i + 25);
            topojson.feature(topo, { type: 'GeometryCollection', geometries: geos.slice(i, end) }).features.forEach(function (f) {
              f.c = d3.geoCentroid(f);
              var b = d3.geoBounds(f);
              f.r = b[0][0] > b[1][0] ? PI : Math.max(
                d3.geoDistance(f.c, b[0]), d3.geoDistance(f.c, b[1]),
                d3.geoDistance(f.c, [b[0][0], b[1][1]]), d3.geoDistance(f.c, [b[1][0], b[0][1]]));
              out.push(f);
            });
            i = end;
            if (i < geos.length) setTimeout(chunk, 0); else done(out);
          })();
        });
      }).then(function (fs) {
        detail = fs;
        if (Z.on && Z.p) Z.feat = findFeat(Z.p);
        baseVer++; kick();
      }, function () { /* 載不到就用原本的粗陸地 */ });
    }
    return detailP;
  }
  function prefetch() { loadRoutes(); }
  function prefetchAll() { loadRoutes(); loadDetail(); }   // 滑過 / 點了國家 = 很可能要放大,先把國界載好
  function findFeat(p) {
    if (!detail) return null;
    var ll = [p.lon, p.lat], hit = null;
    detail.forEach(function (f) { if (!hit && d3.geoDistance(f.c, ll) < f.r + .02 && d3.geoContains(f, ll)) hit = f; });
    return hit;
  }
  function midAlong(lines) {                          // 路線長度一半的那一點(標點放這裡)
    var segs = [], total = 0;
    lines.forEach(function (l) {
      var c = l.coordinates;
      for (var i = 1; i < c.length; i++) { var d = d3.geoDistance(c[i - 1], c[i]); segs.push([c[i - 1], c[i], d]); total += d; }
    });
    if (!segs.length) return lines.length ? lines[0].coordinates[0] : null;
    var half = total / 2;
    for (var j = 0; j < segs.length; j++) {
      if (half <= segs[j][2]) return segs[j][2] ? d3.geoInterpolate(segs[j][0], segs[j][1])(half / segs[j][2]) : segs[j][0];
      half -= segs[j][2];
    }
    return segs[segs.length - 1][1];
  }
  function prepZoom(p) {
    var arts = (routes || []).filter(function (a) { return (a.c || []).indexOf(p.name) >= 0; });
    var pts = [];
    arts.forEach(function (a) {
      if (!a.lines) {
        a.lines = (a.tr || []).map(function (sg) {
          var c = [];
          for (var i = 0; i + 1 < sg.p.length; i += 2) c.push([sg.p[i], sg.p[i + 1]]);
          return c;
        }).filter(function (c) { return c.length > 1; }).map(function (c) { return { type: 'LineString', coordinates: c }; });
      }
      if (!a.pin) a.pin = midAlong(a.lines) || [p.lon, p.lat];
      a.lines.forEach(function (l) { for (var i = 0; i < l.coordinates.length; i += 3) pts.push(l.coordinates[i]); });
      pts.push(a.pin);
    });
    if (!pts.length) pts.push([p.lon, p.lat]);
    var b = d3.geoBounds({ type: 'MultiPoint', coordinates: pts });
    var ctr = [(b[0][0] + b[1][0]) / 2 + (b[0][0] > b[1][0] ? 180 : 0), (b[0][1] + b[1][1]) / 2];
    var cmax = 0;
    pts.forEach(function (q) { var d = d3.geoDistance(ctr, q); if (d > cmax) cmax = d; });
    Z.arts = arts; Z.center = ctr;
    Z.mT = clamp(45 * RAD / Math.max(cmax * 1.15, 1.5 * RAD), 2.5, 30);   // 路線落在半徑 45° 的「虛擬球面」內,邊緣還看得到弧度
    Z.ip = d3.geoInterpolate(Z.from, ctr);
    var stp = Z.mT > 16 ? 1 : 2, ext = 90 / Z.mT * 1.4 + stp, ey = Math.min(80, ext), ex = Math.min(179, ext / Math.max(.2, Math.cos(ctr[1] * RAD)));
    Z.grid = d3.geoGraticule().extent([[ctr[0] - ex, clamp(ctr[1] - ey, -89, 89)], [ctr[0] + ex, clamp(ctr[1] + ey, -89, 89)]]).step([stp, stp]).precision(.5)();
    Z.feat = findFeat(p);
    baseVer++;
    buildPins(arts);
  }
  function buildPins(arts) {
    if (!pinsEl) return;
    pinsEl.innerHTML = '';
    Z.pins = arts.map(function (a) {
      var el = document.createElement('a');
      el.className = 'gz-pin'; el.href = a.u; el.title = a.t;
      el.innerHTML = '<span class="n">' + (a.o || '•') + '</span><span class="l">' + esc(a.l) + '<small>' + esc(a.d) + (!a.lines.length ? ' · 沒有軌跡' : a.src === 'photo' ? ' · 照片定位' : '') + '</small></span>';
      function on() { Z.hi = a; kick(); }
      function off() { if (Z.hi === a) { Z.hi = null; kick(); } }
      el.addEventListener('mouseenter', on); el.addEventListener('mouseleave', off);
      el.addEventListener('focus', on); el.addEventListener('blur', off);
      pinsEl.appendChild(el);
      return { a: a, el: el, lab: el.querySelector('.l') };
    });
  }
  function placePins() {
    if (!Z.on || !Z.pins || !Z.pins.length) return;
    var ctr = center(), lim = HALF / m, show = Z.t >= 1 && !Z.anim, list = [];
    Z.pins.forEach(function (q) {
      if (!show || d3.geoDistance(q.a.pin, ctr) > lim * .97) { q.el.className = 'gz-pin'; return; }
      var xy = proj(q.a.pin); q.x = xy[0] / k; q.y = xy[1] / k;
      list.push(q);
    });
    if (!list.length) return;
    // 標籤放哪一邊:右 / 左 / 上 / 下 裡蓋到最少路線、不和別的標籤或點打架、不跑出地球框的那一邊
    var obs = [];
    Z.arts.forEach(function (a) {
      a.lines.forEach(function (l) {
        l.coordinates.forEach(function (c) { if (d3.geoDistance(c, ctr) < lim) { var xy = proj(c); obs.push(xy[0] / k, xy[1] / k); } });
      });
    });
    var placed = [];
    list.sort(function (a, b) { return a.y - b.y; });
    list.forEach(function (q) {
      var w = q.w || (q.w = q.lab.offsetWidth), h = q.h || (q.h = q.lab.offsetHeight), best = null, bs = 1e9;
      [['r', q.x + 16, q.y - h / 2], ['l', q.x - 16 - w, q.y - h / 2], ['t', q.x - w / 2, q.y - 16 - h], ['b', q.x - w / 2, q.y + 16]].forEach(function (c, ci) {
        var x0 = c[1], y0 = c[2], x1 = x0 + w, y1 = y0 + h, sc = ci * .5;   // 同分時:右 > 左 > 上 > 下
        for (var i = 0; i < obs.length; i += 2) if (obs[i] > x0 - 4 && obs[i] < x1 + 4 && obs[i + 1] > y0 - 4 && obs[i + 1] < y1 + 4) sc += 1;
        placed.forEach(function (b) { if (x0 < b[2] + 4 && x1 > b[0] - 4 && y0 < b[3] + 4 && y1 > b[1] - 4) sc += 1000; });
        list.forEach(function (o) { if (o !== q && o.x + 13 > x0 && o.x - 13 < x1 && o.y + 13 > y0 && o.y - 13 < y1) sc += 500; });
        if (x0 < -6 || x1 > cssW + 6 || y0 < -6 || y1 > cssW + 6) sc += 200;
        if (sc < bs) { bs = sc; best = c; }
      });
      placed.push([best[1], best[2], best[1] + w, best[2] + h]);
      q.el.className = 'gz-pin on pos-' + best[0];
      q.el.style.transform = 'translate(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px)';
    });
  }
  function enterZoom(p) {
    if (Z.on || !p) return;
    endIntro();
    clearTimeout(selTimer);
    sel = null; hover = null; vel = null; cam = null;
    Z = { on: true, p: p, t: 0, dir: 1, anim: false, show: 0, from: center(), hi: null, feat: null, pins: [], loading: true, arts: null, mT: 1, ip: null, grid: null };
    wrap.classList.add('is-zoom');
    if (backEl) backEl.hidden = false;
    cv.style.cursor = 'grab';
    updateLabel();
    loadDetail();
    function go() {
      if (!Z.on || Z.p !== p) return;
      prepZoom(p); Z.loading = false; updateLabel();
      if (reduce) { Z.t = 1; applyZoom(); finishEnter(); } else Z.anim = true;
      kick();
    }
    loadRoutes().then(go, go);
    kick();
  }
  function applyZoom() {
    var t = Z.t, eR = eCubic(clamp(t / .7, 0, 1)), eZ = eCubic(clamp((t - .2) / .8, 0, 1));
    var c = Z.ip(eR);
    rot[0] = -c[0]; rot[1] = -c[1];
    m = Math.exp(Math.log(Z.mT) * eZ);
    Z.show = smooth(.85, 1, t);
  }
  function updZoom(dt) {
    Z.t = clamp(Z.t + Z.dir * dt / ZDUR, 0, 1);
    applyZoom();
    if (Z.dir > 0 && Z.t >= 1) finishEnter();
    else if (Z.dir < 0 && Z.t <= 0) finishExit();
  }
  function finishEnter() { Z.anim = false; Z.t = 1; }
  function exitZoom() {
    if (!Z.on || (Z.anim && Z.dir < 0)) return;
    if (Z.t >= 1 && Z.ip) { Z.ip = d3.geoInterpolate(Z.from, center()); Z.mT = m; }   // 放大後拖過,就從現在的位置縮回去
    if (!Z.ip) { finishExit(); return; }
    Z.dir = -1; Z.anim = true; Z.hi = null;
    if (Z.pins) Z.pins.forEach(function (q) { q.el.className = 'gz-pin'; });
    if (backEl) backEl.hidden = true;
    if (reduce) { Z.t = 0; applyZoom(); finishExit(); }
    kick();
  }
  function finishExit() {
    var from = Z.from;
    Z = { on: false, t: 0, anim: false, show: 0 };
    m = 1;
    if (from) { rot[0] = -from[0]; rot[1] = -from[1]; }
    wrap.classList.remove('is-zoom');
    if (backEl) backEl.hidden = true;
    if (pinsEl) pinsEl.innerHTML = '';
    cv.style.cursor = 'grab';
    baseVer++;
    updateLabel();
    holdFor(800);
    kick();
  }

  // ── 滑鼠 / 觸控
  function pick(ev) {
    var r = cv.getBoundingClientRect(), sc = W / r.width;
    var x = (ev.clientX - r.left) * sc, y = (ev.clientY - r.top) * sc;
    var best = null, bd = (ev.pointerType === 'mouse' ? 14 : 22) * sc;
    PTS.forEach(function (p) {
      if (p.a > .3) { var d = Math.hypot(x - p.sx, y - p.sy) - p.sr * .5; if (d < bd) { bd = d; best = p; } }
    });
    return best;
  }
  function setHover(p) {
    if (p === hover) return;
    hover = p;
    cv.style.cursor = p ? 'pointer' : 'grab';
    if (p) prefetchAll(); else holdFor(600);
    updateLabel(); kick();
  }
  function select(p, turn) {
    sel = p; selT = now(); prefetchAll();
    clearTimeout(selTimer);
    selTimer = setTimeout(function () { if (sel === p) deselect(); }, 4000);
    var d = d3.geoDistance([p.lon, p.lat], center());
    if (turn && d > 20 * RAD) camTo(d3.geoInterpolate([p.lon, p.lat], center())(20 * RAD / d), 700);
    updateLabel(); kick();
  }
  function deselect() {
    if (!sel) return;
    sel = null; clearTimeout(selTimer); holdFor(1500);
    updateLabel(); kick();
  }
  function camTo(to, dur) {
    cam = { ip: d3.geoInterpolate(center(), to), t: 0, dur: reduce ? 1 : dur };
    if (!tour.done) tour.moved = true;
    kick();
  }
  function tap(ev) {
    if (Z.on) return;
    var p = pick(ev);
    if (ev.pointerType === 'mouse') { if (p) enterZoom(p); return; }
    if (!p) { deselect(); return; }
    if (sel === p && now() - selT < 4000) { enterZoom(p); return; }   // 手機:第二下才放大
    select(p, true);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    endIntro();
    down = { x: e.clientX, y: e.clientY, t: now(), id: e.pointerId };
    vel = null;
  });
  cv.addEventListener('pointermove', function (e) {
    if (down && !drag && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      drag = { x: e.clientX, y: e.clientY, t: now(), v: [0, 0] };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 已放開 */ }
      cv.style.cursor = 'grabbing'; hover = null; updateLabel();
      if (!tour.done) tour.moved = true;
      kick();
    }
    if (drag) {
      var t = now(), dt = Math.max(1, t - drag.t), per = DEG / (R / k) / m;   // 每 CSS px 轉幾度:手指下的地面跟著手走
      var dx = (e.clientX - drag.x) * per, dy = (e.clientY - drag.y) * per;
      rot[0] += dx; rot[1] = clamp(rot[1] - dy, -80, 80);
      drag.v = [.8 * drag.v[0] + .2 * dx / dt, .8 * drag.v[1] - .2 * dy / dt];
      drag.x = e.clientX; drag.y = e.clientY; drag.t = t;
      kick();
      return;
    }
    if (e.pointerType === 'mouse' && !Z.on) setHover(pick(e));
  });
  function up(e) {
    if (drag) {
      var v = drag.v, sp = Math.hypot(v[0], v[1]), cap = .24;
      if (sp > cap) v = [v[0] * cap / sp, v[1] * cap / sp];
      vel = !reduce && sp > .005 && now() - drag.t < 80 ? v : null;
      drag = null; cv.style.cursor = 'grab';
      holdFor(2500);
      kick();
    } else if (down && e.type === 'pointerup' && now() - down.t < 500) tap(e);
    down = null;
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !drag) setHover(null); });
  cv.addEventListener('wheel', function () { endIntro(); }, { passive: true });
  if (backEl) backEl.addEventListener('click', exitZoom);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && Z.on) exitZoom(); });
  // 鍵盤:隱藏清單裡某一國的文章連結拿到焦點 → 地球上選中那一國
  Array.prototype.forEach.call(wrap.querySelectorAll('.sr-only li[data-i]'), function (li) {
    var p = PTS[+li.getAttribute('data-i')];
    if (!p) return;
    Array.prototype.forEach.call(li.querySelectorAll('a'), function (a) {
      a.addEventListener('focus', function () { if (!Z.on) select(p, true); });
      a.addEventListener('blur', function () { if (sel === p) deselect(); });
    });
  });

  // ── 啟動
  function pickPalette() {
    var dark = onPhoto || document.documentElement.classList.contains('dark');
    return dark ? PAL.dark : PAL.light;
  }
  function themeChanged() {
    var c = pickPalette();
    if (c === C) return;
    C = c; buildLayers(); buildSprites(); baseVer++; kick();
  }
  C = pickPalette();
  if (!resize()) { W = 640; k = 1; u = 1; R = 280; cx = cy = 320; buildLayers(); buildSprites(); }
  buildTour();
  var firstVisit = true;
  try { firstVisit = !sessionStorage.getItem('globeIntro'); } catch (e) { firstVisit = true; }
  if (reduce) restPose();
  else if (firstVisit) startIntro();
  else { var s0 = tour.steps.length ? tour.steps[0].to : HOME; rot = [-s0[0], -s0[1]]; }
  cv.style.opacity = 0;
  updateLabel();

  fetch(META.land || '/data/land-110m.json')
    .then(function (r) { return r.json(); })
    .then(function (topo) { land = topojson.feature(topo, topo.objects.land); })
    .catch(function () { /* 沒有陸地也照樣畫海和航線 */ })
    .then(function () {
      ready = true; baseVer++;
      cv.style.transition = 'opacity .6s cubic-bezier(.2,.7,.2,1)';
      requestAnimationFrame(function () { cv.style.opacity = 1; });
      draw();
      kick();
    });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: .1 }).observe(stage);
  } else visible = true;
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (Math.abs(cv.getBoundingClientRect().width - cssW) > .5) { if (resize()) { draw(); kick(); } }
      else measure();
    }).observe(stage);
    if (box && box !== document.body) new ResizeObserver(function () { measure(); if (ready) draw(); }).observe(box);
  }
  window.addEventListener('resize', function () { measure(); });
  if (bgImg && !bgImg.complete) bgImg.addEventListener('load', function () { measure(); if (ready) draw(); });
  onMq(desk, function () { measure(); if (ready) draw(); });
  onMq(reduceMq, function (e) { reduce = e.matches; if (reduce) { restPose(); cam = null; vel = null; } kick(); });
  if (window.MutationObserver) new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if ('requestIdleCallback' in window) requestIdleCallback(function () { setTimeout(prefetch, 4000); });
})();
