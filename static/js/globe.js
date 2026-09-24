/* 首頁地球儀:輕量 canvas 版(d3-geo),自轉+可拖曳;離開畫面或分頁隱藏就停,不吃資源 */
(function () {
  var cv = document.getElementById('globe'); if (!cv || !window.d3) return;
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pts = window.GLOBE_POINTS || [];
  var proj = d3.geoOrthographic().scale(W / 2 - 14).translate([W / 2, H / 2]).clipAngle(90);
  var path = d3.geoPath(proj, ctx);
  var land = null, rot = [-10, -18], spin = true, raf = null, hover = null;
  var css = getComputedStyle(document.documentElement);
  var dark = matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark');
  var C = dark
    ? { sea: '#16233a', land: '#33507a', edge: '#4b6ea8', grid: 'rgba(255,255,255,.07)', dot: '#93c5fd', dotEdge: '#0b1220', text: '#e5e7eb' }
    : { sea: '#e6eefc', land: '#9fc0ea', edge: '#6f9ad4', grid: 'rgba(0,0,0,.06)', dot: '#1d4ed8', dotEdge: '#fff', text: '#1f2937' };
  var graticule = d3.geoGraticule10();

  
  fetch('/data/land-110m.json')
    .then(function (r) { return r.json(); })
    .then(function (topo) { land = topojson.feature(topo, topo.objects.land); draw(); });

  function draw() {
    proj.rotate(rot);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = C.sea; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke();
    if (land) { ctx.beginPath(); path(land); ctx.fillStyle = C.land; ctx.fill(); ctx.strokeStyle = C.edge; ctx.lineWidth = .8; ctx.stroke(); }
    pts.forEach(function (p) {
      var c = proj([p.lon, p.lat]); if (!c) return;
      var g = d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]); if (g > Math.PI / 2) return;  // 背面不畫
      var r = 5 + Math.min(p.n, 8) * 1.1, on = hover === p;
      ctx.beginPath(); ctx.arc(c[0], c[1], on ? r + 3 : r, 0, 6.2832);
      ctx.fillStyle = C.dot; ctx.globalAlpha = on ? 1 : .9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5; ctx.strokeStyle = C.dotEdge; ctx.stroke();
      ctx.fillStyle = C.dotEdge; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.n), c[0], c[1] + .5);
    });
  }
  function tick() { if (spin) { rot[0] += .18; draw(); } raf = requestAnimationFrame(tick); }
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
      if (Math.hypot(mx - c[0], my - c[1]) < 16) found = p;
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
