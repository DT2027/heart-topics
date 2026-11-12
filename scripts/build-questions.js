/**
 * 构建脚本：把 data/batch-*.json 合并为 questions.js + QUESTIONS.md
 *
 * 题目会被打散重排：五个层级（破冰/进阶/亲密/自省/深度）各 100 道，
 * 用固定随机种子均匀铺进 1-500 号位，任何题号区间都大致覆盖全部层级。
 * 种子固定 → 每次构建结果一致，可复现、可追溯。
 *
 * 用法：node scripts/build-questions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TOTAL = 500;
const LEVELS = ['破冰', '进阶', '亲密', '自省', '深度'];
const SHUFFLE_SEED = 20261112; // 固定种子

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

/** 固定种子的伪随机数发生器（mulberry32） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates 洗牌（原地） */
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 生成层级序列：
 * - 把 500 个位置切成 100 个 5 题一组，每组**恰好包含 5 个层级各一道**
 *   → 任意连续 5 题都覆盖全部层级，任意连续 25 题内各层级数量偏差为 0
 * - 每组内 5 个层级的顺序随机打散 → 同层级在组内位置会自然漂移，看起来不像固定周期
 * - 末尾做一次相邻去重修复 → 不出现连续两道同层级
 */
function interleaveLevels(pools, rand) {
  const L = LEVELS.length;
  const seq = new Array(TOTAL);
  const numBlocks = TOTAL / L;

  for (let b = 0; b < numBlocks; b++) {
    const order = shuffle(LEVELS.slice(), rand); // 本组内层级顺序随机
    for (let k = 0; k < L; k++) seq[b * L + k] = order[k];
  }

  // 相邻去重修复：在同一组内与别的层级交换
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] !== seq[i - 1]) continue;
    const blockStart = Math.floor(i / L) * L;
    const blockEnd = blockStart + L;
    for (let j = i; j < blockEnd; j++) {
      if (seq[j] === seq[i - 1]) continue;              // 换过去会撞车
      const prevOk = j - 1 < 0 || seq[j - 1] !== seq[i]; // 交换后 j 处的新值
      const nextOk = j + 1 >= seq.length || seq[j + 1] !== seq[i];
      const atIOk = seq[j] !== seq[i - 1];               // 交换后 i 处的新值
      if (prevOk && nextOk && atIOk) {
        const tmp = seq[i]; seq[i] = seq[j]; seq[j] = tmp;
        break;
      }
    }
  }
  return seq;
}

// ---------- 1. 读取所有批次 ----------
let all = [];
for (let i = 1; i <= 5; i++) {
  const p = path.join(DATA_DIR, `batch-${i}.json`);
  if (!fs.existsSync(p)) fail(`缺少批次文件: ${p}`);
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`批次 ${i} JSON 解析失败: ${e.message}`);
  }
  if (!Array.isArray(arr)) fail(`批次 ${i} 不是数组`);
  all = all.concat(arr);
}

// ---------- 2. 结构校验 ----------
const bad = all.filter(
  (q) =>
    !q ||
    typeof q.id !== 'number' ||
    !Number.isInteger(q.id) ||
    typeof q.text !== 'string' ||
    !q.text.trim() ||
    typeof q.level !== 'string' ||
    !q.level.trim()
);
if (bad.length) fail(`存在 ${bad.length} 条结构异常的题目: ${JSON.stringify(bad.slice(0, 3))}`);

all.sort((a, b) => a.id - b.id);

// ---------- 3. 序号连续性 ----------
const ids = all.map((q) => q.id);
if (new Set(ids).size !== ids.length) fail('存在重复的题目序号');
const missing = [];
for (let i = 1; i <= TOTAL; i++) if (!ids.includes(i)) missing.push(i);
if (missing.length) fail(`序号不连续，缺失: ${missing.join(', ')}`);
if (all.length !== TOTAL) fail(`题目总数为 ${all.length}，应为 ${TOTAL}`);

