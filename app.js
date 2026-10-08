'use strict';

/* ============================================================
 * 运动记录 - 应用逻辑（零依赖，纯原生 JS）
 * 数据通过 localStorage 持久化在本地浏览器中
 * ============================================================ */

// localStorage 键名
const STORAGE_KEY = 'sportTrackerRecords';

// 支持的运动类型及展示图标
const TYPES = ['跑步', '骑行', '游泳', '健身', '瑜伽', '步行', '其他'];
const TYPE_ICONS = {
  '跑步': '🏃', '骑行': '🚴', '游泳': '🏊',
  '健身': '🏋️', '瑜伽': '🧘', '步行': '🚶', '其他': '✨'
};

// ---------- 数据层 ----------

/** 从 localStorage 读取全部记录；损坏时返回空数组 */
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('读取本地记录失败，已重置：', e);
    return [];
  }
}

/** 把记录数组写入 localStorage */
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** 生成唯一 ID（时间戳 + 随机串，避免同一毫秒内冲突） */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 工具函数 ----------

/** HTML 转义：备注等用户输入必须转义后再插入页面，防止破坏结构 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 'YYYY-MM-DD' 解析为本地日期对象（避免时区偏移问题） */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 本周一 00:00 的时间戳（用于统计"本周运动次数"） */
function startOfThisWeek() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 周日→6，周一→0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  return monday.getTime();
}

/** 今天日期字符串 'YYYY-MM-DD'，用于日期输入框默认值 */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---------- 渲染 ----------

/** 渲染统计面板：总数/总时长/总距离/本周次数 + 按类型条形图 */
function renderStats(records) {
  const totalDuration = records.reduce((s, r) => s + r.duration, 0);
  const totalDistance = records.reduce((s, r) => s + (r.distance || 0), 0);
  const weekStart = startOfThisWeek();
  const weekCount = records.filter(r => parseDate(r.date).getTime() >= weekStart).length;

  document.getElementById('stat-count').textContent = records.length;
  document.getElementById('stat-duration').textContent = totalDuration;
  // 距离保留一位小数，避免浮点累加出现 0.30000000004
  document.getElementById('stat-distance').textContent = Math.round(totalDistance * 10) / 10;
  document.getElementById('stat-week').textContent = weekCount;

  // 按运动类型分组计数
  const counts = {};
  TYPES.forEach(t => { counts[t] = 0; });
  records.forEach(r => { if (counts[r.type] !== undefined) counts[r.type]++; });

  const max = Math.max(1, ...Object.values(counts)); // 避免除以 0
  const wrap = document.getElementById('type-bars');
  wrap.innerHTML = TYPES.map(t => {
    const c = counts[t];
    const width = Math.round((c / max) * 100);
    return `
      <div class="type-row">
        <span class="type-name">${TYPE_ICONS[t]} ${escapeHtml(t)}</span>
        <span class="type-track"><span class="type-fill" style="width:${width}%"></span></span>
        <span class="type-count">${c}次</span>
      </div>`;
  }).join('');
}

/** 渲染记录列表：按日期倒序（同日期按创建时间倒序） */
function renderList(records) {
  const sorted = [...records].sort((a, b) =>
    b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
  );
  const list = document.getElementById('record-list');
  document.getElementById('list-count').textContent = sorted.length ? `共 ${sorted.length} 条` : '';
  document.getElementById('empty-tip').hidden = sorted.length > 0;

  list.innerHTML = sorted.map(r => {
    const parts = [`${r.duration} 分钟`];
    if (r.distance) parts.push(`${r.distance} km`);
    if (r.calories) parts.push(`${r.calories} kcal`);
    const noteHtml = r.note
      ? `<div class="record-note">${escapeHtml(r.note)}</div>`
      : '';
    return `
      <li class="record-item" data-id="${escapeHtml(r.id)}">
        <span class="record-icon">${TYPE_ICONS[r.type] || '✨'}</span>
        <div class="record-body">
          <div class="record-title">${escapeHtml(r.type)} · ${escapeHtml(r.date)}</div>
          <div class="record-meta">${parts.join(' ｜ ')}</div>
          ${noteHtml}
        </div>
        <button class="delete-btn" type="button">删除</button>
      </li>`;
  }).join('');
}

/** 统一刷新：统计 + 列表 */
function refresh() {
  const records = loadRecords();
  renderStats(records);
  renderList(records);
}

// ---------- 事件 ----------

/** 表单提交：校验并新增一条记录 */
document.getElementById('record-form').addEventListener('submit', e => {
  e.preventDefault();

  const type = document.getElementById('f-type').value;
  const date = document.getElementById('f-date').value;
  const duration = Number(document.getElementById('f-duration').value);
  const distanceRaw = document.getElementById('f-distance').value;
  const caloriesRaw = document.getElementById('f-calories').value;
  const note = document.getElementById('f-note').value.trim();

  // 基础校验
  if (!date) { alert('请选择日期'); return; }
  if (!Number.isFinite(duration) || duration <= 0) { alert('请填写有效的时长（分钟）'); return; }
  const distance = distanceRaw === '' ? null : Number(distanceRaw);
  const calories = caloriesRaw === '' ? null : Number(caloriesRaw);
  if (distance !== null && (!Number.isFinite(distance) || distance < 0)) { alert('距离不能为负数'); return; }
  if (calories !== null && (!Number.isFinite(calories) || calories < 0)) { alert('卡路里不能为负数'); return; }

  const records = loadRecords();
  records.push({
    id: makeId(),
    type,
    date,
    duration: Math.round(duration),
    distance,
    calories: calories === null ? null : Math.round(calories),
    note: note || null,
    createdAt: Date.now()
  });
  saveRecords(records);
  refresh();

  // 重置表单（保留运动类型，日期恢复为今天）
  document.getElementById('f-duration').value = '';
  document.getElementById('f-distance').value = '';
  document.getElementById('f-calories').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('f-date').value = todayStr();
});

/** 列表点击删除（事件委托），删除前二次确认 */
document.getElementById('record-list').addEventListener('click', e => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const item = btn.closest('.record-item');
  const id = item && item.dataset.id;
  if (!id) return;
  if (!confirm('确定删除这条运动记录吗？')) return;

  const records = loadRecords().filter(r => r.id !== id);
  saveRecords(records);
  refresh();
});

// ---------- 初始化 ----------

// 日期输入框默认填今天
document.getElementById('f-date').value = todayStr();
refresh();
