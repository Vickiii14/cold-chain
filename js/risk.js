// Shared risk model — identical logic runs on the ESP32 firmware.
export const CFG = { TMIN: 2, TMAX: 8, SHOCK_G: 1.8, K1: 0.9, K2: 1.5, REPEAT_W: 0.25,
  INTERVALS: { low: 30, elevated: 10, critical: 3 } };

export function newState() { return { risk: 0, repeats: 0, inExcursion: false }; }

export function step(s, temp, shockG, dtSec) {
  const exc = temp > CFG.TMAX ? temp - CFG.TMAX : temp < CFG.TMIN ? CFG.TMIN - temp : 0;
  if (exc > 0 && !s.inExcursion) s.repeats++;
  s.inExcursion = exc > 0;
  s.risk += exc * (dtSec / 60) * CFG.K1 * (1 + CFG.REPEAT_W * Math.max(0, s.repeats - 1));
  if (shockG > CFG.SHOCK_G) s.risk += (shockG - CFG.SHOCK_G) * CFG.K2;
  const cond = Math.max(0, 100 - s.risk);
  const level = (exc > 4 || cond < 40) ? 'critical' : (exc > 0 || shockG > CFG.SHOCK_G || cond < 75) ? 'elevated' : 'low';
  return { exc, cond, level, interval: CFG.INTERVALS[level], decision: decide(cond) };
}

export function decide(c) {
  if (c >= 90) return 'CONTINUE';
  if (c >= 75) return 'MONITOR';
  if (c >= 60) return 'PRIORITIZE DELIVERY';
  if (c >= 40) return 'INSPECTION REQUIRED';
  return 'HIGH RISK';
}

export const COLORS = {
  'CONTINUE': '#34d399', 'MONITOR': '#22d3ee', 'PRIORITIZE DELIVERY': '#fbbf24',
  'INSPECTION REQUIRED': '#fb923c', 'HIGH RISK': '#f87171',
  low: '#34d399', elevated: '#fbbf24', critical: '#f87171'
};
