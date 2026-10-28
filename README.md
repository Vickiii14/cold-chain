# ColdSense — Cold-Chain Remaining Safe-Life Dashboard

Static site (HTML + CSS + JS modules). No build step. Works on Vercel as-is.

## 1. Try it now (demo mode)
Run any static server, e.g. `npx serve .` or `python3 -m http.server`, and open `dashboard.html`.
While `js/firebase-config.js` still has `YOUR_API_KEY`, the dashboard runs a built-in simulator
(buttons: cooling fault, inject shock, reset) — perfect for your viva demo.

## 2. Connect Firebase (live data)
1. Firebase Console → Create project → **Build → Firestore Database → Create** (test region near you).
2. Project settings → **Your apps → Web (</>)** → copy the config into `js/firebase-config.js`.
3. Firestore → **Rules** → paste `firestore.rules` → Publish.
4. Flash `firmware/coldsense_esp32.ino` after filling Wi-Fi, project id and API key. The ESP32 posts to
   the `readings` collection; the dashboard switches to **Live · Firebase** automatically.

## 3. Deploy on Vercel
- Easiest: push this folder to GitHub → vercel.com → **Add New Project** → import → Framework: **Other** → Deploy.
- Or CLI: `npm i -g vercel && vercel --prod` inside this folder.

## Hardware & power notes (important)
- You have a DHT11 (±2 °C accuracy, no BME280/RTC/reed): time comes from NTP over Wi-Fi; door events are not sensed.
- Switch Peltiers/fans with MOSFET modules or relays; never from ESP32 pins.
- A TEC1-12706 Peltier draws ~5–6 A at 12 V. Four 1800 mAh cells in series cannot run two Peltiers for long and
  4S Li-ion needs a BMS. Run the cooling stage from a 12 V ≥10 A adapter for the demo and keep the cells for the
  ESP32 electronics (via the buck converter, set to 5 V).
- Peltier hot side needs the outside fan + heatsink; without it the module overheats.

## Risk model
`excursion = max(T−8, 2−T, 0)`; `risk += excursion·(Δt/60)·0.9·(1+0.25·(repeats−1))`; `risk += max(g−1.8,0)·1.5`;
`condition = max(0, 100−risk)`. Same math in `js/risk.js` and the firmware. Tune `CFG` / constants for your box.
