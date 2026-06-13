// 本地存档：金币、已购车辆、改装、设置、最好成绩
const KEY = "math-racer-3d-save-v1";

const DEFAULT_STATE = {
  coins: 120,                 // 起始金币，够买第一辆便宜车
  ownedCars: ["starter"],     // 默认拥有入门小车
  selectedCar: "starter",
  customizations: {},         // { carId: {color, finish, wheelStyle, wheelColor, spoiler} }
  bestScore: 0,
  difficulty: 1,              // 当前选择的难度等级 (1..6)
  autoDifficulty: true,       // 是否自动调整难度
  sound: true,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (e) {
    console.warn("读取存档失败，使用默认存档", e);
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("保存存档失败", e);
  }
}
