/* 首頁地球儀:輕量 canvas 版(d3-geo),自轉+可拖曳;離開畫面或分頁隱藏就停,不吃資源 */
(function () {
  var cv = document.getElementById('globe'); if (!cv || !window.d3) return;
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pts = window.GLOBE_POINTS || [];
  var proj = d3.geoOrthographic().scale(W / 2 - 14).translate([W / 2, H / 2]).clipAngle(90);
  var path = d3.geoPath(proj, ctx);
  var land = null, rot = [-10, -18], spin = true, raf = null, hover = null, dash = 0;
  var css = getComputedStyle(document.documentElement);
  var dark = matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark');
  var C = dark
    ? { sea: '#16233a', land: '#33507a', edge: '#4b6ea8', grid: 'rgba(255,255,255,.07)', dot: '#93c5fd', dotEdge: '#0b1220', text: '#e5e7eb', arc: 'rgba(147,197,253,.45)', arcOn: '#bfdbfe', home: '#fbbf24' }
    : { sea: '#e6eefc', land: '#9fc0ea', edge: '#6f9ad4', grid: 'rgba(0,0,0,.06)', dot: '#1d4ed8', dotEdge: '#fff', text: '#1f2937', arc: 'rgba(29,78,216,.35)', arcOn: '#1d4ed8', home: '#d97706' };
  var graticule = d3.geoGraticule10();
  var HOME = [121.0, 23.7];   // 台灣
  var arcs = pts.map(function (p) { return { type: 'LineString', coordinates: [HOME, [p.lon, p.lat]], p: p }; });

  
  fetch('/data/land-110m.json')
    .then(function (r) { return r.json(); })
    .then(function (topo) { land = topojson.feature(topo, topo.objects.land); draw(); });

  function draw() {
    proj.rotate(rot);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = C.sea; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke();
    if (land) { ctx.beginPath(); path(land); ctx.fillStyle = C.land; ctx.fill(); ctx.strokeStyle = C.edge; ctx.lineWidth = .8; ctx.stroke(); }
    // 從台灣拉到每個國家的航線
    ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -dash;
    arcs.forEach(function (a) {
      ctx.beginPath(); path(a);
      ctx.strokeStyle = (hover === a.p) ? C.arcOn : C.arc; ctx.lineWidth = (hover === a.p) ? 2.4 : 1.4; ctx.stroke();
    });
    ctx.restore();
    // 台灣:起點
    var hc = proj(HOME);
    if (hc && d3.geoDistance(HOME, [-rot[0], -rot[1]]) <= Math.PI / 2) {
      ctx.beginPath(); ctx.arc(hc[0], hc[1], 7, 0, 6.2832); ctx.fillStyle = C.home; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.dotEdge; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('台灣', hc[0], hc[1] - 13);
    }
    pts.forEach(function (p) {
      var c = proj([p.lon, p.lat]); if (!c) return;
      var g = d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]); if (g > Math.PI / 2) return;  // 背面不畫
      var r = 10 + Math.min(p.n, 8) * 1.6, on = hover === p;
      ctx.beginPath(); ctx.arc(c[0], c[1], on ? r + 3 : r, 0, 6.2832);
      ctx.fillStyle = C.dot; ctx.globalAlpha = on ? 1 : .9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.strokeStyle = C.dotEdge; ctx.stroke();
      ctx.fillStyle = C.dotEdge; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.n), c[0], c[1] + .5);
    });
    pointer();
  }

  // ── 方向線:照片裡的人 → 地球上正對著的國家(他 09-24 手畫的箭頭)
  var RIDER = { x: .305, y: .36 };   // 首頁大圖裁切後,人的頭盔位置(比例)
  var host = document.getElementById('globe-wrap');
  var box = host && host.offsetParent;           // 橫幅內容區(position:relative)
  var svg = null, pathEl = null, dotA = null, dotB = null, tag = null;
  if (box) {
    var NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg'); svg.id = 'globe-pointer';
    svg.innerHTML = '<defs><linearGradient id="gp-grad" x1="0" y1="0" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#ffffff" stop-opacity=".25"/><stop offset="1" stop-color="#fbbf24" stop-opacity=".95"/></linearGradient></defs>'
      + '<path id="gp-path" fill="none" stroke="url(#gp-grad)" stroke-width="2" stroke-dasharray="6 7" stroke-linecap="round"/>'
      + '<circle id="gp-a" r="4" fill="#fff" fill-opacity=".85"/><circle id="gp-b" r="6" fill="none" stroke="#fbbf24" stroke-width="2"/>'
      + '<text id="gp-tag" font-size="13" font-weight="700" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px"></text>';
    box.appendChild(svg);
    pathEl = svg.querySelector('#gp-path'); dotA = svg.querySelector('#gp-a'); dotB = svg.querySelector('#gp-b'); tag = svg.querySelector('#gp-tag');
  }
  var bgImg = document.querySelector('img[src*="home-bg"]');
  function frontMost() {
    if (hover) return hover;
    var best = null, bd = 9;
    pts.forEach(function (p) { var d = d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]); if (d < bd) { bd = d; best = p; } });
    return bd < 1.2 ? best : null;
  }
  function pointer() {
    if (!svg || getComputedStyle(svg).display === 'none') return;
    var p = frontMost();
    if (!p) { pathEl.setAttribute('d', ''); dotA.setAttribute('r', 0); dotB.setAttribute('r', 0); tag.textContent = ''; return; }
    var br = box.getBoundingClientRect(), cr = cv.getBoundingClientRect(), s = cr.width / W;
    var c = proj([p.lon, p.lat]); if (!c) return;
    var bx = cr.left - br.left + c[0] * s, by = cr.top - br.top + c[1] * s;
    var ir = (bgImg || box).getBoundingClientRect();
    var ax = ir.left - br.left + RIDER.x * ir.width, ay = ir.top - br.top + RIDER.y * ir.height;
    var mx = (ax + bx) / 2, my = Math.min(ay, by) - 60;          // 往上拱的弧線
    pathEl.setAttribute('d', 'M' + ax + ',' + ay + ' Q' + mx + ',' + my + ' ' + bx + ',' + by);
    pathEl.setAttribute('stroke-dashoffset', -dash * 1.2);
    dotA.setAttribute('cx', ax); dotA.setAttribute('cy', ay); dotA.setAttribute('r', 4);
    dotB.setAttribute('cx', bx); dotB.setAttribute('cy', by); dotB.setAttribute('r', 6 + Math.sin(dash / 12 * 6.2832) * 1.5);
    tag.setAttribute('x', bx - 8); tag.setAttribute('y', by - 14); tag.setAttribute('text-anchor', 'end');
    tag.textContent = p.name + ' · ' + p.n + ' 篇';
  }

  function tick() { dash = (dash + .35) % 12; if (spin) rot[0] += .18; draw(); raf = requestAnimationFrame(tick); }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  // 只有在畫面裡、分頁可見、使用者沒關動畫時才轉
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: .1 }).observe(cv);
  } else { draw(); }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

  // 拖曳轉動
  var drag = null;
  cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, r: rot.slice() }; spin = false; cv.style.cursor = 'grabbing'; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', function () { drag = null; cv.style.cursor = 'grab'; setTimeout(function () { spin = true; }, 1200); });
  cv.addEventListener('pointermove', function (e) {
    var rect = cv.getBoundingClientRect(), s = W / rect.width;
    if (drag) { rot[0] = drag.r[0] + (e.clientX - drag.x) * .4; rot[1] = Math.max(-80, Math.min(80, drag.r[1] - (e.clientY - drag.y) * .4)); draw(); return; }
    var mx = (e.clientX - rect.left) * s, my = (e.clientY - rect.top) * s, found = null;
    pts.forEach(function (p) {
      var c = proj([p.lon, p.lat]); if (!c) return;
      if (d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]) > Math.PI / 2) return;
      if (Math.hypot(mx - c[0], my - c[1]) < 22) found = p;
    });
    if (found !== hover) {
      hover = found; cv.style.cursor = found ? 'pointer' : 'grab';
      document.getElementById('globe-label').textContent = found ? found.name + ' · ' + found.n + ' 篇' : '';
      spin = !found; draw();
    }
  });
  cv.addEventListener('click', function () { if (hover) location.href = hover.url; });
  cv.addEventListener('pointerleave', function () { hover = null; spin = true; document.getElementById('globe-label').textContent = ''; });
})();
