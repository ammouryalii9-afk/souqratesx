// ── Arcade Effects: Sound + Particles ────────────────────────────────────────
// All audio is synthesized via Web Audio API — zero file downloads.
// Particles are rendered into a shared overlay canvas injected into body.

// ── Audio Engine ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.18,
  startOffset = 0,
  endFreq?: number,
) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startOffset);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + startOffset + duration * 0.9);
  }
  g.gain.setValueAtTime(0, c.currentTime + startOffset);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + startOffset + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startOffset + duration);
  osc.start(c.currentTime + startOffset);
  osc.stop(c.currentTime + startOffset + duration + 0.01);
}

function noise(duration: number, gain = 0.08, startOffset = 0) {
  const c = getCtx();
  if (!c) return;
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.8;
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(gain, c.currentTime + startOffset);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startOffset + duration);
  src.start(c.currentTime + startOffset);
  src.stop(c.currentTime + startOffset + duration + 0.01);
}

export const arcadeSound = {
  tap() {
    tone(520, 0.06, "sine", 0.10);
  },
  claim() {
    tone(440, 0.07, "triangle", 0.14);
    tone(660, 0.12, "sine", 0.13, 0.05);
    tone(880, 0.10, "sine", 0.10, 0.14);
  },
  enemyDetected() {
    tone(120, 0.18, "sawtooth", 0.20);
    noise(0.15, 0.12, 0.02);
    tone(80, 0.25, "square", 0.15, 0.1);
  },
  strike() {
    noise(0.08, 0.18);
    tone(200, 0.12, "sawtooth", 0.16, 0.02, 80);
  },
  explosion() {
    noise(0.35, 0.25);
    tone(60, 0.3, "square", 0.22, 0.01, 30);
    tone(160, 0.2, "sawtooth", 0.18, 0.05, 40);
  },
  shielded() {
    tone(800, 0.08, "sine", 0.12);
    tone(600, 0.12, "sine", 0.10, 0.06);
  },
  decoyTrap() {
    tone(300, 0.05, "square", 0.20);
    noise(0.2, 0.22, 0.04);
    tone(150, 0.25, "sawtooth", 0.18, 0.08, 50);
  },
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.18, "sine", 0.16, i * 0.1));
    tone(1047, 0.4, "sine", 0.12, 0.42);
  },
  radar() {
    tone(1200, 0.06, "sine", 0.10);
    tone(900, 0.08, "sine", 0.08, 0.08);
    tone(1200, 0.06, "sine", 0.07, 0.18);
  },
  multiStrike() {
    [0, 0.08, 0.16, 0.24, 0.32].forEach((t) => {
      noise(0.07, 0.14, t);
      tone(220, 0.08, "sawtooth", 0.14, t, 100);
    });
  },
  combo(level: number) {
    const base = 440 + level * 80;
    tone(base, 0.08, "sine", 0.15);
    tone(base * 1.5, 0.08, "triangle", 0.12, 0.06);
  },
};

// ── Screen Flash ──────────────────────────────────────────────────────────────

export function screenFlash(color: string, duration = 220) {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed;inset:0;z-index:9999;pointer-events:none;
    background:${color};opacity:0.55;
    transition:opacity ${duration}ms ease-out;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { el.style.opacity = "0"; });
  });
  setTimeout(() => el.remove(), duration + 50);
}

// ── Floating Numbers ──────────────────────────────────────────────────────────

export function spawnFloatingText(
  anchorEl: Element | null,
  text: string,
  color = "#4ade80",
) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    position:fixed;
    left:${rect.left + rect.width / 2}px;
    top:${rect.top + rect.height / 2}px;
    transform:translate(-50%,-50%);
    color:${color};
    font-size:13px;
    font-weight:900;
    font-family:'Outfit',sans-serif;
    pointer-events:none;
    z-index:9998;
    white-space:nowrap;
    text-shadow:0 0 8px ${color}99;
    animation:arcadeFloat 0.9s ease-out forwards;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ── Particle Burst ────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

const PARTICLE_COLORS_EXPLOSION = ["#ef4444","#f97316","#fbbf24","#ffffff","#fcd34d"];
const PARTICLE_COLORS_WIN       = ["#4ade80","#22d3ee","#a78bfa","#fbbf24","#ffffff"];
const PARTICLE_COLORS_CLAIM     = ["#4ade80","#86efac","#ffffff"];

let animId: number | null = null;
const particles: Particle[] = [];
let canvas: HTMLCanvasElement | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;

function ensureCanvas() {
  if (canvas && document.body.contains(canvas)) return;
  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:9997;pointer-events:none;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  canvasCtx = canvas.getContext("2d");
  window.addEventListener("resize", () => {
    if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  }, { passive: true });
}

function tick() {
  if (!canvasCtx || !canvas) return;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.97;
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const alpha = p.life / p.maxLife;
    canvasCtx.globalAlpha = alpha;
    canvasCtx.fillStyle = p.color;
    canvasCtx.beginPath();
    canvasCtx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
    canvasCtx.fill();
  }
  canvasCtx.globalAlpha = 1;
  if (particles.length > 0) {
    animId = requestAnimationFrame(tick);
  } else {
    animId = null;
    canvas?.remove();
    canvas = null;
    canvasCtx = null;
  }
}

function spawnBurst(cx: number, cy: number, colors: string[], count: number, speed: number) {
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const s = speed * (0.5 + Math.random() * 0.8);
    const life = 28 + Math.floor(Math.random() * 20);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s - 1.5,
      r: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life,
      maxLife: life,
    });
  }
  if (!animId) animId = requestAnimationFrame(tick);
}

export function particleExplosion(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + r.height / 2, PARTICLE_COLORS_EXPLOSION, 28, 6);
}

export function particleWin(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + r.height / 2, PARTICLE_COLORS_WIN, 45, 9);
}

export function particleClaim(el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + r.height / 2, PARTICLE_COLORS_CLAIM, 16, 4.5);
}

// Inject keyframe for floating text (once)
if (typeof document !== "undefined") {
  const id = "arcade-float-kf";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `@keyframes arcadeFloat{0%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}60%{opacity:1;transform:translate(-50%,calc(-50% - 40px)) scale(1)}100%{opacity:0;transform:translate(-50%,calc(-50% - 75px)) scale(0.8)}}`;
    document.head.appendChild(s);
  }
}
