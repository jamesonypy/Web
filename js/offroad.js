// 越野模式：自动向前行驶的越野赛道，可左右连续转向、随地形起伏颠簸，
// 收集星星、躲避石块泥地，冲过终点「通关」，随后进入数学测验（在 main 里处理）。
//
// 地形做法：高度函数 H(x, w) 在 w 方向以 P 为周期；地面瓦片烘焙一次后循环复用，
// 小车在 (carX, phase) 处采样同一个 H，保证车与地面始终贴合。
import * as THREE from "three";
import { buildCar } from "./carFactory.js";
import { sfx } from "./audio.js";

const TILE_W = 44;
const TILE_LEN = 16;
const TILE_COUNT = 14;
const PERIOD = TILE_COUNT * TILE_LEN;   // 高度函数在 w 方向的周期
const TRACK_HALF = 8;                   // 可行驶赛道半宽
const RIDE = 0.06;                       // 车模型轮底即在原点，仅留极小离地避免穿模
const SEG_W = 22, SEG_L = 10;           // 瓦片细分

// 周期性地形高度函数（所有 w 频率都是基频 2π/P 的整数倍，保证瓦片循环无缝）
const K = (2 * Math.PI) / PERIOD;
function terrainH(x, w, amp = 1) {
  // 中央赛道更平缓，便于行驶；两侧更崎岖
  const calm = 0.45 + 0.55 * Math.min(1, Math.abs(x) / TRACK_HALF);
  const h =
    1.05 * Math.sin(w * K * 3) +
    0.70 * Math.cos(w * K * 5 + x * 0.16) +
    0.45 * Math.sin(x * 0.45) * Math.cos(w * K * 2) +
    0.30 * Math.sin(x * 0.8 + w * K * 7);
  return h * calm * amp;
}

// 不同关卡的地形主题（随通关推进循环切换），各有配色、天空、植被与起伏
const THEMES = [
  { id: "grass",   name: "草原",   sky: 0xbfe3ff, fogNear: 60, fogFar: 132, hemi: [0xdff0ff, 0x6b5a3a],
    track: 0x9a7b4f, trackHi: 0xb89a66, grass: 0x5c8a3e, grassHi: 0x6fa24a, rockHi: 0x8a8276, scenery: "tree",   amp: 1.0 },
  { id: "desert",  name: "沙漠",   sky: 0xffe2a8, fogNear: 55, fogFar: 122, hemi: [0xfff0cf, 0x9c7a45],
    track: 0xd9b878, trackHi: 0xe8caa0, grass: 0xc9a95f, grassHi: 0xd8b96e, rockHi: 0xb89066, scenery: "cactus", amp: 1.15 },
  { id: "river",   name: "河流湿地", sky: 0xa9e7ff, fogNear: 55, fogFar: 122, hemi: [0xd6f5ff, 0x4a6b4a],
    track: 0x8a7b53, trackHi: 0xa0915f, grass: 0x4f9a52, grassHi: 0x67b46a, rockHi: 0x7d8a76, scenery: "tree",   amp: 0.7, water: true },
  { id: "glacier", name: "冰川",   sky: 0xdff1ff, fogNear: 45, fogFar: 112, hemi: [0xeaf6ff, 0x8aa6b8],
    track: 0xcfe6f2, trackHi: 0xeaf6ff, grass: 0xbcd8e6, grassHi: 0xd6ecf5, rockHi: 0x9fc0d2, scenery: "pine",   amp: 1.1, slippery: true },
  { id: "canyon",  name: "峡谷",   sky: 0xf0b48a, fogNear: 55, fogFar: 120, hemi: [0xffd8b0, 0x7a3a20],
    track: 0xb5673e, trackHi: 0xcf7e4e, grass: 0x9c4f30, grassHi: 0xb86641, rockHi: 0x8a4a30, scenery: "rock",   amp: 1.4 },
  { id: "volcano", name: "火山",   sky: 0x53384a, fogNear: 40, fogFar: 100, hemi: [0xff8a5a, 0x331a1a],
    track: 0x3a3338, trackHi: 0x57484a, grass: 0x2e2730, grassHi: 0x4a3a3a, rockHi: 0x7a3a30, scenery: "rock",   amp: 1.3 },
];

