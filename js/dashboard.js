import { firebaseConfig, COLLECTION } from './firebase-config.js';
import { CFG, newState, step, COLORS } from './risk.js';

const $ = (id) => document.getElementById(id);
const WINDOW = 120;
const configured = !String(firebaseConfig.apiKey).startsWith('YOUR');
let records = [];
let mode = 'demo';
let lastDecision = null;

/* ---------- Chart setup ---------- */
Chart.defaults.color = '#8aa0c2';
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
const base = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(5,10,20,.95)', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, padding: 10 } },
  scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.05)' } } },
  ...extra
});
const grad = (ctx, c1, c2) => {
  const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
};
const line = (label, color, fill, extra = {}) => ({
  label, data: [], borderColor: color, borderWidth: 2.2, pointRadius: 0, tension: .35, fill: !!fill,
  backgroundColor: (c) => fill ? grad(c.chart.ctx, color + '66', color + '00') : undefined, ...extra
});
const dash = (label, v, color) => ({ label, data: [], borderColor: color, borderDash: [6, 6], borderWidth: 1.2, pointRadius: 0, fill: false, _v: v });

const chTemp = new Chart($('chTemp'), { type: 'line', data: { labels: [], datasets: [
  line('Temp °C', '#22d3ee', true), dash('Max', CFG.TMAX, '#f87171aa'), dash('Min', CFG.TMIN, '#60a5faaa')] }, options: base() });
const chHum = new Chart($('chHum'), { type: 'line', data: { labels: [], datasets: [line('Humidity %', '#3b82f6', true)] }, options: base() });
const chRisk = new Chart($('chRisk'), { type: 'line', data: { labels: [], datasets: [line('Risk', '#f59e0b', true)] }, options: base() });
const chInt = new Chart($('chInt'), { type: 'line', data: { labels: [], datasets: [line('Interval s', '#8b5cf6', true, { stepped: true, tension: 0 })] },
  options: base({ scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { min: 0, suggestedMax: 35, grid: { color: 'rgba(255,255,255,.05)' } } } }) });
const chShock = new Chart($('chShock'), { type: 'bar', data: { labels: [], datasets: [{ label: 'g', data: [], backgroundColor: [], borderRadius: 4 }] },
  options: base({ scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { min: 0, suggestedMax: 3, grid: { color: 'rgba(255,255,255,.05)' } } } }) });

/* ---------- Rendering ---------- */
const fmtT = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const C = 540.35;

function render() {
  const r = records.slice(-WINDOW);
  if (!r.length) return;
  const last = r[r.length - 1];
  const labels = r.map(x => fmtT(x.t));

  chTemp.data.labels = labels;
  chTemp.data.datasets[0].data = r.map(x => x.temp);
  chTemp.data.datasets[1].data = r.map(() => CFG.TMAX);
  chTemp.data.datasets[2].data = r.map(() => CFG.TMIN);
  chTemp.update('none');
  chHum.data.labels = labels; chHum.data.datasets[0].data = r.map(x => x.hum); chHum.update('none');
  chRisk.data.labels = labels; chRisk.data.datasets[0].data = r.map(x => +x.risk.toFixed(2)); chRisk.update('none');
  chInt.data.labels = labels; chInt.data.datasets[0].data = r.map(x => x.interval); chInt.update('none');
  chShock.data.labels = labels; chShock.data.datasets[0].data = r.map(x => x.shock);
  chShock.data.datasets[0].backgroundColor = r.map(x => x.shock > CFG.SHOCK_G ? '#f87171' : '#3b82f666'); chShock.update('none');

  const dc = COLORS[last.decision] || '#22d3ee', lc = COLORS[last.level] || '#34d399';
  $('kTemp').textContent = last.temp.toFixed(1) + ' °C';
  const out = last.temp > CFG.TMAX || last.temp < CFG.TMIN;
  $('kTemp').style.color = out ? '#f87171' : '#e8f1ff';
  $('kTempS').textContent = out ? 'OUT OF SAFE BAND' : 'within safe band';
  $('kHum').textContent = Math.round(last.hum) + ' %';
  $('kCond').textContent = Math.round(last.cond) + ' %'; $('kCond').style.color = dc;
  $('kLvl').textContent = last.level.toUpperCase(); $('kLvl').style.color = lc;
  $('kRisk').textContent = 'cumulative risk ' + last.risk.toFixed(1);
  $('kInt').textContent = last.interval + ' s';
  const avg = r.reduce((a, x) => a + x.interval, 0) / r.length;
  $('kSave').textContent = Math.max(0, Math.round((1 - 3 / avg) * 100)) + '% fewer samples vs fixed 3 s';
  $('kDec').textContent = last.decision; $('kDec').style.color = dc;
  $('kCool').textContent = last.cooling ? '❄ Peltier cooling ON' : 'Peltier cooling idle';

  $('ringV').style.strokeDashoffset = C * (1 - last.cond / 100);
  $('ringV').style.stroke = dc; $('ringT').textContent = Math.round(last.cond) + '%'; $('ringT').style.color = dc;

  // derived stats
  let exc = 0, shocks = 0, outSec = 0, peak = -99, prevOut = false;
  r.forEach((x, i) => {
    const o = x.temp > CFG.TMAX || x.temp < CFG.TMIN;
    if (o && !prevOut) exc++;
    if (o) outSec += i ? Math.max(0, (x.t - r[i - 1].t) / 1000) : 0;
    prevOut = o;
    if (x.shock > CFG.SHOCK_G) shocks++;
    peak = Math.max(peak, x.temp);
  });
  $('mExc').textContent = exc; $('mShock').textContent = shocks;
  $('mOut').textContent = outSec >= 60 ? (outSec / 60).toFixed(1) + ' min' : Math.round(outSec) + ' s';
  $('mPeak').textContent = peak.toFixed(1) + ' °C';
  $('lastSeen').textContent = 'last update ' + fmtT(last.t);

  buildLog(r);
  if (lastDecision && lastDecision !== last.decision && ['INSPECTION REQUIRED', 'HIGH RISK'].includes(last.decision)) toast('⚠ ' + last.decision + ' — condition ' + Math.round(last.cond) + '%');
  lastDecision = last.decision;
}

