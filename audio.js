/* ==========================================================================
   HIT TIMER - Web Audio API Synthesizer (audio.js)
   Zero-dependency audio cue generator for countdowns & interval transitions
   ========================================================================== */

class SoundSynthesizer {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
  }

  // Initialize or resume AudioContext upon user interaction
  init() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // Helper method to play a single tone
  playTone(freq, type = 'sine', duration = 0.15, startTime = 0, gainLevel = 0.3) {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime + startTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      // Envelope: sharp attack, quick decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainLevel, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  // Beep for 3, 2, 1 countdowns
  playCountdownBeep() {
    // 600 Hz short pulse
    this.playTone(600, 'sine', 0.12, 0, 0.35);
  }

  // Energetic transition sounds for phase starts
  playPhaseStartTone(phaseType) {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    if (phaseType === 'WORK') {
      // High-pitched energetic ascending chime (880 Hz -> 1320 Hz)
      this.playTone(880, 'triangle', 0.15, 0, 0.4);
      this.playTone(1320, 'triangle', 0.25, 0.12, 0.4);
    } else if (phaseType === 'REST') {
      // Soft descending rest tone (440 Hz -> 330 Hz)
      this.playTone(440, 'sine', 0.15, 0, 0.35);
      this.playTone(330, 'sine', 0.25, 0.12, 0.35);
    } else if (phaseType === 'SET_REST') {
      // Mid-pitch dual tone
      this.playTone(523.25, 'sine', 0.18, 0, 0.35);
      this.playTone(659.25, 'sine', 0.22, 0.15, 0.35);
    } else if (phaseType === 'PREP') {
      // Preparation start tone
      this.playTone(500, 'sine', 0.2, 0, 0.3);
    }
  }

  // Celebration Fanfare when workout finishes completely
  playWorkoutCompleteFanfare() {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    // C5 - E5 - G5 - C6 major chord sequence
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.3, idx * 0.12, 0.4);
    });
  }
}

// Global Sound Instance
window.soundSynth = new SoundSynthesizer();
