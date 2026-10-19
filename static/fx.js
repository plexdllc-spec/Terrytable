(function () {
  var cv = document.getElementById('bgfx');
  if (!cv || !cv.getContext) return;
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) { cv.style.display = 'none'; return; }
  var cx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, phone = false, run = true, last = 0, off = 0;
  var pulses = [], dots = [];
  function size() {
    phone = window.innerWidth < 700;
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (var i = 0; i < (phone ? 26 : 60); i++) dots.push({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.012, r: 0.6 + Math.random() * 1.4, p: Math.random() * 6.3 });
  }
  var RAYS = 14;
  function frame(ts) {
    if (!run) return;
    requestAnimationFrame(frame);
    if (phone && ts - last < 33) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    off = (off + dt * 0.22) % 1;
    cx.clearRect(0, 0, W, H);
    var hy = H * 0.52, vx = W / 2, floor = H - hy;
    // horizon glow
    var g = cx.createLinearGradient(0, hy - 90, 0, hy + 40);
    g.addColorStop(0, 'rgba(242,182,50,0)'); g.addColorStop(0.7, 'rgba(242,182,50,0.07)'); g.addColorStop(1, 'rgba(155,28,63,0)');
    cx.fillStyle = g; cx.fillRect(0, hy - 90, W, 130);
    // receding lines, spacing grows toward the viewer
    cx.lineWidth = 1;
    for (var i = 0; i < 16; i++) {
      var t = (i + off) / 16, y = hy + floor * t * t;
      cx.strokeStyle = 'rgba(214,52,98,' + (0.05 + 0.2 * t).toFixed(3) + ')';
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
    }
    // rays fanning out from the vanishing point
    var spread = W * 1.6;
    for (var k = -RAYS; k <= RAYS; k++) {
      var bx = vx + k * (spread / RAYS / 2);
      cx.strokeStyle = 'rgba(214,52,98,' + (k % 4 === 0 ? 0.2 : 0.11) + ')';
      cx.beginPath(); cx.moveTo(vx + k * 4, hy); cx.lineTo(bx, H); cx.stroke();
    }
    cx.strokeStyle = 'rgba(242,182,50,0.35)';
    cx.beginPath(); cx.moveTo(0, hy); cx.lineTo(W, hy); cx.stroke();
    // light pulses racing down the rays
    if (Math.random() < dt * (phone ? 0.7 : 1.3)) pulses.push({ k: Math.round((Math.random() * 2 - 1) * RAYS), t: 0, v: 0.35 + Math.random() * 0.35 });
    pulses = pulses.filter(function (p) {
      p.t += p.v * dt; if (p.t >= 1) return false;
      var bx = vx + p.k * (spread / RAYS / 2), x0 = vx + p.k * 4;
      var f0 = Math.pow(p.t, 1.7), f1 = Math.pow(Math.max(0, p.t - 0.09), 1.7);
      cx.strokeStyle = 'rgba(242,182,50,' + (0.75 * (1 - p.t * 0.5)).toFixed(3) + ')'; cx.lineWidth = 1 + 2 * p.t; cx.lineCap = 'round';
      cx.beginPath();
      cx.moveTo(x0 + (bx - x0) * f1, hy + floor * f1); cx.lineTo(x0 + (bx - x0) * f0, hy + floor * f0); cx.stroke();
      return true;
    });
    // drifting data motes
    dots.forEach(function (d) {
      d.y -= d.v * dt; d.p += dt * 2; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      cx.fillStyle = 'rgba(242,182,50,' + (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(d.p))).toFixed(3) + ')';
      cx.beginPath(); cx.arc(d.x * W, d.y * H, d.r, 0, 6.3); cx.fill();
    });
  }
  size();
  window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) run = false; else if (!run) { run = true; last = performance.now(); requestAnimationFrame(frame); }
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (mq.matches) { run = false; cv.style.display = 'none'; } });
  requestAnimationFrame(frame);
})();
