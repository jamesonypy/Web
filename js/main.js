// 主控制器：渲染器、场景切换、界面与输入
import * as THREE from "three";
import { GameScene } from "./game.js";
import { OffroadScene } from "./offroad.js";
import { Garage } from "./garage.js";
import { getModel, resolveParams, getStats } from "./carFactory.js";
import { DIFFICULTY_LEVELS, MAX_LEVEL, generateProblem } from "./math.js";
import { loadState, saveState } from "./storage.js";
import { sfx, setSoundEnabled } from "./audio.js";

const state = loadState();
const save = () => saveState(state);
setSoundEnabled(state.sound);

// ---------- 渲染器 ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const gameScene = new GameScene(renderer);
const offroadScene = new OffroadScene(renderer);
const garage = new Garage(renderer, state, save, { onChange: refreshMenu });

let renderTarget = "garage"; // 'garage' | 'game' | 'offroad'
let activeMode = null;       // 'road' | 'offroad'

// ---------- 界面元素 ----------
const screens = {
  loading: document.getElementById("loading"),
  menu: document.getElementById("menu"),
  garage: document.getElementById("garage"),
  hud: document.getElementById("hud"),
  pause: document.getElementById("pause"),
  gameover: document.getElementById("gameover"),
  ohud: document.getElementById("ohud"),
  quiz: document.getElementById("quiz"),
  oresult: document.getElementById("oresult"),
};
const $ = (id) => document.getElementById(id);

function show(name, on) { screens[name].classList.toggle("hidden", !on); }
function hideAll() { Object.keys(screens).forEach((k) => show(k, false)); }

// ---------- 菜单 ----------
function refreshMenu() {
  $("menuCoins").textContent = state.coins;
  $("menuBest").textContent = Math.max(state.bestScore, state.offroadBest);
}

function buildDifficultyButtons() {
  const cont = $("diffButtons");
  cont.innerHTML = "";
  DIFFICULTY_LEVELS.forEach((d) => {
    const b = document.createElement("button");
    b.className = "db" + (d.level === state.difficulty ? " active" : "");
    b.innerHTML = `<b>LV${d.level} ${d.name}</b><small>${d.desc}</small>`;
    b.onclick = () => {
      state.difficulty = d.level; save(); sfx.click();
      cont.querySelectorAll(".db").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
    cont.appendChild(b);
  });
}

function showMenu() {
  hideAll(); show("menu", true);
  renderTarget = "garage"; activeMode = null;
  garage.previewId = state.selectedCar;
  garage._rebuildPreview();
  refreshMenu();
}

function openGarage() {
  hideAll(); show("garage", true);
  renderTarget = "garage"; activeMode = null;
  garage.previewId = state.selectedCar;
  garage._rebuildPreview();
  garage.refreshAll();
}

function currentCarParams() {
  const m = getModel(state.selectedCar);
  return resolveParams(m, state.customizations[state.selectedCar] || {});
}

// ================= 公路答题模式 =================
function startGame() {
  hideAll(); show("hud", true);
  renderTarget = "game"; activeMode = "road";
  $("question").classList.remove("hidden");
  gameScene.start({
    carParams: currentCarParams(),
    level: state.difficulty,
    autoDifficulty: state.autoDifficulty,
  });
  sfx.start();
}

gameScene.setCallbacks({
  onHud({ coins, score, level, lives }) {
    $("hudCoins").textContent = coins;
    $("hudScore").textContent = score;
    $("hudLevel").textContent = level;
    let h = "";
    for (let i = 0; i < 3; i++) h += i < lives ? "❤️" : "🤍";
    $("hudLives").textContent = h;
  },
  onQuestion(text) {
    const q = $("question");
    q.textContent = text;
    q.classList.remove("hidden");
  },
  onFeedback(ok, gain, combo, msg) {
    const q = $("question");
    q.classList.remove("flash-ok", "flash-bad");
    void q.offsetWidth;
    q.classList.add(ok ? "flash-ok" : "flash-bad");
    const c = $("combo");
    if (msg) c.textContent = msg;
    else if (ok) c.textContent = combo > 1 ? `+${gain} 🪙  连对 x${combo}!` : `+${gain} 🪙`;
    else c.textContent = "";
    c.classList.remove("hidden");
    c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
  },
  onGameOver(stats) {
    state.coins += stats.coins;
    const isRecord = stats.score > state.bestScore;
    if (isRecord) state.bestScore = stats.score;
    save();
    $("overScore").textContent = stats.score;
    $("overCoins").textContent = stats.coins;
    $("overRight").textContent = `${stats.correct}/${stats.total}`;
    $("overAcc").textContent = stats.accuracy + "%";
    $("overBadge").classList.toggle("hidden", !isRecord);
    show("hud", false);
    show("gameover", true);
  },
});

// ================= 越野闯关模式 =================
let driveResult = null;
let quizState = null;

function startOffroad() {
  hideAll(); show("ohud", true);
  renderTarget = "offroad"; activeMode = "offroad";
  const m = getModel(state.selectedCar);
  offroadScene.start({
    carParams: resolveParams(m, state.customizations[state.selectedCar] || {}),
    stats: getStats(m),
    level: state.offroadLevel,
  });
  sfx.start();
}

offroadScene.setCallbacks({
  onHud({ score, stars, speed, progress, time, theme, level }) {
    $("oScore").textContent = score;
    $("oStars").textContent = stars;
    $("oSpeed").textContent = speed;
    $("oTime").textContent = Math.ceil(time);
    $("oProgress").style.width = (progress * 100).toFixed(1) + "%";
    $("oTheme").textContent = theme ? `第 ${level} 关 · ${theme}` : "";
  },
  onFinishDrive(res) {
    driveResult = res;
    startQuiz(res);
  },
});

// ---- 通关测验 ----
const QUIZ_N = 3;
function startQuiz(res) {
  show("ohud", false);
  quizState = { i: 0, n: QUIZ_N, score: res.runScore, base: res.runScore, correct: 0, level: state.difficulty };
  show("quiz", true);
  nextQuizQuestion();
}

function nextQuizQuestion() {
  const qs = quizState;
  if (qs.i >= qs.n) { finishQuiz(); return; }
  const p = generateProblem(qs.level);
  qs.current = p;
  $("quizProgress").textContent = `第 ${qs.i + 1} / ${qs.n} 题`;
  $("quizScore").textContent = Math.round(qs.score);
  $("quizQuestion").textContent = p.text;
  const cont = $("quizChoices");
  cont.className = "quiz-choices" + (p.options.length === 2 ? " two" : "");
  cont.innerHTML = "";
  const fb = $("quizFeedback");
  fb.textContent = ""; fb.className = "quiz-feedback";
  p.options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.className = "quiz-choice";
    b.textContent = opt;
    b.onclick = () => answerQuiz(idx, b);
    cont.appendChild(b);
  });
}

