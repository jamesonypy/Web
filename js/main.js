// 主控制器：渲染器、场景切换、界面与输入
import * as THREE from "three";
import { GameScene } from "./game.js";
import { Garage } from "./garage.js";
import { getModel, resolveParams } from "./carFactory.js";
import { DIFFICULTY_LEVELS } from "./math.js";
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
const garage = new Garage(renderer, state, save, { onChange: refreshMenu });

let renderTarget = "garage"; // 'garage' | 'game'

// ---------- 界面元素 ----------
const screens = {
  loading: document.getElementById("loading"),
  menu: document.getElementById("menu"),
  garage: document.getElementById("garage"),
  hud: document.getElementById("hud"),
  pause: document.getElementById("pause"),
  gameover: document.getElementById("gameover"),
};
const $ = (id) => document.getElementById(id);

function show(name, on) { screens[name].classList.toggle("hidden", !on); }
function hideAll() { Object.keys(screens).forEach((k) => show(k, false)); }

// ---------- 菜单 ----------
function refreshMenu() {
  $("menuCoins").textContent = state.coins;
  $("menuBest").textContent = state.bestScore;
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
  renderTarget = "garage";
  garage.previewId = state.selectedCar;
  garage._rebuildPreview();
  refreshMenu();
}

function openGarage() {
  hideAll(); show("garage", true);
  renderTarget = "garage";
  garage.previewId = state.selectedCar;
  garage._rebuildPreview();
  garage.refreshAll();
}

// ---------- 游戏 ----------
function currentCarParams() {
  const m = getModel(state.selectedCar);
  return resolveParams(m, state.customizations[state.selectedCar] || {});
}

function startGame() {
  hideAll(); show("hud", true);
  renderTarget = "game";
  $("question").classList.remove("hidden");
  gameScene.start({
    carParams: currentCarParams(),
    level: state.difficulty,
    autoDifficulty: state.autoDifficulty,
  });
  sfx.start();
}

function pauseGame() {
  if (!gameScene.active) return;
  gameScene.pause();
  show("pause", true);
}
function resumeGame() {
  show("pause", false);
  gameScene.resume();
}

// HUD 回调
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
    void q.offsetWidth; // 重启动画
    q.classList.add(ok ? "flash-ok" : "flash-bad");

    const c = $("combo");
    if (msg) c.textContent = msg;
    else if (ok) c.textContent = combo > 1 ? `+${gain} 🪙  连对 x${combo}!` : `+${gain} 🪙`;
    else c.textContent = "";
    c.classList.remove("hidden");
    void c.offsetWidth;
    c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
  },
  onGameOver(stats) {
    // 结算并持久化
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

// ---------- 按钮事件 ----------
$("btnPlay").onclick = () => { sfx.click(); startGame(); };
$("btnGarage").onclick = () => { sfx.click(); openGarage(); };
$("garageBack").onclick = () => { sfx.click(); showMenu(); };
$("btnPause").onclick = () => { sfx.click(); pauseGame(); };
$("btnResume").onclick = () => { sfx.click(); resumeGame(); };
$("btnQuit").onclick = () => { sfx.click(); gameScene.stop(); openGarage(); };
$("btnReplay").onclick = () => { sfx.click(); startGame(); };
$("btnToGarage").onclick = () => { sfx.click(); openGarage(); };
$("btnToMenu").onclick = () => { sfx.click(); showMenu(); };

$("autoDiff").checked = state.autoDifficulty;
$("autoDiff").onchange = (e) => { state.autoDifficulty = e.target.checked; save(); };

$("btnSound").onclick = () => {
  state.sound = !state.sound;
  setSoundEnabled(state.sound);
  save();
  $("btnSound").textContent = state.sound ? "🔊 声音：开" : "🔇 声音：关";
  if (state.sound) sfx.click();
};

// 触控按钮
$("touchLeft").onclick = () => gameScene.setLane(-1);
$("touchRight").onclick = () => gameScene.setLane(1);

// 键盘
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  switch (e.key) {
    case "ArrowLeft": case "a": case "A": gameScene.setLane(-1); break;
    case "ArrowRight": case "d": case "D": gameScene.setLane(1); break;
    case "Escape": case "p": case "P":
      if (gameScene.active) pauseGame();
      else if (!screens.pause.classList.contains("hidden")) resumeGame();
      break;
  }
});

// 点击画面左右半区切换车道（移动端）
canvas.addEventListener("pointerdown", (e) => {
  if (renderTarget !== "game" || !gameScene.active) return;
  gameScene.setLane(e.clientX < window.innerWidth / 2 ? -1 : 1);
});

// ---------- 尺寸 ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  gameScene.resize(w, h);
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
