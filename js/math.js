// 数学题生成 + 难度系统
// 主打两位数加减法，难度可手动选择，也可随表现自动增减。

export const DIFFICULTY_LEVELS = [
  { level: 1, name: "新手上路", desc: "两位数加减·不进退位", choices: 2 },
  { level: 2, name: "稳步前进", desc: "两位数加减·含进退位", choices: 2 },
  { level: 3, name: "渐入佳境", desc: "两位数混合·三个选项", choices: 3 },
  { level: 4, name: "高手挑战", desc: "更大的数·更快车速", choices: 3 },
  { level: 5, name: "闪电飞驰", desc: "连加连减·三选项", choices: 3 },
  { level: 6, name: "数学车神", desc: "极限速度·全随机", choices: 3 },
];

export const MAX_LEVEL = DIFFICULTY_LEVELS.length;

export function levelConfig(level) {
  return DIFFICULTY_LEVELS[Math.min(Math.max(level, 1), MAX_LEVEL) - 1];
}

// 车速随难度提升（单位/秒）
export function speedForLevel(level) {
  return 16 + (level - 1) * 3.2;
}

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 是否产生进位（加法）
function hasCarry(a, b) { return (a % 10) + (b % 10) >= 10; }
// 是否产生借位（减法）
function hasBorrow(a, b) { return (a % 10) < (b % 10); }

// 生成一道题，返回 { text, answer, operands }
function generateExpression(level) {
  // 高难度偶尔出现三个数的连加连减
  const triple = level >= 5 && Math.random() < 0.4;

  if (triple) {
    // a ± b ± c，保证中间和结果都为正、且为两位数范围
    let a, b, c, answer, text, mid;
    let tries = 0;
    do {
      a = rnd(20, 60);
      b = rnd(10, 30);
      c = rnd(10, 30);
      const op1 = Math.random() < 0.5 ? "+" : "-";
      const op2 = Math.random() < 0.5 ? "+" : "-";
      mid = op1 === "+" ? a + b : a - b;
      answer = op2 === "+" ? mid + c : mid - c;
      text = `${a} ${op1} ${b} ${op2} ${c}`;
      tries++;
    } while ((mid < 1 || answer < 0 || answer > 99) && tries < 40);
    return { text, answer };
  }

  // 二数加减
  const isAdd = Math.random() < 0.5;
  let a, b, answer, tries = 0;

  if (isAdd) {
    do {
      a = rnd(10, 99);
      b = rnd(10, 99);
      tries++;
      // 难度 1：不进位且结果两位数；难度 2+：允许进位
      const carryOk = level >= 2 || !hasCarry(a, b);
      if (carryOk && a + b <= (level >= 4 ? 99 : 99)) break;
    } while (tries < 60);
    answer = a + b;
    return { text: `${a} + ${b}`, answer };
  } else {
    do {
      a = rnd(20, 99);
      b = rnd(10, a);
      tries++;
      const borrowOk = level >= 2 || !hasBorrow(a, b);
      if (borrowOk && a - b >= 0) break;
    } while (tries < 60);
    answer = a - b;
    return { text: `${a} − ${b}`, answer };
  }
}

// 生成贴近正确答案的干扰项
function makeDistractors(answer, count) {
  const set = new Set([answer]);
  const candidates = [
    answer + 1, answer - 1, answer + 2, answer - 2,
    answer + 10, answer - 10, answer + 9, answer - 9,
    answer + 11, answer - 11, answer + 20, answer - 20,
    answer + 3, answer - 3,
  ].filter((n) => n >= 0 && n <= 199);

  // 打乱候选顺序
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const distractors = [];
  for (const c of candidates) {
    if (set.has(c)) continue;
    set.add(c);
    distractors.push(c);
    if (distractors.length >= count - 1) break;
  }
  // 兜底：极端情况下补足
  let pad = answer + 5;
  while (distractors.length < count - 1) {
    if (!set.has(pad)) { set.add(pad); distractors.push(pad); }
    pad++;
  }
  return distractors;
}

// 生成完整一题：题面 + 选项 + 正确选项索引
export function generateProblem(level) {
  const cfg = levelConfig(level);
  const choiceCount = cfg.choices;
  const { text, answer } = generateExpression(level);
  const distractors = makeDistractors(answer, choiceCount);

  const options = [answer, ...distractors];
  // 打乱选项
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctIndex = options.indexOf(answer);
  return { text: `${text} = ?`, answer, options, correctIndex, choiceCount };
}

// 自动难度控制器：连对升级，答错降级
export function makeAutoDifficulty(startLevel) {
  let level = startLevel;
  let streak = 0;
  let wrongStreak = 0;
  return {
    get level() { return level; },
    correct() {
      streak++;
      wrongStreak = 0;
      if (streak >= 4 && level < MAX_LEVEL) { level++; streak = 0; return true; }
      return false;
    },
    wrong() {
      wrongStreak++;
      streak = 0;
      if (wrongStreak >= 2 && level > 1) { level--; wrongStreak = 0; return true; }
      return false;
    },
  };
}
