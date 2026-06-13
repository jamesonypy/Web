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
function terrainH(x, w) {
  // 中央赛道更平缓，便于行驶；两侧更崎岖
  const calm = 0.45 + 0.55 * Math.min(1, Math.abs(x) / TRACK_HALF);
  const h =
    1.05 * Math.sin(w * K * 3) +
    0.70 * Math.cos(w * K * 5 + x * 0.16) +
    0.45 * Math.sin(x * 0.45) * Math.cos(w * K * 2) +
    0.30 * Math.sin(x * 0.8 + w * K * 7);
  return h * calm;
}

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

    this._buildTerrain();
    this._buildItems();

    // 车体：yaw(转向) → tilt(俯仰/侧倾) → 模型
    this.carYaw = new THREE.Group();
    this.carTilt = new THREE.Group();
    this.carYaw.add(this.carTilt);
    scene.add(this.carYaw);
    this.car = null;

    this._reset();
  }

  setCallbacks(cb) { this.callbacks = cb; }

  // ---------- 地形 ----------
  _buildTerrain() {
    this.tiles = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      const geo = new THREE.PlaneGeometry(TILE_W, TILE_LEN, SEG_W, SEG_L);
      geo.rotateX(-Math.PI / 2);
      const baseZ = i * TILE_LEN - TILE_LEN;
      const pos = geo.attributes.position;
      const colors = [];
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const w = baseZ + pos.getZ(v);
        const y = terrainH(x, w);
        pos.setY(v, y);
        // 颜色：赛道土黄、两侧草绿、高处岩灰
        const onTrack = Math.abs(x) < TRACK_HALF;
        let c;
        if (onTrack) c = new THREE.Color(0x9a7b4f).lerp(new THREE.Color(0xb89a66), (y + 1.5) / 3);
        else if (y > 1.4) c = new THREE.Color(0x8a8276);
        else c = new THREE.Color(0x5c8a3e).lerp(new THREE.Color(0x6fa24a), Math.random() * 0.4);
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
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 1 })
    );
    m.rotation.x = -Math.PI / 2;
    m.userData = { type: "mud", r: 1.6 };
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
  _makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 7),
      new THREE.MeshStandardMaterial({ color: 0x6e4423 }));
    trunk.position.y = 0.6;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a7d35 }));
    leaves.position.y = 2.3;
    g.add(trunk, leaves);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData = { type: "tree" };
    return g;
  }

  _buildItems() {
    this.items = [];      // 赛道内可交互物：star / rock / mud
    this.deco = [];       // 两侧装饰：tree
    for (let i = 0; i < 26; i++) {
      const roll = Math.random();
      const item = roll < 0.5 ? this._makeStar() : (roll < 0.78 ? this._makeRock() : this._makeMud());
      this.scene.add(item);
      this.items.push(item);
      this._placeItem(item, Math.random() * PERIOD * 1.5 + 20);
    }
    for (let i = 0; i < 18; i++) {
      const t = this._makeTree();
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

    if (this.car) { this.carTilt.remove(this.car); disposeObj(this.car); }
    this.car = buildCar(carParams);
    this.carTilt.add(this.car);

    // 重新铺一遍道具，避免开局就撞上
    this.items.forEach((it) => this._placeItem(it, 30 + Math.random() * PERIOD * 1.5));
    this.deco.forEach((t) => this._placeDeco(t, Math.random() * PERIOD * 1.5));

    this.camera.position.set(0, RIDE + 4.2, -9);
    this.camera.lookAt(0, RIDE + 1, 14);

    this.active = true;
    this._pushHud();
  }

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
    const d = 0.6;
    const hHere = terrainH(this.carX, this.phase);
    const dHdw = (terrainH(this.carX, this.phase + d) - terrainH(this.carX, this.phase - d)) / (2 * d);
    const dHdx = (terrainH(this.carX + d, this.phase) - terrainH(this.carX - d, this.phase)) / (2 * d);

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
    const turnRate = 4.5 * (0.55 + this.stats.grip * 0.6);
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
      const baseY = terrainH(item.position.x, wz);
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
      t.position.y = terrainH(t.position.x, this.phase + t.position.z);
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
