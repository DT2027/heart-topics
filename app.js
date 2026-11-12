/* 真心话题库 · 交互逻辑 */
(function () {
  'use strict';

  var TOTAL = 500;
  var QUESTIONS = (window.QUESTIONS || []).filter(function (q) {
    return q && typeof q.id === 'number' && typeof q.text === 'string' && q.text.length > 0;
  });

  var $ = function (sel) { return document.querySelector(sel); };

  var input      = $('#num-input');
  var form       = $('#ask-form');
  var card       = $('#question-card');
  var qNoEl      = $('#q-no');
  var qLevelEl   = $('#q-level');
  var qTextEl    = $('#q-text');
  var errorEl    = $('#error');
  var chipsEl    = $('#history-list');
  var emptyEl    = $('#history-empty');
  var countEl    = $('#hist-count');
  var clearBtn   = $('#clear-btn');
  var randomBtn  = $('#random-btn');
  var prevBtn    = $('#prev-btn');
  var nextBtn    = $('#next-btn');
  var copyBtn    = $('#copy-btn');

  var STORAGE_KEY = 'zhixin-topics-history-v1';
  var history = loadHistory();
  var current = null;

  /* ---------- 存储 ---------- */
  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(Number).filter(function (n) {
        return Number.isInteger(n) && n >= 1 && n <= TOTAL;
      });
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ---------- 渲染 ---------- */
  function renderHistory() {
    chipsEl.innerHTML = '';
    countEl.textContent = String(history.length);
    emptyEl.hidden = history.length > 0;

    history.forEach(function (n) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = String(n);
      btn.title = '查看第 ' + n + ' 题';
      btn.setAttribute('aria-label', '查看第 ' + n + ' 题');
      btn.addEventListener('click', function () { showQuestion(n, true); });
      chipsEl.appendChild(btn);
    });
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.focus();
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function showQuestion(id, record) {
    var q = null;
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].id === id) { q = QUESTIONS[i]; break; }
    }
    if (!q) {
      showError('没有找到第 ' + id + ' 题，请输入 1 - ' + TOTAL + ' 之间的数字。');
      return;
    }

    clearError();
    current = id;

    qNoEl.textContent = '第 ' + q.id + ' 题';
    qLevelEl.textContent = q.level || '话题';
    qLevelEl.className = 'q-level lv-' + (q.level || '话题');
    qTextEl.textContent = q.text;

    card.hidden = false;
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');

    if (record) {
      if (history.indexOf(id) === -1) {
        history.push(id);
        history.sort(function (a, b) { return a - b; });
        saveHistory();
        renderHistory();
      }
      input.value = String(id);
    }

    updateStepButtons();

    if (window.matchMedia('(max-width: 560px)').matches) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateStepButtons() {
    prevBtn.disabled = !current || current <= 1;
    nextBtn.disabled = !current || current >= TOTAL;
    prevBtn.style.opacity = prevBtn.disabled ? '.45' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '.45' : '1';
  }

  /* ---------- 事件 ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = (input.value || '').trim();
    if (raw === '') {
      showError('请先输入题号（1 - ' + TOTAL + '）。');
      return;
    }
    var n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL) {
      showError('题号需要是 1 - ' + TOTAL + ' 之间的整数哦。');
      return;
    }
    showQuestion(n, true);
  });

  randomBtn.addEventListener('click', function () {
    var pool = QUESTIONS.map(function (q) { return q.id; });
    if (!pool.length) return;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    showQuestion(pick, true);
  });

  prevBtn.addEventListener('click', function () {
    if (current && current > 1) showQuestion(current - 1, true);
  });

  nextBtn.addEventListener('click', function () {
    if (current && current < TOTAL) showQuestion(current + 1, true);
  });

  copyBtn.addEventListener('click', function () {
    if (!current) return;
    var text = '第 ' + current + ' 题｜' + qTextEl.textContent;
    var done = function () {
      var old = copyBtn.textContent;
      copyBtn.textContent = '已复制 ✓';
      setTimeout(function () { copyBtn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        copyBtn.textContent = '复制失败';
      }
    }
  });

  clearBtn.addEventListener('click', function () {
    history = [];
    saveHistory();
    renderHistory();
  });

  input.addEventListener('input', function () {
    if (!errorEl.hidden) clearError();
  });

  /* ---------- 初始化 ---------- */
  renderHistory();
  updateStepButtons();

  // 支持 URL 片段直达： #42
  var hash = parseInt(String(window.location.hash).replace('#', ''), 10);
  if (Number.isInteger(hash) && hash >= 1 && hash <= TOTAL) {
    showQuestion(hash, true);
  }
})();
