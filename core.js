export const VERSION = 1;
export const RARITIES = ['N', 'R', 'SR', 'SSR', 'SSSR'];
export const EXP = { N: 10, R: 20, SR: 50, SSR: 150, SSSR: 500 };
export const STATUS = { yes: '💀 有噩夢', no: '😴 沒有噩夢', unknown: '❓ 不記得' };
export const METRICS = { sleepDisruption: '睡眠影響', distress: '醒來難受程度', contentIntensity: '內容強度' };
export const DEFAULT_TAGS = {
  contentTags: ['被追逐', '被困', '威脅', '暴力', '死亡', '他人死亡', '自己受傷', '身體異常', '安全場所失效', '陌生人', '冒充熟人', '無法求助', '性威脅 / 性侵', '墜落', '超現實', '場景突然切換', '失憶', '時間異常', '家人', '伴侶', '嘗試救人', '迷路', '遲到', '考試 / 學業', '工作 / 任務失敗', '被監視', '被拒絕 / 排斥', '背叛', '失去重要的人', '自然災害', '交通事故', '鬼怪 / 靈異', '無法動彈', '窒息 / 無法呼吸', '牙齒脫落', '其他'],
  structures: ['輪迴 / Recurring', '逃亡 / Chase', '侵入 / Intrusion', '敘事 / Narrative', '碎片 / Fragmented', '規則改變 / Rule Shift', '救援失敗 / Rescue Failure', '其他'],
  fearReasons: ['失去控制', '無法逃脫', '被追', '身體被傷害', '他人死亡', '無法保護重要的人', '安全的地方突然不安全', '周圍的人無法察覺', '被冒充 / 身份錯亂', '世界規則失效', '不知道接下來會發生甚麼', '被迫服從', '無法求助', '其他']
};
// Display-only grouping of DEFAULT_TAGS.contentTags; stored labels stay identical so existing data and statistics are unaffected.
export const CONTENT_TAG_GROUPS = [
  { label: '被追與困住', tags: ['被追逐', '被困', '迷路', '無法動彈', '無法求助', '墜落', '窒息 / 無法呼吸'] },
  { label: '傷害與死亡', tags: ['威脅', '暴力', '死亡', '他人死亡', '自己受傷', '性威脅 / 性侵', '失去重要的人', '嘗試救人'] },
  { label: '人物與關係', tags: ['家人', '伴侶', '陌生人', '冒充熟人', '背叛', '被拒絕 / 排斥', '被監視'] },
  { label: '場景與異象', tags: ['安全場所失效', '超現實', '場景突然切換', '時間異常', '自然災害', '交通事故', '鬼怪 / 靈異', '身體異常', '牙齒脫落', '失憶'] },
  { label: '壓力與失敗', tags: ['考試 / 學業', '工作 / 任務失敗', '遲到'] }
];
export const UNGROUPED_TAG_LABEL = '其他與自訂';
export function groupContentTags(allTags) {
  const known = new Set(CONTENT_TAG_GROUPS.flatMap(group => group.tags));
  const present = new Set(allTags);
  const groups = CONTENT_TAG_GROUPS.map(group => ({ label: group.label, tags: group.tags.filter(tag => present.has(tag)) }));
  groups.push({ label: UNGROUPED_TAG_LABEL, tags: allTags.filter(tag => !known.has(tag)) });
  return groups.filter(group => group.tags.length);
}
export const uid = () => globalThis.crypto.randomUUID();
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function shiftDate(value, days) { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); }
export function datesBetween(start, end) { const result = []; for (let d = start; d <= end; d = shiftDate(d, 1)) result.push(d); return result; }
export function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(new Date(`${value}T12:00:00`)) === value; }
export function emptyData() { return { version: VERSION, daily: [], dreams: [], series: [], settings: { customTags: { contentTags: [], structures: [], fearReasons: [] }, lastExportAt: null, changedAt: null, reducedMotion: false }, drafts: {} }; }
export function dayRecord(data, date) { return data.daily.find(d => d.date === date) || { date, status: null, sleepHours: null }; }
export function upsertDay(data, date, patch = {}) {
  let day = data.daily.find(d => d.date === date);
  const now = new Date().toISOString();
  if (!day) { day = { date, status: null, sleepHours: null, createdAt: now, updatedAt: now }; data.daily.push(day); }
  Object.assign(day, patch, { updatedAt: now }); return day;
}
export function setNightStatus(data, date, status) {
  if (status !== 'yes') data.dreams = data.dreams.filter(d => d.date !== date || d.sleepType !== 'night');
  upsertDay(data, date, { status });
}
export function saveDream(data, dream, sleepHours = undefined) {
  if (dream.sleepType === 'night' && sleepHours !== undefined && !validSleepHours(sleepHours)) throw new Error('睡眠時數請填 0–24，或留空');
  const previous = data.dreams.find(d => d.id === dream.id);
  data.dreams = data.dreams.filter(d => d.id !== dream.id);
  const now = new Date().toISOString();
  data.dreams.push({ ...dream, createdAt: previous?.createdAt || dream.createdAt || now, updatedAt: now });
  upsertDay(data, dream.date, dream.sleepType === 'night' ? { status: 'yes', ...(sleepHours === undefined ? {} : { sleepHours }) } : {});
  // A previous explicit "yes" remains valid even if its only detailed episode is moved or deleted.
}
export function rewards(data) {
  const byDate = new Map();
  for (const dream of data.dreams) byDate.set(dream.date, Math.max(byDate.get(dream.date) || 0, EXP[dream.rarity] || 10));
  for (const day of data.daily) if (day.status === 'yes' && !byDate.has(day.date)) byDate.set(day.date, 10);
  const exp = [...byDate.values()].reduce((a, b) => a + b, 0);
  return { exp, fish: data.daily.filter(d => d.status === 'no').length, level: 1 + Math.floor(exp / 100), progress: exp % 100 };
}
// `before` and `after` are rewards() results taken around a save; `isEdit` means the dream already existed.
export function saveFeedback(before, after, isEdit) {
  const gain = after.exp - before.exp;
  if (isEdit) {
    const base = '已更新這個夢。';
    return gain === 0 ? base : `${base}經驗值已重新計算（${gain > 0 ? '+' : '−'}${Math.abs(gain)} EXP）。`;
  }
  if (gain <= 0) return '這個夢已經留下來了。這一天的經驗值已計算過。';
  return `💀 → 🦭 NOM。這個夢留下來了，+${gain} EXP${after.level > before.level ? `，升到 Lv. ${after.level}` : ''}。`;
}
export const mean = values => { const filled = values.filter(v => typeof v === 'number' && Number.isFinite(v)); return filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null; };
export const validSleepHours = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24;
// Judgement-call thresholds. They only soften or hide numbers in the UI; they never change a stored value.
export const ANALYSIS = { smallSample: 10, lowCoverage: 0.6, minGroupKnown: 5, minCompareKnown: 5, minScored: 3, minRated: 5, trendCoverage: 0.5 };
export const RECURRING_TAG = '輪迴 / Recurring';
const clampEnd = (end, today) => end < today ? end : today;
export const daysInclusive = (start, end) => start > end ? 0 : Math.round((Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`)) / 864e5) + 1;
export function previousRange(start, end) { const days = daysInclusive(start, end); return { start: shiftDate(start, -days), end: shiftDate(start, -1) }; }
// Night counts for [start, end]. Nights that have not finished (today) and future dates are never "missing";
// records dated after today are reported as `ahead` and left out of every count.
export function nightSummary(data, start, end, { today = dateKey() } = {}) {
  const last = clampEnd(end, today), status = new Map();
  let ahead = 0;
  for (const day of data.daily) {
    if (!day.status || day.date < start || day.date > end) continue;
    if (day.date > today) ahead++; else status.set(day.date, day.status);
  }
  let yes = 0, no = 0, unknown = 0, missing = 0, pending = 0, days = 0;
  for (let date = start; date <= last; date = shiftDate(date, 1)) {
    days++;
    const value = status.get(date);
    if (value === 'yes') yes++; else if (value === 'no') no++; else if (value === 'unknown') unknown++;
    else if (date < today) missing++; else pending++;
  }
  const known = yes + no, recorded = known + unknown, due = recorded + missing;
  return { start, end: last, days, yes, no, unknown, known, recorded, missing, pending, due, ahead,
    future: daysInclusive(start > today ? start : shiftDate(today, 1), end), coverage: due ? recorded / due : null, rate: known ? yes / known : null };
}
export function limitNotes(summary) {
  const notes = [];
  if (!summary.known) notes.push({ code: 'noKnown', text: '這段時間還沒有「確定有／沒有」噩夢的夜晚，暫時算不出噩夢率。' });
  else if (summary.known < ANALYSIS.smallSample) notes.push({ code: 'smallSample', text: `目前只有 ${summary.known} 晚確定有／沒有噩夢，樣本偏少，比例容易大幅跳動，先當作參考就好。` });
  if (summary.known && summary.coverage !== null && summary.coverage < ANALYSIS.lowCoverage) notes.push({ code: 'lowCoverage', text: `這段時間只記錄了 ${Math.round(summary.coverage * 100)}% 的夜晚，數字可能無法代表整段時間。` });
  return notes;
}
// Rarity is an ordinal, subjective label: report counts, median and mode, never a mean.
export function rarityDistribution(dreams) {
  const counts = RARITIES.map(label => ({ label, count: dreams.filter(d => d.rarity === label).length }));
  const rated = counts.reduce((sum, item) => sum + item.count, 0), peak = Math.max(0, ...counts.map(item => item.count));
  const ordered = counts.flatMap(item => Array(item.count).fill(item.label));
  let median = null;
  if (rated) { const low = ordered[Math.ceil(rated / 2) - 1], high = ordered[Math.floor(rated / 2)]; median = low === high ? low : `${low}–${high}`; }
  return { total: dreams.length, rated, unrated: dreams.length - rated, items: counts.map(item => ({ ...item, share: rated ? item.count / rated : null })), median, mode: peak ? counts.filter(item => item.count === peak).map(item => item.label) : [] };
}
export function sleepAnalysis(data, start, end, { today = dateKey() } = {}) {
  const last = clampEnd(end, today);
  const inWindow = data.daily.filter(day => day.date >= start && day.date <= last);
  const recorded = inWindow.filter(day => day.status !== null);
  const eligible = recorded.filter(day => day.sleepHours !== null && validSleepHours(day.sleepHours));
  const nightDreams = new Map();
  for (const d of data.dreams) if (d.sleepType === 'night') { const list = nightDreams.get(d.date); if (list) list.push(d); else nightDreams.set(d.date, [d]); }
  const summarize = days => {
    const yes = days.filter(day => day.status === 'yes').length;
    const no = days.filter(day => day.status === 'no').length;
    const unknown = days.filter(day => day.status === 'unknown').length;
    const metrics = {};
    for (const key of Object.keys(METRICS)) {
      const nightly = days.filter(day => day.status === 'yes').map(day => mean((nightDreams.get(day.date) || []).map(d => d[key])));
      const count = nightly.filter(value => value !== null).length;
      metrics[key] = { value: mean(nightly), count, units: nightly.length, missing: nightly.length - count };
    }
    return { count: days.length, yes, no, unknown, known: yes + no, rate: yes + no ? yes / (yes + no) : null, reliable: yes + no >= ANALYSIS.minGroupKnown, recallUnknownRate: days.length ? unknown / days.length : null, meanHours: mean(days.map(day => day.sleepHours)), metrics };
  };
  const groups = [{label:'少於 5 小時',min:0,max:5},{label:'5–未滿 7 小時',min:5,max:7},{label:'7–未滿 9 小時',min:7,max:9},{label:'9 小時以上',min:9,max:Infinity}].map(group => ({ label: group.label, ...summarize(eligible.filter(day => day.sleepHours >= group.min && day.sleepHours < group.max)) }));
  return { ...summarize(eligible), start, end: last, recorded: recorded.length, missingHours: recorded.length - eligible.length,
    hoursOnly: inWindow.filter(day => day.status === null && day.sleepHours !== null).length, groups,
    byStatus: ['yes','no','unknown'].map(status => { const days = eligible.filter(day => day.status === status); return { status, count: days.length, meanHours: mean(days.map(day => day.sleepHours)) }; }) };
}
export const recurring = dream => dream.structures.includes(RECURRING_TAG);
export const inSeries = dream => Boolean(dream.seriesId);
export function statistics(data, start, end, type = 'night', options = {}) {
  const nights = nightSummary(data, start, end, options);
  const dreams = data.dreams.filter(d => d.date >= start && d.date <= nights.end && (type === 'all' || d.sleepType === type));
  const isNight = type === 'night';
  const byDate = new Map();
  for (const d of dreams) { const list = byDate.get(d.date); if (list) list.push(d); else byDate.set(d.date, [d]); }
  // Night scope: one unit per nightmare night (several dreams merge). Nap / all scope: one unit per dream.
  const units = isNight ? data.daily.filter(d => d.status === 'yes' && d.date >= start && d.date <= nights.end).map(d => byDate.get(d.date) || []) : dreams.map(d => [d]);
  const metrics = {};
  for (const key of Object.keys(METRICS)) {
    const scores = units.map(group => mean(group.map(d => d[key])));
    const count = scores.filter(v => v !== null).length;
    metrics[key] = { value: mean(scores), count, units: units.length, missing: units.length - count };
  }
  // A unit with no label in a category is "not filled", not "does not have it": percentages use the filled units.
  const categories = {}, categoryMeta = {};
  for (const key of Object.keys(DEFAULT_TAGS)) {
    const counts = new Map();
    let filled = 0;
    for (const group of units) { const labels = new Set(group.flatMap(d => d[key])); if (labels.size) filled++; for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1); }
    categories[key] = [...counts].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count, ratio: filled ? count / filled : null }));
    categoryMeta[key] = { units: units.length, filled, unfilled: units.length - filled };
  }
  const countUnits = predicate => units.filter(group => group.some(predicate)).length;
  return { ...nights, dreams: dreams.length, units: units.length, unit: isNight ? 'night' : 'dream', metrics, categories, categoryMeta, rarity: rarityDistribution(dreams),
    recurring: countUnits(recurring), inSeries: countUnits(inSeries), recalled: countUnits(d => d.dreamMemory === 'yes') };
}
// Rolling windows ending on each date up to today. Values are raw; `samples` / `known` tell how much data stands behind them.
export function trend(data, start, end, type, windowDays, { today = dateKey() } = {}) {
  const last = clampEnd(end, today);
  if (start > last) return [];
  const dates = datesBetween(shiftDate(start, -(windowDays - 1)), last);
  const statusOf = new Map(), hoursOf = new Map(), dreamsOf = new Map();
  for (const day of data.daily) {
    if (day.status) statusOf.set(day.date, day.status);
    if (day.status !== null && day.sleepHours !== null) hoursOf.set(day.date, day.sleepHours);
  }
  for (const d of data.dreams) if (type === 'all' || d.sleepType === type) { const list = dreamsOf.get(d.date); if (list) list.push(d); else dreamsOf.set(d.date, [d]); }
  const points = [];
  for (let i = windowDays - 1; i < dates.length; i++) {
    let yes = 0, no = 0, unknown = 0, due = 0, dreams = 0;
    const hours = [], units = [];
    for (const date of dates.slice(i - windowDays + 1, i + 1)) {
      const status = statusOf.get(date), list = dreamsOf.get(date) || [];
      if (status === 'yes') yes++; else if (status === 'no') no++; else if (status === 'unknown') unknown++;
      if (status || date < today) due++;
      dreams += list.length;
      if (hoursOf.has(date)) hours.push(hoursOf.get(date));
      if (type === 'night') { if (status === 'yes') units.push(list); } else for (const d of list) units.push([d]);
    }
    const known = yes + no, recorded = known + unknown;
    const point = { date: dates[i], windowDays, yes, no, unknown, known, recorded, due, coverage: due ? recorded / due : null, rate: known ? yes / known : null,
      dreams: recorded || dreams ? dreams : null, sleepHours: mean(hours), sleepSample: hours.length, samples: {} };
    for (const key of Object.keys(METRICS)) { const scores = units.map(group => mean(group.map(d => d[key]))).filter(v => v !== null); point[key] = mean(scores); point.samples[key] = scores.length; }
    points.push(point);
  }
  return points;
}
export const TREND_METRICS = {
  rate: { label: '夜間噩夢率', kind: 'ratio', type: 'night', basis: '有噩夢的夜晚 ÷ 確定有／無的夜晚', sampleLabel: '晚確定有／無' },
  nightmareNights: { label: '有噩夢的夜晚數', kind: 'count', type: 'night', basis: '窗口內有噩夢的夜晚數', sampleLabel: '晚有記錄' },
  dreams: { label: '記錄到的夢境數（夜間＋午覺）', kind: 'count', type: 'all', basis: '窗口內記錄的夢境筆數', sampleLabel: '晚有記錄' },
  sleepHours: { label: '夜間睡眠時數', kind: 'mean', type: 'night', basis: '有填時數的夜晚', sampleLabel: '晚有填時數' },
  ...Object.fromEntries(Object.entries(METRICS).map(([key, label]) => [key, { label: `${label}（夜間）`, kind: 'mean', type: 'night', basis: '有噩夢且有評分的夜晚；同一晚多個夢先平均', sampleLabel: '晚有評分' }]))
};
export const trendMinSample = (metric, windowDays) => Object.hasOwn(METRICS, metric) ? ANALYSIS.minScored : Math.max(3, Math.ceil(windowDays * ANALYSIS.trendCoverage));
// One metric as a plottable series. Only `reliable` points should be drawn: a window with too few valid
// observations is reported as insufficient (never as 0), and a window with nothing at all as unavailable (null).
export function trendSeries(data, start, end, metric, windowDays, options = {}) {
  const def = TREND_METRICS[metric];
  if (!def) throw new Error(`unknown trend metric: ${metric}`);
  const min = trendMinSample(metric, windowDays);
  const points = trend(data, start, end, def.type, windowDays, options).map(p => {
    const [value, sample] = metric === 'rate' ? [p.rate, p.known]
      : metric === 'nightmareNights' ? [p.recorded ? p.yes : null, p.recorded]
      : metric === 'dreams' ? [p.dreams, p.recorded]
      : metric === 'sleepHours' ? [p.sleepHours, p.sleepSample]
      : [p[metric], p.samples[metric]];
    return { date: p.date, value, sample, reliable: value !== null && sample >= min };
  });
  return { metric, ...def, windowDays, min, points, plotted: points.filter(p => p.reliable).length,
    insufficient: points.filter(p => p.value !== null && !p.reliable).length, unavailable: points.filter(p => p.value === null).length };
}
// Night-scope comparison of two periods. Differences are only computed when both sides have enough observations.
export function comparePeriods(data, a, b, options = {}) {
  const sa = statistics(data, a.start, a.end, 'night', options), sb = statistics(data, b.start, b.end, 'night', options);
  const enough = sa.known >= ANALYSIS.minCompareKnown && sb.known >= ANALYSIS.minCompareKnown;
  const metricDeltas = Object.fromEntries(Object.keys(METRICS).map(key => [key, sa.metrics[key].count >= ANALYSIS.minScored && sb.metrics[key].count >= ANALYSIS.minScored ? sb.metrics[key].value - sa.metrics[key].value : null]));
  return { a: sa, b: sb, enough, rateDelta: enough ? sb.rate - sa.rate : null, metricDeltas, lengthsDiffer: sa.days !== sb.days };
}
export function validateData(input) {
  const fail = message => { throw new Error(`備份格式不正確：${message}`); };
  if (!input || input.version !== VERSION) fail('不支援的資料版本');
  for (const key of ['daily', 'dreams', 'series']) if (!Array.isArray(input[key])) fail(`缺少 ${key}`);
  const isTime = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const ids = new Set(), dates = new Set(), seriesIds = new Set();
  const series = input.series.map(s => {
    if (!s || typeof s.id !== 'string' || !s.id || seriesIds.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || typeof s.background !== 'string' || !['Active','Rare','Retired','Returned'].includes(s.status)) fail('系列資料');
    seriesIds.add(s.id); return { id: s.id, name: s.name, background: s.background, status: s.status };
  });
  const daily = input.daily.map(d => {
    if (!d || !validDate(d.date) || dates.has(d.date) || ![null,'yes','no','unknown'].includes(d.status) || !(d.sleepHours === null || typeof d.sleepHours === 'number' && Number.isFinite(d.sleepHours) && d.sleepHours >= 0 && d.sleepHours <= 24) || !isTime(d.createdAt) || !isTime(d.updatedAt)) fail('每日資料、日期或重複日期');
    dates.add(d.date); return { date: d.date, status: d.status, sleepHours: d.sleepHours, createdAt: d.createdAt, updatedAt: d.updatedAt };
  });
  const dreams = input.dreams.map(d => {
    if (!d || typeof d.id !== 'string' || !d.id || ids.has(d.id) || !validDate(d.date) || !dates.has(d.date) || !['night','nap'].includes(d.sleepType) || ![null,...RARITIES].includes(d.rarity) || typeof d.description !== 'string' || !(d.seriesId === null || seriesIds.has(d.seriesId)) || !isTime(d.createdAt) || !isTime(d.updatedAt)) fail('夢境資料或系列連結');
    for (const key of Object.keys(METRICS)) if (!(d[key] === null || Number.isInteger(d[key]) && d[key] >= 0 && d[key] <= 5)) fail('評分須為 0–5 或未填');
    for (const key of Object.keys(DEFAULT_TAGS)) if (!Array.isArray(d[key]) || d[key].some(v => typeof v !== 'string' || !v.trim())) fail('分類標籤');
    for (const key of ['dreamMemory','predictedEvent','lucid']) if (![null,'yes','no','unsure'].includes(d[key])) fail('夢中記憶選項');
    if (![null,'yes','no','partially'].includes(d.changedOutcome)) fail('改變結局選項');
    if (d.sleepType === 'night' && daily.find(day => day.date === d.date).status !== 'yes') fail('夜間夢與每日狀態不一致');
    ids.add(d.id); return Object.fromEntries(['id','date','sleepType','rarity',...Object.keys(METRICS),'description',...Object.keys(DEFAULT_TAGS),'seriesId','dreamMemory','predictedEvent','changedOutcome','lucid','createdAt','updatedAt'].map(k => [k, d[k]]));
  });
  const settings = input.settings;
  if (!settings || typeof settings.reducedMotion !== 'boolean' || !settings.customTags || ![null,undefined].includes(settings.lastExportAt) && !isTime(settings.lastExportAt) || ![null,undefined].includes(settings.changedAt) && !isTime(settings.changedAt)) fail('設定');
  const customTags = {};
  for (const key of Object.keys(DEFAULT_TAGS)) {
    if (!Array.isArray(settings.customTags[key]) || settings.customTags[key].some(v => typeof v !== 'string' || !v.trim())) fail('自訂分類');
    customTags[key] = [...new Set(settings.customTags[key])];
  }
  // Drafts are untrusted form input, never executable. Restore only usable editor shapes.
  const drafts = {};
  if (input.drafts && typeof input.drafts === 'object' && !Array.isArray(input.drafts)) {
    const draft = input.drafts.editor;
    if (draft && validDate(draft.date) && ['night','nap'].includes(draft.sleepType) && typeof draft.description === 'string' && Object.keys(DEFAULT_TAGS).every(k => Array.isArray(draft[k]) && draft[k].every(v => typeof v === 'string')) && Object.keys(METRICS).every(k => draft[k] === null || Number.isInteger(draft[k]) && draft[k] >= 0 && draft[k] <= 5) && [null,...RARITIES].includes(draft.rarity) && typeof draft.id === 'string' && draft.id) {
      drafts.editor = Object.fromEntries(['id','date','sleepType','rarity',...Object.keys(METRICS),'description',...Object.keys(DEFAULT_TAGS)].map(key => [key,draft[key]]));
      drafts.editor.seriesId = seriesIds.has(draft.seriesId) ? draft.seriesId : null;
      for (const key of ['dreamMemory','predictedEvent','lucid']) drafts.editor[key] = ['yes','no','unsure'].includes(draft[key]) ? draft[key] : null;
      drafts.editor.changedOutcome = ['yes','no','partially'].includes(draft.changedOutcome) ? draft.changedOutcome : null;
      for (const key of ['createdAt','updatedAt']) if (isTime(draft[key])) drafts.editor[key] = draft[key];
      if (draft.sleepHoursByDate && typeof draft.sleepHoursByDate === 'object' && !Array.isArray(draft.sleepHoursByDate)) {
        drafts.editor.sleepHoursByDate = Object.fromEntries(Object.entries(draft.sleepHoursByDate).filter(([date,value]) => validDate(date) && validSleepHours(value)));
      }
    }
  }
  return { version: VERSION, daily, dreams, series, settings: { customTags, reducedMotion: settings.reducedMotion, lastExportAt: settings.lastExportAt || null, changedAt: settings.changedAt || null }, drafts };
}
export function mergeData(current, incoming) {
  const result = structuredClone(current);
  const conflictingDates = new Set(incoming.daily.filter(day => current.daily.some(d => d.date === day.date)).map(d => d.date));
  for (const s of incoming.series) if (!result.series.some(existing => existing.id === s.id)) result.series.push(s);
  for (const day of incoming.daily) if (!conflictingDates.has(day.date)) result.daily.push(day);
  for (const dream of incoming.dreams) if (!conflictingDates.has(dream.date) && !result.dreams.some(d => d.id === dream.id)) result.dreams.push(dream);
  for (const key of Object.keys(DEFAULT_TAGS)) result.settings.customTags[key] = [...new Set([...result.settings.customTags[key], ...incoming.settings.customTags[key]])];
  return validateData(result);
}
export function csv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
