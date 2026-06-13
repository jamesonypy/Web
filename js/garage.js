// 车库：3D 转台预览 + 购买 / 改装 UI
import * as THREE from "three";
import {
  MODELS, getModel, resolveParams, buildCar, getStats,
  BODY_COLORS, WHEEL_COLORS, FINISHES, WHEEL_STYLES,
} from "./carFactory.js";
import { sfx } from "./audio.js";

export class Garage {
  constructor(renderer, state, save, callbacks = {}) {
    this.renderer = renderer;
    this.state = state;
    this.save = save;
    this.cb = callbacks;
    this.previewId = state.selectedCar;

    // ---- 3D 预览场景 ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121a33);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(5.5, 3.4, 7);
    camera.lookAt(0, 0.7, 0);
    this.camera = camera;

    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x20263a, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(6, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66aaff, 0.6);
    rim.position.set(-6, 4, -6);
    scene.add(rim);

    // 转台
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4.2, 0.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3358, roughness: 0.6, metalness: 0.3 })
    );
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    scene.add(platform);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.0, 0.06, 12, 48),
      new THREE.MeshStandardMaterial({ color: 0xffce3a, emissive: 0x553f00, emissiveIntensity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    this.turntable = new THREE.Group();
    scene.add(this.turntable);
    this.car = null;

    this._cacheDom();
    this._bindStatic();
    this._rebuildPreview();
    this.refreshAll();
  }

  _cacheDom() {
    this.dom = {
      list: document.getElementById("garageList"),
      coins: document.getElementById("garageCoins"),
      name: document.getElementById("carName"),
      desc: document.getElementById("carDesc"),
      stats: document.getElementById("carStats"),
      price: document.getElementById("carPriceRow"),
      bodyColors: document.getElementById("bodyColors"),
      finish: document.getElementById("finishBtns"),
      wheelStyles: document.getElementById("wheelStyles"),
      wheelColors: document.getElementById("wheelColors"),
      spoiler: document.getElementById("spoilerBtns"),
    };
  }

  _custom(id = this.previewId) {
    if (!this.state.customizations[id]) this.state.customizations[id] = {};
    return this.state.customizations[id];
  }
  _owned(id = this.previewId) { return this.state.ownedCars.includes(id); }

  // ---------- 静态控件（颜色/质感/轮毂/尾翼）----------
  _bindStatic() {
    // 车身颜色
    BODY_COLORS.forEach((c) => {
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = "#" + c.toString(16).padStart(6, "0");
      sw.dataset.color = c;
      sw.onclick = () => this._setCustom("color", c);
      this.dom.bodyColors.appendChild(sw);
    });
    // 轮毂颜色
    WHEEL_COLORS.forEach((c) => {
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = "#" + c.toString(16).padStart(6, "0");
      sw.dataset.wcolor = c;
      sw.onclick = () => this._setCustom("wheelColor", c);
      this.dom.wheelColors.appendChild(sw);
    });
    // 质感
    FINISHES.forEach((f) => {
      const b = document.createElement("button");
      b.textContent = f.name; b.dataset.finish = f.id;
      b.onclick = () => this._setCustom("finish", f.id);
      this.dom.finish.appendChild(b);
    });
    // 轮毂样式
    WHEEL_STYLES.forEach((w) => {
      const b = document.createElement("button");
      b.textContent = w.name; b.dataset.wstyle = w.id;
      b.onclick = () => this._setCustom("wheelStyle", w.id);
      this.dom.wheelStyles.appendChild(b);
    });
    // 尾翼
    [{ id: "off", name: "无" }, { id: "on", name: "有" }].forEach((o) => {
      const b = document.createElement("button");
      b.textContent = o.name; b.dataset.spoiler = o.id;
      b.onclick = () => this._setCustom("spoiler", o.id === "on");
      this.dom.spoiler.appendChild(b);
    });
  }

  _setCustom(key, val) {
    if (!this._owned()) return; // 未拥有不可改装
    this._custom()[key] = val;
    this.save();
    sfx.click();
    this._rebuildPreview();
    this._refreshCustomizeActive();
    if (this.cb.onChange) this.cb.onChange();
  }

  // ---------- 列表 ----------
  refreshAll() {
    this.dom.coins.textContent = this.state.coins;
    this._refreshList();
    this._refreshInfo();
    this._refreshCustomizeActive();
  }

  _refreshList() {
    this.dom.list.innerHTML = "";
    MODELS.forEach((m) => {
      const owned = this._owned(m.id);
      const card = document.createElement("div");
      card.className = "car-card" + (m.id === this.previewId ? " active" : "");
      const priceTxt = owned
        ? (this.state.selectedCar === m.id ? '<small class="owned-tag">使用中</small>' : '<small class="owned-tag">已拥有</small>')
        : `<small class="lock">🪙 ${m.price}</small>`;
      card.innerHTML = `<div class="thumb">${m.emoji}</div><b>${m.name}</b>${priceTxt}`;
      card.onclick = () => {
        this.previewId = m.id;
        sfx.click();
        // 点击已拥有的车 = 直接选用；未拥有的仅预览（再点购买）
        if (this.state.ownedCars.includes(m.id)) {
          this.state.selectedCar = m.id;
          this.save();
          if (this.cb.onChange) this.cb.onChange();
        }
        this._rebuildPreview();
        this.refreshAll();
      };
      this.dom.list.appendChild(card);
    });
  }

  _refreshInfo() {
    const m = getModel(this.previewId);
    this.dom.name.textContent = m.name;
    this.dom.desc.textContent = m.desc;
    this._renderStats(m);
    this.dom.price.innerHTML = "";

    const owned = this._owned();
    if (!owned) {
      const canAfford = this.state.coins >= m.price;
      const btn = document.createElement("button");
      btn.className = "btn btn-primary" + (canAfford ? "" : " disabled");
      btn.textContent = canAfford ? `🪙 购买 (${m.price})` : `金币不足 (需 ${m.price})`;
      btn.disabled = !canAfford;
      btn.onclick = () => this._buy(m);
      this.dom.price.appendChild(btn);
    } else if (this.state.selectedCar === this.previewId) {
      const span = document.createElement("div");
      span.className = "owned-tag";
      span.textContent = "✓ 当前使用中";
      this.dom.price.appendChild(span);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = "🚗 选择这辆车";
      btn.onclick = () => this._select(m.id);
      this.dom.price.appendChild(btn);
    }
  }

  _buy(m) {
    if (this.state.coins < m.price) return;
    this.state.coins -= m.price;
    this.state.ownedCars.push(m.id);
    this.state.selectedCar = m.id;
    this.save();
    sfx.buy();
    this.refreshAll();
    if (this.cb.onChange) this.cb.onChange();
  }

  _select(id) {
    this.state.selectedCar = id;
    this.save();
    sfx.click();
    this.refreshAll();
    if (this.cb.onChange) this.cb.onChange();
  }

  _renderStats(m) {
    const s = getStats(m);
    const rows = [
      ["动力", s.power], ["操控", s.grip], ["越野", s.clearance],
    ];
    this.dom.stats.innerHTML = rows.map(([label, v]) =>
      `<div class="stat-bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%"></div></div></div>`
    ).join("");
  }

  _refreshCustomizeActive() {
    const owned = this._owned();
    const params = resolveParams(getModel(this.previewId), this._custom());
    const setActive = (container, attr, value) => {
      container.querySelectorAll("[data-" + attr + "]").forEach((el) => {
        const v = el.dataset[attr];
        const match = String(value) === v || Number(value) === Number(v) ||
          (attr === "spoiler" && ((value && v === "on") || (!value && v === "off")));
        el.classList.toggle("active", match);
        el.style.opacity = owned ? "1" : "0.4";
        el.style.pointerEvents = owned ? "auto" : "none";
      });
    };
    setActive(this.dom.bodyColors, "color", params.color);
    setActive(this.dom.wheelColors, "wcolor", params.wheelColor);
    setActive(this.dom.finish, "finish", params.finish);
    setActive(this.dom.wheelStyles, "wstyle", params.wheelStyle);
    setActive(this.dom.spoiler, "spoiler", params.spoiler);
  }

  // ---------- 预览模型 ----------
  _rebuildPreview() {
    if (this.car) { this.turntable.remove(this.car); disposeObj(this.car); }
    const params = resolveParams(getModel(this.previewId), this._custom());
    this.car = buildCar(params);
    // 让车头朝向略偏，便于观察；车身居中
    this.car.position.y = 0;
    this.turntable.add(this.car);
  }

  refreshCoinsDisplay() { this.dom.coins.textContent = this.state.coins; }

  update(dt) {
    this.turntable.rotation.y += dt * 0.5;
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
