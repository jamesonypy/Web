// 游戏主玩法：赛车在三车道前进，穿过正确答案的闸门得分。
// 采用「世界向后移动、车保持原地」的跑酷式做法，可无限延伸。
import * as THREE from "three";
import { buildCar } from "./carFactory.js";
import { generateProblem, speedForLevel, makeAutoDifficulty, MAX_LEVEL } from "./math.js";
import { sfx } from "./audio.js";

// 相机在车后方朝 +z 看，世界 +x 会显示在屏幕左侧；
// 因此按「车道 0 = 屏幕最左」排列 x 坐标，保证左右键方向与画面一致。
const LANES = [3.5, 0, -3.5];
const TILE_LEN = 20;
const TILE_COUNT = 10;
const SPAWN_Z = 120;       // 闸门出现的前方距离
const ROAD_WIDTH = 14;
const START_LIVES = 3;

// 不同难度的公路环境配色（天空 / 草地 / 路面），随等级循环切换
const ROAD_THEMES = [
  { name: "晴空草原", sky: 0x8fd3ff, grass: 0x5cab46, road: 0x40434f },
  { name: "金色黄昏", sky: 0xffce9a, grass: 0x6a8f3c, road: 0x45414a },
  { name: "沙漠公路", sky: 0xffe2a8, grass: 0xc9a95f, road: 0x6b5d44 },
  { name: "雪原赛道", sky: 0xdff1ff, grass: 0xcfe0ea, road: 0x55606b },
  { name: "霓虹夜行", sky: 0x1c2546, grass: 0x2a3a30, road: 0x2a2d38 },
  { name: "火星地表", sky: 0xe0a080, grass: 0x9c5030, road: 0x5a3a30 },
];