function answerQuiz(idx, btn) {
  const qs = quizState;
  const p = qs.current;
  const buttons = $("quizChoices").querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  const ok = idx === p.correctIndex;
  const reward = 30 + qs.level * 8;
  const penalty = 20 + qs.level * 8;
  const fb = $("quizFeedback");
  if (ok) {
    btn.classList.add("right");
    qs.score += reward; qs.correct++;
    fb.textContent = `答对！+${reward} 分`; fb.className = "quiz-feedback ok";
    sfx.correct();
  } else {
    btn.classList.add("wrong");
    buttons[p.correctIndex].classList.add("right");
    qs.score = Math.max(0, qs.score - penalty);
    fb.textContent = `答错，正确答案是 ${p.answer}，扣 ${penalty} 分`; fb.className = "quiz-feedback bad";
    sfx.wrong();
  }
  $("quizScore").textContent = Math.round(qs.score);
  qs.i++;
  setTimeout(nextQuizQuestion, 1200);
}

function finishQuiz() {
  const qs = quizState;
  const finalScore = Math.round(qs.score);
  const base = Math.round(qs.base);
  const delta = finalScore - base;
  const coins = Math.round(finalScore * 0.5);

  state.coins += coins;
  const isRecord = finalScore > state.offroadBest;
  if (isRecord) state.offroadBest = finalScore;
  // 成功通关推进关卡（赛道更长、限时更紧）
  if (driveResult.reason === "finish") state.offroadLevel = Math.min(8, state.offroadLevel + 1);
  // 自动难度：全对升级，错两题及以上降级
  if (state.autoDifficulty) {
    if (qs.correct === qs.n && state.difficulty < MAX_LEVEL) state.difficulty++;
    else if (qs.correct <= qs.n - 2 && state.difficulty > 1) state.difficulty--;
    buildDifficultyButtons();
  }
  save();

  $("oresultTitle").textContent = driveResult.reason === "finish" ? "🏁 成功通关！" : "⏱ 时间到，结算";
  $("orDrive").textContent = base;
  $("orQuiz").textContent = (delta >= 0 ? "+" : "") + delta;
  $("orFinal").textContent = finalScore;
  $("orCoins").textContent = coins;
  $("orBadge").classList.toggle("hidden", !isRecord);
  show("quiz", false);
  show("oresult", true);
}

// ================= 暂停（模式通用）=================
function pauseCurrent() {
  if (activeMode === "road" && gameScene.active) { gameScene.pause(); show("pause", true); }
  else if (activeMode === "offroad" && offroadScene.active) { offroadScene.pause(); show("pause", true); }
}
function resumeCurrent() {
  show("pause", false);
  if (activeMode === "road") gameScene.resume();
  else if (activeMode === "offroad") offroadScene.resume();
}
function quitToGarage() {
  gameScene.stop(); offroadScene.stop(); show("pause", false); openGarage();
}

