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
export const mean = values => { const filled = values.filter(v => typeof v === 'number' && Number.isFinite(v)); return filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null; };
export const validSleepHours = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24;
export function sleepAnalysis(data, start, end) {
  const recorded = data.daily.filter(day => day.date >= start && day.date <= end && day.status !== null);
  const eligible = recorded.filter(day => day.sleepHours !== null && validSleepHours(day.sleepHours));
  const summarize = days => {
    const yes = days.filter(day => day.status === 'yes').length;
    const no = days.filter(day => day.status === 'no').length;
    const unknown = days.filter(day => day.status === 'unknown').length;
    const metrics = {};
    for (const key of [...Object.keys(METRICS), 'rarity']) {
      const nightly = days.filter(day => day.status === 'yes').map(day => mean(data.dreams.filter(d => d.sleepType === 'night' && d.date === day.date).map(d => key === 'rarity' ? (d.rarity ? RARITIES.indexOf(d.rarity) + 1 : null) : d[key])));
      metrics[key] = { value: mean(nightly), count: nightly.filter(value => value !== null).length };
    }
    return { count: days.length, yes, no, unknown, known: yes + no, rate: yes + no ? yes / (yes + no) : null, recallUnknownRate: days.length ? unknown / days.length : null, meanHours: mean(days.map(day => day.sleepHours)), metrics };
  };
  const groups = [{label:'少於 5 小時',min:0,max:5},{label:'5–未滿 7 小時',min:5,max:7},{label:'7–未滿 9 小時',min:7,max:9},{label:'9 小時以上',min:9,max:Infinity}].map(group => ({ label: group.label, ...summarize(eligible.filter(day => day.sleepHours >= group.min && day.sleepHours < group.max)) }));
  return { ...summarize(eligible), recorded: recorded.length, missingHours: recorded.length - eligible.length, groups,
    byStatus: ['yes','no','unknown'].map(status => { const days = eligible.filter(day => day.status === status); return { status, count: days.length, meanHours: mean(days.map(day => day.sleepHours)) }; }) };
}
export const recurring = dream => Boolean(dream.seriesId) || dream.structures.includes('輪迴 / Recurring');
export function statistics(data, start, end, type = 'night') {
  const days = data.daily.filter(d => d.date >= start && d.date <= end);
  const yes = days.filter(d => d.status === 'yes').length, no = days.filter(d => d.status === 'no').length, unknown = days.filter(d => d.status === 'unknown').length;
  const dreams = data.dreams.filter(d => d.date >= start && d.date <= end && (type === 'all' || d.sleepType === type));
  const night = type === 'night';
  const units = night ? days.filter(d => d.status === 'yes').map(d => dreams.filter(e => e.date === d.date)) : dreams.map(d => [d]);
  const metrics = {};
  for (const key of [...Object.keys(METRICS), 'rarity']) {
    const scores = units.map(group => mean(group.map(d => key === 'rarity' ? (d.rarity ? RARITIES.indexOf(d.rarity) + 1 : null) : d[key])));
    metrics[key] = { value: mean(scores), count: scores.filter(v => v !== null).length };
  }
  const categories = {};
  for (const key of Object.keys(DEFAULT_TAGS)) {
    const counts = new Map();
    for (const group of units) for (const label of new Set(group.flatMap(d => d[key]))) counts.set(label, (counts.get(label) || 0) + 1);
    categories[key] = [...counts].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count, ratio: units.length ? count / units.length : null }));
  }
  return { yes, no, unknown, missing: datesBetween(start, end).length - yes - no - unknown, recorded: yes + no + unknown,
    rate: yes + no ? yes / (yes + no) : null, dreams: dreams.length, units: units.length, metrics, categories,
    recurring: units.filter(group => group.some(recurring)).length, rarity: RARITIES.map(label => ({ label, count: dreams.filter(d => d.rarity === label).length })) };
}
export function trend(data, start, end, type, windowDays) {
  return datesBetween(start, end).map(date => {
    const first = shiftDate(date, -(windowDays - 1));
    const s = statistics(data, first, date, type);
    const sleepHours = mean(data.daily.filter(day => day.date >= first && day.date <= date && day.status !== null).map(day => day.sleepHours));
    return { date, rate: s.rate, dreams: s.dreams, sleepHours, ...Object.fromEntries(Object.entries(s.metrics).map(([k, v]) => [k, v.value])) };
  });
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
