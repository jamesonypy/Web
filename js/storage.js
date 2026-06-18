// 本地存档：金币、已购车辆、改装、设置、最好成绩
const KEY = "math-racer-3d-save-v1";

const DEFAULT_STATE = {
  coins: 120,                       // 起始金币，够买第一辆便宜车
  ownedCars: ["junker", "starter"], // 默认拥有：越野小破车 + 公路入门车
  selectedCar: "starter",
  customizations: {},               // { carId: {color, finish, wheelStyle, wheelColor, spoiler} }
  bestScore: 0,                     // 公路模式最好成绩
  offroadBest: 0,                   // 越野模式最好成绩
  offroadLevel: 1,                  // 越野当前选择的关卡
  offroadUnlocked: 1,               // 越野已解锁到的最高关卡
  difficulty: 1,                    // 当前选择的难度等级 (1..6)
  autoDifficulty: true,             // 是否自动调整难度
  sound: true,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    const state = { ...structuredClone(DEFAULT_STATE), ...parsed };
    // 迁移：确保老存档也免费拥有越野小破车
    if (!Array.isArray(state.ownedCars)) state.ownedCars = ["junker", "starter"];
    if (!state.ownedCars.includes("junker")) state.ownedCars.unshift("junker");
    // 迁移：解锁进度至少覆盖历史到达过的关卡
    state.offroadUnlocked = Math.max(state.offroadUnlocked || 1, state.offroadLevel || 1, 1);
    return state;
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
