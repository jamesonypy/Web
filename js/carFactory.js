// 程序化生成 3D 车辆模型（纯几何体，无需外部素材）
// 通过 bodyType 预设 + 改装参数，组合出多种外观。
import * as THREE from "three";

// ---------- 可购买车型列表 ----------
export const MODELS = [
  { id: "junker",   name: "小破车",   emoji: "🚙", price: 0,    desc: "锈迹斑斑的二手越野车，动力弱但底盘还行，越野起点。", base: { bodyType: "junker", color: 0x9c7a4d, finish: "matte", wheelStyle: "offroad" } },
  { id: "starter",  name: "小蜜蜂",   emoji: "🐝", price: 0,    desc: "灵巧的入门两厢车，新手好伙伴。", base: { bodyType: "hatchback", color: 0xffd23f } },
  { id: "cityCab",  name: "城市轿车", emoji: "🚗", price: 150,  desc: "经典三厢轿车，沉稳大方。",       base: { bodyType: "sedan", color: 0x4aa3ff } },
  { id: "roadster", name: "敞篷跑车", emoji: "🏎️", price: 320,  desc: "低矮敞篷，风驰电掣。",           base: { bodyType: "roadster", color: 0xff5d6c } },
  { id: "gtSport",  name: "GT 跑车",  emoji: "🚙", price: 480,  desc: "流线车身，自带尾翼。",           base: { bodyType: "sports", color: 0x2ee6a6, spoiler: true } },
  { id: "muscle",   name: "肌肉车",   emoji: "🚘", price: 600,  desc: "粗犷引擎盖，复古力量感。",       base: { bodyType: "muscle", color: 0xff8c1a } },
  { id: "suvX",     name: "都市 SUV", emoji: "🚐", price: 750,  desc: "高底盘，全家出行首选。",         base: { bodyType: "suv", color: 0x7b6cff, wheelStyle: "offroad" } },
  { id: "pickup",   name: "皮卡王",   emoji: "🛻", price: 900,  desc: "带货斗的硬派皮卡。",             base: { bodyType: "pickup", color: 0x3ccf7a } },
  { id: "van",      name: "欢乐巴士", emoji: "🚌", price: 1050, desc: "圆润可爱的小巴士。",             base: { bodyType: "van", color: 0xff79c6 } },
  { id: "monster",  name: "怪兽越野", emoji: "🚜", price: 1400, desc: "超大轮胎，翻山越岭。",           base: { bodyType: "jeep", color: 0x44d62c, wheelStyle: "offroad" } },
  { id: "retro",    name: "复古甲壳", emoji: "🚕", price: 1700, desc: "圆头圆脑的复古经典。",           base: { bodyType: "retro", color: 0xf6c453 } },
  { id: "superCar", name: "超级跑车", emoji: "🏁", price: 2400, desc: "极致宽体，赛道之王。",           base: { bodyType: "super", color: 0xff2e63, spoiler: true, finish: "metallic" } },
  { id: "phantom",  name: "幻影银箭", emoji: "✨", price: 3500, desc: "顶级豪华，金属流光。",           base: { bodyType: "super", color: 0xc0c8ff, finish: "metallic", spoiler: true } },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

// ---------- 车辆性能（越野模式用）----------
// power 动力/极速, grip 转向抓地, clearance 离地间隙(越野通过性, 影响颠簸减速)
// 跑车动力强但底盘低 → 越野通过性差；SUV/吉普通过性好。买车因此有意义。
const STATS_BY_BODY = {
  junker:    { power: 0.32, grip: 0.42, clearance: 0.55 },
  hatchback: { power: 0.40, grip: 0.50, clearance: 0.30 },
  sedan:     { power: 0.50, grip: 0.55, clearance: 0.22 },
  roadster:  { power: 0.74, grip: 0.72, clearance: 0.10 },
  sports:    { power: 0.82, grip: 0.74, clearance: 0.12 },
  muscle:    { power: 0.78, grip: 0.52, clearance: 0.22 },
  suv:       { power: 0.62, grip: 0.60, clearance: 0.78 },
  pickup:    { power: 0.64, grip: 0.52, clearance: 0.80 },
  van:       { power: 0.48, grip: 0.46, clearance: 0.42 },
  jeep:      { power: 0.70, grip: 0.62, clearance: 0.98 },
  retro:     { power: 0.42, grip: 0.46, clearance: 0.32 },
  super:     { power: 0.98, grip: 0.88, clearance: 0.08 },
};

export function getStats(model) {
  const bt = (model.base && model.base.bodyType) || "sedan";
  const s = STATS_BY_BODY[bt] || STATS_BY_BODY.sedan;
  return { ...s, ...(model.stats || {}) };
}

// ---------- 改装可选项 ----------
export const BODY_COLORS = [
  0xffd23f, 0xff5d6c, 0x4aa3ff, 0x2ee6a6, 0xff8c1a, 0x7b6cff,
  0xff79c6, 0x44d62c, 0xf6f6f6, 0x2b2b35, 0xff2e63, 0x00d4ff,
];
export const WHEEL_COLORS = [0x1a1a1a, 0xc0c0c0, 0xffd23f, 0xff5d6c, 0x4aa3ff, 0x2ee6a6];
export const FINISHES = [
  { id: "gloss", name: "亮面" },
  { id: "matte", name: "哑光" },
  { id: "metallic", name: "金属" },
];
export const WHEEL_STYLES = [
  { id: "standard", name: "标准" },
  { id: "sport", name: "运动" },
  { id: "offroad", name: "越野" },
];

// ---------- 车身预设 ----------
const BODY_PRESETS = {
  junker:    { len: 3.6, wid: 1.85, hgt: 0.95, cabLen: 1.8, cabH: 0.85, cabOff: 0.0, ride: 0.42, wheelR: 0.52, roofRack: true },
  hatchback: { len: 3.8, wid: 1.9, hgt: 0.85, cabLen: 1.9, cabH: 0.78, cabOff: -0.1, ride: 0.18, wheelR: 0.42 },
  sedan:     { len: 4.4, wid: 1.95, hgt: 0.82, cabLen: 1.9, cabH: 0.72, cabOff: -0.15, ride: 0.16, wheelR: 0.42 },
  roadster:  { len: 4.2, wid: 1.95, hgt: 0.62, cabLen: 1.3, cabH: 0.48, cabOff: -0.35, ride: 0.12, wheelR: 0.44, open: true },
  sports:    { len: 4.4, wid: 2.0, hgt: 0.66, cabLen: 1.6, cabH: 0.6, cabOff: -0.2, ride: 0.12, wheelR: 0.45 },
  muscle:    { len: 4.7, wid: 2.05, hgt: 0.8, cabLen: 1.7, cabH: 0.66, cabOff: -0.25, ride: 0.16, wheelR: 0.46, hood: true },
  suv:       { len: 4.5, wid: 2.05, hgt: 1.0, cabLen: 2.3, cabH: 0.92, cabOff: 0.0, ride: 0.32, wheelR: 0.5, roofRack: true },
  pickup:    { len: 4.9, wid: 2.05, hgt: 0.92, cabLen: 1.5, cabH: 0.85, cabOff: -0.55, ride: 0.3, wheelR: 0.5, bed: true },
  van:       { len: 4.6, wid: 2.05, hgt: 1.15, cabLen: 2.9, cabH: 1.05, cabOff: -0.1, ride: 0.26, wheelR: 0.46 },
  jeep:      { len: 4.3, wid: 2.1, hgt: 1.05, cabLen: 2.0, cabH: 0.9, cabOff: 0.0, ride: 0.5, wheelR: 0.62, roofRack: true },
  retro:     { len: 3.9, wid: 1.95, hgt: 0.95, cabLen: 2.0, cabH: 0.82, cabOff: 0.0, ride: 0.22, wheelR: 0.44 },
  super:     { len: 4.6, wid: 2.15, hgt: 0.58, cabLen: 1.5, cabH: 0.5, cabOff: -0.15, ride: 0.1, wheelR: 0.46 },
};

function makeBodyMaterial(color, finish) {
  const params = { color };
  if (finish === "matte") { params.metalness = 0.0; params.roughness = 0.92; }
  else if (finish === "metallic") { params.metalness = 0.9; params.roughness = 0.22; }
  else { params.metalness = 0.35; params.roughness = 0.4; } // gloss
  return new THREE.MeshStandardMaterial(params);
}

const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x10131f, metalness: 0.6, roughness: 0.15 });
const darkMat  = (c = 0x16181f) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.6 });

