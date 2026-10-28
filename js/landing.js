// Nav shadow on scroll
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 30), { passive: true });

// Scroll reveal
const io = new IntersectionObserver((es) => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.15 });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

// Counters
const cio = new IntersectionObserver((es) => es.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target, to = +el.dataset.to, suf = el.dataset.suffix || '';
  const t0 = performance.now(), dur = 1400;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suf;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  cio.unobserve(el);
}), { threshold: 0.4 });
document.querySelectorAll('.count').forEach(el => cio.observe(el));

// Hero ring + live-feeling number
const ring = document.getElementById('heroRing');
const pct = document.getElementById('heroPct');
const C = 540.35;
let target = 95;
function setRing(v) {
  ring.style.strokeDashoffset = C * (1 - v / 100);
  pct.textContent = Math.round(v) + '%';
}
setTimeout(() => setRing(target), 400);
setInterval(() => {
  target = 93 + Math.round(Math.random() * 4);
  setRing(target);
}, 3500);

// Snow / particle background
const cv = document.getElementById('bg-canvas');
const ctx = cv.getContext('2d');
let W, H, P = [];
function resize() {
  W = cv.width = innerWidth; H = cv.height = innerHeight;
  P = Array.from({ length: Math.min(90, Math.floor(W / 16)) }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 2 + .5, v: Math.random() * .5 + .15, d: Math.random() * Math.PI * 2
  }));
}
resize(); addEventListener('resize', resize);
let mx = 0;
addEventListener('mousemove', e => mx = (e.clientX / W - .5) * 30);
(function loop() {
  ctx.clearRect(0, 0, W, H);
  for (const p of P) {
    p.y += p.v; p.d += .01; p.x += Math.sin(p.d) * .35 + mx * .01;
    if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
    ctx.fillStyle = `rgba(160,225,255,${.25 + p.r / 5})`; ctx.fill();
  }
  // faint connecting lines
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = dx * dx + dy * dy;
    if (d < 9000) { ctx.strokeStyle = `rgba(34,211,238,${.08 * (1 - d / 9000)})`; ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
  }
  requestAnimationFrame(loop);
})();
