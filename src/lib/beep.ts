// The short "got it" beep of a checkout scanner. Browsers only allow sound
// after a tap, so call unlockBeep() from one (opening the scanner).

let audio: AudioContext | null = null;

export function unlockBeep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    if (audio.state === 'suspended') audio.resume().catch(() => null);
  } catch {
    audio = null;
  }
}

export function beep(ok = true): void {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square';
  osc.frequency.value = ok ? 1480 : 420;
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}