export class GameScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.callbacks = {};
    this.active = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 70, 150);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    camera.position.set(0, 5.4, -9.5);
    camera.lookAt(0, 1.2, 12);
    this.camera = camera;
    this.camBaseY = 5.4;

    // 灯光
    const hemi = new THREE.HemisphereLight(0xcfeaff, 0x4a6b3a, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
    sun.position.set(-14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 30;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
    sun.target.position.set(0, 0, 10);
    scene.add(sun, sun.target);

    // 草地（大底面，随车循环重置不可见的边界由 fog 遮挡）
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 600),
      new THREE.MeshStandardMaterial({ color: 0x5cab46, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, 40);
    grass.receiveShadow = true;
    scene.add(grass);
    this.grass = grass;

    this._buildRoad();
    this._buildScenery();

    this.carHolder = new THREE.Group();
    scene.add(this.carHolder);
    this.car = null;

    this._reset();
  }

  setCallbacks(cb) { this.callbacks = cb; }

  // ---------- 道路 ----------
  _buildRoad() {
    this.tiles = [];
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x40434f, roughness: 0.95 });
    this.roadMat = roadMat;
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4d35e, emissive: 0x665500, emissiveIntensity: 0.2 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });

    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = new THREE.Group();
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, TILE_LEN), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      tile.add(road);

      // 车道虚线（两条分隔线）
      for (const lx of [-ROAD_WIDTH / 6, ROAD_WIDTH / 6]) {
        for (let d = -TILE_LEN / 2 + 2; d < TILE_LEN / 2; d += 4) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2), lineMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(lx, 0.01, d);
          tile.add(dash);
        }
      }
      // 路肩白线
      for (const ex of [-ROAD_WIDTH / 2 + 0.3, ROAD_WIDTH / 2 - 0.3]) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.18, TILE_LEN), edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(ex, 0.01, 0);
        tile.add(edge);
      }
      tile.position.z = i * TILE_LEN - TILE_LEN;
      this.scene.add(tile);
      this.tiles.push(tile);
    }
  }

  // ---------- 路边景物 ----------
  _makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1, 7),
      new THREE.MeshStandardMaterial({ color: 0x7a4a25 }));
    trunk.position.y = 0.5;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e8b3d }));
    leaves.position.y = 2.0;
    g.add(trunk, leaves);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  _makeBuilding() {
    const h = 3 + Math.random() * 5;
    const colors = [0xd98b6a, 0x6a8bd9, 0x8bd96a, 0xd9c46a, 0xb06ad9];
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.5 + Math.random() * 2, h, 2.5 + Math.random() * 2),
      new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] }));
    b.position.y = h / 2;
    b.castShadow = true;
    return b;
  }
  _buildScenery() {
    this.scenery = [];
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const item = Math.random() < 0.6 ? this._makeTree() : this._makeBuilding();
      const z = Math.random() * (TILE_COUNT * TILE_LEN);
      const x = side * (ROAD_WIDTH / 2 + 3 + Math.random() * 10);
      item.position.set(x, 0, z);
      item.userData.side = side;
      this.scene.add(item);
      this.scenery.push(item);
    }
  }
  _recycleScenery(item) {
    item.position.z += TILE_COUNT * TILE_LEN;
    item.position.x = item.userData.side * (ROAD_WIDTH / 2 + 3 + Math.random() * 10);
  }

  // ---------- 闸门 / 题目面板 ----------
  _makePanel(text, lane) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 160;
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(10,16,40,0.9)";
    roundRect(c, 8, 8, 240, 144, 20); c.fill();
    c.lineWidth = 8; c.strokeStyle = "#ffce3a"; c.stroke();
    c.fillStyle = "#ffffff";
    c.font = "bold 86px 'Segoe UI', sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(String(text), 128, 84);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), mat);
    panel.rotation.y = Math.PI;           // 面向相机（-z）
    panel.position.set(LANES[lane], 2.6, 0);
    return panel;
  }
  _makeArch(lane, slabColor) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.5 });
    const post = (x) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), postMat);
      m.position.set(x, 2, 0); g.add(m);
    };
    post(LANES[lane] - 1.6); post(LANES[lane] + 1.6);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.3), postMat);
    top.position.set(LANES[lane], 4, 0); g.add(top);
    // 半透明可穿过的色幕
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.6),
      new THREE.MeshBasicMaterial({ color: slabColor, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    slab.position.set(LANES[lane], 1.9, 0);
    g.add(slab);
    g.userData.slab = slab;
    g.userData.lane = lane;
    return g;
  }

  _spawnRound() {
    const prob = generateProblem(this.level);
    const count = prob.choiceCount;

    // 选择使用哪些车道
    let lanes;
    if (count === 2) {
      lanes = Math.random() < 0.5 ? [0, 2] : (Math.random() < 0.5 ? [0, 1] : [1, 2]);
    } else {
      lanes = [0, 1, 2];
    }

    const group = new THREE.Group();
    group.position.z = SPAWN_Z;
    const laneToOption = {};
    let correctLane = lanes[0];

    lanes.forEach((lane, i) => {
      const optVal = prob.options[i];
      laneToOption[lane] = optVal;
      if (optVal === prob.answer) correctLane = lane;
      const arch = this._makeArch(lane, 0x4aa3ff);
      const panel = this._makePanel(optVal, lane);
      group.add(arch, panel);
    });

    this.scene.add(group);
    this.activeRound = {
      group, lanes, laneToOption, correctLane,
      answer: prob.answer, text: prob.text, answered: false,
    };
    this.totalQuestions++;
    if (this.callbacks.onQuestion) this.callbacks.onQuestion(prob.text);
  }

  _evaluateRound() {
    const r = this.activeRound;
    r.answered = true;
    const inLane = r.lanes.includes(this.laneIndex);
    const correct = inLane && this.laneIndex === r.correctLane;

    // 高亮闸门
    r.group.children.forEach((child) => {
      if (child.userData && child.userData.slab) {
        const lane = child.userData.lane;
        if (lane === r.correctLane) child.userData.slab.material.color.setHex(0x2ee6a6);
        else if (lane === this.laneIndex) child.userData.slab.material.color.setHex(0xff5d6c);
      }
    });

    if (correct) {
      this.correctCount++;
      const gain = 3 + this.level + Math.min(8, Math.floor(this.combo / 2));
      this.coins += gain;
      this.coinsEarned += gain;
      this.combo++;
      this.score += 10 * this.level + (this.combo > 1 ? this.combo : 0);
      sfx.correct(); sfx.coin();
      if (this.callbacks.onFeedback) this.callbacks.onFeedback(true, gain, this.combo);
      if (this.auto && this.auto.correct()) this._applyLevel(this.auto.level, true);
    } else {
      this.combo = 0;
      this.lives--;
      sfx.wrong();
      this.shake = 0.4;
      const msg = inLane ? `正确答案是 ${r.answer}` : `错过啦！答案 ${r.answer}`;
      if (this.callbacks.onFeedback) this.callbacks.onFeedback(false, 0, 0, msg);
      if (this.auto && this.auto.wrong()) this._applyLevel(this.auto.level, false);
    }
    this._pushHud();

    // 0.4 秒后移除闸门
    setTimeout(() => {
      this.scene.remove(r.group);
      r.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose?.(); o.material.map?.dispose?.(); o.material.dispose?.(); } });
    }, 350);
    this.activeRound = null;
    this.spawnCooldown = 0.7;

    if (this.lives <= 0) this._gameOver();
  }

  _applyLevel(level, up) {
    this.level = level;
    this.targetSpeed = speedForLevel(level);
    if (this.callbacks.onFeedback) {
      this.callbacks.onFeedback(up, 0, 0, up ? `🔥 难度提升至 LV${level}` : `难度降至 LV${level}`);
    }
  }

  // ---------- 生命周期 ----------
  _reset() {
    this.distance = 0;
    this.coins = 0;
    this.score = 0;
    this.level = 1;
    this.lives = START_LIVES;
    this.combo = 0;
    this.laneIndex = 1;
    this.targetX = LANES[1];
    this.speed = 0;
    this.targetSpeed = speedForLevel(1);
    this.activeRound = null;
    this.spawnCooldown = 1.2;
    this.totalQuestions = 0;
    this.correctCount = 0;
    this.coinsEarned = 0;
    this.shake = 0;
    this.auto = null;
  }

  start({ carParams, level, autoDifficulty }) {
    this._reset();
    this.level = level;
    this.targetSpeed = speedForLevel(level);
    if (autoDifficulty) this.auto = makeAutoDifficulty(level);

    // 按难度切换环境配色，使不同难度地图不再雷同
    const th = ROAD_THEMES[(level - 1) % ROAD_THEMES.length];
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.sky, 70, 150);
    this.grass.material.color.setHex(th.grass);
    if (this.roadMat) this.roadMat.color.setHex(th.road);

    // 清掉旧车
    if (this.car) { this.carHolder.remove(this.car); disposeObj(this.car); }
    this.car = buildCar(carParams);
    this.car.position.set(LANES[1], 0, 0);
    this.carHolder.add(this.car);

    // 移除残留闸门
    if (this.activeRound) { this.scene.remove(this.activeRound.group); this.activeRound = null; }

    this.active = true;
    this._pushHud();
    if (this.callbacks.onQuestion) this.callbacks.onQuestion("准备…");
  }

  stop() { this.active = false; }
  pause() { this.active = false; }
  resume() { this.active = true; }

  setLane(dir) {
    if (!this.active) return;
    const ni = Math.min(2, Math.max(0, this.laneIndex + dir));
    if (ni !== this.laneIndex) { this.laneIndex = ni; this.targetX = LANES[ni]; sfx.click(); }
  }

  _gameOver() {
    this.active = false;
    sfx.gameover();
    const acc = this.totalQuestions ? Math.round((this.correctCount / this.totalQuestions) * 100) : 0;
    if (this.callbacks.onGameOver) {
      this.callbacks.onGameOver({
        score: this.score, coins: this.coinsEarned,
        correct: this.correctCount, total: this.totalQuestions, accuracy: acc,
      });
    }
  }

  _pushHud() {
    if (this.callbacks.onHud) {
      this.callbacks.onHud({ coins: this.coinsEarned, score: this.score, level: this.level, lives: this.lives });
    }
  }

  // ---------- 每帧 ----------
  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);

    // 加速到目标速度
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 1.5);
    const move = this.speed * dt;
    this.distance += move;

    // 移动道路
    for (const tile of this.tiles) {
      tile.position.z -= move;
      if (tile.position.z < -TILE_LEN * 1.5) tile.position.z += TILE_COUNT * TILE_LEN;
    }
    // 移动景物
    for (const item of this.scenery) {
      item.position.z -= move;
      if (item.position.z < -10) this._recycleScenery(item);
    }
    // 草地跟随（避免边界）
    this.grass.position.z = 40; // 静止足够大

    // 车辆横移 + 轮子转动 + 轻微摆动
    const car = this.car;
    if (car) {
      car.position.x += (this.targetX - car.position.x) * Math.min(1, dt * 10);
      const tilt = (this.targetX - car.position.x) * -0.05;
      car.rotation.z = tilt;
      car.position.y = Math.sin(this.distance * 0.5) * 0.02;
      const spin = (this.speed / 0.42) * dt;
      car.traverse((o) => { if (o.userData && o.userData.isWheel) o.rotation.x += spin; });
    }

    // 闸门移动 / 触发判定
    if (this.activeRound) {
      const r = this.activeRound;
      r.group.position.z -= move;
      if (!r.answered && r.group.position.z <= 0.2) this._evaluateRound();
      else if (r.group.position.z < -12) { this.scene.remove(r.group); this.activeRound = null; this.spawnCooldown = 0.7; }
    } else {
      this.spawnCooldown -= dt;
      if (this.active && this.lives > 0 && this.spawnCooldown <= 0) this._spawnRound();
    }

    // 相机抖动（答错时）
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x = (Math.random() - 0.5) * 0.3;
      this.camera.position.y = this.camBaseY + (Math.random() - 0.5) * 0.2;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * 0.2;
      this.camera.position.y += (this.camBaseY - this.camera.position.y) * 0.2;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function disposeObj(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    }
  });
}
