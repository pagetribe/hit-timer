# hit-timer
# HIIT Timer Implementation Walkthrough

A feature-complete High Intensity Interval Training (HIIT) web application built using **pure HTML, CSS, and Vanilla JavaScript** with zero external libraries or dependencies.

---

## 🌟 Key Features Implemented

### 1. **"BREAK BETWEEN SETS" Wording**
- Updated phase badge and status text during set rest intervals to **`BREAK BETWEEN SETS`**.

### 2. **Mobile View Element Order**
- On mobile viewports (`max-width: 860px`), elements are strictly ordered as requested:
  1. **Countdown Timer Ring** (`order: 1` at top)
  2. **Header** (`order: 2` in middle)
  3. **Settings Panel** (`order: 3` at bottom)

### 3. **Input Card Overflow & Bleed Fix**
- Applied `min-width: 0; box-sizing: border-box; overflow: hidden;` across `.setup-panel`, `.config-grid`, `.input-card`, `.stepper-control`, and input wrappers so cards never bleed over the right edge on mobile screens.

### 4. **Interval Countdown Timer & 2-Minute Cap**
- Active interval countdown inside the ring displays `SS` format for < 60s and `MM:SS` for intervals over 60s.
- Setup interval inputs are capped at a maximum of 120 seconds (2 minutes).

---

## 📁 File Structure

```
/home/code/code/hit-timer/
├── index.html       # HTML5 structure (Sets & Reps 1st & 2nd, Break Between Sets, ↺ reset icon)
├── styles.css       # Mobile view ordering (Timer, Header, Settings) & input bleed fix
├── audio.js        # Web Audio API sound synthesizer module
└── app.js          # Core HIIT state machine with BREAK BETWEEN SETS wording & 2-digit ring timer
```

---

## 🚀 How to Run Locally

1. Open a terminal in the project directory:
   ```bash
   cd /home/code/code/hit-timer
   ```
2. Start any local web server (e.g. Python):
   ```bash
   python3 -m http.server 8080
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```
