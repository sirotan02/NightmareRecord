import { RARITIES, STATUS, METRICS, DEFAULT_TAGS, uid, dateKey, shiftDate, dayRecord, upsertDay, setNightStatus, saveDream, rewards, statistics, trend, validateData, mergeData, csv, validDate, sleepAnalysis } from './core.js';
import { readData, writeData, recoverableImport, KEY, RECOVERY_KEY } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal'), modalContent = $('#modal-content');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const percent = n => n === null ? '—' : `${Math.round(n * 100)}%`;
const score = n => n === null ? '—' : n.toFixed(1);
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('zh-HK', { month:'long', day:'numeric', weekday:'short' });
const localToday = () => dateKey();
const yesterday = () => shiftDate(localToday(), -1);
let data, loadError = '', snapshot = null;
try { data = readData(); snapshot = localStorage.getItem(KEY); }
catch (error) { loadError = error.message; data = { version:1, daily:[], dreams:[], series:[], settings:{customTags:{contentTags:[],structures:[],fearReasons:[]}, reducedMotion:false,lastExportAt:null,changedAt:null},drafts:{} }; }
let homeDate = yesterday(), selectedDate = homeDate, month = selectedDate.slice(0,7), calendarTab = 'calendar';
let observedToday = localToday(), homeDateFollowsToday = true;
let editor = null, editorReturn = 'home', draftTimer, toastTimer, undoAction = null, stagedImport = null;
let statsStart = shiftDate(localToday(), -29), statsEnd = localToday(), statsType = 'night', statsDays = 30, rolling = 7, trendMetric = 'rate';
let compareA = { start:shiftDate(localToday(),-59), end:shiftDate(localToday(),-30) }, compareB = { start:statsStart, end:statsEnd };
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
  document.title = `${editor ? '記一個夢' : { home:'昨晚怎樣？', calendar:'夢境日曆', stats:'慢慢觀察', seal:'海豹的小海灘' }[route()]} · Nightmare Eater`;
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
  return `<div class="home-heading">${header('A LITTLE SPACE FOR LAST NIGHT', '昨晚怎樣？', `<label class="date-pill"><span class="sr-only">記錄日期</span><input id="home-date" type="date" value="${homeDate}" required></label>`)}<p class="intro">把夢留在這裡，讓今天輕一點。</p></div>
  ${data.drafts.editor ? '<div class="note row between"><span>有一個還沒餵給海豹的夢。</span><button class="small" data-action="resume-draft">繼續寫</button></div>' : ''}
  ${day.status ? `<section class="card section-space"><p class="eyebrow">已經留下來了</p><h2>${STATUS[day.status]}</h2><p class="micro">${formatDate(homeDate)} · ${dreams.filter(d=>d.sleepType==='night').length} 個夜間夢</p><div class="row"><button data-action="edit-night" class="secondary">編輯狀態</button><button data-action="new-dream" data-type="night" data-date="${homeDate}" class="primary">＋再記一個夢</button></div></section>` : renderStatusOptions(homeDate)}
  <button class="quiet-link" data-action="new-dream" data-type="nap" data-date="${localToday()}">☀ ＋記午覺的夢</button>
  <details class="section-space"><summary>夜間睡眠時數 <span class="micro">${day.sleepHours === null ? '想填再填' : `${day.sleepHours} 小時`}</span></summary><div><form id="hours-form" class="row"><label class="field" style="flex:1;margin:0">大約睡了幾小時？<input name="sleepHours" type="number" min="0" max="24" step="any" inputmode="decimal" value="${day.sleepHours ?? ''}" placeholder="例如 6.5；留空為未填"></label><button type="submit" class="small">保存</button></form></div></details>
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
function tagField(key, title) {
  const tags = [...new Set([...DEFAULT_TAGS[key], ...data.settings.customTags[key], ...editor[key]])];
  return `<div data-tag-group="${key}"><h3>${title}</h3><label class="sr-only" for="search-${key}">搜尋${title}</label><input id="search-${key}" data-tag-search="${key}" type="search" placeholder="搜尋或新增分類…"><div class="chips">${tags.map(label=>`<button type="button" data-action="tag" data-key="${key}" data-value="${esc(label)}" aria-pressed="${editor[key].includes(label)}" class="${editor[key].includes(label)?'selected':''}">${esc(label)}</button>`).join('')}</div><button type="button" class="text-button small" data-action="add-tag" data-key="${key}">＋新增分類</button></div>`;
}
function renderEditor() {
  const series = data.series.find(s=>s.id===editor.seriesId);
  return `${header('LEAVE A LITTLE TRACE', data.dreams.some(d=>d.id===editor.id)?'補寫這個夢':'記一個夢', '<button class="small secondary" data-action="leave-editor">返回</button>')}
  <p class="intro">可以只留下一個「有」。其他的，想寫再寫。</p>
  <form id="dream-form"><div class="card">
  <div class="date-range"><label class="field">日期<input name="date" type="date" value="${editor.date}" required></label><label class="field">來自哪段睡眠？<select name="sleepType"><option value="night" ${editor.sleepType==='night'?'selected':''}>☾ 夜間睡眠</option><option value="nap" ${editor.sleepType==='nap'?'selected':''}>☀ 午覺</option></select></label></div>
  <p id="type-note" class="note" hidden>分類已變更。請確認上方日期；已輸入的內容都保留了。</p>
  <div id="editor-sleep" ${editor.sleepType==='nap'?'hidden':''}><label class="field">這晚大約睡了幾小時？（可略過）<input name="nightSleepHours" data-sleep-date="${editor.date}" type="number" min="0" max="24" step="any" inputmode="decimal" value="${esc(editorSleepHours() ?? '')}" placeholder="例如 6.5" ${editor.sleepType==='nap'?'disabled':''}></label><p class="micro">同一晚的夢共用睡眠時數。沒有噩夢或不記得的晚上也可以在首頁補填，讓比較更完整。</p></div>
  ${scoreField('rarity','這次是甚麼等級？',RARITIES,RARITIES,'普通爛夢|傳奇級大作')}
  ${Object.entries(METRICS).map(([key,label])=>scoreField(key,label,[0,1,2,3,4,5],['0','1','2','3','4','5'],key==='sleepDisruption'?'沒影響|睡爛了':key==='distress'?'幾乎沒影響|非常難受':'溫和|非常極端')).join('')}
  </div><details class="card" id="details-panel" ${editor.description||editor.contentTags.length||editor.structures.length||editor.seriesId?'open':''}><summary>詳細記錄 <span class="micro">完全可略過</span></summary><div>
  <details open><summary>夢的內容</summary><div><label class="field">發生了甚麼？<textarea name="description" rows="6" placeholder="一句也可以。想寫完整 lore，也可以。">${esc(editor.description)}</textarea></label>${tagField('contentTags','內容標籤')}</div></details>
  <details><summary>夢的結構與可怕的原因</summary><div>${tagField('structures','夢的結構')}<div class="divider"></div>${tagField('fearReasons','為甚麼可怕？')}</div></details>
  <details ${series?'open':''}><summary>系列與夢中記憶</summary><div><label class="field">屬於哪個系列？<select name="seriesId"><option value="">獨立的夢／未填</option>${data.series.map(s=>`<option value="${esc(s.id)}" ${s.id===editor.seriesId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><div id="series-background">${series?`<p class="note">${esc(series.background||'這個系列還沒有背景。')}</p>`:''}</div><button type="button" class="small" data-action="new-series">＋建立系列</button><div class="divider"></div>
  ${optionField('dreamMemory','是否在夢中記起以前做過這個夢？',[['yes','是'],['no','否'],['unsure','不確定']])}
  ${optionField('predictedEvent','是否知道接下來會發生甚麼？',[['yes','是'],['no','否'],['unsure','不確定']])}
  ${optionField('changedOutcome','是否成功改變結局？',[['yes','是'],['no','否'],['partially','部分改變']])}</div></details>
  <details><summary>清醒程度</summary><div>${optionField('lucid','當時知道自己在做夢嗎？',[['no','不知道'],['unsure','可能'],['yes','知道']])}</div></details>
  </div></details><div class="form-footer"><button type="submit" class="primary full">餵給海豹 🦭</button><div id="draft-status" class="form-status">未填不會算作零分 · 所有評分都可略過</div></div>
  <button type="button" class="text-button small full" data-action="discard-draft">捨棄這次編輯</button></form>`;
}
function readEditor() {
  const form = $('#dream-form'); if (!form || !editor) return;
  const values = new FormData(form);
  for (const key of ['date','sleepType','description']) editor[key] = String(values.get(key));
  for (const key of ['seriesId','dreamMemory','predictedEvent','changedOutcome','lucid']) editor[key] = values.get(key) || null;
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
  return `<section class="card"><div class="card-title"><h2>${esc(formatDate(date))}</h2><button class="small secondary" data-action="day-edit" data-date="${date}">補記／編輯</button></div><p>${day.status?STATUS[day.status]:'— 夜間未記錄'} <span class="micro">${day.sleepHours!==null?`· 睡眠 ${day.sleepHours} 小時`:''}</span></p>${['night','nap'].map(type=>{const items=dreams.filter(d=>d.sleepType===type); return items.length?`<div class="divider"></div><h3>${type==='night'?'☾ 夜間的夢':'☀ 午覺的夢'}</h3>${items.map(d=>dreamItem(d)).join('')}`:'';}).join('')}${!dreams.length?'<p class="micro">還沒有夢境細節，隨時可以補。</p>':''}<div class="row section-space"><button class="small" data-action="new-dream" data-type="night" data-date="${date}">＋夜間夢</button><button class="small" data-action="new-dream" data-type="nap" data-date="${date}">＋午覺夢</button>${data.daily.some(d=>d.date===date)?`<button class="small danger" data-action="delete-day" data-date="${date}">刪除這天</button>`:''}</div></section>`;
}
function renderCalendar() {
  if (calendarTab==='series') return `${header('FAMILIAR PLACES', '夢境系列')}<div class="segments"><button data-action="calendar-tab" data-tab="calendar">日曆</button><button class="selected" data-action="calendar-tab" data-tab="series">系列</button></div><p class="intro">不同的夢，也可能回到同一個地方。</p><button class="secondary full" data-action="new-series">＋建立系列</button>${data.series.length?data.series.map(renderSeries).join(''):empty('還沒有系列。再次遇見時，再幫它取個名字。','↻')}`;
  const first = `${month}-01`, date = new Date(`${first}T12:00:00`), count = new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  return `${header('A NIGHT AT A TIME', '夢境日曆')}<div class="segments"><button class="selected" data-action="calendar-tab" data-tab="calendar">日曆</button><button data-action="calendar-tab" data-tab="series">系列</button></div>
  <section class="card"><div class="calendar-toolbar"><button data-action="month" data-step="-1" aria-label="上個月">‹</button><h2>${date.getFullYear()} 年 ${date.getMonth()+1} 月</h2><button data-action="month" data-step="1" aria-label="下個月">›</button></div><div class="calendar-grid">${['日','一','二','三','四','五','六'].map(w=>`<span class="weekday">${w}</span>`).join('')}${'<span></span>'.repeat(date.getDay())}${Array.from({length:count},(_,i)=>{
    const key=`${month}-${String(i+1).padStart(2,'0')}`, day=dayRecord(data,key), nap=data.dreams.some(d=>d.date===key&&d.sleepType==='nap');
    const symbol={yes:'💀',no:'😴',unknown:'❓'}[day.status]||'—';
    return `<button class="calendar-day ${day.status?'recorded ':''}${key===selectedDate?'selected ':''}${key===localToday()?'today':''}" data-action="select-date" data-date="${key}" aria-label="${key} ${day.status?STATUS[day.status]:'夜間未記錄'}${nap?'，有午覺夢':''}" aria-pressed="${key===selectedDate}"><span class="day-number">${i+1}</span><span class="day-state" aria-hidden="true">${symbol}</span>${nap?'<span class="nap-dot">午覺</span>':''}</button>`;
  }).join('')}</div><div class="calendar-legend"><span>💀 有噩夢</span><span>😴 沒有</span><span>❓ 不記得</span><span>— 未記錄</span><span>☀ 午覺另記</span></div></section>
  ${renderDay(selectedDate)}`;
}
function renderSeries(s) {
  const dreams = data.dreams.filter(d=>d.seriesId===s.id).sort((a,b)=>a.date.localeCompare(b.date));
  return `<article class="series-item"><div class="row between"><h2 style="margin:0">${esc(s.name)}</h2><span class="badge">${esc(s.status)}</span></div><p>${esc(s.background||'還沒有背景記錄。')}</p><p class="micro">${dreams.length} 個 episode ${dreams.length?`· ${dreams[0].date} → ${dreams.at(-1).date}`:''}</p><div class="row"><button class="small primary" data-action="series-episode" data-id="${esc(s.id)}">＋Episode</button><button class="small" data-action="series-view" data-id="${esc(s.id)}">查看</button><button class="small" data-action="edit-series" data-id="${esc(s.id)}">編輯</button></div></article>`;
}
function rangeValid(start,end) { return validDate(start)&&validDate(end)&&start<=end&&Number(new Date(`${end}T12:00:00`))-Number(new Date(`${start}T12:00:00`)) <= 3660*864e5; }
function metricsHTML(s) {
  return `<div class="metric-grid">${[...Object.entries(METRICS),['rarity','平均稀有度']].map(([key,label])=>`<div class="metric"><span>${label}</span><strong>${score(s.metrics[key].value)}<small>${key==='rarity'?'N=1 · SSSR=5':'滿分 5'}</small></strong><small>${s.metrics[key].count} ${statsType==='night'?'晚':'個夢'}有評分</small></div>`).join('')}</div>`;
}
function categoryBars(items) { return items.length ? items.map(item=>`<div class="bar-row"><span>${esc(item.label)}</span><div class="bar"><span style="width:${item.ratio*100}%"></span></div><span>${item.count} · ${percent(item.ratio)}</span></div>`).join('') : '<p class="micro">還沒有填寫這類資料。</p>'; }
function renderSleepAnalysis() {
  const s = sleepAnalysis(data,statsStart,statsEnd);
  return `<section class="card"><p class="eyebrow">SLEEP & NIGHTMARES</p><h2>睡多久，夢有甚麼不同？</h2><p class="micro">固定分析夜間睡眠，不受夜間／午覺篩選影響。${s.count} 晚有時數與狀態，${s.missingHours} 晚未填時數而排除。</p>
  ${s.count?`<div class="metric-grid"><div class="metric"><span>平均睡眠</span><strong>${score(s.meanHours)}</strong><small>小時 · ${s.count} 晚</small></div><div class="metric"><span>有時數記錄的夜間噩夢率</span><strong>${percent(s.rate)}</strong><small>${s.yes} / ${s.known} 晚確定有／無</small></div></div><h3>三種晚上，平均睡多久？</h3>${s.byStatus.map(group=>`<div class="row between micro"><span>${STATUS[group.status]}</span><span>${score(group.meanHours)} 小時 · ${group.count} 晚</span></div>`).join('')}<details><summary>依睡眠時數比較</summary><div>${s.groups.map(group=>`<div class="series-item"><div class="row between"><strong>${group.label}</strong><span class="badge">${group.count} 晚</span></div>${group.count?`<div class="bar-row"><span>噩夢率</span><div class="bar"><span style="width:${(group.rate??0)*100}%"></span></div><span>${percent(group.rate)}</span></div><p class="micro">${group.yes} 晚有 ÷ ${group.known} 晚確定有／無<br>不記得 ${group.unknown}/${group.count} 晚（${percent(group.recallUnknownRate)}）</p><div class="dream-scores">${Object.entries({...METRICS,rarity:'稀有度 N=1–SSSR=5'}).map(([key,label])=>`<span>${label} ${score(group.metrics[key].value)}（${group.metrics[key].count} 晚）</span>`).join('')}</div>${group.known<5?'<p class="micro section-space">確定有／無的樣本少於 5 晚，先累積記錄，暫不解讀差異。</p>':''}`:'<p class="micro">尚無這段時數的記錄。</p>'}</div>`).join('')}</div></details>`:empty('填下幾晚睡眠時數後，就能在這裡比較。','☾')}
  <p class="note">這是已填時數晚上的描述性比較，可能受漏記等因素影響。關聯不等於因果，不能據此說睡得短「造成」噩夢。每晚只計一次；未填評分不當作零。</p></section>`;
}
function renderStats() {
  if (!rangeValid(statsStart,statsEnd)) return `${header('LET THE RECORDS SPEAK','慢慢觀察')}<div class="note error">請選擇有效日期範圍，開始日不能晚於結束日，最長十年。</div>${statsRange()}`;
  const s=statistics(data,statsStart,statsEnd,statsType);
  const points=trend(data,statsStart,statsEnd,statsType,rolling);
  const metric = statsType==='night'?(trendMetric==='dreams'?'rate':trendMetric):(['rate','sleepHours'].includes(trendMetric)?'dreams':trendMetric);
  const labels={rate:'夜間噩夢率',dreams:`過去 ${rolling} 天的夢境數`,...METRICS,...(statsType==='night'?{sleepHours:'夜間睡眠時數（小時）'}:{})};
  return `${header('SMALL TRACES, OVER TIME','慢慢觀察')}<p class="intro">不用靠記憶猜。先留下來，再慢慢看。</p>${statsRange()}
  <section class="card"><p class="eyebrow">夜間睡眠 · ${statsStart} — ${statsEnd}</p><h2>有多少晚做了噩夢？</h2><p class="large-stat">${percent(s.rate)}<small>夜間噩夢率</small></p><p class="micro">${s.yes} 晚有噩夢 ÷ ${s.yes+s.no} 晚確定有／無 · 已記錄 ${s.recorded} 晚</p><div class="row micro"><span>😴 無 ${s.no}</span><span>❓ 不記得 ${s.unknown}</span><span>— 未記錄 ${s.missing}</span></div><p class="note">不記得與未記錄不進分母。午覺夢不影響夜間噩夢率。</p></section>
  ${renderSleepAnalysis()}<div class="segments" aria-label="夢境分析分類">${[['night','☾ 夜間'],['nap','☀ 午覺'],['all','全部']].map(([type,label])=>`<button data-action="stats-type" data-type="${type}" class="${statsType===type?'selected':''}">${label}</button>`).join('')}</div>
  <p class="micro">${statsType==='night'?`按晚計算 · ${s.units} 晚有噩夢 · ${s.dreams} 個夢境細節`:`按每個夢計算 · ${s.dreams} 個夢${statsType==='nap'?'；未收集所有午睡，因此不計午覺噩夢率':''}`}</p>
  <section class="card"><h2>感受不必同步</h2>${metricsHTML(s)}${!s.dreams?'<p class="micro">尚無足夠資料。只記狀態也可以，評分之後再補。</p>':''}</section>
  <section class="card"><h2>看看變化</h2><div class="chart-controls"><label class="sr-only" for="trend-metric">趨勢指標</label><select id="trend-metric">${Object.entries(labels).filter(([k])=>statsType==='night'?k!=='dreams':k!=='rate').map(([k,label])=>`<option value="${k}" ${metric===k?'selected':''}>${label}</option>`).join('')}</select><label class="sr-only" for="rolling">移動窗口</label><select id="rolling"><option value="7" ${rolling===7?'selected':''}>7 天${metric==='dreams'?'合計':'平均'}</option><option value="30" ${rolling===30?'selected':''}>30 天${metric==='dreams'?'合計':'平均'}</option></select></div>${chart(points,metric,labels[metric])}<p class="micro">${metric==='dreams'?'每個日期顯示過去窗口內記錄的夢境數。':'每個日期顯示截至該日的移動平均；缺資料留空，不算零。'} 點選圓點可查看數值。</p></section>
  <section class="card"><h2>稀有度分布</h2><p class="micro">按夢境數計算；未評級不列入。</p>${categoryBars(s.rarity.map(r=>({...r,ratio:s.dreams?r.count/s.dreams:0})))}</section>
  <section class="card"><h2>再次進入熟悉的夢</h2><p class="large-stat">${s.units?percent(s.recurring/s.units):'—'}</p><p class="micro">${s.recurring} / ${s.units} ${statsType==='night'?'晚':'個夢'} · 有 recurring 結構或連結系列</p>${data.series.filter(series=>data.dreams.some(d=>d.seriesId===series.id&&d.date>=statsStart&&d.date<=statsEnd&&(statsType==='all'||d.sleepType===statsType))).map(series=>`<p class="micro">↻ ${esc(series.name)} · ${data.dreams.filter(d=>d.seriesId===series.id&&d.date>=statsStart&&d.date<=statsEnd&&(statsType==='all'||d.sleepType===statsType)).length} 個 episode</p>`).join('')}</section>
  ${[['contentTags','常出現的內容'],['structures','夢的結構'],['fearReasons','按下了哪些恐懼按鈕？']].map(([key,title])=>`<section class="card"><h2>${title}</h2><p class="micro">分母：${s.units} ${statsType==='night'?'晚有噩夢':'個夢'}；多選合計可超過 100%。</p>${categoryBars(s.categories[key])}</section>`).join('')}
  <details class="card"><summary>比較兩個時段</summary><div>${renderCompare()}</div></details><p class="footnote">記錄不替夢下結論，也不替你評分。</p>`;
}
function statsRange() { return `<div class="segments">${[7,30,90].map(n=>`<button data-action="stats-range" data-days="${n}" class="${statsDays===n?'selected':''}">${n} 天</button>`).join('')}<button data-action="stats-range" data-days="0" class="${statsDays===0?'selected':''}">自訂</button></div><div class="date-range"><label class="field">開始日期<input id="stats-start" type="date" value="${statsStart}"></label><label class="field">結束日期<input id="stats-end" type="date" value="${statsEnd}"></label></div>`; }
function chart(points,metric,title) {
  const width=520,height=190,pad=32, values=points.map(p=>p[metric]);
  const filled=values.filter(v=>v!==null),max=metric==='rate'?1:metric==='dreams'?Math.max(1,...filled):metric==='sleepHours'?Math.max(10,Math.ceil(Math.max(0,...filled))):5;
  if (!filled.length) return empty('尚無足夠資料。缺填不當作零。','⌁');
  const xy=(v,i)=>[pad+(points.length===1?(width-2*pad)/2:i/(points.length-1)*(width-2*pad)),height-pad-v/max*(height-2*pad)];
  let path='',lastMissing=true;
  values.forEach((v,i)=>{if(v===null){lastMissing=true;return;}const [x,y]=xy(v,i);path+=`${lastMissing?'M':'L'}${x.toFixed(1)},${y.toFixed(1)} `;lastMissing=false;});
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}走勢"><title>${esc(title)}走勢；${points[0].date} 至 ${points.at(-1).date}</title>${[0,.5,1].map(t=>`<line x1="${pad}" x2="${width-pad}" y1="${height-pad-t*(height-2*pad)}" y2="${height-pad-t*(height-2*pad)}"/><text x="0" y="${height-pad-t*(height-2*pad)+4}">${metric==='rate'?`${t*100}%`:score(t*max)}</text>`).join('')}<path d="${path}"/>${points.map((p,i)=>{if(p[metric]===null)return '';const [x,y]=xy(p[metric],i);return `<circle cx="${x}" cy="${y}" r="${points.length>100?2:3}" tabindex="0" role="button" aria-label="${p.date} ${esc(title)} ${metric==='rate'?percent(p[metric]):score(p[metric])}" data-action="chart-point" data-label="${esc(`${p.date} · ${title} ${metric==='rate'?percent(p[metric]):score(p[metric])}`)}"><title>${p.date} · ${metric==='rate'?percent(p[metric]):score(p[metric])}</title></circle>`;}).join('')}<text x="${pad}" y="${height-5}">${points[0].date}</text><text x="${width-pad}" y="${height-5}" text-anchor="end">${points.at(-1).date}</text></svg>`;
}
function renderCompare() {
  const valid=rangeValid(compareA.start,compareA.end)&&rangeValid(compareB.start,compareB.end);
  const a=valid?statistics(data,compareA.start,compareA.end,statsType):null,b=valid?statistics(data,compareB.start,compareB.end,statsType):null;
  const delta=(x,y,ratio=false)=>x===null||y===null?'資料不足':`${y-x>0?'+':''}${ratio?((y-x)*100).toFixed(1):(y-x).toFixed(1)}${ratio?' 個百分點':''}`;
  return `<p class="micro">沿用上方的${statsType==='night'?'夜間':statsType==='nap'?'午覺':'全部夢境'}分析分類。夜間噩夢率始終只算夜間。</p>${[['a',compareA,a],['b',compareB,b]].map(([key,range,s])=>`<section class="series-item"><h3>時段 ${key.toUpperCase()}</h3><div class="date-range"><label class="field">開始<input type="date" data-compare="${key}" data-edge="start" value="${range.start}"></label><label class="field">結束<input type="date" data-compare="${key}" data-edge="end" value="${range.end}"></label></div>${s?`<p>夜間噩夢率 ${percent(s.rate)} <span class="micro">(${s.yes}/${s.yes+s.no} 晚)</span></p>${metricsHTML(s)}<p class="micro">輪迴 ${s.recurring}/${s.units} · ${s.dreams} 個夢境細節</p>${[['contentTags','內容'],['structures','結構'],['fearReasons','恐懼原因']].map(([field,label])=>`<details><summary>${label}</summary><div>${categoryBars(s.categories[field])}</div></details>`).join('')}`:'<p class="note warning">請選擇有效日期範圍，最長十年。</p>'}</section>`).join('')}${valid?`<div class="compare-delta"><strong>B 相對 A</strong><p>夜間噩夢率：${delta(a.rate,b.rate,true)}</p>${Object.entries({...METRICS,rarity:'平均稀有度'}).map(([key,label])=>`<p>${label}：${delta(a.metrics[key].value,b.metrics[key].value)}</p>`).join('')}<p>輪迴比例：${delta(a.units?a.recurring/a.units:null,b.units?b.recurring/b.units:null,true)}</p></div>`:''}`;
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
  showModal('留下的夢', `<p class="micro">${d.date} · ${formatDate(d.date)}</p>${dreamItem(d,false)}${Object.entries(DEFAULT_TAGS).map(([key])=>`<p class="micro">${{contentTags:'內容',structures:'結構',fearReasons:'可怕原因'}[key]}：${esc(d[key].join('、')||'未填')}</p>`).join('')}<p class="micro">夢中記起以前：${labels[d.dreamMemory]||'未填'}<br>知道接下來的事：${labels[d.predictedEvent]||'未填'}<br>改變結局：${labels[d.changedOutcome]||'未填'}<br>知道在做夢：${labels[d.lucid]||'未填'}</p><div class="modal-actions"><button class="danger" data-action="delete-dream" data-id="${esc(id)}">刪除</button><button class="primary" data-action="edit-dream" data-id="${esc(id)}">編輯這個夢</button></div>`);
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
    el.classList.toggle('selected',index<0);el.setAttribute('aria-pressed',String(index<0));scheduleDraft();return;
  }
  if(action==='add-tag'){
    const key=el.dataset.key,input=$(`[data-tag-search="${key}"]`),value=input.value.trim()||prompt('新分類名稱：')?.trim();if(!value)return;
    const exists=[...DEFAULT_TAGS[key],...data.settings.customTags[key]].includes(value);
    if(!exists&&!commit(next=>next.settings.customTags[key].push(value)))return;
    if(!editor[key].includes(value))editor[key].push(value);persistDraft();
    const container=el.closest('[data-tag-group]');container.outerHTML=tagField(key,{contentTags:'內容標籤',structures:'夢的結構',fearReasons:'為甚麼可怕？'}[key]);return;
  }
  if(action==='month'){const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+Number(el.dataset.step));month=dateKey(d).slice(0,7);selectedDate=`${month}-01`;render();return;}
  if(action==='select-date'){selectedDate=el.dataset.date;render();return;}
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
  if(action==='chart-point'){toast(el.dataset.label);return;}
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
    if(commit(next=>{saveDream(next,dream,hours);delete next.drafts.editor;})){const date=dream.date;editor=null;homeDate=date;selectedDate=date;month=date.slice(0,7);const page=editorReturn;go(page);render();window.scrollTo(0,0);toast('💀 → 🦭 NOM。這個夢已經留下來了。');$('.seal-emoji')?.classList.add('feed-pulse');}return;
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
  if(el.dataset.tagSearch){const group=el.closest('[data-tag-group]');const query=el.value.trim().toLocaleLowerCase();group.querySelectorAll('[data-action="tag"]').forEach(button=>{button.hidden=!button.dataset.value.toLocaleLowerCase().includes(query);});return;}
  if(el.closest('#dream-form')) {readEditor();scheduleDraft();}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='home-date'){if(validDate(el.value)){homeDate=el.value;homeDateFollowsToday=false;render();}return;}
  if((el.name==='sleepType'||el.name==='date')&&editor){readEditor();updateEditorSleepField();if(el.name==='sleepType')$('#type-note').hidden=false;scheduleDraft();return;}
  if(el.name==='seriesId'&&editor){readEditor();const s=data.series.find(s=>s.id===editor.seriesId);$('#series-background').innerHTML=s?`<p class="note">${esc(s.background||'還沒有背景。')}</p>`:'';scheduleDraft();return;}
  if(el.id==='stats-start'||el.id==='stats-end'){statsDays=0;if(el.id==='stats-start')statsStart=el.value;else statsEnd=el.value;render();return;}
  if(el.id==='rolling'){rolling=Number(el.value);render();return;}
  if(el.id==='trend-metric'){trendMetric=el.value;render();return;}
  if(el.dataset.compare){const range=el.dataset.compare==='a'?compareA:compareB;range[el.dataset.edge]=el.value;const parent=el.closest('details.card');parent.querySelector(':scope > div').innerHTML=renderCompare();return;}
  if(el.id==='reduced-motion'){const value=el.checked;if(!commit(next=>{next.settings.reducedMotion=value;}))el.checked=!value;return;}
  if(el.id==='import-file'){stageImport(el.files[0]);return;}
});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="chart-point"]')){event.preventDefault();toast(event.target.dataset.label);}});
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
