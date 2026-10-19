import { RARITIES, STATUS, METRICS, DEFAULT_TAGS, groupContentTags, uid, dateKey, shiftDate, daysInclusive, dayRecord, upsertDay, setNightStatus, saveDream, rewards, saveFeedback, statistics, nightSummary, limitNotes, trendSeries, TREND_METRICS, ANALYSIS, comparePeriods, previousRange, validateData, mergeData, csv, validDate, sleepAnalysis } from './core.js';
import { readData, writeData, recoverableImport, KEY, RECOVERY_KEY } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal'), modalContent = $('#modal-content');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const percent = n => n === null ? '—' : `${Math.round(n * 100)}%`;
const score = n => n === null ? '—' : n.toFixed(1);
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('zh-HK', { month:'long', day:'numeric', weekday:'short' });
const localToday = () => dateKey();
const yesterday = () => shiftDate(localToday(), -1);
const nightQuestion = date => date === yesterday() ? '昨晚怎樣？' : `${new Date(`${date}T12:00:00`).toLocaleDateString('zh-HK', { month:'long', day:'numeric' })}那晚怎樣？`;
let data, loadError = '', snapshot = null;
try { data = readData(); snapshot = localStorage.getItem(KEY); }
catch (error) { loadError = error.message; data = { version:1, daily:[], dreams:[], series:[], settings:{customTags:{contentTags:[],structures:[],fearReasons:[]}, reducedMotion:false,lastExportAt:null,changedAt:null},drafts:{} }; }
let homeDate = yesterday(), selectedDate = homeDate, month = selectedDate.slice(0,7), calendarTab = 'calendar';
let observedToday = localToday(), homeDateFollowsToday = true;
let editor = null, editorReturn = 'home', draftTimer, toastTimer, undoAction = null, stagedImport = null;
let statsStart = shiftDate(localToday(), -29), statsEnd = localToday(), statsType = 'night', statsDays = 30, rolling = 7, trendMetric = 'rate';
let compareCustom = null, chartView = null;
const openSections = new Set();
let conflict = false, swStatus = '正在準備離線功能';