export class OffroadScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.callbacks = {};
    this.active = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3ff);
    scene.fog = new THREE.Fog(0xbfe3ff, 60, 130);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera = camera;

    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6b5a3a, 0.95));
    this.hemi = scene.children[scene.children.length - 1];
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
    sun.position.set(-16, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 34;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
    sun.target.position.set(0, 0, 12);
    scene.add(sun, sun.target);

    this.theme = THEMES[0];
    this.amp = 1.0;
    this.tiles = [];
    this.items = [];
    this.deco = [];

    // 车体：yaw(转向) → tilt(俯仰/侧倾) → 模型
    this.carYaw = new THREE.Group();
    this.carTilt = new THREE.Group();
    this.carYaw.add(this.carTilt);
    scene.add(this.carYaw);
    this.car = null;

    this._reset();
  }

  setCallbacks(cb) { this.callbacks = cb; }

  // ---------- 主题 ----------
  _applyTheme(level) {
    this.theme = THEMES[(level - 1) % THEMES.length];
    this.amp = this.theme.amp;
    this.scene.background = new THREE.Color(this.theme.sky);
    this.scene.fog = new THREE.Fog(this.theme.sky, this.theme.fogNear, this.theme.fogFar);
    if (this.hemi) { this.hemi.color.setHex(this.theme.hemi[0]); this.hemi.groundColor.setHex(this.theme.hemi[1]); }
  }

  // ---------- 地形（按主题配色 + 振幅）----------
  _disposeTerrain() {
    for (const t of this.tiles) { this.scene.remove(t); disposeObj(t); }
    this.tiles = [];
  }
  _buildTerrain() {
    const th = this.theme;
    const cTrack = new THREE.Color(th.track), cTrackHi = new THREE.Color(th.trackHi);
    const cGrass = new THREE.Color(th.grass), cGrassHi = new THREE.Color(th.grassHi);
    const cRock = new THREE.Color(th.rockHi);
    for (let i = 0; i < TILE_COUNT; i++) {
      const geo = new THREE.PlaneGeometry(TILE_W, TILE_LEN, SEG_W, SEG_L);
      geo.rotateX(-Math.PI / 2);
      const baseZ = i * TILE_LEN - TILE_LEN;
      const pos = geo.attributes.position;
      const colors = [];
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const w = baseZ + pos.getZ(v);
        const y = terrainH(x, w, this.amp);
        pos.setY(v, y);
        const onTrack = Math.abs(x) < TRACK_HALF;
        let c;
        if (onTrack) c = cTrack.clone().lerp(cTrackHi, Math.max(0, Math.min(1, (y + 1.5 * this.amp) / (3 * this.amp))));
        else if (y > 1.3 * this.amp) c = cRock.clone();
        else c = cGrass.clone().lerp(cGrassHi, Math.random() * 0.4);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
      const tile = new THREE.Mesh(geo, mat);
      tile.position.z = baseZ;
      tile.receiveShadow = true;
      this.scene.add(tile);
      this.tiles.push(tile);
    }
  }

  _makeRock() {
    const r = 0.5 + Math.random() * 0.7;
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 1, flatShading: true })
    );
    m.castShadow = true;
    m.userData = { type: "rock", r };
    return m;
  }
  _makeMud() {
    const water = !!this.theme.water;
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 18),
      new THREE.MeshStandardMaterial({
        color: water ? 0x3a86c8 : 0x4a3b28, roughness: water ? 0.3 : 1,
        metalness: water ? 0.4 : 0, transparent: water, opacity: water ? 0.8 : 1,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.userData = { type: "mud", r: 1.7 };   // 行为同泥地（减速），河流主题显示为水洼
    return m;
  }
  _makeStar() {
    const g = new THREE.Group();
    const star = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0xffce3a, emissive: 0x9c7400, emissiveIntensity: 0.7, flatShading: true })
    );
    g.add(star);
    g.userData = { type: "star", r: 1.1, spin: star };
    g.castShadow = true;
    return g;
  }
  // 按主题生成两侧装饰：树 / 仙人掌 / 雪松 / 岩石
  _makeScenery() {
    const kind = this.theme.scenery;
    const g = new THREE.Group();
    if (kind === "cactus") {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a8c3a, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 2.4, 8), mat);
      body.position.y = 1.2;
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 6), mat);
      armL.position.set(-0.45, 1.4, 0); armL.rotation.z = 0.5;
      const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 6), mat);
      armR.position.set(0.45, 1.6, 0); armR.rotation.z = -0.5;
      g.add(body, armL, armR);
    } else if (kind === "pine") {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 7),
        new THREE.MeshStandardMaterial({ color: 0x5a3a1e }));
      trunk.position.y = 0.45;
      const snowMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a });
      g.add(trunk);
      for (let k = 0; k < 3; k++) {
        const tier = new THREE.Mesh(new THREE.ConeGeometry(1.2 - k * 0.3, 1.2, 8), snowMat);
        tier.position.y = 1.1 + k * 0.85;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.22 - k * 0.3, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xf2f8ff }));
        cap.position.y = 1.5 + k * 0.85;
        g.add(tier, cap);
      }
    } else if (kind === "rock") {
      const mat = new THREE.MeshStandardMaterial({ color: this.theme.rockHi, roughness: 1, flatShading: true });
      const r = 1.0 + Math.random() * 1.4;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      m.position.y = r * 0.5; m.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(m);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x6e4423 }));
      trunk.position.y = 0.6;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a7d35 }));
      leaves.position.y = 2.3;
      g.add(trunk, leaves);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData = { type: "deco" };
    return g;
  }

  _disposeItems() {
    for (const it of this.items) { this.scene.remove(it); disposeObj(it); }
    for (const t of this.deco) { this.scene.remove(t); disposeObj(t); }
    this.items = [];
    this.deco = [];
  }
  _buildItems() {
    this.items = [];      // 赛道内可交互物：star / rock / mud(or water)
    this.deco = [];       // 两侧装饰
    const mudChance = this.theme.water ? 0.4 : 0.22;
    for (let i = 0; i < 26; i++) {
      const roll = Math.random();
      const item = roll < 0.5 ? this._makeStar()
        : (roll < 1 - mudChance ? this._makeRock() : this._makeMud());
      this.scene.add(item);
      this.items.push(item);
      this._placeItem(item, Math.random() * PERIOD * 1.5 + 20);
    }
    for (let i = 0; i < 18; i++) {
      const t = this._makeScenery();
      this.scene.add(t);
      this.deco.push(t);
      this._placeDeco(t, Math.random() * PERIOD * 1.5 + 20);
    }
  }
  _placeItem(item, z) {
    item.position.z = z;
    item.position.x = (Math.random() * 2 - 1) * (TRACK_HALF - 1.5);
    item.userData.collected = false;
    item.visible = true;
  }
  _placeDeco(t, z) {
    t.position.z = z;
    const side = Math.random() < 0.5 ? -1 : 1;
    t.position.x = side * (TRACK_HALF + 2 + Math.random() * 12);
  }

  // ---------- 生命周期 ----------
  _reset() {
    this.phase = 0;
    this.carX = 0;
    this.v = 0;
    this.carY = RIDE;
    this.vy = 0;
    this.steerInput = 0;
    this.throttle = 0.7;   // 默认巡航(0.7)，踩油门时 1，保证不卡死又有加速感
    this.braking = false;
    this.runScore = 0;
    this.stars = 0;
    this.time = 0;
    this.rockHits = 0;
    this.finished = false;
    this.stats = { power: 0.4, grip: 0.5, clearance: 0.4 };
    this.courseLen = 900;
    this.timeLimit = 90;
  }

  start({ carParams, stats, level }) {
    this._reset();
    this.stats = stats || this.stats;
    this.level = level || 1;
    // 关卡越高赛道越长、限时略紧
    this.courseLen = 820 + (this.level - 1) * 160;
    this.timeLimit = 95 + (this.level - 1) * 10;

    // 按关卡切换地形主题（草原/沙漠/河流/冰川/峡谷/火山…），重建地形与景物
    this._applyTheme(this.level);
    this._disposeTerrain(); this._buildTerrain();
    this._disposeItems(); this._buildItems();

    if (this.car) { this.carTilt.remove(this.car); disposeObj(this.car); }
    this.car = buildCar(carParams);
    this.carTilt.add(this.car);

    this.camera.position.set(0, RIDE + 4.2, -9);
    this.camera.lookAt(0, RIDE + 1, 14);

    this.active = true;
    this._pushHud();
  }

  get themeName() { return this.theme ? this.theme.name : ""; }

  stop() { this.active = false; }
  pause() { this.active = false; }
  resume() { this.active = true; }

  // 相机在车后朝 +z 看，世界 +x 显示在屏幕左侧；故转向取反，使按键方向与画面一致
  setSteer(dir) { this.steerInput = -dir; }           // -1 左 / 0 / 1 右
  setThrottle(on) { this.throttle = on ? 1 : 0.7; }   // 踩=全力，松=巡航
  setBrake(on) { this.braking = on; }

  _pushHud() {
    if (this.callbacks.onHud) {
      this.callbacks.onHud({
        score: Math.round(this.runScore),
        stars: this.stars,
        speed: Math.round(this.v * 3.6),         // 粗略 km/h
        progress: Math.min(1, this.phase / this.courseLen),
        time: Math.max(0, this.timeLimit - this.time),
        theme: this.themeName,
        level: this.level,
      });
    }
  }

  _finishDrive(reason) {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    // 冲过终点额外时间奖励
    let timeBonus = 0;
    if (reason === "finish") {
      timeBonus = Math.max(0, Math.round((this.timeLimit - this.time) * 4));
      this.runScore += timeBonus;
      sfx.start();
    } else {
      sfx.gameover();
    }
    if (this.callbacks.onFinishDrive) {
      this.callbacks.onFinishDrive({
        reason,
        runScore: Math.round(this.runScore),
        stars: this.stars,
        timeBonus,
        time: Math.round(this.time),
        level: this.level,
      });
    }
  }

  // ---------- 每帧 ----------
  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // —— 地形坡度（沿前进方向 w 与横向 x）——
    const d = 0.6, A = this.amp;
    const hHere = terrainH(this.carX, this.phase, A);
    const dHdw = (terrainH(this.carX, this.phase + d, A) - terrainH(this.carX, this.phase - d, A)) / (2 * d);
    const dHdx = (terrainH(this.carX + d, this.phase, A) - terrainH(this.carX - d, this.phase, A)) / (2 * d);

    // —— 速度：受动力、上坡、泥地影响 ——
    const baseMax = 17 + this.stats.power * 16;
    const uphill = Math.max(0, dHdw);
    const downhill = Math.max(0, -dHdw);
    // 离地间隙低的车在崎岖处更吃亏
    const roughPenalty = (1 - this.stats.clearance) * Math.abs(dHdw) * 0.5;
    let speedMul = 1 - uphill * 0.6 - roughPenalty + downhill * 0.25;
    if (this._inMud) speedMul -= 0.45;
    speedMul = Math.max(0.2, Math.min(1.35, speedMul));
    let targetV = baseMax * speedMul * this.throttle;
    if (this.braking) targetV *= 0.15;
    const accel = this.braking ? 22 : 9;
    this.v += (targetV - this.v) * Math.min(1, dt * (this.v < targetV ? accel * 0.15 : 1.2));
    if (this.v < 0) this.v = 0;

    this.phase += this.v * dt;

    // —— 横向转向（速度越快越能转，抓地力影响转速）——
    const gripMul = this.theme.slippery ? 0.72 : 1;   // 冰川更滑，转向变弱
    const turnRate = 4.5 * (0.55 + this.stats.grip * 0.6) * gripMul;
    const speedFactor = Math.min(1, this.v / 8);
    this.carX += this.steerInput * turnRate * speedFactor * dt;
    this.carX = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, this.carX));

    // —— 地面瓦片滚动 + 循环 ——
    const move = this.v * dt;
    for (const tile of this.tiles) {
      tile.position.z -= move;
      if (tile.position.z < -TILE_LEN * 1.5) tile.position.z += PERIOD;
    }

    // —— 车辆垂直（弹簧悬挂，可短暂腾空）——
    const groundY = hHere + RIDE;
    const k = 60, c = 9;
    this.vy += (groundY - this.carY) * k * dt - this.vy * c * dt;
    this.carY += this.vy * dt;
    if (this.carY < groundY) { this.carY = groundY; if (this.vy < 0) this.vy = 0; }

    // —— 姿态 ——
    this.carYaw.position.set(this.carX, this.carY, 0);
    this.carYaw.rotation.y = this.steerInput * 0.18 * speedFactor;
    this.carTilt.rotation.x = Math.max(-0.5, Math.min(0.5, -dHdw * 0.5));
    this.carTilt.rotation.z = Math.max(-0.4, Math.min(0.4, dHdx * 0.5));
    if (this.car) {
      const spin = (this.v / 0.5) * dt;
      this.car.traverse((o) => { if (o.userData && o.userData.isWheel) o.rotation.x += spin; });
    }

    // —— 相机跟随 ——
    const camTargetX = this.carX * 0.55;
    this.camera.position.x += (camTargetX - this.camera.position.x) * Math.min(1, dt * 4);
    this.camera.position.y += (this.carY + 4.2 - this.camera.position.y) * Math.min(1, dt * 4);
    this.camera.position.z = -9;
    this.camera.lookAt(this.carX * 0.6, this.carY + 1.0, 14);

    // —— 道具滚动 / 碰撞 ——
    this._inMud = false;
    for (const item of this.items) {
      item.position.z -= move;
      const wz = this.phase + item.position.z;       // 道具世界 w 坐标
      const baseY = terrainH(item.position.x, wz, this.amp);
      const ud = item.userData;
      if (ud.type === "star") {
        item.position.y = baseY + 1.1 + Math.sin(this.time * 3 + item.position.x) * 0.15;
        if (ud.spin) ud.spin.rotation.y += dt * 3;
      } else if (ud.type === "rock") {
        item.position.y = baseY + ud.r * 0.55;
      } else {
        item.position.y = baseY + 0.03;
      }
      // 进入车辆所在的 z≈0 平面时判定
      if (!ud.collected && item.visible && Math.abs(item.position.z) < 1.6) {
        const dx = Math.abs(item.position.x - this.carX);
        if (ud.type === "star" && dx < ud.r) {
          ud.collected = true; item.visible = false;
          this.stars++; this.runScore += 25; sfx.coin();
        } else if (ud.type === "rock" && dx < ud.r + 0.7) {
          ud.collected = true; item.visible = false;
          this.v *= 0.45; this.runScore = Math.max(0, this.runScore - 12);
          this.rockHits++; this.vy += 4; sfx.wrong();
        } else if (ud.type === "mud" && dx < ud.r) {
          this._inMud = true;
        }
      }
      if (item.position.z < -8) this._placeItem(item, item.position.z + PERIOD + Math.random() * 40);
    }
    for (const t of this.deco) {
      t.position.z -= move;
      t.position.y = terrainH(t.position.x, this.phase + t.position.z, this.amp);
      if (t.position.z < -8) this._placeDeco(t, t.position.z + PERIOD + Math.random() * 40);
    }

    // 小幅持续得分（鼓励前进，但远小于星星）
    this.runScore += this.v * dt * 0.4;

    this._pushHud();

    // —— 结束判定 ——
    if (this.phase >= this.courseLen) this._finishDrive("finish");
    else if (this.time >= this.timeLimit) this._finishDrive("timeout");
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
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