function buildLog(r) {
  const ev = []; let pd = null, po = false;
  r.forEach((x, i) => {
    const o = x.temp > CFG.TMAX || x.temp < CFG.TMIN;
    if (o && !po) ev.push([x, 'Temperature excursion started']);
    if (!o && po) ev.push([x, 'Temperature back in range']);
    if (x.shock > CFG.SHOCK_G) ev.push([x, 'Shock detected (' + x.shock.toFixed(1) + ' g)']);
    if (pd && pd !== x.decision) ev.push([x, 'Decision → ' + x.decision]);
    po = o; pd = x.decision;
  });
  $('log').innerHTML = ev.slice(-25).reverse().map(([x, t]) => {
    const c = COLORS[x.decision];
    return `<tr><td class="mono">${fmtT(x.t)}</td><td>${t}</td><td>${x.temp.toFixed(1)} °C</td><td>${Math.round(x.cond)}%</td><td><span class="tag" style="background:${c}22;color:${c}">${x.decision}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--mute)">No events yet — all conditions nominal.</td></tr>';
}

function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000); }
function setStatus(live) {
  $('status').className = 'status ' + (live ? 'live' : 'demo');
  $('statusTxt').textContent = live ? 'Live · Firebase' : 'Demo mode · simulated data';
  $('simControls').style.display = live ? 'none' : 'flex';
}

/* ---------- Demo simulator ---------- */
const sim = { t: Date.now() - WINDOW * 20000, temp: 5, cooling: true, fault: false, shockPending: 0, rs: newState(), timer: null };
function simReset() { Object.assign(sim, { t: Date.now() - 30 * 20000, temp: 5, cooling: true, fault: false, shockPending: 0, rs: newState() }); records = []; lastDecision = null; for (let i = 0; i < 30; i++) simTick(); }
function simTick() {
  const dt = 20;
  sim.t += dt * 1000;
  if (!sim.fault) { if (sim.temp > 6.5) sim.cooling = true; else if (sim.temp < 3.5) sim.cooling = false; } else sim.cooling = false;
  sim.temp += 0.0008 * (30 - sim.temp) * dt - (sim.cooling ? 0.03 * dt : 0) + (Math.random() - .5) * 0.15;
  sim.temp = Math.max(-2, sim.temp);
  let shock = 0.95 + Math.random() * 0.15;
  if (sim.shockPending > 0) { shock = 2.2 + Math.random() * 1.6; sim.shockPending--; }
  const res = step(sim.rs, sim.temp, shock, dt);
  const hum = 52 + (sim.temp - 5) * 0.8 + (Math.random() - .5) * 3;
  records.push({ t: sim.t, temp: +sim.temp.toFixed(2), hum: +hum.toFixed(1), shock: +shock.toFixed(2), risk: sim.rs.risk,
    cond: res.cond, level: res.level, interval: res.interval, decision: res.decision, cooling: sim.cooling });
  if (records.length > 400) records.shift();
}
function startDemo() {
  mode = 'demo'; setStatus(false); simReset(); render();
  clearInterval(sim.timer);
  sim.timer = setInterval(() => { simTick(); render(); }, 1000);
}
$('bHeat').onclick = () => { sim.fault = true; toast('Cooling fault injected — watch the temperature climb'); };
$('bFix').onclick = () => { sim.fault = false; };
$('bShock').onclick = () => { sim.shockPending = 2; };
$('bReset').onclick = () => { simReset(); render(); };

/* ---------- Live Firebase mode ---------- */
async function startLive() {
  try {
    const V = '10.14.1';
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const { getFirestore, collection, query, orderBy, limit, onSnapshot } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const db = getFirestore(initializeApp(firebaseConfig));
    const q = query(collection(db, COLLECTION), orderBy('t', 'desc'), limit(WINDOW));
    mode = 'live'; clearInterval(sim.timer); setStatus(true);
    onSnapshot(q, (snap) => {
      records = snap.docs.map(d => d.data()).reverse().map(x => ({
        t: Number(x.t), temp: +x.temp, hum: +x.hum, shock: +(x.shock ?? 1), risk: +(x.risk ?? 0), cond: +x.cond,
        level: x.level || 'low', interval: +(x.interval ?? 30), decision: x.decision || 'CONTINUE', cooling: !!x.cooling }));
      if (!records.length) { $('lastSeen').textContent = 'connected — waiting for the first reading from the ESP32…'; return; }
      render();
    }, (err) => { console.error(err); toast('Firebase error: ' + err.code + ' — showing demo'); startDemo(); });
  } catch (e) { console.error(e); toast('Could not load Firebase — showing demo'); startDemo(); }
}

if (configured) startLive(); else startDemo();
