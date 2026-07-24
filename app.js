/* ==========================================================================
   HIT TIMER - Core Engine & Application Logic (app.js)
   Zero-dependency state machine, timing loop, SVG ring renderer & presets
   ========================================================================== */

(function () {
  'use strict';

  // --- Constants & Default Presets ---
  const DEFAULT_PRESETS = {
    '30-30': { name: '30/30 Standard', prep: 5, work: 30, rest: 30, reps: 4, sets: 2, setRest: 30 },
    'tabata': { name: 'Tabata 20/10', prep: 5, work: 20, rest: 10, reps: 8, sets: 1, setRest: 30 },
    'boxing': { name: 'Boxing 45/15', prep: 5, work: 45, rest: 15, reps: 4, sets: 2, setRest: 30 },
    'emom': { name: 'EMOM 45/15', prep: 5, work: 45, rest: 15, reps: 8, sets: 1, setRest: 0 }
  };

  const STORAGE_KEY_CUSTOM_PRESETS = 'hit_timer_custom_presets_v1';
  const STORAGE_KEY_THEME = 'hit_timer_selected_theme_v1';

  // --- App State ---
  let intervals = [];
  let currentIntervalIndex = 0;
  let timerState = 'STOPPED'; // 'STOPPED', 'RUNNING', 'PAUSED', 'FINISHED'
  let intervalTimeRemaining = 0; // in seconds (float)
  let lastTimestamp = 0;
  let animFrameId = null;
  let lastBeepSecond = -1;

  let wakeLock = null;

  // --- DOM Elements Cache ---
  const elements = {
    themeSelect: document.getElementById('theme-select'),
    soundToggle: document.getElementById('sound-toggle'),
    soundIcon: document.getElementById('sound-icon'),
    wakeLockBadge: document.getElementById('wakelock-badge'),
    
    // Inputs
    prepInput: document.getElementById('prep-time'),
    workInput: document.getElementById('work-time'),
    restInput: document.getElementById('rest-time'),
    repsInput: document.getElementById('reps-count'),
    setsInput: document.getElementById('sets-count'),
    setRestInput: document.getElementById('set-rest-time'),
    
    // Total Summary
    totalDurationDisplay: document.getElementById('total-duration-display'),
    summaryBreakdown: document.getElementById('summary-breakdown'),
    startBtn: document.getElementById('start-btn'),
    
    // Presets
    customPresetsList: document.getElementById('custom-presets-list'),
    btnOpenSavePreset: document.getElementById('btn-open-save-preset'),
    presetModal: document.getElementById('preset-modal'),
    presetNameInput: document.getElementById('preset-name-input'),
    btnSavePresetConfirm: document.getElementById('btn-save-preset-confirm'),
    btnCancelPreset: document.getElementById('btn-cancel-preset'),
    
    // Sections & Mobile Nav
    setupSection: document.getElementById('setup-section'),
    timerSection: document.getElementById('timer-section'),
    tabSetup: document.getElementById('tab-setup'),
    tabTimer: document.getElementById('tab-timer'),
    
    // Timer Display & SVG Ring
    ringProgress: document.getElementById('ring-progress'),
    phaseBadge: document.getElementById('phase-badge'),
    timerDigits: document.getElementById('timer-digits'),
    subtextStatus: document.getElementById('subtext-status'),
    
    // Stats Dashboard
    statSet: document.getElementById('stat-set'),
    statRep: document.getElementById('stat-rep'),
    statElapsed: document.getElementById('stat-elapsed'),
    statRemaining: document.getElementById('stat-remaining'),
    totalProgressFill: document.getElementById('total-progress-fill'),
    
    // Runtime Controls
    playPauseBtn: document.getElementById('play-pause-btn'),
    playPauseIcon: document.getElementById('play-pause-icon'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    resetBtn: document.getElementById('reset-btn')
  };

  // --- Helper Functions ---
  function formatMMSS(totalSeconds) {
    const secs = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Two-digit format for ring countdown timer (max 60 seconds)
  function formatSS(totalSeconds) {
    const secs = Math.max(0, Math.ceil(totalSeconds));
    return String(secs).padStart(2, '0');
  }

  function getCircumference() {
    const r = parseFloat(elements.ringProgress.getAttribute('r')) || 140;
    return 2 * Math.PI * r;
  }

  // --- Workout Sequence Builder ---
  function getConfigValues() {
    return {
      prep: Math.min(60, parseInt(elements.prepInput.value, 10) || 0),
      work: Math.min(60, Math.max(1, parseInt(elements.workInput.value, 10) || 1)),
      rest: Math.min(60, parseInt(elements.restInput.value, 10) || 0),
      reps: Math.max(1, parseInt(elements.repsInput.value, 10) || 1),
      sets: Math.max(1, parseInt(elements.setsInput.value, 10) || 1),
      setRest: Math.min(60, parseInt(elements.setRestInput.value, 10) || 0)
    };
  }

  function buildIntervalSequence() {
    const cfg = getConfigValues();
    const seq = [];

    // 1. Preparation interval
    if (cfg.prep > 0) {
      seq.push({
        type: 'PREP',
        name: 'GET READY IN',
        duration: cfg.prep,
        set: 1,
        rep: 1
      });
    }

    // 2. Main Sets & Reps
    for (let s = 1; s <= cfg.sets; s++) {
      for (let r = 1; r <= cfg.reps; r++) {
        // Work Phase (Green)
        seq.push({
          type: 'WORK',
          name: 'WORK',
          duration: cfg.work,
          set: s,
          rep: r
        });

        // Determine Rest vs Set Rest
        const isLastRepOfSet = (r === cfg.reps);
        const isLastSet = (s === cfg.sets);

        if (isLastRepOfSet && !isLastSet) {
          // End of Set -> Break Between Sets
          if (cfg.setRest > 0) {
            seq.push({
              type: 'SET_REST',
              name: 'BREAK BETWEEN SETS',
              duration: cfg.setRest,
              set: s,
              rep: r
            });
          }
        } else if (!isLastRepOfSet) {
          // Regular Rep Rest
          if (cfg.rest > 0) {
            seq.push({
              type: 'REST',
              name: 'REST',
              duration: cfg.rest,
              set: s,
              rep: r
            });
          }
        }
      }
    }

    return seq;
  }

  function calculateTotalDuration(seq) {
    return seq.reduce((acc, curr) => acc + curr.duration, 0);
  }

  function updateTotalSummary() {
    const cfg = getConfigValues();
    const seq = buildIntervalSequence();
    const totalSecs = calculateTotalDuration(seq);

    elements.totalDurationDisplay.textContent = formatMMSS(totalSecs);
    elements.summaryBreakdown.textContent = `${cfg.sets} Set${cfg.sets > 1 ? 's' : ''} × ${cfg.reps} Rep${cfg.reps > 1 ? 's' : ''} • ${cfg.prep}s Prep`;

    if (timerState === 'STOPPED') {
      intervals = seq;
      renderCurrentIntervalState();
    }
  }

  // --- SVG Ring & Display Renderer ---
  function renderCurrentIntervalState() {
    if (!intervals || intervals.length === 0) return;

    const totalWorkoutSecs = calculateTotalDuration(intervals);
    const curr = intervals[currentIntervalIndex] || intervals[intervals.length - 1];
    const cfg = getConfigValues();

    // 1. Update Center Text (2-digit countdown format)
    elements.phaseBadge.textContent = curr.name;
    elements.timerDigits.textContent = formatSS(intervalTimeRemaining);
    elements.subtextStatus.textContent = timerState === 'FINISHED' ? 'WORKOUT DONE!' : (curr.type === 'PREP' ? 'GET READY IN' : (curr.type === 'SET_REST' ? 'BREAK BETWEEN SETS' : `SET ${curr.set} OF ${cfg.sets}`));

    // 2. Set Phase Badge Class
    elements.phaseBadge.className = 'phase-badge';
    if (timerState === 'FINISHED') {
      elements.phaseBadge.classList.add('badge-prep');
      elements.phaseBadge.style.background = 'rgba(168, 85, 247, 0.2)';
      elements.phaseBadge.style.color = 'var(--color-finish)';
      elements.phaseBadge.textContent = 'FINISHED 🎉';
    } else if (curr.type === 'PREP') {
      elements.phaseBadge.classList.add('badge-prep');
    } else if (curr.type === 'WORK') {
      elements.phaseBadge.classList.add('badge-work');
    } else if (curr.type === 'REST') {
      elements.phaseBadge.classList.add('badge-rest');
    } else if (curr.type === 'SET_REST') {
      elements.phaseBadge.classList.add('badge-set-rest');
    }

    // 3. Update SVG Ring Stroke Color & Depletion Progress
    elements.ringProgress.setAttribute('class', 'ring-progress');
    if (timerState === 'FINISHED') {
      elements.ringProgress.classList.add('phase-finish-stroke');
    } else {
      elements.ringProgress.classList.add(`phase-${curr.type.toLowerCase().replace('_', '-')}-stroke`);
    }

    // Depletion Ratio: Smooth continuous depletion clockwise from 100% to 0%
    const duration = curr.duration || 1;
    const progressRatio = timerState === 'FINISHED' ? 0 : Math.max(0, Math.min(1, intervalTimeRemaining / duration));
    const circumference = getCircumference();
    // strokeDashoffset: 0 when ratio=1 (100% full), circumference when ratio=0 (0% empty)
    const strokeOffset = circumference * (1 - progressRatio);
    elements.ringProgress.style.strokeDashoffset = strokeOffset.toFixed(2);

    // 4. Update Stats Dashboard Cards
    elements.statSet.textContent = `${curr.set} / ${cfg.sets}`;
    elements.statRep.textContent = `${curr.rep} / ${cfg.reps}`;

    // Calculate total elapsed time up to current interval + time elapsed in current interval
    let elapsedBefore = 0;
    for (let i = 0; i < currentIntervalIndex; i++) {
      elapsedBefore += intervals[i].duration;
    }
    const currentElapsedInInterval = timerState === 'FINISHED' ? curr.duration : (curr.duration - intervalTimeRemaining);
    const totalElapsedSecs = elapsedBefore + currentElapsedInInterval;
    const totalRemainingSecs = Math.max(0, totalWorkoutSecs - totalElapsedSecs);

    elements.statElapsed.textContent = formatMMSS(totalElapsedSecs);
    elements.statRemaining.textContent = formatMMSS(totalRemainingSecs);

    // 5. Total Progress Bar Fill
    const overallProgressPercent = totalWorkoutSecs > 0 ? (totalElapsedSecs / totalWorkoutSecs) * 100 : 0;
    elements.totalProgressFill.style.width = `${Math.min(100, overallProgressPercent).toFixed(1)}%`;
  }

  // --- High Precision Timer Loop ---
  function timerLoop(timestamp) {
    if (timerState !== 'RUNNING') return;

    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaSeconds = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    intervalTimeRemaining -= deltaSeconds;

    // Check 3-2-1 Audio Beeps
    const currentIntSec = Math.ceil(intervalTimeRemaining);
    if (currentIntSec <= 3 && currentIntSec >= 1 && currentIntSec !== lastBeepSecond) {
      lastBeepSecond = currentIntSec;
      if (window.soundSynth) window.soundSynth.playCountdownBeep();
    }

    // Interval Completed
    if (intervalTimeRemaining <= 0) {
      advanceInterval();
    } else {
      renderCurrentIntervalState();
      animFrameId = requestAnimationFrame(timerLoop);
    }
  }

  function advanceInterval() {
    if (currentIntervalIndex < intervals.length - 1) {
      currentIntervalIndex++;
      const nextInt = intervals[currentIntervalIndex];
      intervalTimeRemaining = nextInt.duration;
      lastBeepSecond = -1;
      lastTimestamp = performance.now();

      // Play audio transition cue
      if (window.soundSynth) {
        window.soundSynth.playPhaseStartTone(nextInt.type);
      }

      renderCurrentIntervalState();
      animFrameId = requestAnimationFrame(timerLoop);
    } else {
      // Workout Finished!
      timerState = 'FINISHED';
      intervalTimeRemaining = 0;
      renderCurrentIntervalState();
      updatePlayPauseButtonUI();
      releaseWakeLock();

      if (window.soundSynth) {
        window.soundSynth.playWorkoutCompleteFanfare();
      }
    }
  }

  function previousInterval() {
    if (currentIntervalIndex > 0) {
      currentIntervalIndex--;
      intervalTimeRemaining = intervals[currentIntervalIndex].duration;
      lastBeepSecond = -1;
      lastTimestamp = performance.now();
      renderCurrentIntervalState();
    } else {
      intervalTimeRemaining = intervals[0].duration;
      renderCurrentIntervalState();
    }
  }

  // --- State Control Actions ---
  function startWorkout() {
    if (timerState === 'STOPPED' || timerState === 'FINISHED') {
      intervals = buildIntervalSequence();
      currentIntervalIndex = 0;
      intervalTimeRemaining = intervals[0].duration;
    }
    
    timerState = 'RUNNING';
    lastTimestamp = performance.now();
    lastBeepSecond = -1;
    updatePlayPauseButtonUI();
    requestWakeLock();

    // Play initial start audio cue
    if (window.soundSynth && intervals[currentIntervalIndex]) {
      window.soundSynth.playPhaseStartTone(intervals[currentIntervalIndex].type);
    }

    // Mobile view switch to timer panel
    switchToTimerTabOnMobile();

    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(timerLoop);
  }

  function pauseWorkout() {
    timerState = 'PAUSED';
    cancelAnimationFrame(animFrameId);
    updatePlayPauseButtonUI();
    releaseWakeLock();
    renderCurrentIntervalState();
  }

  function togglePlayPause() {
    if (timerState === 'RUNNING') {
      pauseWorkout();
    } else {
      startWorkout();
    }
  }

  function resetWorkout() {
    timerState = 'STOPPED';
    cancelAnimationFrame(animFrameId);
    intervals = buildIntervalSequence();
    currentIntervalIndex = 0;
    intervalTimeRemaining = intervals[0].duration;
    lastBeepSecond = -1;
    updatePlayPauseButtonUI();
    releaseWakeLock();
    renderCurrentIntervalState();
  }

  function updatePlayPauseButtonUI() {
    if (timerState === 'RUNNING') {
      elements.playPauseIcon.textContent = '⏸';
      elements.playPauseIcon.classList.remove('icon-play');
      elements.playPauseBtn.setAttribute('title', 'Pause Timer');
      elements.playPauseBtn.classList.remove('is-paused');
    } else {
      elements.playPauseIcon.textContent = '▶';
      elements.playPauseIcon.classList.add('icon-play');
      elements.playPauseBtn.setAttribute('title', 'Start Timer');
      elements.playPauseBtn.classList.add('is-paused');
    }
  }

  // --- Presets Manager ---
  function loadPreset(presetConfig) {
    elements.prepInput.value = Math.min(60, Math.max(0, presetConfig.prep || 0));
    elements.workInput.value = Math.min(60, Math.max(1, presetConfig.work || 30));
    elements.restInput.value = Math.min(60, Math.max(0, presetConfig.rest || 0));
    elements.repsInput.value = Math.max(1, presetConfig.reps || 1);
    elements.setsInput.value = Math.max(1, presetConfig.sets || 1);
    elements.setRestInput.value = Math.min(60, Math.max(0, presetConfig.setRest || 0));

    resetWorkout();
    updateTotalSummary();
  }

  function getCustomPresets() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomPresets(presetsList) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(presetsList));
  }

  function renderCustomPresetsList() {
    const list = getCustomPresets();
    elements.customPresetsList.innerHTML = '';

    list.forEach((p, idx) => {
      const chip = document.createElement('div');
      chip.className = 'custom-chip';
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.innerHTML = `
        <span class="custom-chip-name">${p.name}</span>
        <button class="delete-preset-btn" title="Delete Preset" type="button">&times;</button>
      `;

      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-preset-btn')) {
          e.stopPropagation();
          deleteCustomPreset(idx);
        } else {
          loadPreset(p);
          document.querySelectorAll('#built-in-presets .preset-chip').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('#custom-presets-list .custom-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });

      elements.customPresetsList.appendChild(chip);
    });
  }

  function deleteCustomPreset(index) {
    const list = getCustomPresets();
    list.splice(index, 1);
    saveCustomPresets(list);
    renderCustomPresetsList();
  }

  function saveCurrentAsCustomPreset(name) {
    if (!name.trim()) return;
    const cfg = getConfigValues();
    const newPreset = {
      name: name.trim(),
      ...cfg
    };
    const list = getCustomPresets();
    list.push(newPreset);
    saveCustomPresets(list);
    renderCustomPresetsList();
  }

  // --- Screen Wake Lock API ---
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        elements.wakeLockBadge.classList.remove('inactive');
        elements.wakeLockBadge.classList.add('active');
        elements.wakeLockBadge.querySelector('.badge-text').textContent = 'WAKE LOCK ON';
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().then(() => {
        wakeLock = null;
        elements.wakeLockBadge.classList.remove('active');
        elements.wakeLockBadge.classList.add('inactive');
        elements.wakeLockBadge.querySelector('.badge-text').textContent = 'WAKE LOCK OFF';
      }).catch(() => {});
    }
  }

  // --- Theme Switching ---
  function applyTheme(themeClass) {
    document.body.className = themeClass;
    localStorage.setItem(STORAGE_KEY_THEME, themeClass);
  }

  // --- Mobile Navigation ---
  function switchToTimerTabOnMobile() {
    if (elements.tabSetup && elements.tabTimer) {
      elements.setupSection.classList.add('mobile-hidden');
      elements.timerSection.classList.remove('mobile-hidden');
      elements.tabSetup.classList.remove('active');
      elements.tabTimer.classList.add('active');
    }
  }

  function switchToSetupTabOnMobile() {
    if (elements.tabSetup && elements.tabTimer) {
      elements.timerSection.classList.add('mobile-hidden');
      elements.setupSection.classList.remove('mobile-hidden');
      elements.tabTimer.classList.remove('active');
      elements.tabSetup.classList.add('active');
    }
  }

  // --- Event Listeners Setup ---
  function initEvents() {
    // 1. Stepper Input Adjusters
    document.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const change = parseInt(btn.getAttribute('data-change'), 10);
        const inputEl = document.getElementById(targetId);
        if (inputEl) {
          const currentVal = parseInt(inputEl.value, 10) || 0;
          const minVal = parseInt(inputEl.getAttribute('min'), 10) || 0;
          const maxVal = parseInt(inputEl.getAttribute('max'), 10) || 3600;
          inputEl.value = Math.max(minVal, Math.min(maxVal, currentVal + change));
          
          resetWorkout();
          updateTotalSummary();
        }
      });
    });

    // Direct input edits
    [elements.prepInput, elements.workInput, elements.restInput, elements.repsInput, elements.setsInput, elements.setRestInput].forEach(inp => {
      inp.addEventListener('input', () => {
        resetWorkout();
        updateTotalSummary();
      });
    });

    // 2. Built-in Presets Chips
    document.querySelectorAll('#built-in-presets .preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        if (DEFAULT_PRESETS[presetKey]) {
          loadPreset(DEFAULT_PRESETS[presetKey]);
          document.querySelectorAll('#built-in-presets .preset-chip').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // 3. Custom Presets Modal
    elements.btnOpenSavePreset.addEventListener('click', () => {
      elements.presetNameInput.value = '';
      elements.presetModal.classList.remove('hidden');
      elements.presetNameInput.focus();
    });

    elements.btnCancelPreset.addEventListener('click', () => {
      elements.presetModal.classList.add('hidden');
    });

    elements.btnSavePresetConfirm.addEventListener('click', () => {
      const name = elements.presetNameInput.value;
      if (name.trim()) {
        saveCurrentAsCustomPreset(name);
        elements.presetModal.classList.add('hidden');
      }
    });

    // 4. Primary Actions & Toolbar
    elements.startBtn.addEventListener('click', () => {
      startWorkout();
    });

    elements.playPauseBtn.addEventListener('click', () => {
      togglePlayPause();
    });

    elements.nextBtn.addEventListener('click', () => {
      advanceInterval();
    });

    elements.prevBtn.addEventListener('click', () => {
      previousInterval();
    });

    elements.resetBtn.addEventListener('click', () => {
      resetWorkout();
    });

    // 5. Sound Mute Toggle
    elements.soundToggle.addEventListener('click', () => {
      if (window.soundSynth) {
        const muted = window.soundSynth.toggleMute();
        elements.soundIcon.textContent = muted ? '🔇' : '🔊';
      }
    });

    // 6. Theme Selector
    elements.themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });

    // 7. Mobile Tabs
    if (elements.tabSetup) elements.tabSetup.addEventListener('click', switchToSetupTabOnMobile);
    if (elements.tabTimer) elements.tabTimer.addEventListener('click', switchToTimerTabOnMobile);
  }

  // --- App Initialization ---
  function init() {
    // Restore Saved Theme
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme) {
      applyTheme(savedTheme);
      elements.themeSelect.value = savedTheme;
    }

    initEvents();
    renderCustomPresetsList();
    updateTotalSummary();
    resetWorkout();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