function toast(message, error = false, undo = null) {
  clearTimeout(toastTimer); undoAction = undo;
  const el = $('#toast'); el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button data-action="undo">撤銷</button>' : ''}`;
  toastTimer = setTimeout(() => { el.hidden = true; undoAction = null; }, error ? 12000 : 6000);
}
function commit(mutator, { changed = true, backup = false } = {}) {
  if (loadError) { toast('原有資料未能讀取。請先在設定下載原始資料或還原備份。', true); return false; }
  try {
    if (localStorage.getItem(KEY) !== snapshot) { conflict = true; throw new Error('另一個視窗已修改資料。請先匯出目前內容，再重新載入。'); }
    const next = structuredClone(data); mutator(next);
    if (changed) next.settings.changedAt = new Date().toISOString();
    if (backup) recoverableImport(data, next); else writeData(next);
    data = next; snapshot = localStorage.getItem(KEY); applyMotion(); return true;
  } catch (error) { toast(`尚未保存：${error.message}。輸入仍保留。`, true); return false; }
}
function applyMotion() { document.documentElement.classList.toggle('reduce-motion', data.settings.reducedMotion); }
function route() { const page = location.hash.slice(1); return ['home','calendar','stats','seal'].includes(page) ? page : 'home'; }
function go(page) { editor = null; if (route() === page) render(); else location.hash = page; }
function empty(message, symbol='☾') { return `<div class="empty"><span aria-hidden="true">${symbol}</span>${esc(message)}</div>`; }
function header(kicker, title, extra='') { return `<p class="eyebrow">${kicker}</p><div class="heading-row"><h1>${title}</h1>${extra}</div>`; }
function render() {
  document.body.classList.toggle('editing', Boolean(editor));
  document.title = `${editor ? '記一個夢' : { home:nightQuestion(homeDate), calendar:'夢境日曆', stats:'慢慢觀察', seal:'海豹的小海灘' }[route()]} · Nightmare Eater`;
  document.querySelectorAll('.bottom-nav a').forEach(a => { const active = a.dataset.page === route(); a.classList.toggle('active', active); if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  app.innerHTML = (loadError ? `<div class="note error">無法讀取原有資料，已停止寫入以保護內容。請到設定下載原始檔或還原備份。<br>${esc(loadError)}</div>` : '') +
    (conflict ? '<div class="note warning">另一個視窗已更新資料。請先在設定匯出此視窗內容，然後重新載入。</div>' : '') +
    (editor ? renderEditor() : { home:renderHome, calendar:renderCalendar, stats:renderStats, seal:renderSeal }[route()]());
  applyMotion();
}
function sealCard() {
  const r = rewards(data), day = dayRecord(data, homeDate);
  const caption = day.status === 'no' ? '收到早餐魚了。今天也慢慢來。' : day.status === 'unknown' ? '不記得也沒關係，今天一起休息。' : day.status === 'yes' ? 'NOM。夢留下來了，剩下的交給我。' : '本海豹只負責吃。準備好就來。';
  return `<section class="seal-home" aria-label="海豹成長"><div class="seal-scene"><span class="moon">☾</span><span class="star one">✧</span><span class="star two">·</span><span class="seal-emoji">🦭</span></div><p class="seal-caption">${caption}</p><div class="seal-meta"><strong>小海豹 <span class="muted">· Lv. ${r.level}</span></strong><span class="muted">${r.progress} / 100 EXP</span></div><div class="progress" role="progressbar" aria-label="本級經驗值" aria-valuenow="${r.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${r.progress}%"></span></div></section>`;
}
function renderHome() {
  const day = dayRecord(data, homeDate), dreams = data.dreams.filter(d => d.date === homeDate);
  const backupDue = data.settings.changedAt && (!data.settings.lastExportAt || Date.now() - Date.parse(data.settings.lastExportAt) > 7 * 864e5) && (!data.settings.lastExportAt || data.settings.changedAt > data.settings.lastExportAt);
  return `<div class="home-heading">${header(homeDate === yesterday() ? 'A LITTLE SPACE FOR LAST NIGHT' : 'A LITTLE SPACE FOR THAT NIGHT', nightQuestion(homeDate), `<label class="date-pill"><span class="sr-only">記錄日期</span><input id="home-date" type="date" value="${homeDate}" required></label>`)}<p class="intro">把夢留在這裡，讓今天輕一點。</p></div>
  ${data.drafts.editor ? '<div class="note row between"><span>有一個還沒餵給海豹的夢。</span><button class="small" data-action="resume-draft">繼續寫</button></div>' : ''}
  ${day.status ? `<section class="card section-space"><p class="eyebrow">已經留下來了</p><h2>${STATUS[day.status]}</h2><p class="micro">${formatDate(homeDate)}${day.status === 'yes' ? ` · ${dreams.filter(d=>d.sleepType==='night').length} 個夜間夢` : ''}</p>${day.status === 'yes' ? '' : `<p class="micro">要記下夢的話，這晚的狀態會改為「有噩夢」。</p>`}<div class="row"><button data-action="edit-night" class="secondary">編輯狀態</button><button data-action="new-dream" data-type="night" data-date="${homeDate}" class="primary">${day.status === 'yes' ? '＋再記一個夢' : '改為有噩夢並記錄'}</button></div></section>` : renderStatusOptions(homeDate)}
  <button class="quiet-link" data-action="new-dream" data-type="nap" data-date="${localToday()}">☀ ＋記午覺的夢</button>
  <details class="section-space"><summary>夜間睡眠時數 <span class="micro">${day.sleepHours === null ? '想填再填' : `${day.sleepHours} 小時`}</span></summary><div><form id="hours-form">${hoursField({ name:'sleepHours', value:day.sleepHours, title:'大約睡了幾小時？' })}<button type="submit" class="small full">保存</button></form></div></details>
  ${dreams.length ? `<section class="section-space"><div class="card-title"><h2>這一天留下的夢</h2><span class="micro">${dreams.length} 個</span></div>${dreams.map(d=>dreamItem(d)).join('')}</section>` : ''}
  ${sealCard()}<p class="footnote">只存在這部裝置 · 不解夢，也不催你打卡</p>
  ${backupDue ? '<div class="note row between"><span>記得偶爾把夢帶走備份。</span><button class="small" data-action="settings">匯出 JSON</button></div>' : ''}`;
}
function renderStatusOptions(date) {
  return `<div class="status-options">${[['no','😴','沒有噩夢','平靜的一晚，送海豹一條早餐魚'],['yes','💀','有噩夢','寫一點就好，海豹準備好了'],['unknown','❓','不記得','記憶留白，也是一種記錄']].map(([status,emoji,title,sub]) => `<button class="status-option" data-action="status" data-status="${status}" data-date="${date}"><span class="status-emoji" aria-hidden="true">${emoji}</span><span class="status-copy"><strong>${title}</strong><small>${sub}</small></span><span class="arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
}
function blankDream(type='night', date=type === 'nap' ? localToday() : homeDate, seriesId=null) {
  return { id:uid(), date, sleepType:type, rarity:null, sleepDisruption:null, distress:null, contentIntensity:null, description:'', contentTags:[], structures:[], fearReasons:[], seriesId, dreamMemory:null, predictedEvent:null, changedOutcome:null, lucid:null };
}
function openEditor(dream, returnPage=route()) { clearTimeout(draftTimer); editor = structuredClone(dream); editorReturn = returnPage; render(); window.scrollTo(0,0); }
function scoreField(key, title, values, labels, help='') {
  const value = editor[key];
  return `<fieldset><legend class="score-label">${title}<button type="button" data-action="clear-score" data-key="${key}">略過／清除</button></legend><div class="score-options ${key==='rarity'?'rarity-options':''}">${values.map((v,i)=>`<button type="button" data-action="score" data-key="${key}" data-value="${v}" aria-pressed="${value===v}" class="${value===v?'selected ':''}${key==='rarity'?`rarity-${v}`:''}">${labels[i]}</button>`).join('')}</div>${help ? `<div class="score-help"><span>${help.split('|')[0]}</span><span>${help.split('|')[1]}</span></div>` : ''}</fieldset>`;
}
function optionField(key, title, options) {
  return `<label class="field">${title}<select name="${key}"><option value="">未填</option>${options.map(([v,label])=>`<option value="${v}" ${editor[key]===v?'selected':''}>${label}</option>`).join('')}</select></label>`;
}
function tagSummaryText(key) {
  return editor[key].length ? `已選：${editor[key].join('、')}` : '還沒選。點選夢裡出現的東西。';
}
function updateTagSummary(group) {
  const out = group.querySelector('[data-tag-selected]');
  if (out) out.textContent = tagSummaryText(group.dataset.tagGroup);
}
function tagField(key, title) {
  const tags = [...new Set([...DEFAULT_TAGS[key], ...data.settings.customTags[key], ...editor[key]])];
  const chip = label => `<button type="button" data-action="tag" data-key="${key}" data-value="${esc(label)}" aria-pressed="${editor[key].includes(label)}" class="${editor[key].includes(label)?'selected':''}">${esc(label)}</button>`;
  const grouped = key === 'contentTags';
  const body = grouped
    ? groupContentTags(tags).map(group => `<section class="tag-cat"><h4>${esc(group.label)}</h4><div class="chips">${group.tags.map(chip).join('')}</div></section>`).join('')
    : `<div class="chips">${tags.map(chip).join('')}</div>`;
  return `<div data-tag-group="${key}"><h3>${title}</h3>${grouped ? `<p class="tag-selected" data-tag-selected aria-live="polite">${esc(tagSummaryText(key))}</p>` : ''}${body}<button type="button" class="text-button small" data-action="add-tag" data-key="${key}">＋新增分類</button></div>`;
}
function hoursField({ name, value, title, attrs = '' }) {
  const set = value !== null && value !== undefined && value !== '';
  return `<div class="hours-widget${set ? '' : ' unset'}"><div class="hours-head"><span>${title}</span><strong data-hours-display>${set ? esc(value) : '未填'}</strong></div><input type="range" class="hours-slider" data-hours-slider min="0" max="10" step="0.5" value="${set ? Math.min(Number(value), 10) : 5}" aria-label="${title}" aria-valuetext="${set ? `${esc(value)} 小時` : '未填'}" ${attrs.includes('disabled') ? 'disabled' : ''}><div class="hours-scale" aria-hidden="true"><span>0</span><span>5</span><span>10+</span></div><div class="hours-manual"><label class="field">超過 10 小時，或想填精確數字<input name="${name}" ${attrs} type="number" min="0" max="24" step="any" inputmode="decimal" value="${set ? esc(value) : ''}" placeholder="未填"></label><button type="button" class="text-button small" data-action="clear-hours">清除</button></div></div>`;
}
function syncHours(widget) {
  const input = widget.querySelector('input[type="number"]'), slider = widget.querySelector('[data-hours-slider]');
  const empty = input.value === '';
  widget.classList.toggle('unset', empty);
  if (!empty && Number.isFinite(Number(input.value))) slider.value = Math.min(Number(input.value), 10);
  slider.setAttribute('aria-valuetext', empty ? '未填' : `${input.value} 小時`);
  widget.querySelector('[data-hours-display]').textContent = empty ? '未填' : input.value;
}
function renderEditor() {
  const series = data.series.find(s=>s.id===editor.seriesId);
  return `${header('LEAVE A LITTLE TRACE', data.dreams.some(d=>d.id===editor.id)?'補寫這個夢':'記一個夢', '<button class="small secondary" data-action="leave-editor">返回</button>')}
  <p class="intro">可以只留下一個「有」。其他的，想寫再寫。</p>
  <form id="dream-form"><div class="card">
  <div class="date-range"><label class="field">日期<input name="date" type="date" value="${editor.date}" required></label><label class="field">來自哪段睡眠？<select name="sleepType"><option value="night" ${editor.sleepType==='night'?'selected':''}>☾ 夜間睡眠</option><option value="nap" ${editor.sleepType==='nap'?'selected':''}>☀ 午覺</option></select></label></div>
  <p id="type-note" class="note" hidden>分類已變更。請確認上方日期；已輸入的內容都保留了。</p>
  <label class="field">一句話記下大概（可略過）<textarea class="quick-note" name="description" rows="2" placeholder="例如：在舊學校被追">${esc(editor.description)}</textarea></label>
  <div id="editor-sleep" ${editor.sleepType==='nap'?'hidden':''}>${hoursField({ name:'nightSleepHours', value:editorSleepHours(), title:'這晚大約睡了幾小時？（可略過）', attrs:`data-sleep-date="${editor.date}" ${editor.sleepType==='nap'?'disabled':''}` })}<p class="micro">同一晚的夢共用睡眠時數。沒有噩夢或不記得的晚上也可以在首頁補填，讓比較更完整。</p></div>
  ${scoreField('rarity','這次是甚麼等級？',RARITIES,RARITIES,'普通爛夢|傳奇級大作')}
  ${Object.entries(METRICS).map(([key,label])=>scoreField(key,label,[0,1,2,3,4,5],['0','1','2','3','4','5'],key==='sleepDisruption'?'沒影響|睡爛了':key==='distress'?'幾乎沒影響|非常難受':'溫和|非常極端')).join('')}
  </div><details class="card" id="details-panel" open><summary>快速標記 <span class="micro">夢裡有甚麼？點選即可</span></summary><div>
  ${tagField('contentTags','內容標籤')}
  <div class="divider"></div>${tagField('structures','夢的結構')}
  <div class="divider"></div>${tagField('fearReasons','為甚麼可怕？')}
  <div class="divider"></div><h3>系列與夢中記憶</h3><label class="field">屬於哪個系列？<select name="seriesId"><option value="">獨立的夢／未填</option>${data.series.map(s=>`<option value="${esc(s.id)}" ${s.id===editor.seriesId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><div id="series-background">${series?`<p class="note">${esc(series.background||'這個系列還沒有背景。')}</p>`:''}</div><button type="button" class="small" data-action="new-series">＋建立系列</button><div class="divider"></div>
  ${optionField('dreamMemory','是否在夢中記起以前做過這個夢？',[['yes','是'],['no','否'],['unsure','不確定']])}
  ${optionField('predictedEvent','是否知道接下來會發生甚麼？',[['yes','是'],['no','否'],['unsure','不確定']])}
  ${optionField('changedOutcome','是否成功改變結局？',[['yes','是'],['no','否'],['partially','部分改變']])}
  </div></details><div class="form-footer"><button type="submit" class="primary full">餵給海豹 🦭</button><div id="draft-status" class="form-status">未填不會算作零分 · 所有評分都可略過</div></div>
  <button type="button" class="text-button small full" data-action="discard-draft">捨棄這次編輯</button></form>`;
}
function readEditor() {
  const form = $('#dream-form'); if (!form || !editor) return;
  const values = new FormData(form);
  for (const key of ['date','sleepType','description']) editor[key] = String(values.get(key));
  for (const key of ['seriesId','dreamMemory','predictedEvent','changedOutcome']) editor[key] = values.get(key) || null;
  const hours = form.elements.namedItem('nightSleepHours');
  if (editor.sleepType === 'night' && hours.validity.valid && validDate(hours.dataset.sleepDate)) {
    editor.sleepHoursByDate ||= {};
    editor.sleepHoursByDate[hours.dataset.sleepDate] = hours.value === '' ? null : Number(hours.value);
  }
}
function editorSleepHours() { return editor.sleepHoursByDate && Object.hasOwn(editor.sleepHoursByDate,editor.date) ? editor.sleepHoursByDate[editor.date] : dayRecord(data,editor.date).sleepHours; }
function updateEditorSleepField() {
  const input = $('#dream-form [name="nightSleepHours"]');
  $('#editor-sleep').hidden = editor.sleepType === 'nap'; input.disabled = editor.sleepType === 'nap';
  input.dataset.sleepDate = editor.date; input.value = editorSleepHours() ?? '';
  const widget = input.closest('.hours-widget'); widget.querySelector('[data-hours-slider]').disabled = editor.sleepType === 'nap'; syncHours(widget);
}
function persistDraft() {
  clearTimeout(draftTimer); if (!editor) return true; readEditor();
  if (!validDate(editor.date)) { $('#draft-status').textContent='請填有效日期；輸入仍在畫面上。'; return false; }
  if (editor.sleepType === 'night' && !$('#dream-form [name="nightSleepHours"]').validity.valid) { $('#draft-status').textContent='睡眠時數請填 0–24，或留空。輸入仍保留。'; return false; }
  const draft = structuredClone(editor);
  const ok = commit(next => { next.drafts.editor = draft; }, { changed:false });
  if ($('#draft-status')) $('#draft-status').textContent = ok ? '草稿已存在這部裝置 · 正式保存後才計入統計' : '草稿尚未保存 · 請保留此頁並匯出備份';
  return ok;
}
function scheduleDraft() { clearTimeout(draftTimer); draftTimer=setTimeout(persistDraft,400); }
function dreamItem(d, compact=true) {
  const s = data.series.find(s=>s.id===d.seriesId);
  return `<article class="dream-item"><div class="row between"><div class="row"><span class="badge ${d.sleepType==='nap'?'nap':''}">${d.sleepType==='nap'?'☀ 午覺':'☾ 夜間'}</span>${d.rarity?`<span class="badge rarity rarity-${d.rarity}">${d.rarity}</span>`:'<span class="micro">未評級</span>'}${s?`<span class="micro">↻ ${esc(s.name)}</span>`:''}</div><button class="small secondary" data-action="view-dream" data-id="${esc(d.id)}">查看</button></div><p class="dream-description ${compact?'dream-preview':''}">${esc(d.description||'只留下「有噩夢」，已經足夠。')}</p><div class="dream-scores">${Object.entries(METRICS).map(([k,label])=>`<span>${label} ${d[k]??'—'}</span>`).join('')}</div></article>`;
}
function renderDay(date) {
  const day = dayRecord(data,date), dreams = data.dreams.filter(d=>d.date===date);
  return `<section class="card" id="day-detail"><div class="card-title"><h2>${esc(formatDate(date))}</h2><button class="small secondary" data-action="day-edit" data-date="${date}">補記／編輯</button></div><p>${day.status?STATUS[day.status]:'— 夜間未記錄'} <span class="micro">${day.sleepHours!==null?`· 睡眠 ${day.sleepHours} 小時`:''}</span></p>${['night','nap'].map(type=>{const items=dreams.filter(d=>d.sleepType===type); return items.length?`<div class="divider"></div><h3>${type==='night'?'☾ 夜間的夢':'☀ 午覺的夢'}</h3>${items.map(d=>dreamItem(d)).join('')}`:'';}).join('')}${!dreams.length?'<p class="micro">還沒有夢境細節，隨時可以補。</p>':''}<div class="row section-space"><button class="small" data-action="new-dream" data-type="night" data-date="${date}">${day.status==='no'||day.status==='unknown'?'改為有噩夢並記錄':'＋夜間夢'}</button><button class="small" data-action="new-dream" data-type="nap" data-date="${date}">＋午覺夢</button>${data.daily.some(d=>d.date===date)?`<button class="small danger" data-action="delete-day" data-date="${date}">刪除這天</button>`:''}</div></section>`;
}
function renderDayBar(date) {
  const day = dayRecord(data,date), dreams = data.dreams.filter(d=>d.date===date);
  const meta = [dreams.length ? `${dreams.length} 個夢` : '', day.sleepHours!==null ? `睡眠 ${day.sleepHours} 小時` : ''].filter(Boolean).join(' · ');
  return `<div class="day-bar" role="status" aria-live="polite"><div class="day-bar-text"><strong>${esc(formatDate(date))}</strong><span>${day.status?STATUS[day.status]:'— 夜間未記錄'}${meta?` · ${meta}`:''}</span></div><button class="small" data-action="scroll-day">詳情</button><button class="small primary" data-action="day-edit" data-date="${date}">補記／編輯</button></div>`;
}
function renderCalendar() {
  if (calendarTab==='series') return `${header('FAMILIAR PLACES', '夢境系列')}<div class="segments"><button data-action="calendar-tab" data-tab="calendar">日曆</button><button class="selected" data-action="calendar-tab" data-tab="series">系列</button></div><p class="intro">不同的夢，也可能回到同一個地方。</p><button class="secondary full" data-action="new-series">＋建立系列</button>${data.series.length?data.series.map(renderSeries).join(''):empty('還沒有系列。再次遇見時，再幫它取個名字。','↻')}`;
  const first = `${month}-01`, date = new Date(`${first}T12:00:00`), count = new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  return `${header('A NIGHT AT A TIME', '夢境日曆')}<div class="segments"><button class="selected" data-action="calendar-tab" data-tab="calendar">日曆</button><button data-action="calendar-tab" data-tab="series">系列</button></div>
  <section class="card"><div class="calendar-toolbar"><button data-action="month" data-step="-1" aria-label="上個月">‹</button><h2>${date.getFullYear()} 年 ${date.getMonth()+1} 月</h2><button data-action="month" data-step="1" aria-label="下個月">›</button></div><div class="calendar-grid">${['日','一','二','三','四','五','六'].map(w=>`<span class="weekday">${w}</span>`).join('')}${'<span></span>'.repeat(date.getDay())}${Array.from({length:count},(_,i)=>{
    const key=`${month}-${String(i+1).padStart(2,'0')}`, day=dayRecord(data,key), nap=data.dreams.some(d=>d.date===key&&d.sleepType==='nap');
    const symbol={yes:'💀',no:'😴',unknown:'❓'}[day.status]||'—';
    return `<button class="calendar-day ${day.status?'recorded ':''}${key===selectedDate?'selected ':''}${key===localToday()?'today':''}" data-action="select-date" data-date="${key}" aria-label="${key} ${day.status?STATUS[day.status]:'夜間未記錄'}${nap?'，有午覺夢':''}" aria-pressed="${key===selectedDate}"><span class="day-number">${i+1}</span><span class="day-state" aria-hidden="true">${symbol}</span>${nap?'<span class="nap-dot">午覺</span>':''}</button>`;
  }).join('')}</div><div class="calendar-legend"><span>💀 有噩夢</span><span>😴 沒有</span><span>❓ 不記得</span><span>— 未記錄</span><span>☀ 午覺另記</span></div>${renderDayBar(selectedDate)}</section>
  ${renderDay(selectedDate)}`;
}
function renderSeries(s) {
  const dreams = data.dreams.filter(d=>d.seriesId===s.id).sort((a,b)=>a.date.localeCompare(b.date));
  return `<article class="series-item"><div class="row between"><h2 style="margin:0">${esc(s.name)}</h2><span class="badge">${esc(s.status)}</span></div><p>${esc(s.background||'還沒有背景記錄。')}</p><p class="micro">${dreams.length} 個 episode ${dreams.length?`· ${dreams[0].date} → ${dreams.at(-1).date}`:''}</p><div class="row"><button class="small primary" data-action="series-episode" data-id="${esc(s.id)}">＋Episode</button><button class="small" data-action="series-view" data-id="${esc(s.id)}">查看</button><button class="small" data-action="edit-series" data-id="${esc(s.id)}">編輯</button></div></article>`;
}
function rangeValid(start,end) { return validDate(start)&&validDate(end)&&start<=end&&Number(new Date(`${end}T12:00:00`))-Number(new Date(`${start}T12:00:00`)) <= 3660*864e5; }
const unitWord = unit => unit === 'night' ? '晚' : '個夢';
const shortDate = value => value.slice(5).replace('-', '/');
const kindLabel = { ratio: '比率', count: '滾動計數', mean: '平均值' };
const signed = (value, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}`;
const keepOpen = id => openSections.has(id) ? 'open' : '';
// A rate from very few nights is shown as a plain fraction so that it does not look like a finding.
const rateText = (rate, yes, known) => known >= ANALYSIS.minGroupKnown ? percent(rate) : known ? `${yes} / ${known} 晚` : '—';
const scopeNotes = {
  night: '以「夜」為單位：只看有噩夢的夜晚，同一晚的多個夢合併計算。',
  nap: '以「夢」為單位：每個午覺夢算一次。沒有記錄所有午睡，所以不計午覺噩夢率。',
  all: '以「夢」為單位：夜間與午覺的夢各算一次。單位和「夜間」不同，數字不能直接互相比較。'
};
function scopeControl(withNote = true) {
  return `<div class="segments" role="group" aria-label="統計的夢境範圍">${[['night','☾ 夜間'],['nap','☀ 午覺'],['all','全部']].map(([type,label])=>`<button data-action="stats-type" data-type="${type}" aria-pressed="${statsType===type}" class="${statsType===type?'selected':''}">${label}</button>`).join('')}</div>${withNote ? `<p class="micro">${scopeNotes[statsType]}</p>` : ''}`;
}
function metricsHTML(s) {
  const word = unitWord(s.unit);
  return `<div class="metric-grid">${Object.entries(METRICS).map(([key,label])=>{ const m=s.metrics[key]; return `<div class="metric"><span>${label}</span><strong>${score(m.value)}${m.value===null?'':'<small>/ 5</small>'}</strong><small>${m.count} ${word}有評分${m.missing?` · ${m.missing} ${word}沒評`:''}</small></div>`; }).join('')}</div>`;
}
function categoryBars(items, limit = items.length) {
  return items.length ? items.slice(0, limit).map(item=>`<div class="bar-row"><span>${esc(item.label)}</span><div class="bar"><span style="width:${(item.ratio ?? 0)*100}%"></span></div><span>${item.count} · ${percent(item.ratio)}</span></div>`).join('') : '<p class="micro">還沒有填寫這類資料。</p>';
}
function renderSleepImpact(s) {
  const sl = sleepAnalysis(data, statsStart, statsEnd, { today: localToday() });
  const excluded = sl.missingHours + sl.hoursOnly;
  const groupHTML = group => `<div class="series-item"><div class="row between"><strong>${group.label}</strong><span class="badge">${group.count} 晚</span></div>${group.count ? `<p class="micro">確定有／無 ${group.known} 晚（有 ${group.yes}、無 ${group.no}）· 不記得 ${group.unknown} 晚</p>${group.reliable ? `<div class="bar-row"><span>噩夢率</span><div class="bar"><span style="width:${(group.rate ?? 0) * 100}%"></span></div><span>${percent(group.rate)}</span></div><p class="micro">${group.yes} ÷ ${group.known} 晚確定有／無</p>` : `<p class="micro">確定有／無少於 ${ANALYSIS.minGroupKnown} 晚，只列出晚數，不顯示百分比。</p>`}<div class="dream-scores">${Object.entries(METRICS).map(([key, label]) => { const m = group.metrics[key]; return `<span>${label} ${m.count ? score(m.value) : '—'}（${m.count} / ${m.units} 晚有評分）</span>`; }).join('')}</div>` : '<p class="micro">尚無這段時數的記錄。</p>'}</div>`;
  return `<section class="card stats-section" id="stats-sleep"><p class="eyebrow">D · 睡眠與影響</p><h2>睡多久，夢有甚麼不同？</h2>
  <p class="micro">只看夜間睡眠。納入 <strong>${sl.count}</strong> 晚（有夜間狀態、也有睡眠時數）；排除 <strong>${excluded}</strong> 晚：${sl.missingHours} 晚有狀態但沒填時數${sl.hoursOnly ? `、${sl.hoursOnly} 晚只有時數沒有狀態` : ''}。</p>
  ${sl.count ? `<div class="metric-grid"><div class="metric"><span>平均睡眠</span><strong>${score(sl.meanHours)}</strong><small>小時 · ${sl.count} 晚</small></div><div class="metric"><span>這 ${sl.count} 晚的噩夢率</span><strong>${rateText(sl.rate, sl.yes, sl.known)}</strong><small>${sl.yes} / ${sl.known} 晚確定有／無 · 不記得 ${sl.unknown} 晚</small></div></div><h3>三種夜晚的平均睡眠</h3>${sl.byStatus.map(group => `<div class="row between micro"><span>${STATUS[group.status]}</span><span>${group.count ? `${score(group.meanHours)} 小時 · ${group.count} 晚` : '沒有資料'}</span></div>`).join('')}<details data-keep="sleep-groups" ${keepOpen('sleep-groups')}><summary>依睡眠時數分組</summary><div>${sl.groups.map(groupHTML).join('')}</div></details>` : empty('填下幾晚睡眠時數後，就能在這裡比較。', '☾')}
  <p class="note">這只是描述各組的數字，不能說明睡多久「造成」或「避免」噩夢；漏記和其他因素都可能影響。</p>
  <div class="divider"></div><h3>感受評分</h3>${scopeControl(false)}${metricsHTML(s)}${s.units ? '' : '<p class="micro">這個範圍內還沒有夢。只記狀態也可以，評分之後再補。</p>'}
  <p class="micro">評分選填，沒填的不算 0。稀有度是主觀趣味，和感受評分分開看，不互相推斷。</p></section>`;
}
function renderOverview(n) {
  const notes = limitNotes(n), due = n.recorded + n.missing;
  const seg = (count, cls, label) => count ? `<span class="seg ${cls}" style="flex:${count}" title="${label} ${count} 晚"></span>` : '';
  const side = [n.pending ? '今天的夜晚還沒結束，不算未記錄。' : '', n.future ? `${n.future} 個今天之後的日期不計入。` : '', n.ahead ? `另有 ${n.ahead} 筆日期在今天之後的記錄，沒有納入統計。` : ''].filter(Boolean).join('');
  return `<section class="card stats-section" id="stats-overview"><p class="eyebrow">A · 概覽 · ${statsStart} — ${n.days ? n.end : statsEnd}</p><h2>夜間噩夢發生率</h2>
  ${n.days ? `<div class="rate-hero">${n.known ? `<span class="rate-num${n.known < ANALYSIS.minGroupKnown ? ' muted' : ''}">${percent(n.rate)}</span><span class="rate-frac"><strong>${n.yes}</strong> / ${n.known} 晚</span>` : '<span class="rate-num muted">—</span><span class="rate-frac">還算不出來</span>'}</div>` : '<p class="micro">這個範圍都在今天之後，還沒有可以統計的夜晚。</p>'}
  <p class="micro">有噩夢的夜晚 ÷ 確定有／無的夜晚。不記得、未記錄不進分母，也不當作沒有噩夢。</p>
  ${notes.length ? notes.map(note => `<div class="note warning limit"><span aria-hidden="true">☾</span><span>${esc(note.text)}</span></div>`).join('') : n.days ? '<p class="micro">目前沒有特別的資料限制提示。</p>' : ''}
  ${due ? `<div class="coverage-bar" role="img" aria-label="${n.yes} 晚有噩夢、${n.no} 晚沒有、${n.unknown} 晚不記得、${n.missing} 晚未記錄">${seg(n.yes, 'yes', '有噩夢')}${seg(n.no, 'no', '沒有噩夢')}${seg(n.unknown, 'unknown', '不記得')}${seg(n.missing, 'missing', '未記錄')}</div>` : ''}
  <ul class="state-list"><li><span><i class="dot yes"></i>💀 有噩夢</span><strong>${n.yes} 晚</strong></li><li><span><i class="dot no"></i>😴 沒有噩夢</span><strong>${n.no} 晚</strong></li><li><span><i class="dot unknown"></i>❓ 不記得</span><strong>${n.unknown} 晚</strong></li><li><span><i class="dot missing"></i>— 未記錄</span><strong>${n.missing} 晚</strong></li></ul>
  <p class="micro">${due ? `已經過去的 ${due} 晚中，有 ${n.recorded} 晚留下記錄（${percent(n.coverage)}）。` : ''}「不記得」是你記下的答案；「未記錄」是沒有留下任何記錄。${side ? ` ${side}` : ''}</p></section>`;
}
function trendValueText(series, p) {
  if (series.kind === 'ratio') return percent(p.value);
  if (series.metric === 'sleepHours') return `${score(p.value)} 小時`;
  return series.kind === 'count' ? String(p.value) : score(p.value);
}
function readoutText(series, p) {
  return `${p.date} · ${series.label} ${trendValueText(series, p)}（${p.sample} ${series.sampleLabel}${series.kind === 'ratio' ? `，其中 ${Math.round(p.value * p.sample)} 晚有噩夢` : ''}）`;
}
function renderTrend() {
  if (!TREND_METRICS[trendMetric]) trendMetric = 'rate';
  const series = trendSeries(data, statsStart, statsEnd, trendMetric, rolling, { today: localToday() });
  chartView = series;
  const good = series.points.filter(p => p.reliable), sizes = good.map(p => p.sample);
  const facts = [good.length ? `畫出 ${series.plotted} 個樣本足夠的窗口（每個至少 ${series.min} ${series.sampleLabel}；樣本 ${Math.min(...sizes)}–${Math.max(...sizes)}）` : '', series.insufficient ? `${series.insufficient} 個窗口樣本不足，沒有畫出，也沒有當作 0` : '', series.unavailable ? `${series.unavailable} 個窗口完全沒有資料` : ''].filter(Boolean);
  const last = good.at(-1);
  return `<section class="card stats-section" id="stats-trend"><p class="eyebrow">B · 趨勢</p><h2>${esc(series.label)}</h2>
  <label class="sr-only" for="trend-metric">趨勢指標</label><select id="trend-metric">${Object.entries(TREND_METRICS).map(([key, m]) => `<option value="${key}" ${key === trendMetric ? 'selected' : ''}>${esc(m.label)}（${kindLabel[m.kind]}）</option>`).join('')}</select>
  <div class="segments" role="group" aria-label="滾動窗口">${[7, 30].map(n => `<button data-action="trend-window" data-days="${n}" aria-pressed="${rolling === n}" class="${rolling === n ? 'selected' : ''}">過去 ${n} 天</button>`).join('')}</div>
  <p class="micro kind-line"><strong>${kindLabel[series.kind]}</strong> · 每個點 = 當天與前 ${rolling - 1} 天 · ${esc(series.basis)}</p>
  ${chartHTML(series)}${last ? `<p class="chart-readout" id="chart-readout" aria-live="polite">${esc(readoutText(series, last))}</p>` : ''}
  <p class="micro">空白＝資料不足或沒有資料，不是 0。只呈現數字，不解讀變化。</p>
  <details data-keep="trend-how" ${keepOpen('trend-how')}><summary>怎麼讀這張圖</summary><div>${facts.map(fact => `<p class="micro">${fact}。</p>`).join('')}<p class="micro">實心點＝樣本足夠的窗口；下方細條是各窗口的樣本數，灰色代表不足，不畫在線上。點圖表或用左右方向鍵可逐點查看。</p></div></details>
  ${good.length ? `<details data-keep="trend-table" ${keepOpen('trend-table')}><summary>用表格看數值</summary><div><table class="mini-table"><thead><tr><th>日期</th><th>${esc(series.label)}</th><th>樣本</th></tr></thead><tbody>${good.slice(-40).reverse().map(p => `<tr><td>${p.date}</td><td>${trendValueText(series, p)}</td><td>${p.sample} ${series.sampleLabel}</td></tr>`).join('')}</tbody></table>${good.length > 40 ? '<p class="micro">只列出最近 40 個有效窗口。</p>' : ''}</div></details>` : ''}</section>`;
}
function renderPatterns(s) {
  const word = unitWord(s.unit), tags = s.categories.contentTags, meta = s.categoryMeta.contentTags, structMeta = s.categoryMeta.structures, r = s.rarity;
  const inScope = d => d.date >= statsStart && d.date <= s.end && (statsType === 'all' || d.sleepType === statsType);
  const seriesRows = data.series.map(series => [series, data.dreams.filter(d => d.seriesId === series.id && inScope(d)).length]).filter(([, count]) => count);
  return `<section class="card stats-section" id="stats-patterns"><p class="eyebrow">C · 夢境模式</p><h2>常見的內容與重複</h2>${scopeControl()}
  <h3>常見內容</h3>
  ${meta.units ? `<p class="micro">${meta.filled} / ${meta.units} ${word}有填內容標籤${meta.unfilled ? `（${meta.unfilled} ${word}沒填，不計入百分比）` : ''}；同一${word}重複的標籤只算一次。</p>` : '<p class="micro">這個範圍內還沒有夢。</p>'}
  ${categoryBars(tags, 5)}${tags.length > 5 ? `<p class="micro">另有 ${tags.length - 5} 個標籤，完整清單在「進階分析」。</p>` : ''}
  <div class="divider"></div><h3>重複出現與系列</h3>
  <div class="stat-row"><span>屬於夢境系列</span><strong>${s.inSeries} / ${s.units} ${word}</strong></div>
  <div class="stat-row"><span>標記為重複出現</span><strong>${s.recurring} / ${structMeta.filled} ${word}</strong></div>
  <p class="micro">系列是你整理的故事線；重複出現是你在「夢的結構」選的「輪迴 / Recurring」。兩者分開統計。重複出現只以有填「夢的結構」的 ${structMeta.filled} ${word}為分母${structMeta.unfilled ? `（另有 ${structMeta.unfilled} ${word}沒填）` : ''}。</p>
  ${seriesRows.map(([series, count]) => `<p class="micro">↻ ${esc(series.name)} · ${count} 個 episode（每個 episode 是一個夢）</p>`).join('')}
  <details data-keep="rarity" ${keepOpen('rarity')}><summary>稀有度分布 <span class="micro">主觀趣味等級</span></summary><div>
  <p class="micro">稀有度是你主觀的趣味等級，不代表可怕或影響程度。以「個夢」為單位，百分比只計有評級的夢。</p>
  ${r.rated ? r.items.map(item => `<div class="bar-row"><span>${item.label}</span><div class="bar"><span style="width:${(item.share ?? 0) * 100}%"></span></div><span>${item.count} · ${percent(item.share)}</span></div>`).join('') : '<p class="micro">還沒有評級的夢。</p>'}
  <p class="micro">有評級 ${r.rated} 個 · 未評級 ${r.unrated} 個（不計入百分比）${r.rated ? ` · 中位數 ${r.median} · ${r.mode.length > 2 ? '沒有明顯最常見的等級' : `最常見 ${r.mode.join('、')}`}` : ''}${r.rated && r.rated < ANALYSIS.minRated ? '。評級的夢還很少，分布只供參考' : ''}。</p></div></details></section>`;
}
function renderAdvanced(s) {
  const word = unitWord(s.unit), scopeName = { night: '夜間', nap: '午覺', all: '全部' }[statsType];
  return `<details class="card stats-section" id="stats-advanced" data-keep="advanced" ${keepOpen('advanced')}><summary>E · 進階分析 <span class="micro">時段比較、完整分類</span></summary><div>
  <h3>比較兩個時段</h3><div data-compare-root>${renderCompare()}</div>
  <div class="divider"></div><h3>完整分類</h3><p class="micro">目前的統計範圍：${scopeName}（在「夢境模式」切換）。百分比以有填的${word}為分母，同一${word}多選可超過 100%。</p>
  ${[['contentTags', '內容標籤'], ['structures', '夢的結構'], ['fearReasons', '你標記的可怕原因']].map(([key, title]) => { const meta = s.categoryMeta[key]; return `<h4>${title} <span class="micro">${meta.filled} / ${meta.units} ${word}有填</span></h4>${categoryBars(s.categories[key])}`; }).join('')}
  <div class="divider"></div><h3>其他</h3><div class="stat-row"><span>夢中記起以前做過這個夢<small>你在編輯器選了「是」</small></span><strong>${s.recalled} / ${s.units} ${word}</strong></div></div></details>`;
}
function renderStats() {
  if (!rangeValid(statsStart,statsEnd)) return `${header('LET THE RECORDS SPEAK','慢慢觀察')}<div class="note error">請選擇有效日期範圍，開始日不能晚於結束日，最長十年。</div>${statsRange()}`;
  const today = localToday(), s = statistics(data, statsStart, statsEnd, statsType, { today }), nights = nightSummary(data, statsStart, statsEnd, { today });
  const sections = [['stats-overview', '概覽'], ['stats-trend', '趨勢'], ['stats-patterns', '夢境模式'], ['stats-sleep', '睡眠與影響'], ['stats-advanced', '進階']];
  return `${header('SMALL TRACES, OVER TIME','慢慢觀察')}<p class="intro">不用靠記憶猜。先留下來，再慢慢看。</p>${statsRange()}
  <nav class="stats-nav" aria-label="分析區塊">${sections.map(([id, label]) => `<button data-action="stats-jump" data-target="${id}">${label}</button>`).join('')}</nav>
  ${renderOverview(nights)}${renderTrend()}${renderPatterns(s)}${renderSleepImpact(s)}${renderAdvanced(s)}
  <p class="footnote">記錄不替夢下結論，也不替你評分 · 🦭 海豹只負責吃</p>`;
}
function statsRange() {
  return `<div class="segments" role="group" aria-label="統計範圍">${[7,30,90].map(n=>`<button data-action="stats-range" data-days="${n}" aria-pressed="${statsDays===n}" class="${statsDays===n?'selected':''}">${n} 天</button>`).join('')}<button data-action="stats-range" data-days="0" aria-pressed="${statsDays===0}" class="${statsDays===0?'selected':''}">自訂</button></div>${statsDays===0?`<div class="date-range"><label class="field">開始日期<input id="stats-start" type="date" value="${statsStart}"></label><label class="field">結束日期<input id="stats-end" type="date" value="${statsEnd}"></label></div>`:''}`;
}
const CHART = { W: 320, padL: 40, padR: 10, top: 12, plotH: 124, gap: 12, stripH: 24 };
const chartX = (i, n) => CHART.padL + (n === 1 ? (CHART.W - CHART.padL - CHART.padR) / 2 : i / (n - 1) * (CHART.W - CHART.padL - CHART.padR));
function chartGeom(series) {
  const n = series.points.length, values = series.points.filter(p => p.reliable).map(p => p.value);
  const max = series.kind === 'ratio' ? 1 : Object.hasOwn(METRICS, series.metric) ? 5 : Math.max(2, Math.ceil(Math.max(...values, 0) / 2) * 2);
  return { n, max, x: i => chartX(i, n), y: v => CHART.top + CHART.plotH - v / max * CHART.plotH };
}
// Only windows with enough observations are drawn; the strip underneath shows each window's sample size.
function chartHTML(series) {
  const { W, padL, padR, top, plotH, gap, stripH } = CHART, pts = series.points, good = pts.filter(p => p.reliable);
  if (!good.length) return `<div class="empty"><span aria-hidden="true">⌁</span>資料還不夠，暫時不畫趨勢。<br><small>需要在 ${series.windowDays} 天窗口內至少有 ${series.min} ${esc(series.sampleLabel)}。</small></div>`;
  const g = chartGeom(series), n = g.n, stripTop = top + plotH + gap, H = stripTop + stripH + 22;
  const tick = v => series.kind === 'ratio' ? `${Math.round(v * 100)}%` : Number.isInteger(v) ? String(v) : v.toFixed(1);
  // Long ranges are thinned to about 120 evenly spaced windows (aligned to the last day); tapping still uses every window.
  const stride = Math.max(1, Math.ceil(n / 120)), shown = pts.map((p, i) => i).filter(i => (n - 1 - i) % stride === 0);
  let path = '', joined = false;
  for (const i of shown) { const p = pts[i]; if (!p.reliable) { joined = false; continue; } path += `${joined ? 'L' : 'M'}${g.x(i).toFixed(1)},${g.y(p.value).toFixed(1)} `; joined = true; }
  const lastIndex = pts.lastIndexOf(good.at(-1));
  const dots = shown.map(i => pts[i].reliable ? `<circle cx="${g.x(i).toFixed(1)}" cy="${g.y(pts[i].value).toFixed(1)}" r="3.5"/>` : '').join('');
  const maxSample = Math.max(1, ...pts.map(p => p.sample)), barWidth = Math.max(1, Math.min(6, (W - padL - padR) / shown.length * 0.6));
  let okBars = '', lowBars = '';
  for (const i of shown) { const p = pts[i]; if (!p.sample) continue; const bar = `M${g.x(i).toFixed(1)},${stripTop + stripH} v${(-Math.max(1.5, p.sample / maxSample * stripH)).toFixed(1)} `; if (p.reliable) okBars += bar; else lowBars += bar; }
  const span = daysInclusive(pts[0].date, pts.at(-1).date), axisDate = value => span > 330 ? value.slice(0, 7).replace('-', '/') : shortDate(value);
  const labels = (n === 1 ? [[0, 'middle']] : [[0, 'start'], ...(n >= 5 ? [[Math.floor((n - 1) / 2), 'middle']] : []), [n - 1, 'end']]).map(([i, anchor]) => `<text x="${anchor === 'end' ? W - padR : anchor === 'start' ? padL : g.x(i)}" y="${H - 6}" text-anchor="${anchor}">${axisDate(pts[i].date)}</text>`).join('');
  series.cursor = lastIndex;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(series.label)}走勢；左右方向鍵可逐點查看；${pts[0].date} 至 ${pts.at(-1).date}"><title>${esc(series.label)}走勢</title>${[0, .5, 1].map(t => `<line x1="${padL}" x2="${W - padR}" y1="${g.y(t * g.max)}" y2="${g.y(t * g.max)}"/><text x="${padL - 6}" y="${g.y(t * g.max) + 4}" text-anchor="end">${tick(t * g.max)}</text>`).join('')}<path class="line" d="${path}"/>${dots}<path class="bars low" style="stroke-width:${barWidth}px" d="${lowBars}"/><path class="bars ok" style="stroke-width:${barWidth}px" d="${okBars}"/><text x="${padL - 6}" y="${stripTop + stripH - 2}" text-anchor="end">樣本</text>${labels}<line class="cursor" x1="${g.x(lastIndex)}" x2="${g.x(lastIndex)}" y1="${top}" y2="${stripTop + stripH}"/><circle class="cursor-dot" cx="${g.x(lastIndex)}" cy="${g.y(pts[lastIndex].value)}" r="5"/><rect class="chart-hit" data-action="chart-tap" x="${padL}" y="${top}" width="${W - padL - padR}" height="${plotH + gap + stripH}"/></svg>`;
}
function moveChartCursor(svg, index) {
  const series = chartView, p = series.points[index], g = chartGeom(series);
  series.cursor = index;
  svg.querySelector('.cursor').setAttribute('x1', g.x(index)); svg.querySelector('.cursor').setAttribute('x2', g.x(index));
  svg.querySelector('.cursor-dot').setAttribute('cx', g.x(index)); svg.querySelector('.cursor-dot').setAttribute('cy', g.y(p.value));
  $('#chart-readout').textContent = readoutText(series, p);
}
function renderCompare() {
  const ranges = compareCustom || { a: previousRange(statsStart, statsEnd), b: { start: statsStart, end: statsEnd } };
  const valid = rangeValid(ranges.a.start, ranges.a.end) && rangeValid(ranges.b.start, ranges.b.end);
  const cmp = valid ? comparePeriods(data, ranges.a, ranges.b, { today: localToday() }) : null;
  const periodHTML = (key, range, s) => `<section class="series-item"><h4>時段 ${key.toUpperCase()}${key === 'a' ? '（較早）' : ''}</h4><div class="date-range"><label class="field">開始<input type="date" data-compare="${key}" data-edge="start" value="${range.start}"></label><label class="field">結束<input type="date" data-compare="${key}" data-edge="end" value="${range.end}"></label></div>${s ? `<p>夜間噩夢率 <strong>${rateText(s.rate, s.yes, s.known)}</strong> <span class="micro">${s.yes} / ${s.known} 晚確定有／無 · 記錄覆蓋 ${percent(s.coverage)}</span></p>${metricsHTML(s)}<p class="micro">屬於系列 ${s.inSeries} / ${s.units} 晚 · 標記重複出現 ${s.recurring} / ${s.categoryMeta.structures.filled} 晚</p>` : ''}</section>`;
  return `<p class="micro">比較只看夜間睡眠，單位是「夜」，不受上方範圍影響。${compareCustom ? '' : '預設 A＝上一段（和目前範圍一樣長），B＝目前範圍。'}</p>${periodHTML('a', ranges.a, cmp?.a)}${periodHTML('b', ranges.b, cmp?.b)}${valid ? '' : '<p class="note warning">請選擇有效日期範圍（開始日不能晚於結束日，最長十年）。</p>'}
  ${valid ? `<div class="compare-delta"><strong>B 相對 A · 只是描述，不是評價</strong>${cmp.lengthsDiffer ? '<p>兩個時段長度不同，比較時請留意。</p>' : ''}${cmp.enough ? `<p>夜間噩夢率：${signed(cmp.rateDelta * 100, 0)} 個百分點（A ${percent(cmp.a.rate)} → B ${percent(cmp.b.rate)}）</p>` : `<p>任一時段確定有／無少於 ${ANALYSIS.minCompareKnown} 晚，暫不計算差異。</p>`}${Object.entries(METRICS).map(([key, label]) => `<p>${label}：${cmp.metricDeltas[key] === null ? `資料不足（每段至少要 ${ANALYSIS.minScored} 晚有評分）` : signed(cmp.metricDeltas[key])}</p>`).join('')}</div>` : ''}
  ${compareCustom ? '<button class="small" data-action="compare-reset">回到自動時段</button>' : ''}`;
}
function renderSeal() {
  const r=rewards(data),unlocks=[{level:1,emoji:'🦭',name:'小麻糬'},{level:3,emoji:'🦭💤',name:'睡覺麻糬'},{level:5,emoji:'🦭🐟',name:'早餐麻糬'},{level:10,emoji:'🦭🌙',name:'月光麻糬'},{level:15,emoji:'🦭✨',name:'圓麻糬'},{level:20,emoji:'🦭👑',name:'海灘霸主'}];
  return `${header('THE LITTLE DREAM EATER','海豹的小海灘')}<p class="intro">夢境交給我。今天的你，慢慢來就好。</p><section class="card seal-world"><p class="eyebrow">${unlocks.filter(u=>r.level>=u.level).at(-1).name}</p><span class="seal-large" aria-label="海豹">🦭</span><h2>Lv. ${r.level} · ${r.exp} EXP</h2><div class="progress" role="progressbar" aria-label="本級經驗值" aria-valuenow="${r.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${r.progress}%"></span></div><p class="micro section-space">再 ${100-r.progress} EXP 升級 · 早餐魚 🐟 ${r.fish}</p><p class="note">成長代表留下的記錄，不代表睡眠好壞。</p></section><section class="card"><h2>慢慢變成一顆水麻糬</h2><div class="collectibles">${unlocks.map(u=>`<div class="collectible ${r.level<u.level?'locked':''}"><span>${r.level>=u.level?u.emoji:'🔒'}</span>${u.name}<br><small>Lv. ${u.level}</small></div>`).join('')}</div></section><details class="card"><summary>海豹怎樣成長？</summary><div><p class="micro">同一日期最多算一次 EXP，夜間與午覺共同取最高稀有度。未評級先 +10；N +10、R +20、SR +50、SSR +150、SSSR +500。只記夜間「有」也有 +10。</p><p class="micro">沒有噩夢有早餐魚，不記得就一起睡。補填、編輯和匯入會重新計算，不重複發獎。沒有打卡期限。</p></div></details>`;
}
function showModal(title,content) {
  modalContent.innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="關閉">×</button></div>${content}`;
  if (!modal.open) modal.showModal();
}
function showSettings() {
  let recovery=false; try{recovery=Boolean(localStorage.getItem(RECOVERY_KEY));}catch{}
  showModal('設定與備份', `<p class="eyebrow">YOUR DREAMS STAY HERE</p><p class="intro">夢境只存在目前的瀏覽器或主畫面 App。清除網站資料可能令記錄消失，JSON 才是可帶走的備份。</p>
  ${loadError?'<div class="note error">讀取失敗，已停止寫入。可下載原始資料交由你保管，或匯入有效備份還原。</div><button class="full" data-action="export-raw">下載原始資料</button>':''}
  <section class="section-space"><h3>帶走一份夢境</h3><div class="stack"><button class="primary full" data-action="export-json">匯出完整 JSON 備份</button><button data-action="export-csv">匯出 CSV（每日摘要＋夢境明細）</button></div><p class="micro section-space">最近產生備份：${data.settings.lastExportAt?esc(new Date(data.settings.lastExportAt).toLocaleString('zh-HK')):'尚未匯出'}</p></section>
  <div class="divider"></div><h3>匯入或還原</h3><label class="field">選擇 JSON 備份<input id="import-file" type="file" accept=".json,application/json"></label><div id="import-preview"></div>${recovery?'<button class="secondary full" data-action="restore-recovery">回復到上次匯入前</button>':''}
  <div class="divider"></div><label class="row"><input type="checkbox" id="reduced-motion" ${data.settings.reducedMotion?'checked':''}>減少動畫</label>
  <details class="section-space"><summary>在 iPhone 加入主畫面</summary><div><ol class="micro"><li>用 Safari 開啟網站。</li><li>點分享，選「加入主畫面」，以網頁 App 開啟。</li><li>之後固定從主畫面記錄。</li></ol><p class="note">Safari 與主畫面 App 的儲存空間可能不同。切換前先匯出 JSON，進入另一邊後再匯入。</p></div></details>
  <p class="micro">${esc(swStatus)} · ${navigator.onLine?'目前已連線':'目前離線'}<br>首次連線完成快取後，才可離線使用。沒有帳號或跨裝置同步。</p>`);
}
function showDream(id) {
  const d=data.dreams.find(d=>d.id===id); if(!d)return;
  const labels={yes:'是',no:'否',unsure:'不確定',partially:'部分改變'};
  showModal('留下的夢', `<p class="micro">${d.date} · ${formatDate(d.date)}</p>${dreamItem(d,false)}${Object.entries(DEFAULT_TAGS).map(([key])=>`<p class="micro">${{contentTags:'內容',structures:'結構',fearReasons:'可怕原因'}[key]}：${esc(d[key].join('、')||'未填')}</p>`).join('')}<p class="micro">夢中記起以前：${labels[d.dreamMemory]||'未填'}<br>知道接下來的事：${labels[d.predictedEvent]||'未填'}<br>改變結局：${labels[d.changedOutcome]||'未填'}${d.lucid?`<br>知道在做夢：${labels[d.lucid]}`:''}</p><div class="modal-actions"><button class="danger" data-action="delete-dream" data-id="${esc(id)}">刪除</button><button class="primary" data-action="edit-dream" data-id="${esc(id)}">編輯這個夢</button></div>`);
}
function showSeriesForm(id=null) {
  if(editor) { readEditor(); persistDraft(); }
  const s=data.series.find(s=>s.id===id)||{id:'',name:'',background:'',status:'Active'};
  showModal(id?'編輯系列':'替熟悉的夢取個名字',`<form id="series-form" data-id="${esc(s.id)}"><label class="field">系列名稱<input name="name" value="${esc(s.name)}" placeholder="例如：上山救人" required></label><label class="field">背景<textarea name="background" placeholder="不用每次重寫的背景…">${esc(s.background)}</textarea></label><label class="field">狀態<select name="status">${[['Active','Active · 活躍'],['Rare','Rare · 偶爾'],['Retired','Retired · 已退環境'],['Returned','Returned · 復刻']].map(([v,label])=>`<option value="${v}" ${v===s.status?'selected':''}>${label}</option>`).join('')}</select></label><p class="micro">狀態由你決定，海豹不根據時間自行猜測。</p><div class="modal-actions">${id?`<button type="button" class="danger" data-action="delete-series" data-id="${esc(id)}">刪除系列</button>`:''}<button class="primary" type="submit">保存系列</button></div></form>`);
}
function download(content,name,type) {
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function exportJSON() {
  if(editor) { readEditor(); persistDraft(); }
  const exportData=structuredClone(data);exportData.settings.lastExportAt=new Date().toISOString();
  if(editor)exportData.drafts.editor=structuredClone(editor);
  if(!loadError&&!conflict) commit(next=>{next.settings.lastExportAt=exportData.settings.lastExportAt;},{changed:false});
  download(JSON.stringify(exportData,null,2),`nightmare-eater-${localToday()}.json`,'application/json');toast('JSON 已產生，請存到「檔案」保管。');showSettings();
}
function exportCSV() {
  const dailyRows=[['date','nightStatus','sleepHours','nightDreams','napDreams'],...data.daily.map(d=>[d.date,d.status,d.sleepHours,data.dreams.filter(e=>e.date===d.date&&e.sleepType==='night').length,data.dreams.filter(e=>e.date===d.date&&e.sleepType==='nap').length])];
  const keys=['id','date','sleepType','rarity',...Object.keys(METRICS),'description','seriesId','contentTags','structures','fearReasons','dreamMemory','predictedEvent','changedOutcome','lucid'];
  const dreamsRows=[keys,...data.dreams.map(d=>keys.map(key=>Array.isArray(d[key])?JSON.stringify(d[key]):d[key]))];
  download(csv(dailyRows),`nightmare-daily-${localToday()}.csv`,'text/csv;charset=utf-8');
  download(csv(dreamsRows),`nightmare-dreams-${localToday()}.csv`,'text/csv;charset=utf-8');
  const area=$('#import-preview'); if(area) area.innerHTML='<p class="note">已產生兩個 CSV。如瀏覽器只保留一份，請分別下載。</p><div class="row"><button data-action="csv-daily">每日摘要</button><button data-action="csv-dreams">夢境明細</button></div>';
  window.csvDownloads={dailyRows,dreamsRows};toast('CSV 已產生，CSV 不包含完整還原所需設定。');
}
async function stageImport(file) {
  stagedImport=null; const area=$('#import-preview'); if(!file)return;
  try {
    stagedImport=validateData(JSON.parse(await file.text()));
    const overlaps=stagedImport.daily.filter(day=>data.daily.some(d=>d.date===day.date)).length;
    area.innerHTML=`<div class="note"><p>備份可讀取：${stagedImport.daily.length} 個日期、${stagedImport.dreams.length} 個夢、${stagedImport.series.length} 個系列。</p><p>${overlaps} 個日期已存在。合併會保留本機整天的資料；相同夢境 ID 也保留本機。</p></div><div class="stack"><button data-action="import-merge" ${loadError?'disabled':''}>合併，保留本機衝突資料</button><button class="danger" data-action="import-replace">完整還原此備份</button></div>`;
  } catch(error) { area.innerHTML=`<p class="note error">${esc(error.message)}。原有資料未更動。</p>`; }
}

document.addEventListener('click', async event => {
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action;
  if(action==='close-modal'){modal.close();return;}
  if(action==='settings'){showSettings();return;}
  if(action==='undo'){if(undoAction){const fn=undoAction;undoAction=null;fn();}return;}
  if(action==='status'){
    const date=el.dataset.date,status=el.dataset.status;
    if(status==='yes') {if(modal.open)modal.close();openEditor(blankDream('night',date));return;}
    if(data.dreams.some(d=>d.date===date&&d.sleepType==='night')&&!confirm('改成這個狀態會刪除該晚的夜間夢境細節，午覺夢會保留。確定修改？'))return;
    const before=structuredClone(data);
    if(commit(next=>setNightStatus(next,date,status))){const savedSnapshot=snapshot;if(modal.open)modal.close();render();toast(status==='no'?'🐟 早餐魚已送到。這晚的記錄存好了。':'🦭💤 不記得也已經好好留下來。',false,()=>{if(snapshot!==savedSnapshot){toast('之後已有新修改，這次撤銷已失效。');return;}if(commit(next=>Object.assign(next,before))){render();toast('已撤銷。');}});$('.seal-emoji')?.classList.add('feed-pulse');}return;
  }
  if(action==='new-dream'){
    if(data.drafts.editor&&!editor&&!confirm('還有一份草稿。開新夢會在編輯後取代它；要開新夢嗎？'))return;
    if(modal.open)modal.close();openEditor(blankDream(el.dataset.type,el.dataset.date));return;
  }
  if(action==='edit-night'){showModal('修改夜間狀態',renderStatusOptions(homeDate));return;}
  if(action==='resume-draft'){openEditor(data.drafts.editor);return;}
  if(action==='leave-editor'){if(persistDraft()){editor=null;render();window.scrollTo(0,0);}return;}
  if(action==='discard-draft'){
    if(!confirm('捨棄尚未正式保存的編輯？已保存的夢不會刪除。'))return;
    clearTimeout(draftTimer);if(commit(next=>{delete next.drafts.editor;},{changed:false})){editor=null;render();}return;
  }
  if(action==='score'||action==='clear-score'){
    readEditor();const value=action==='clear-score'?null:el.dataset.key==='rarity'?el.dataset.value:Number(el.dataset.value);editor[el.dataset.key]=value;
    const fieldset=el.closest('fieldset');fieldset.querySelectorAll('[data-action="score"]').forEach(button=>{const selected=value!==null&&String(value)===button.dataset.value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});scheduleDraft();return;
  }
  if(action==='tag'){
    readEditor();const list=editor[el.dataset.key],value=el.dataset.value,index=list.indexOf(value);if(index<0)list.push(value);else list.splice(index,1);
    el.classList.toggle('selected',index<0);el.setAttribute('aria-pressed',String(index<0));updateTagSummary(el.closest('[data-tag-group]'));scheduleDraft();return;
  }
  if(action==='clear-hours'){
    const widget=el.closest('.hours-widget');widget.querySelector('input[type="number"]').value='';syncHours(widget);if(editor){readEditor();scheduleDraft();}return;
  }
  if(action==='add-tag'){
    const key=el.dataset.key,value=prompt('新分類名稱：')?.trim();if(!value)return;
    const exists=[...DEFAULT_TAGS[key],...data.settings.customTags[key]].includes(value);
    if(!exists&&!commit(next=>next.settings.customTags[key].push(value)))return;
    if(!editor[key].includes(value))editor[key].push(value);persistDraft();
    const container=el.closest('[data-tag-group]');container.outerHTML=tagField(key,{contentTags:'內容標籤',structures:'夢的結構',fearReasons:'為甚麼可怕？'}[key]);return;
  }
  if(action==='month'){const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+Number(el.dataset.step));month=dateKey(d).slice(0,7);selectedDate=`${month}-01`;render();return;}
  if(action==='select-date'){selectedDate=el.dataset.date;render();$('.calendar-day.selected')?.focus({preventScroll:true});return;}
  if(action==='scroll-day'){$('#day-detail')?.scrollIntoView({behavior:data.settings.reducedMotion?'auto':'smooth',block:'start'});return;}
  if(action==='calendar-tab'){calendarTab=el.dataset.tab;render();return;}
  if(action==='day-edit'){homeDate=el.dataset.date;homeDateFollowsToday=false;go('home');window.scrollTo(0,0);return;}
  if(action==='delete-day'){
    if(!confirm('刪除這天的夜間狀態、睡眠時數及所有夜間／午覺夢？此操作不能撤銷。'))return;
    const date=el.dataset.date;if(commit(next=>{next.daily=next.daily.filter(d=>d.date!==date);next.dreams=next.dreams.filter(d=>d.date!==date);if(next.drafts.editor?.date===date)delete next.drafts.editor;})){render();toast('這天的記錄已刪除。');}return;
  }
  if(action==='view-dream'){showDream(el.dataset.id);return;}
  if(action==='edit-dream'){const d=data.dreams.find(d=>d.id===el.dataset.id);if(!d)return;if(data.drafts.editor&&data.drafts.editor.id!==d.id&&!confirm('目前有另一份草稿。編輯這個夢會取代草稿，要繼續嗎？'))return;modal.close();openEditor(d);return;}
  if(action==='delete-dream'){
    if(!confirm('刪除這個夢的細節？夜間「有噩夢」狀態仍保留，可以另行修改。'))return;
    if(commit(next=>{next.dreams=next.dreams.filter(d=>d.id!==el.dataset.id);if(next.drafts.editor?.id===el.dataset.id)delete next.drafts.editor;})){modal.close();render();toast('夢境細節已刪除。');}return;
  }
  if(action==='new-series'||action==='edit-series'){showSeriesForm(el.dataset.id);return;}
  if(action==='series-episode'){
    showModal('新增系列 episode',`<p class="intro">來自哪段睡眠？之後仍可修改。</p><div class="stack"><button data-action="series-start" data-id="${esc(el.dataset.id)}" data-type="night">☾ 夜間 · 預設昨晚</button><button data-action="series-start" data-id="${esc(el.dataset.id)}" data-type="nap">☀ 午覺 · 預設今天</button></div>`);return;
  }
  if(action==='series-start'){if(data.drafts.editor&&!confirm('開啟新 episode 會在編輯後取代目前草稿。繼續？'))return;modal.close();openEditor(blankDream(el.dataset.type,el.dataset.type==='nap'?localToday():yesterday(),el.dataset.id));return;}
  if(action==='series-view'){
    const s=data.series.find(s=>s.id===el.dataset.id);if(!s)return;const episodes=data.dreams.filter(d=>d.seriesId===s.id).sort((a,b)=>b.date.localeCompare(a.date));
    showModal(esc(s.name),`<p class="dream-description">${esc(s.background)}</p>${episodes.length?episodes.map(d=>`<p class="micro section-space">${d.date}</p>${dreamItem(d)}`).join(''):empty('這個系列還沒有 episode。','↻')}`);return;
  }
  if(action==='delete-series'){
    if(!confirm('刪除系列？夢境會保留，但解除這個系列連結。'))return;
    if(commit(next=>{next.series=next.series.filter(s=>s.id!==el.dataset.id);next.dreams.forEach(d=>{if(d.seriesId===el.dataset.id)d.seriesId=null;});if(next.drafts.editor?.seriesId===el.dataset.id)next.drafts.editor.seriesId=null;})){if(editor?.seriesId===el.dataset.id)editor.seriesId=null;modal.close();render();toast('已刪除系列，夢境保留。');}return;
  }
  if(action==='stats-range'){statsDays=Number(el.dataset.days);if(statsDays){statsEnd=localToday();statsStart=shiftDate(statsEnd,-(statsDays-1));}render();return;}
  if(action==='stats-type'){statsType=el.dataset.type;render();return;}
  if(action==='trend-window'){rolling=Number(el.dataset.days);render();return;}
  if(action==='stats-jump'){
    const target=document.getElementById(el.dataset.target);if(!target)return;
    if(target.tagName==='DETAILS'){target.open=true;openSections.add(target.dataset.keep);}
    target.scrollIntoView({behavior:data.settings.reducedMotion?'auto':'smooth',block:'start'});return;
  }
  if(action==='chart-tap'){
    const svg=el.ownerSVGElement,box=svg.getBoundingClientRect(),vx=(event.clientX-box.left)/box.width*svg.viewBox.baseVal.width,g=chartGeom(chartView);
    let best=-1,distance=Infinity;
    chartView.points.forEach((p,i)=>{if(!p.reliable)return;const d=Math.abs(g.x(i)-vx);if(d<distance){distance=d;best=i;}});
    if(best>=0)moveChartCursor(svg,best);return;
  }
  if(action==='compare-reset'){compareCustom=null;render();return;}
  if(action==='export-json'){exportJSON();return;}
  if(action==='export-csv'){exportCSV();return;}
  if(action==='csv-daily'||action==='csv-dreams'){const daily=action==='csv-daily';download(csv(daily?window.csvDownloads.dailyRows:window.csvDownloads.dreamsRows),`nightmare-${daily?'daily':'dreams'}-${localToday()}.csv`,'text/csv;charset=utf-8');return;}
  if(action==='export-raw'){try{download(localStorage.getItem(KEY)||'{}',`nightmare-raw-${localToday()}.txt`,'text/plain');}catch(error){toast(error.message,true);}return;}
  if(action==='import-merge'||action==='import-replace'){
    if(!stagedImport)return;const replace=action==='import-replace';
    if(replace&&!confirm('完整還原會取代目前所有記錄、設定及草稿。已匯出需要保留的內容嗎？確定還原？'))return;
    try{
      const next=replace?structuredClone(stagedImport):mergeData(data,stagedImport);next.settings.changedAt=new Date().toISOString();
      if(loadError){localStorage.setItem(RECOVERY_KEY,localStorage.getItem(KEY)||'');writeData(next);data=next;loadError='';snapshot=localStorage.getItem(KEY);}
      else if(!commit(current=>Object.assign(current,next),{backup:true}))return;
      stagedImport=null;editor=null;conflict=false;modal.close();render();toast('備份已匯入，EXP 已重新計算。');
    }catch(error){toast(`匯入失敗：${error.message}。原有資料未更動。`,true);}return;
  }
  if(action==='restore-recovery'){
    if(!confirm('用上次匯入前的副本取代目前資料？建議先匯出目前資料。'))return;
    try{const previous=validateData(JSON.parse(localStorage.getItem(RECOVERY_KEY)));if(commit(next=>Object.assign(next,previous),{backup:true})){modal.close();render();toast('已回復匯入前資料。');}}catch(error){toast(`回復失敗：${error.message}`,true);}return;
  }
});
document.addEventListener('submit',event=>{
  if(event.target.id==='dream-form'){
    event.preventDefault();clearTimeout(draftTimer);readEditor();if(!validDate(editor.date)){toast('請選擇有效日期。',true);return;}
    const {sleepHoursByDate,...dream}=structuredClone(editor);
    const hours = dream.sleepType==='night' ? editorSleepHours() : undefined;
    let isEdit=false,before=null,after=null;
    if(commit(next=>{isEdit=next.dreams.some(d=>d.id===dream.id);before=rewards(next);saveDream(next,dream,hours);delete next.drafts.editor;after=rewards(next);})){const date=dream.date;editor=null;homeDate=date;selectedDate=date;month=date.slice(0,7);const page=editorReturn;go(page);render();window.scrollTo(0,0);toast(saveFeedback(before,after,isEdit));if(!isEdit&&after.exp>before.exp)$('.seal-emoji')?.classList.add('feed-pulse');}return;
  }
  if(event.target.id==='hours-form'){
    event.preventDefault();const raw=new FormData(event.target).get('sleepHours'),value=raw===''?null:Number(raw);
    if(value!==null&&(!Number.isFinite(value)||value<0||value>24)){toast('睡眠時數請填 0–24，或留空。',true);return;}
    if(commit(next=>upsertDay(next,homeDate,{sleepHours:value}))){render();toast('睡眠時數已保存。');}return;
  }
  if(event.target.id==='series-form'){
    event.preventDefault();const form=event.target,values=new FormData(form),id=form.dataset.id||uid(),name=String(values.get('name')).trim();if(!name){toast('請填系列名稱。',true);return;}
    const series={id,name,background:String(values.get('background')),status:String(values.get('status'))};
    if(commit(next=>{next.series=next.series.filter(s=>s.id!==id);next.series.push(series);})){if(editor)editor.seriesId=id;modal.close();render();if(editor)persistDraft();toast('系列已保存。');}return;
  }
});
document.addEventListener('input',event=>{
  const el=event.target;
  const widget=el.closest('.hours-widget');
  if(widget){if(el.matches('[data-hours-slider]'))widget.querySelector('input[type="number"]').value=el.value;syncHours(widget);}
  if(el.closest('#dream-form')) {readEditor();scheduleDraft();}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='home-date'){if(validDate(el.value)){homeDate=el.value;homeDateFollowsToday=false;render();}return;}
  if((el.name==='sleepType'||el.name==='date')&&editor){readEditor();updateEditorSleepField();if(el.name==='sleepType')$('#type-note').hidden=false;scheduleDraft();return;}
  if(el.name==='seriesId'&&editor){readEditor();const s=data.series.find(s=>s.id===editor.seriesId);$('#series-background').innerHTML=s?`<p class="note">${esc(s.background||'還沒有背景。')}</p>`:'';scheduleDraft();return;}
  if(el.id==='stats-start'||el.id==='stats-end'){statsDays=0;if(el.id==='stats-start')statsStart=el.value;else statsEnd=el.value;render();return;}
  if(el.id==='trend-metric'){trendMetric=el.value;render();return;}
  if(el.dataset.compare){compareCustom??={a:previousRange(statsStart,statsEnd),b:{start:statsStart,end:statsEnd}};compareCustom[el.dataset.compare][el.dataset.edge]=el.value;el.closest('[data-compare-root]').innerHTML=renderCompare();return;}
  if(el.id==='reduced-motion'){const value=el.checked;if(!commit(next=>{next.settings.reducedMotion=value;}))el.checked=!value;return;}
  if(el.id==='import-file'){stageImport(el.files[0]);return;}
});
document.addEventListener('keydown',event=>{
  const svg=event.target.closest?.('svg.chart');
  if(!svg||!chartView||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const step=event.key==='ArrowLeft'?-1:1;let i=chartView.cursor+step;
  while(i>=0&&i<chartView.points.length&&!chartView.points[i].reliable)i+=step;
  if(i>=0&&i<chartView.points.length)moveChartCursor(svg,i);
});
document.addEventListener('toggle',event=>{const id=event.target.dataset?.keep;if(!id)return;if(event.target.open)openSections.add(id);else openSections.delete(id);},true);
$('#settings-button').addEventListener('click',()=>{if(editor)persistDraft();showSettings();});
document.querySelectorAll('.bottom-nav a,.brand').forEach(link=>link.addEventListener('click',event=>{
  if(editor&&!persistDraft()){event.preventDefault();return;}editor=null;
  if(link.hash===location.hash)render();window.scrollTo(0,0);
}));
window.addEventListener('hashchange',()=>{if(editor){if(!persistDraft()){render();return;}editor=null;}render();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&editor)persistDraft();
  if(!document.hidden&&localToday()!==observedToday){
    if(homeDateFollowsToday&&!editor)homeDate=yesterday();
    if(statsDays){statsEnd=localToday();statsStart=shiftDate(statsEnd,-(statsDays-1));}
    observedToday=localToday();if(!editor)render();
  }
});
window.addEventListener('pagehide',()=>{if(editor)persistDraft();});
window.addEventListener('storage',event=>{if(event.key===KEY){conflict=true;toast('另一個視窗已修改資料。請先匯出目前內容，再重新載入。',true);if(!editor)render();}});
modal.addEventListener('click',event=>{if(event.target===modal){const rect=modal.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();}});
render();
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').then(registration=>{
    const ready=()=>{swStatus='離線功能已準備好';};
    if(registration.active)ready();else registration.installing?.addEventListener('statechange',event=>{if(event.target.state==='activated')ready();});
    registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',event=>{if(event.target.state==='installed'&&navigator.serviceWorker.controller)toast('新版已準備好；關閉所有此網站視窗後再開啟即可更新。');});});
    navigator.serviceWorker.ready.then(ready);
  }).catch(()=>{swStatus='離線功能未準備好，請保持連線後再試';});
}else swStatus='此環境不支援離線功能';
