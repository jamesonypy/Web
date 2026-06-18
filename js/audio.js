// 用 WebAudio 合成简单音效，避免依赖任何音频素材文件
let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setSoundEnabled(v) { enabled = v; }

function beep(freq, dur, type = "sine", gain = 0.18) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur + 0.02);
}

export const sfx = {
  correct() {
    beep(660, 0.12, "triangle");
    setTimeout(() => beep(880, 0.16, "triangle"), 90);
  },
  wrong() {
    beep(200, 0.25, "sawtooth", 0.15);
  },
  coin() {
    beep(990, 0.08, "square", 0.12);
    setTimeout(() => beep(1320, 0.1, "square", 0.12), 70);
  },
  click() { beep(420, 0.05, "square", 0.08); },
  buy() {
    beep(523, 0.1, "triangle");
    setTimeout(() => beep(659, 0.1, "triangle"), 80);
    setTimeout(() => beep(784, 0.16, "triangle"), 160);
  },
  start() {
    beep(440, 0.12, "sine");
    setTimeout(() => beep(554, 0.12, "sine"), 120);
    setTimeout(() => beep(660, 0.2, "sine"), 240);
  },
  gameover() {
    beep(440, 0.18, "sine");
    setTimeout(() => beep(330, 0.18, "sine"), 160);
    setTimeout(() => beep(220, 0.3, "sine"), 320);
  },
};