// ---------- 按钮事件 ----------
$("btnPlay").onclick = () => { sfx.click(); startGame(); };
$("btnOffroad").onclick = () => { sfx.click(); startOffroad(); };
$("btnGarage").onclick = () => { sfx.click(); openGarage(); };
$("garageBack").onclick = () => { sfx.click(); showMenu(); };
$("btnPause").onclick = () => { sfx.click(); pauseCurrent(); };
$("btnOPause").onclick = () => { sfx.click(); pauseCurrent(); };
$("btnResume").onclick = () => { sfx.click(); resumeCurrent(); };
$("btnQuit").onclick = () => { sfx.click(); quitToGarage(); };
$("btnReplay").onclick = () => { sfx.click(); startGame(); };
$("btnToGarage").onclick = () => { sfx.click(); openGarage(); };
$("btnToMenu").onclick = () => { sfx.click(); showMenu(); };
$("btnOReplay").onclick = () => { sfx.click(); startOffroad(); };
$("btnOGarage").onclick = () => { sfx.click(); openGarage(); };
$("btnOMenu").onclick = () => { sfx.click(); showMenu(); };

$("autoDiff").checked = state.autoDifficulty;
$("autoDiff").onchange = (e) => { state.autoDifficulty = e.target.checked; save(); };

$("btnSound").onclick = () => {
  state.sound = !state.sound;
  setSoundEnabled(state.sound);
  save();
  $("btnSound").textContent = state.sound ? "🔊 声音：开" : "🔇 声音：关";
  if (state.sound) sfx.click();
};

// ---------- 输入 ----------
// 公路模式触控
$("touchLeft").onclick = () => gameScene.setLane(-1);
$("touchRight").onclick = () => gameScene.setLane(1);

// 越野模式：连续转向 + 油门/刹车
const held = { left: false, right: false };
function applyOffroadSteer() {
  offroadScene.setSteer((held.right ? 1 : 0) - (held.left ? 1 : 0));
}
function bindHold(id, onDown, onUp) {
  const el = $(id);
  const down = (e) => { e.preventDefault(); onDown(); };
  const up = (e) => { e.preventDefault(); onUp(); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("pointercancel", up);
}
bindHold("oLeft", () => { held.left = true; applyOffroadSteer(); }, () => { held.left = false; applyOffroadSteer(); });
bindHold("oRight", () => { held.right = true; applyOffroadSteer(); }, () => { held.right = false; applyOffroadSteer(); });
bindHold("oGas", () => offroadScene.setThrottle(true), () => offroadScene.setThrottle(false));
bindHold("oBrake", () => offroadScene.setBrake(true), () => offroadScene.setBrake(false));

// 键盘
window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowLeft": case "a": case "A":
      if (activeMode === "offroad") { held.left = true; applyOffroadSteer(); }
      else if (activeMode === "road" && !e.repeat) gameScene.setLane(-1);
      break;
    case "ArrowRight": case "d": case "D":
      if (activeMode === "offroad") { held.right = true; applyOffroadSteer(); }
      else if (activeMode === "road" && !e.repeat) gameScene.setLane(1);
      break;
    case "ArrowUp": case "w": case "W":
      if (activeMode === "offroad") offroadScene.setThrottle(true);
      break;
    case "ArrowDown": case "s": case "S":
      if (activeMode === "offroad") offroadScene.setBrake(true);
      break;
    case "Escape": case "p": case "P":
      if (!screens.pause.classList.contains("hidden")) resumeCurrent();
      else pauseCurrent();
      break;
  }
});
window.addEventListener("keyup", (e) => {
  switch (e.key) {
    case "ArrowLeft": case "a": case "A":
      if (activeMode === "offroad") { held.left = false; applyOffroadSteer(); } break;
    case "ArrowRight": case "d": case "D":
      if (activeMode === "offroad") { held.right = false; applyOffroadSteer(); } break;
    case "ArrowUp": case "w": case "W":
      if (activeMode === "offroad") offroadScene.setThrottle(false); break;
    case "ArrowDown": case "s": case "S":
      if (activeMode === "offroad") offroadScene.setBrake(false); break;
  }
});

// 公路模式点击左右半屏切换车道
canvas.addEventListener("pointerdown", (e) => {
  if (renderTarget !== "game" || !gameScene.active) return;
  gameScene.setLane(e.clientX < window.innerWidth / 2 ? -1 : 1);
});

// ---------- 尺寸 ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  gameScene.resize(w, h);
  offroadScene.resize(w, h);
  garage.resize(w, h);
}
window.addEventListener("resize", resize);
resize();

// ---------- 渲染循环 ----------
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (renderTarget === "game") {
    gameScene.update(dt);
    renderer.render(gameScene.scene, gameScene.camera);
  } else if (renderTarget === "offroad") {
    offroadScene.update(dt);
    renderer.render(offroadScene.scene, offroadScene.camera);
  } else {
    garage.update(dt);
    renderer.render(garage.scene, garage.camera);
  }
  requestAnimationFrame(loop);
}

// ---------- 启动 ----------
buildDifficultyButtons();
$("btnSound").textContent = state.sound ? "🔊 声音：开" : "🔇 声音：关";
show("loading", false);
showMenu();
requestAnimationFrame(loop);
