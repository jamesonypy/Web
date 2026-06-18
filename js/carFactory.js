// 程序化生成 3D 车辆模型（纯几何体，无需外部素材）
// 通过 bodyType 预设 + 改装参数，组合出多种外观。
import * as THREE from "three";

// ---------- 可购买车型列表 ----------
// 价格越高 → 性能(power/grip/clearance 综合)越强、外观等级(tier)越高。
// tier: 0 朴素 / 1 普通 / 2 运动(车身拉花) / 3 顶级(金属漆+大尾翼+双排气)
export const MODELS = [
  { id: "junker",   name: "小破车",   emoji: "🚙", price: 0,    tier: 0, desc: "锈迹斑斑的二手越野车，动力弱但底盘高，越野起点。",
    base: { bodyType: "junker", color: 0x9c7a4d, finish: "matte", wheelStyle: "offroad" }, stats: { power: 0.30, grip: 0.36, clearance: 0.50 } },
  { id: "starter",  name: "小蜜蜂",   emoji: "🐝", price: 0,    tier: 0, desc: "灵巧的入门两厢车，新手好伙伴。",
    base: { bodyType: "hatchback", color: 0xffd23f }, stats: { power: 0.34, grip: 0.42, clearance: 0.30 } },
  { id: "cityCab",  name: "城市轿车", emoji: "🚗", price: 200,  tier: 0, desc: "经典三厢轿车，沉稳大方。",
    base: { bodyType: "sedan", color: 0x4aa3ff }, stats: { power: 0.44, grip: 0.50, clearance: 0.34 } },
  { id: "retro",    name: "复古甲壳", emoji: "🚕", price: 450,  tier: 1, desc: "圆头圆脑的复古经典，小巧灵活。",
    base: { bodyType: "retro", color: 0xf6c453, accent: 0xffffff }, stats: { power: 0.48, grip: 0.52, clearance: 0.42 } },
  { id: "van",      name: "欢乐巴士", emoji: "🚌", price: 750,  tier: 1, desc: "圆润可爱的小巴士，稳健耐造。",
    base: { bodyType: "van", color: 0xff79c6, accent: 0xffffff }, stats: { power: 0.54, grip: 0.54, clearance: 0.52 } },
  { id: "roadster", name: "敞篷跑车", emoji: "🏎️", price: 1100, tier: 1, desc: "低矮敞篷，公路上风驰电掣。",
    base: { bodyType: "roadster", color: 0xff5d6c, wheelStyle: "sport" }, stats: { power: 0.66, grip: 0.70, clearance: 0.36 } },
  { id: "pickup",   name: "皮卡王",   emoji: "🛻", price: 1600, tier: 1, desc: "带货斗的硬派皮卡，越野好手。",
    base: { bodyType: "pickup", color: 0x3ccf7a, wheelStyle: "offroad", accent: 0x1e1e22 }, stats: { power: 0.66, grip: 0.58, clearance: 0.68 } },
  { id: "muscle",   name: "肌肉车",   emoji: "🚘", price: 2300, tier: 2, desc: "粗犷引擎盖，强劲力量感。",
    base: { bodyType: "muscle", color: 0xff8c1a, accent: 0x1e1e22, wheelStyle: "sport" }, stats: { power: 0.80, grip: 0.70, clearance: 0.58 } },
  { id: "suvX",     name: "都市 SUV", emoji: "🚐", price: 3000, tier: 2, desc: "高底盘全能，铺装越野都拿手。",
    base: { bodyType: "suv", color: 0x7b6cff, wheelStyle: "offroad", accent: 0xffffff }, stats: { power: 0.76, grip: 0.72, clearance: 0.84 } },
  { id: "gtSport",  name: "GT 跑车",  emoji: "🚙", price: 4200, tier: 2, desc: "流线车身、运动尾翼，弯道利器。",
    base: { bodyType: "sports", color: 0x2ee6a6, spoiler: true, wheelStyle: "sport", accent: 0x101014 }, stats: { power: 0.90, grip: 0.86, clearance: 0.64 } },
  { id: "monster",  name: "怪兽越野", emoji: "🚜", price: 5800, tier: 3, desc: "超大轮胎，翻山越岭无所不能。",
    base: { bodyType: "jeep", color: 0x44d62c, wheelStyle: "offroad", accent: 0x101014 }, stats: { power: 0.86, grip: 0.78, clearance: 0.98 } },
  { id: "superCar", name: "超级跑车", emoji: "🏁", price: 8000, tier: 3, desc: "极致宽体、金属车漆，赛道之王。",
    base: { bodyType: "super", color: 0xff2e63, spoiler: true, finish: "metallic", wheelStyle: "sport", accent: 0xffffff }, stats: { power: 0.96, grip: 0.92, clearance: 0.82 } },
  { id: "phantom",  name: "幻影银箭", emoji: "✨", price: 12000, tier: 3, desc: "顶级全能旗舰，性能外观皆拉满。",
    base: { bodyType: "super", color: 0xc0c8ff, finish: "metallic", spoiler: true, wheelStyle: "sport", accent: 0x1b2a55 }, stats: { power: 1.0, grip: 0.98, clearance: 0.87 } },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

// 车辆性能（越野模式用）：power 动力/极速, grip 转向抓地, clearance 离地间隙/通过性
const STATS_BY_BODY = {
  junker: { power: 0.32, grip: 0.42, clearance: 0.55 }, hatchback: { power: 0.40, grip: 0.50, clearance: 0.30 },
  sedan: { power: 0.50, grip: 0.55, clearance: 0.22 }, roadster: { power: 0.74, grip: 0.72, clearance: 0.10 },
  sports: { power: 0.82, grip: 0.74, clearance: 0.12 }, muscle: { power: 0.78, grip: 0.52, clearance: 0.22 },
  suv: { power: 0.62, grip: 0.60, clearance: 0.78 }, pickup: { power: 0.64, grip: 0.52, clearance: 0.80 },
  van: { power: 0.48, grip: 0.46, clearance: 0.42 }, jeep: { power: 0.70, grip: 0.62, clearance: 0.98 },
  retro: { power: 0.42, grip: 0.46, clearance: 0.32 }, super: { power: 0.98, grip: 0.88, clearance: 0.08 },
};

export function getStats(model) {
  if (model.stats) return { ...model.stats };
  const bt = (model.base && model.base.bodyType) || "sedan";
  return { ...(STATS_BY_BODY[bt] || STATS_BY_BODY.sedan) };
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

// 圆角盒子：用带倒角的挤出几何体生成各边圆润的车身块，比直角盒子更像真车
function roundedRectShape(w, h, r) {
  r = Math.max(0.01, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function roundedBox(w, h, d, r, bevel, mat) {
  const bs = Math.max(0.01, Math.min(bevel, d / 2 - 0.02, w / 2 - 0.02, h / 2 - 0.02));
  const shape = roundedRectShape(w, h, r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, d - 2 * bs), bevelEnabled: true,
    bevelThickness: bs, bevelSize: bs, bevelSegments: 3, steps: 1, curveSegments: 5,
  });
  geo.translate(0, 0, -(d / 2 - bs));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
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
    tier: model.tier ?? 0,
    accent: base.accent ?? 0xffffff,
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

  // ---- 下车身（圆角车身，贴近真车曲面）----
  const bodyR = Math.min(0.30, p.hgt * 0.5, p.wid * 0.24);
  const lower = roundedBox(p.wid, p.hgt, p.len, bodyR, Math.min(0.30, p.len * 0.12), bodyMat);
  lower.position.y = bodyCY;
  car.add(lower);

  // 侧裙 / 防擦条（车身下沿深色，增强层次）
  for (const sx of [-1, 1]) {
    const sill = box(0.06, p.hgt * 0.22, p.len * 0.62, darkMat(0x1e2025));
    sill.position.set(sx * (p.wid / 2 - 0.02), bodyBottom + p.hgt * 0.16, 0);
    car.add(sill);
  }

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

  // ---- 座舱（圆角车顶 + 环绕车窗 + 倾斜前后挡风）----
  const cabW = p.wid * (params.bodyType === "van" ? 0.94 : 0.82); // 略收窄做出收腰
  const cabBottom = bodyBottom + p.hgt - 0.08;
  if (!p.open) {
    // 车顶（车身色）
    const cabR = Math.min(0.26, p.cabH * 0.42, cabW * 0.22);
    const roof = roundedBox(cabW, p.cabH, p.cabLen, cabR, Math.min(0.18, p.cabLen * 0.12), bodyMat);
    roof.position.set(0, cabBottom + p.cabH / 2, p.cabOff);
    car.add(roof);

    const winH = p.cabH * 0.52;
    const winY = cabBottom + p.cabH * 0.5;
    // 环绕车窗（深色玻璃带，前后留出立柱）
    const band = roundedBox(cabW + 0.04, winH, p.cabLen * 0.72, 0.1, 0.06, glassMat());
    band.position.set(0, winY, p.cabOff);
    car.add(band);
    // 倾斜前挡风
    const wsH = p.cabH * 0.92;
    const ws = box(cabW * 0.9, wsH, 0.05, glassMat());
    ws.position.set(0, winY + 0.04, p.cabOff + p.cabLen / 2 - 0.04);
    ws.rotation.x = -0.5;
    car.add(ws);
    // 倾斜后窗
    const rw = box(cabW * 0.9, wsH * 0.85, 0.05, glassMat());
    rw.position.set(0, winY + 0.04, p.cabOff - p.cabLen / 2 + 0.04);
    rw.rotation.x = 0.55;
    car.add(rw);
  } else {
    // 敞篷：内舱 + 挡风片
    const seat = box(cabW * 0.7, 0.2, p.cabLen * 0.6, darkMat(0x33323a));
    seat.position.set(0, cabBottom + 0.12, p.cabOff - 0.1);
    car.add(seat);
    const ws = box(cabW * 0.82, 0.4, 0.05, glassMat());
    ws.position.set(0, cabBottom + 0.32, p.cabOff + p.cabLen / 2);
    ws.rotation.x = -0.32;
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

  // ---- 车灯（圆形大灯 + 镀铬圈，更拟真）----
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff7d0, emissive: 0xfff0b0, emissiveIntensity: 0.85, metalness: 0.2, roughness: 0.2 });
  const tailLMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff1111, emissiveIntensity: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.28 });
  const hY = bodyBottom + p.hgt * 0.4;
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16), headMat);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(sx * p.wid * 0.34, hY, p.len / 2 + 0.11);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 18), chromeMat);
    ring.position.set(sx * p.wid * 0.34, hY, p.len / 2 + 0.15);
    const tl = box(0.3, 0.18, 0.08, tailLMat);
    tl.position.set(sx * p.wid * 0.32, hY, -p.len / 2 - 0.11);
    car.add(hl, ring, tl);
  }

  // ---- 车轮 ----
  const wheelW = 0.34 * (params.wheelStyle === "offroad" ? 1.2 : 1);
  const axleZ = p.len * 0.32;
  const axleX = p.wid / 2 - 0.02;
  const positions = [
    [axleX, wheelR, axleZ], [-axleX, wheelR, axleZ],
    [axleX, wheelR, -axleZ], [-axleX, wheelR, -axleZ],
  ];
  const wheels = [];
  for (const [x, y, z] of positions) {
    const w = makeWheel(wheelR, wheelW, params.wheelColor, params.wheelStyle);
    w.position.set(x, y, z);
    w.rotation.order = "YXZ";   // 先转向(Y)再滚动(X)
    w.userData.isWheel = true;
    car.add(w);
    wheels.push({ mesh: w, fx: x, fz: z, front: z > 0, restY: y });
  }

  // ---- 拟真细节：保险杠 / 轮眉 / 进气格栅 / 后视镜 / 排气 / 引擎盖装饰 ----
  const plastic = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.85, metalness: 0.1 });
  const chrome2 = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.3 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); car.add(mesh); };

  // 四个圆润轮眉（深色护板）
  const archW = wheelW + 0.28;
  const archD = wheelR * 2.55;
  for (const [ax, az] of [[axleX, axleZ], [-axleX, axleZ], [axleX, -axleZ], [-axleX, -axleZ]]) {
    add(roundedBox(archW, 0.18, archD, 0.08, 0.06, plastic), ax, bodyBottom + 0.04, az);
  }
  // 前后保险杠（圆角）
  add(roundedBox(p.wid * 0.98, 0.26, 0.34, 0.1, 0.1, plastic), 0, bodyBottom + 0.12, p.len / 2 + 0.14);
  add(roundedBox(p.wid * 0.98, 0.26, 0.34, 0.1, 0.1, plastic), 0, bodyBottom + 0.12, -p.len / 2 - 0.12);
  // 进气格栅
  add(box(p.wid * 0.5, p.hgt * 0.32, 0.05, new THREE.MeshStandardMaterial({ color: 0x121317, metalness: 0.6, roughness: 0.45 })),
    0, bodyBottom + p.hgt * 0.28, p.len / 2 + 0.14);
  // 引擎盖镀铬装饰条
  const hoodFront = p.len / 2, hoodBack = p.cabOff + p.cabLen / 2;
  const hoodLen = Math.max(0.25, hoodFront - hoodBack);
  add(box(0.06, 0.04, hoodLen * 0.7, chrome2), 0, bodyBottom + p.hgt + 0.02, (hoodFront + hoodBack) / 2);
  // 排气管（tier>=3 为双出）
  const tier = params.tier || 0;
  const exN = tier >= 3 ? [0.16, 0.42] : [0.28];
  for (const ex of exN) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), chrome2);
    pipe.rotation.x = Math.PI / 2;
    add(pipe, p.wid * ex, bodyBottom + 0.02, -p.len / 2 - 0.18);
  }
  // 后视镜（封闭车厢才有）
  if (!p.open) {
    for (const sx of [-1, 1]) {
      add(box(0.05, 0.05, 0.12, bodyMat), sx * (cabW / 2 + 0.06), cabBottom + p.cabH * 0.5, p.cabOff + p.cabLen * 0.42);
      add(box(0.16, 0.11, 0.07, plastic), sx * (cabW / 2 + 0.16), cabBottom + p.cabH * 0.48, p.cabOff + p.cabLen * 0.42);
    }
  }
  // 高配车身拉花（tier>=2，双条赛车条纹）
  if (tier >= 2) {
    const stripeMat = new THREE.MeshStandardMaterial({ color: params.accent, metalness: 0.35, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const stripe = box(0.12, 0.025, p.len * 0.96, stripeMat);
      stripe.position.set(sx * p.wid * 0.16, bodyBottom + p.hgt + 0.01, 0);
      car.add(stripe);
    }
  }

  // 让所有 mesh 投射阴影
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  // 供越野模式做每轮悬挂 / 前轮转向 / 姿态
  car.userData.wheels = wheels;
  car.userData.axleX = axleX;
  car.userData.axleZ = axleZ;
  car.userData.wheelR = wheelR;
  car.userData.length = p.len;
  car.userData.width = p.wid;
  return car;
}
