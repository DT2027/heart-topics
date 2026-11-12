/**
 * 构建脚本：把 data/batch-*.json 合并为 questions.js + QUESTIONS.md
 * 用法：node scripts/build-questions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TOTAL = 500;

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

// 1. 读取所有批次
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

// 2. 结构校验
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

// 3. 序号连续性
const ids = all.map((q) => q.id);
if (new Set(ids).size !== ids.length) fail('存在重复的题目序号');
const missing = [];
for (let i = 1; i <= TOTAL; i++) if (!ids.includes(i)) missing.push(i);
if (missing.length) fail(`序号不连续，缺失: ${missing.join(', ')}`);
if (all.length !== TOTAL) fail(`题目总数为 ${all.length}，应为 ${TOTAL}`);

// 4. 完全重复文本
const norm = (s) => s.replace(/[\s，。？！、；：""''（）()~—…·\.,?!;:"'\-]/g, '').toLowerCase();
const seen = new Map();
const stemSeen = new Map();
const dupText = [];
const dupStem = [];
for (const q of all) {
  const k = norm(q.text);
  if (seen.has(k)) dupText.push(`${seen.get(k)} 与 ${q.id}: "${q.text}"`);
  else seen.set(k, q.id);

  // 同句式检测：取前 6 个汉字作为词干
  const stem = k.slice(0, 6);
  if (stemSeen.has(stem)) dupStem.push(`${stemSeen.get(stem)} 与 ${q.id}: "${q.text}"`);
  else stemSeen.set(stem, q.id);
}

// 5. 质量规则
const issues = [];
for (const q of all) {
  const t = q.text;
  if (/[a-zA-Z]{3,}/.test(t)) issues.push(`${q.id} 含英文单词: ${t}`);
  if (!/[？?]$/.test(t.trim())) issues.push(`${q.id} 不是问句结尾: ${t}`);
  if (t.length < 10 || t.length > 62) issues.push(`${q.id} 长度 ${t.length} 越界: ${t}`);
}

// 6. 输出 questions.js
const js = `/* 真心话题库 · 题目数据（共 ${TOTAL} 题，由 scripts/build-questions.js 自动生成，请勿手改） */\nwindow.QUESTIONS = ${JSON.stringify(
  all.map((q) => ({ id: q.id, text: q.text.trim(), level: q.level.trim() })),
  null,
  0
)};\n`;
fs.writeFileSync(path.join(ROOT, 'questions.js'), js, 'utf8');

// 7. 输出 QUESTIONS.md（审查清单）
const LEVELS = ['破冰', '进阶', '亲密', '自省', '深度'];
let md = `# 真心话题库 · 全部 ${TOTAL} 题（审查清单）\n\n> 自动生成于构建时。本文件按层级分组，便于逐条审阅。\n\n`;
for (const lv of LEVELS) {
  const group = all.filter((q) => q.level === lv);
  if (!group.length) continue;
  md += `## ${lv}（第 ${group[0].id} - ${group[group.length - 1].id} 题，共 ${group.length} 道）\n\n`;
  for (const q of group) md += `${q.id}. ${q.text}\n`;
  md += '\n';
}
fs.writeFileSync(path.join(ROOT, 'QUESTIONS.md'), md, 'utf8');

// 8. 报告
const byLevel = {};
for (const q of all) byLevel[q.level] = (byLevel[q.level] || 0) + 1;
console.log('✅ 构建完成');
console.log('   题目总数:', all.length, '| 序号 1 -', all[all.length - 1].id, '连续无缺失');
console.log('   分层统计:', JSON.stringify(byLevel, null, 0));
console.log('   完全重复文本:', dupText.length);
if (dupText.length) console.log(dupText.join('\n'));
console.log('   同词干(前6字)疑似重复:', dupStem.length);
if (dupStem.length) console.log(dupStem.join('\n'));
console.log('   质量规则告警:', issues.length);
if (issues.length) console.log(issues.join('\n'));
console.log('   输出: questions.js (' + fs.statSync(path.join(ROOT, 'questions.js')).size + ' bytes), QUESTIONS.md');