function box(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(g, mat);
}

// 生成一个车轮（含轮胎 + 轮毂）
function makeWheel(radius, width, wheelColor, style) {
  const group = new THREE.Group();
  let r = radius;
  let w = width;
  if (style === "sport") { w = width * 0.95; }
  else if (style === "offroad") { r = radius * 1.12; w = width * 1.35; }

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, w, 22),
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.85 })
  );
  tire.rotation.z = Math.PI / 2;
  group.add(tire);

  // 轮毂
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.04, style === "sport" ? 6 : 16),
    new THREE.MeshStandardMaterial({ color: wheelColor, metalness: 0.7, roughness: 0.3 })
  );
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  // 轮毂中心点
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 })
  );
  cap.rotation.z = Math.PI / 2;
  group.add(cap);

  return group;
}

// 合并模型基础参数 + 用户改装，得到完整参数
export function resolveParams(model, customization = {}) {
  const base = model.base || {};
  return {
    bodyType: base.bodyType || "sedan",
    color: customization.color ?? base.color ?? 0x4aa3ff,
    finish: customization.finish ?? base.finish ?? "gloss",
    wheelStyle: customization.wheelStyle ?? base.wheelStyle ?? "standard",
    wheelColor: customization.wheelColor ?? base.wheelColor ?? 0x1a1a1a,
    spoiler: customization.spoiler ?? base.spoiler ?? false,
  };
}