// ---------- 4. 质量规则 + 重复检测 ----------
const norm = (s) => s.replace(/[\s，。？！、；：""''（）()~—…·\.,?!;:"'\-]/g, '').toLowerCase();
const seen = new Map();
const dupText = [];
for (const q of all) {
  const k = norm(q.text);
  if (seen.has(k)) dupText.push(`${seen.get(k)} 与 ${q.id}: "${q.text}"`);
  else seen.set(k, q.id);
}

const issues = [];
for (const q of all) {
  const t = q.text;
  if (/[a-zA-Z]{3,}/.test(t)) issues.push(`${q.id} 含英文单词: ${t}`);
  if (!/[？?]$/.test(t.trim())) issues.push(`${q.id} 不是问句结尾: ${t}`);
  if (t.length < 10 || t.length > 62) issues.push(`${q.id} 长度 ${t.length} 越界: ${t}`);
  if (!LEVELS.includes(q.level)) issues.push(`${q.id} 未知层级: ${q.level}`);
}

// ---------- 5. 打散重排 ----------
const rand = mulberry32(SHUFFLE_SEED);

const pools = {};
LEVELS.forEach((l) => (pools[l] = []));
for (const q of all) pools[q.level].push(q);
LEVELS.forEach((l) => {
  if (!pools[l].length) fail(`层级「${l}」没有题目`);
  shuffle(pools[l], rand); // 同层级内部也打散
});

const levelSeq = interleaveLevels(pools, rand);

const reordered = [];
for (let i = 0; i < levelSeq.length; i++) {
  const q = pools[levelSeq[i]].pop();
  reordered.push({ id: i + 1, text: q.text.trim(), level: q.level.trim() });
}
if (reordered.length !== TOTAL) fail(`重排后数量为 ${reordered.length}，应为 ${TOTAL}`);

// ---------- 6. 均匀性统计 ----------
const seqLevels = reordered.map((q) => q.level);
let adjacentSame = 0;
for (let i = 1; i < seqLevels.length; i++) if (seqLevels[i] === seqLevels[i - 1]) adjacentSame++;

const gapStats = {};
LEVELS.forEach((l) => {
  const positions = seqLevels.map((v, i) => (v === l ? i + 1 : -1)).filter((p) => p > 0);
  let maxGap = 0;
  let minGap = Infinity;
  for (let i = 1; i < positions.length; i++) {
    const g = positions[i] - positions[i - 1];
    if (g > maxGap) maxGap = g;
    if (g < minGap) minGap = g;
  }
  gapStats[l] = { count: positions.length, minGap, maxGap, first: positions[0], last: positions[positions.length - 1] };
});

// 每 25 题一组的层级构成（看是否五类均衡铺开）
const BLOCK = 25;
const blockCounts = [];
for (let s = 0; s < TOTAL; s += BLOCK) {
  const slice = seqLevels.slice(s, s + BLOCK);
  const c = {};
  LEVELS.forEach((l) => (c[l] = slice.filter((v) => v === l).length));
  blockCounts.push(c);
}
const blockDev = Math.max(...blockCounts.map((c) => Math.max(...LEVELS.map((l) => Math.abs(c[l] - BLOCK / LEVELS.length)))));

// 对齐的每 5 题组内是否都含全部 5 个层级
const aligned5 = [];
for (let s = 0; s < TOTAL; s += 5) {
  aligned5.push(new Set(seqLevels.slice(s, s + 5)).size);
}
// 任意滑动 5 题窗口内最少出现几种层级
let minWin5 = 5;
for (let s = 0; s + 5 <= TOTAL; s++) {
  minWin5 = Math.min(minWin5, new Set(seqLevels.slice(s, s + 5)).size);
}
// 任意滑动 10 题窗口内层级种类数（区间）
let win10Min = 5, win10Max = 0;
for (let s = 0; s + 10 <= TOTAL; s++) {
  const n = new Set(seqLevels.slice(s, s + 10)).size;
  win10Min = Math.min(win10Min, n);
  win10Max = Math.max(win10Max, n);
}

// ---------- 7. 输出 questions.js ----------
const js = `/* 真心话题库 · 题目数据（共 ${TOTAL} 题，由 scripts/build-questions.js 自动生成，请勿手改） */\nwindow.QUESTIONS = ${JSON.stringify(
  reordered,
  null,
  0
)};\n`;
fs.writeFileSync(path.join(ROOT, 'questions.js'), js, 'utf8');

// ---------- 8. 输出 QUESTIONS.md（按新序号 + 层级索引） ----------
let md = `# 真心话题库 · 全部 ${TOTAL} 题（审查清单）\n\n`;
md += `> 自动生成于构建时。题目已按层级均匀打散，序号即展示顺序；每题后面的方括号标注层级。\n`;
md += `> 重排种子：\`${SHUFFLE_SEED}\`（固定，重复构建结果一致）。\n\n`;
md += `## 按序号（1 - ${TOTAL}）\n\n`;
for (const q of reordered) md += `${q.id}. [${q.level}] ${q.text}\n`;

md += `\n## 按层级索引\n\n`;
for (const lv of LEVELS) {
  const group = reordered.filter((q) => q.level === lv);
  md += `### ${lv}（共 ${group.length} 道）\n\n`;
  md += group.map((q) => `${q.id}`).join('、') + '\n\n';
}
fs.writeFileSync(path.join(ROOT, 'QUESTIONS.md'), md, 'utf8');

// ---------- 9. 报告 ----------
console.log('✅ 构建完成');
console.log(`   题目总数: ${reordered.length} | 序号 1 - ${reordered[reordered.length - 1].id} 连续无缺失`);
console.log(`   打散种子: ${SHUFFLE_SEED} | 相邻同层级: ${adjacentSame} 处`);
console.log('   各层级分布与间隔:');
for (const l of LEVELS) {
  const g = gapStats[l];
  console.log(`     ${l}: ${g.count} 道 | 最小间隔 ${g.minGap} | 最大间隔 ${g.maxGap} | 首现 #${g.first} 末现 #${g.last}`);
}
console.log(`   每 ${BLOCK} 题一组内，各层级数量与理论值 ${BLOCK / LEVELS.length} 的最大偏差: ${blockDev}`);
console.log(`   对齐的每 5 题组内层级种类数: 全部为 ${[...new Set(aligned5)].join('/')}（5 为满分）`);
console.log(`   任意滑动 5 题窗口内最少层级种类: ${minWin5} | 滑动 10 题窗口: ${win10Min}-${win10Max} 种`);
console.log(`   完全重复文本: ${dupText.length}`);
if (dupText.length) console.log(dupText.join('\n'));
console.log(`   质量规则告警: ${issues.length}`);
if (issues.length) console.log(issues.join('\n'));
console.log(`   输出: questions.js (${fs.statSync(path.join(ROOT, 'questions.js')).size} bytes), QUESTIONS.md`);