// 主函数：根据参数构建一辆车（车头朝 +Z）
export function buildCar(params) {
  const p = BODY_PRESETS[params.bodyType] || BODY_PRESETS.sedan;
  const car = new THREE.Group();
  const bodyMat = makeBodyMaterial(params.color, params.finish);

  const ride = p.ride;          // 车身底部离轮心的高度
  const wheelR = p.wheelR;
  const bodyBottom = wheelR + ride; // 车身底部 y
  const bodyCY = bodyBottom + p.hgt / 2; // 下车身中心 y

  // ---- 下车身 ----
  const lower = box(p.wid, p.hgt, p.len, bodyMat);
  lower.position.y = bodyCY;
  car.add(lower);

  // 车头/车尾稍微收窄，营造层次（小斜面块）
  const nose = box(p.wid * 0.9, p.hgt * 0.55, 0.5, bodyMat);
  nose.position.set(0, bodyBottom + p.hgt * 0.3, p.len / 2 + 0.12);
  car.add(nose);
  const tail = box(p.wid * 0.92, p.hgt * 0.6, 0.4, bodyMat);
  tail.position.set(0, bodyBottom + p.hgt * 0.35, -p.len / 2 - 0.1);
  car.add(tail);

  // ---- 货斗（皮卡）----
  if (p.bed) {
    const bedFloorY = bodyBottom + p.hgt;
    const wall = (w, h, d, x, z) => {
      const m = box(w, h, d, bodyMat);
      m.position.set(x, bedFloorY + h / 2, z);
      car.add(m);
    };
    wall(p.wid, 0.35, 1.7, 0, -p.len / 2 + 0.9 + 0.85); // 后部货斗外框近似
  }

  // ---- 座舱 ----
  const cabW = p.wid * (params.bodyType === "van" ? 0.95 : 0.86);
  const cabBottom = bodyBottom + p.hgt - 0.05;
  const cab = box(cabW, p.cabH, p.cabLen, p.open ? darkMat(0x222531) : bodyMat);
  cab.position.set(0, cabBottom + p.cabH / 2, p.cabOff);
  car.add(cab);

  // 玻璃窗（前/后/侧）
  if (!p.open) {
    const gW = cabW + 0.02;
    const winH = p.cabH * 0.6;
    const winY = cabBottom + p.cabH * 0.55;
    // 侧窗
    const sideL = box(gW, winH, p.cabLen * 0.82, glassMat());
    sideL.position.set(0, winY, p.cabOff);
    sideL.scale.x = 1.0; // 让玻璃略大于车身在两侧露出
    car.add(sideL);
    // 前挡风
    const front = box(cabW * 0.82, winH, 0.12, glassMat());
    front.position.set(0, winY, p.cabOff + p.cabLen / 2);
    car.add(front);
    // 后挡风
    const back = box(cabW * 0.82, winH * 0.9, 0.12, glassMat());
    back.position.set(0, winY, p.cabOff - p.cabLen / 2);
    car.add(back);
  } else {
    // 敞篷：内舱
    const seat = box(cabW * 0.7, 0.2, p.cabLen * 0.6, darkMat(0x33323a));
    seat.position.set(0, cabBottom + 0.1, p.cabOff - 0.1);
    car.add(seat);
    // 挡风玻璃片
    const ws = box(cabW * 0.8, 0.35, 0.06, glassMat());
    ws.position.set(0, cabBottom + 0.3, p.cabOff + p.cabLen / 2);
    ws.rotation.x = -0.25;
    car.add(ws);
  }

  // ---- 引擎盖凸起（肌肉车）----
  if (p.hood) {
    const scoop = box(0.6, 0.18, 0.8, darkMat(0x222));
    scoop.position.set(0, bodyBottom + p.hgt + 0.08, p.len * 0.28);
    car.add(scoop);
  }

  // ---- 行李架（SUV / 越野）----
  if (p.roofRack) {
    const roofY = cabBottom + p.cabH + 0.05;
    const rackMat = darkMat(0x2a2a30);
    const r1 = box(cabW * 0.8, 0.05, 0.06, rackMat); r1.position.set(0, roofY, p.cabOff + p.cabLen * 0.3); car.add(r1);
    const r2 = box(cabW * 0.8, 0.05, 0.06, rackMat); r2.position.set(0, roofY, p.cabOff - p.cabLen * 0.3); car.add(r2);
    const r3 = box(0.06, 0.05, p.cabLen * 0.7, rackMat); r3.position.set(cabW * 0.36, roofY, p.cabOff); car.add(r3);
    const r4 = box(0.06, 0.05, p.cabLen * 0.7, rackMat); r4.position.set(-cabW * 0.36, roofY, p.cabOff); car.add(r4);
  }

  // ---- 尾翼 ----
  if (params.spoiler) {
    const spMat = darkMat(0x1c1c22);
    const wing = box(p.wid * 0.86, 0.08, 0.45, spMat);
    const supL = box(0.1, 0.3, 0.1, spMat);
    const supR = box(0.1, 0.3, 0.1, spMat);
    const baseY = bodyBottom + p.hgt + 0.2;
    const zPos = -p.len / 2 + 0.1;
    supL.position.set(p.wid * 0.3, baseY - 0.05, zPos);
    supR.position.set(-p.wid * 0.3, baseY - 0.05, zPos);
    wing.position.set(0, baseY + 0.12, zPos - 0.05);
    car.add(wing, supL, supR);
  }

  // ---- 车灯 ----
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 });
  const tailLMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff1111, emissiveIntensity: 0.6 });
  const hY = bodyBottom + p.hgt * 0.35;
  for (const sx of [-1, 1]) {
    const hl = box(0.28, 0.16, 0.1, headMat);
    hl.position.set(sx * p.wid * 0.32, hY, p.len / 2 + 0.13);
    car.add(hl);
    const tl = box(0.26, 0.16, 0.08, tailLMat);
    tl.position.set(sx * p.wid * 0.32, hY, -p.len / 2 - 0.11);
    car.add(tl);
  }

  // ---- 车轮 ----
  const wheelW = 0.34 * (params.wheelStyle === "offroad" ? 1.2 : 1);
  const axleZ = p.len * 0.32;
  const axleX = p.wid / 2 - 0.02;
  const positions = [
    [axleX, wheelR, axleZ], [-axleX, wheelR, axleZ],
    [axleX, wheelR, -axleZ], [-axleX, wheelR, -axleZ],
  ];
  for (const [x, y, z] of positions) {
    const w = makeWheel(wheelR, wheelW, params.wheelColor, params.wheelStyle);
    w.position.set(x, y, z);
    w.userData.isWheel = true;
    car.add(w);
  }

  // 让所有 mesh 投射阴影
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  car.userData.length = p.len;
  car.userData.width = p.wid;
  return car;
}
