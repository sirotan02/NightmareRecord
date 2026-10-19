import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, DEFAULT_TAGS, CONTENT_TAG_GROUPS, UNGROUPED_TAG_LABEL, groupContentTags, dateKey, shiftDate, validDate, upsertDay, setNightStatus, saveDream, rewards, saveFeedback, statistics, trend, validateData, mergeData, csv, sleepAnalysis, nightSummary, limitNotes, rarityDistribution, recurring, inSeries, trendSeries, trendMinSample, comparePeriods, previousRange, daysInclusive, ANALYSIS, TREND_METRICS } from '../core.js';
import { readData, writeData, recoverableImport, KEY, RECOVERY_KEY } from '../storage.js';
const dream = (id,date,sleepType='night',patch={}) => ({ id,date,sleepType,rarity:null,distress:null,sleepDisruption:null,contentIntensity:null,description:'',contentTags:[],structures:[],fearReasons:[],seriesId:null,dreamMemory:null,predictedEvent:null,changedOutcome:null,lucid:null,...patch });
const T = { today: '2026-12-31' };
const fixture = () => {
  const data=emptyData();
  saveDream(data,dream('a','2026-10-01','night',{distress:0,sleepDisruption:2,rarity:'N',contentTags:['追逐']}));
  saveDream(data,dream('b','2026-10-01','night',{distress:4,sleepDisruption:4,rarity:'SSR',contentTags:['追逐']}));
  saveDream(data,dream('c','2026-10-02','night',{distress:5,structures:['輪迴 / Recurring']}));
  setNightStatus(data,'2026-10-03','no'); setNightStatus(data,'2026-10-04','unknown');
  saveDream(data,dream('d','2026-10-03','nap',{distress:1,rarity:'SSSR'}));
  saveDream(data,dream('e','2026-10-05','nap',{distress:3}));
  return data;
};
test('local dates survive month, year and leap boundaries',()=>{
  assert.equal(dateKey(new Date(2026,9,12,0,1)),'2026-10-12');assert.equal(shiftDate('2026-01-01',-1),'2025-12-31');assert.equal(shiftDate('2024-02-28',1),'2024-02-29');assert.equal(validDate('2026-02-30'),false);
});
test('nap-only days do not become recorded nights; no-night + nap stays no',()=>{
  const data=fixture();assert.equal(data.daily.find(d=>d.date==='2026-10-05').status,null);assert.equal(data.daily.find(d=>d.date==='2026-10-03').status,'no');
  const stats=statistics(data,'2026-10-01','2026-10-06','night',T);assert.equal(stats.rate,2/3);assert.equal(stats.recorded,4);assert.equal(stats.unknown,1);assert.equal(stats.missing,2);
});
test('night means weight nights equally, count zero and exclude null',()=>{
  const data=fixture(),stats=statistics(data,'2026-10-01','2026-10-06','night',T);
  assert.equal(stats.metrics.distress.value,3.5);assert.equal(stats.metrics.distress.count,2);assert.equal(stats.metrics.sleepDisruption.value,3);assert.equal(stats.metrics.sleepDisruption.count,1);assert.equal(stats.metrics.contentIntensity.value,null);
  assert.equal(stats.metrics.sleepDisruption.missing,1);assert.equal(stats.metrics.contentIntensity.missing,2);assert.equal('rarity' in stats.metrics,false);
  // Night 10-02 has no content tag at all: it is "not filled", so it is left out of the denominator instead of counting as "no".
  assert.equal(stats.categories.contentTags[0].count,1);assert.equal(stats.categories.contentTags[0].ratio,1);assert.deepEqual(stats.categoryMeta.contentTags,{units:2,filled:1,unfilled:1});assert.equal(stats.recurring,1);
  assert.equal(statistics(data,'2026-10-01','2026-10-06','nap',T).metrics.distress.value,2);
  assert.equal(statistics(data,'2026-10-01','2026-10-06','all',T).metrics.distress.value,2.6);
});
test('highest EXP once per date across naps and nights; edits recalculate',()=>{
  const data=fixture();assert.deepEqual(rewards(data),{exp:670,fish:1,level:7,progress:70});
  saveDream(data,{...data.dreams.find(d=>d.id==='b'),rarity:'N'});assert.equal(rewards(data).exp,530);
  data.dreams=data.dreams.filter(d=>d.id!=='d');assert.equal(rewards(data).exp,30);
  setNightStatus(data,'2026-10-05','yes');assert.equal(rewards(data).exp,30);
});
test('night status changes delete only night details, never nap',()=>{
  const data=fixture();saveDream(data,dream('f','2026-10-01','nap'));setNightStatus(data,'2026-10-01','unknown');assert.deepEqual(data.dreams.filter(d=>d.date==='2026-10-01').map(d=>d.id),['f']);
});
test('moving an episode preserves explicit night status and creates nap-only target',()=>{
  const data=fixture();saveDream(data,{...data.dreams[0],date:'2026-10-10',sleepType:'nap'});assert.equal(data.daily.find(d=>d.date==='2026-10-01').status,'yes');assert.equal(data.daily.find(d=>d.date==='2026-10-10').status,null);assert.doesNotThrow(()=>validateData(data));
});
test('rolling statistics include preceding dates and leave scores as gaps',()=>{
  const data=fixture();const points=trend(data,'2026-10-01','2026-10-05','night',1,T);
  assert.equal(points[0].distress,2);assert.equal(points[2].distress,null);assert.equal(points[3].rate,null);
  assert.equal(trend(data,'2026-10-03','2026-10-03','night',3,T)[0].rate,2/3);
  assert.equal(trend(data,'2026-10-03','2026-10-03','nap',3,T)[0].dreams,1);
});
test('JSON round trip preserves series, zero, notes, custom tags and draft',()=>{
  const data=fixture();data.series.push({id:'s',name:'上山救人',background:'背景\n很長的故事',status:'Returned'});data.dreams[0].seriesId='s';data.dreams[0].description='💀 "夢"\n第二行';data.settings.customTags.contentTags.push('自訂');data.drafts.editor=dream('draft','2026-10-12','nap');upsertDay(data,'2026-10-01',{sleepHours:0});
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
});
test('invalid imports fail without modifying original data',()=>{
  const original=fixture(),before=JSON.stringify(original);
  for(const change of [d=>d.version=9,d=>d.daily.push({...d.daily[0]}),d=>d.dreams[0].sleepType='evil',d=>d.dreams[0].distress=6,d=>d.dreams[0].seriesId='missing',d=>d.daily[0].status='no',d=>d.daily[0].sleepHours=-1,d=>d.settings.customTags.structures=[''],d=>d.dreams.push({...d.dreams[0]})]){
    const bad=structuredClone(original);change(bad);assert.throws(()=>validateData(bad));
  }
  assert.equal(JSON.stringify(original),before);
});
test('untrusted draft metadata is normalized without poisoning saved records',()=>{
  const data=fixture();data.drafts.editor={...dream('draft','2026-10-12','nap'),createdAt:'bad',dreamMemory:'bad',script:'ignored'};
  const restored=validateData(data);assert.equal(restored.drafts.editor.dreamMemory,null);assert.equal(restored.drafts.editor.createdAt,undefined);assert.equal(restored.drafts.editor.script,undefined);
  saveDream(restored,restored.drafts.editor);assert.doesNotThrow(()=>validateData(restored));
});
test('merge preserves local dates and IDs; repeated imports do not duplicate rewards',()=>{
  const local=fixture(),incoming=fixture();incoming.dreams[0].description='incoming conflict';saveDream(incoming,dream('new','2026-10-12','nap',{rarity:'SR'}));
  const merged=mergeData(local,incoming);assert.equal(merged.dreams.find(d=>d.id==='a').description,'');assert.equal(merged.dreams.length,6);assert.equal(rewards(merged).exp,720);assert.deepEqual(mergeData(merged,incoming),merged);
});
test('storage errors do not overwrite data; recovery written before import',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};const data=fixture();writeData(data,storage);assert.deepEqual(readData(storage),data);
  recoverableImport(data,emptyData(),storage);assert.deepEqual(JSON.parse(map.get(RECOVERY_KEY)),data);assert.deepEqual(readData(storage),emptyData());
  const before=map.get(KEY);assert.throws(()=>writeData(data,{setItem(){throw new Error('QuotaExceededError');}}));assert.equal(map.get(KEY),before);
  writeData(data,storage);
  const quotaStorage={getItem:storage.getItem,setItem(k,v){if(k===KEY)throw new Error('QuotaExceededError');map.set(k,v);}};
  assert.throws(()=>recoverableImport(data,emptyData(),quotaStorage));assert.deepEqual(readData(storage),data);assert.deepEqual(JSON.parse(map.get(RECOVERY_KEY)),data);
});
test('CSV quotes multiline content and guards spreadsheet formulas',()=>{
  const result=csv([['內容','空白','公式'],['"夢"\n第二行',null,'=1+1']]);assert.ok(result.startsWith('\ufeff'));assert.ok(result.includes('""夢""\n第二行'));assert.ok(result.includes('"\'=1+1"'));
});
test('night episodes save shared hours atomically; omitted hours preserve them and naps cannot overwrite',()=>{
  const data=emptyData();saveDream(data,dream('a','2026-10-01'),6.5);saveDream(data,dream('b','2026-10-01'));
  assert.equal(data.daily.length,1);assert.equal(data.daily[0].sleepHours,6.5);assert.equal(data.dreams[0].sleepHours,undefined);
  saveDream(data,dream('nap','2026-10-01','nap'),12);assert.equal(data.daily[0].sleepHours,6.5);
  saveDream(data,{...data.dreams[0]},0);assert.equal(data.daily[0].sleepHours,0);
  saveDream(data,{...data.dreams[0]},null);assert.equal(data.daily[0].sleepHours,null);
  const before=JSON.stringify(data);for(const value of [-1,25,NaN,Infinity,'6'])assert.throws(()=>saveDream(data,dream('bad','2026-10-02'),value));assert.equal(JSON.stringify(data),before);
});
test('sleep groups use exact boundaries, known-night denominators and separate unknown recall',()=>{
  const data=emptyData();
  for(const [date,hours,status] of [['2026-10-01',0,'yes'],['2026-10-02',4.9,'unknown'],['2026-10-03',5,'no'],['2026-10-04',7,'yes'],['2026-10-05',9,'unknown'],['2026-10-06',24,'no'],['2026-10-07',null,'yes'],['2026-10-08',8,null],['2026-09-30',2,'yes']])upsertDay(data,date,{sleepHours:hours,status});
  saveDream(data,dream('nap','2026-10-03','nap',{distress:5}));
  const s=sleepAnalysis(data,'2026-10-01','2026-10-08',T);assert.equal(s.count,6);assert.equal(s.recorded,7);assert.equal(s.missingHours,1);assert.equal(s.hoursOnly,1);assert.equal(s.rate,.5);
  assert.deepEqual(s.groups.map(g=>g.count),[2,1,1,2]);assert.deepEqual(s.groups.map(g=>g.rate),[1,0,1,0]);assert.equal(s.groups[0].recallUnknownRate,.5);assert.equal(s.groups[3].recallUnknownRate,.5);assert.equal(s.byStatus[0].meanHours,3.5);
});
test('sleep associations weight each night once and ignore nap ratings and unfilled values',()=>{
  const data=emptyData();saveDream(data,dream('a','2026-10-01','night',{distress:0,rarity:'N'}),6);saveDream(data,dream('b','2026-10-01','night',{distress:4,rarity:'SSR'}));saveDream(data,dream('c','2026-10-02','night',{distress:5}),6.5);saveDream(data,dream('nap','2026-10-01','nap',{distress:5}));
  const s=sleepAnalysis(data,'2026-10-01','2026-10-02',T);assert.equal(s.count,2);assert.equal(s.metrics.distress.value,3.5);assert.equal(s.metrics.distress.count,2);assert.equal(s.metrics.sleepDisruption.value,null);assert.equal(s.metrics.sleepDisruption.missing,2);assert.equal('rarity' in s.metrics,false);
  const empty=sleepAnalysis(data,'2027-01-01','2027-01-30',T);assert.equal(empty.rate,null);assert.equal(empty.meanHours,null);assert.equal(empty.groups[0].recallUnknownRate,null);
});
test('sleep drafts preserve per-date values across JSON restore without changing existing records',()=>{
  const data=fixture();data.drafts.editor={...dream('draft','2026-10-12'),sleepHoursByDate:{'2026-10-12':6.5,'2026-10-13':null,'2026-10-14':0,'invalid':8,'2026-10-15':-1}};
  const restored=validateData(JSON.parse(JSON.stringify(data)));assert.deepEqual(restored.drafts.editor.sleepHoursByDate,{'2026-10-12':6.5,'2026-10-13':null,'2026-10-14':0});assert.deepEqual(restored.daily,data.daily);
});
test('save feedback reports the real EXP gain for a new dream and levels up',()=>{
  const data=emptyData(),before=rewards(data);saveDream(data,dream('n1','2026-10-01','night',{rarity:'SR'}));
  const after=rewards(data);assert.equal(after.exp-before.exp,50);assert.match(saveFeedback(before,after,false),/\+50 EXP/);
  const big=emptyData(),b2=rewards(big);saveDream(big,dream('n2','2026-10-01','night',{rarity:'SSSR'}));assert.match(saveFeedback(b2,rewards(big),false),/\+500 EXP.*Lv\. 6/);
});
test('save feedback never claims EXP when the date was already counted',()=>{
  const data=emptyData();saveDream(data,dream('n1','2026-10-01','night',{rarity:'SSR'}));
  const before=rewards(data);saveDream(data,dream('n2','2026-10-01','night',{rarity:'N'}));
  const after=rewards(data);assert.equal(after.exp,before.exp);assert.doesNotMatch(saveFeedback(before,after,false),/\+\d+ EXP|NOM/);
});
test('editing an existing dream does not announce earned EXP',()=>{
  const data=emptyData();saveDream(data,dream('n1','2026-10-01','night',{rarity:'SR'}));
  let before=rewards(data);saveDream(data,{...data.dreams[0],description:'更新'});
  assert.equal(saveFeedback(before,rewards(data),true),'已更新這個夢。');
  before=rewards(data);saveDream(data,{...data.dreams[0],rarity:'SSR'});
  const message=saveFeedback(before,rewards(data),true);assert.match(message,/重新計算/);assert.doesNotMatch(message,/NOM|餵|留下來了/);
  assert.equal(rewards(data).exp,150);
});
test('content tag groups cover every default tag exactly once and keep custom tags',()=>{
  const grouped=CONTENT_TAG_GROUPS.flatMap(group=>group.tags);
  assert.equal(new Set(grouped).size,grouped.length);
  assert.deepEqual([...grouped].sort(),DEFAULT_TAGS.contentTags.filter(tag=>tag!=='其他').sort());
  const groups=groupContentTags([...DEFAULT_TAGS.contentTags,'我的自訂']);
  assert.deepEqual(groups.map(group=>group.label).at(-1),UNGROUPED_TAG_LABEL);
  assert.deepEqual(groups.at(-1).tags,['其他','我的自訂']);
  assert.equal(groups.flatMap(group=>group.tags).length,DEFAULT_TAGS.contentTags.length+1);
  assert.deepEqual(groupContentTags(['被追逐']),[{label:'被追與困住',tags:['被追逐']}]);
});
const night = (data, date, status, hours) => upsertDay(data, date, { status, ...(hours === undefined ? {} : { sleepHours: hours }) });
const finite = value => { if (typeof value === 'number') return Number.isFinite(value); if (value && typeof value === 'object') return Object.values(value).every(finite); return true; };
test('future dates and an unfinished tonight are never counted as missing',()=>{
  const data=emptyData();night(data,'2026-10-01','yes');night(data,'2026-10-02','no');night(data,'2026-10-03','unknown');
  const s=nightSummary(data,'2026-10-01','2026-10-31',{today:'2026-10-06'});
  assert.deepEqual([s.days,s.recorded,s.missing,s.pending,s.future,s.due],[6,3,2,1,25,5]);
  assert.equal(s.end,'2026-10-06');assert.equal(s.coverage,3/5);assert.equal(s.known,2);assert.equal(s.rate,.5);
  assert.equal(statistics(data,'2026-10-01','2026-10-31','night',{today:'2026-10-06'}).missing,2);
  night(data,'2026-10-10','yes');
  const ahead=nightSummary(data,'2026-10-01','2026-10-31',{today:'2026-10-06'});assert.equal(ahead.ahead,1);assert.equal(ahead.yes,1);
  night(data,'2026-10-06','no');
  const recordedToday=nightSummary(data,'2026-10-01','2026-10-31',{today:'2026-10-06'});assert.deepEqual([recordedToday.pending,recordedToday.recorded,recordedToday.missing],[0,4,2]);
  const allFuture=nightSummary(data,'2026-11-01','2026-11-30',{today:'2026-10-06'});
  assert.deepEqual([allFuture.days,allFuture.missing,allFuture.due,allFuture.future],[0,0,0,30]);assert.equal(allFuture.coverage,null);assert.equal(allFuture.rate,null);
});
test('unknown, missing and no-nightmare nights stay separate and never enter the rate as zero',()=>{
  const data=emptyData();night(data,'2026-10-01','yes');night(data,'2026-10-02','no');night(data,'2026-10-03','unknown');night(data,'2026-10-04','unknown');
  const s=nightSummary(data,'2026-10-01','2026-10-10',{today:'2026-12-31'});
  assert.deepEqual([s.yes,s.no,s.unknown,s.missing],[1,1,2,6]);assert.equal(s.known,2);assert.equal(s.rate,.5);assert.equal(s.coverage,.4);
  const onlyUnknown=emptyData();night(onlyUnknown,'2026-10-01','unknown');
  assert.equal(nightSummary(onlyUnknown,'2026-10-01','2026-10-05',{today:'2026-12-31'}).rate,null);
});
test('limitation notes appear only for small samples or low coverage and stay calm',()=>{
  assert.deepEqual(limitNotes({known:0,coverage:null}).map(n=>n.code),['noKnown']);
  assert.deepEqual(limitNotes({known:4,coverage:1}).map(n=>n.code),['smallSample']);
  assert.deepEqual(limitNotes({known:ANALYSIS.smallSample,coverage:.5}).map(n=>n.code),['lowCoverage']);
  assert.deepEqual(limitNotes({known:12,coverage:ANALYSIS.lowCoverage}),[]);
  const notes=limitNotes({known:3,coverage:.4});assert.deepEqual(notes.map(n=>n.code),['smallSample','lowCoverage']);assert.match(notes[0].text,/3 晚/);assert.match(notes[1].text,/40%/);
  for(const note of notes)assert.doesNotMatch(note.text,/危險|警告|嚴重|失敗|異常/);
});
test('rarity distribution uses rated dreams as the denominator and reports unrated separately',()=>{
  const r=rarityDistribution([{rarity:'R'},{rarity:'R'},{rarity:'SR'},{rarity:null},{rarity:null}]);
  assert.deepEqual([r.total,r.rated,r.unrated],[5,3,2]);assert.equal(r.items.find(i=>i.label==='R').share,2/3);
  assert.ok(Math.abs(r.items.reduce((sum,i)=>sum+i.share,0)-1)<1e-9);assert.equal(r.median,'R');assert.deepEqual(r.mode,['R']);
  const tie=rarityDistribution([{rarity:'N'},{rarity:'SSR'}]);assert.equal(tie.median,'N–SSR');assert.deepEqual(tie.mode,['N','SSR']);
  const none=rarityDistribution([{rarity:null}]);assert.deepEqual([none.rated,none.unrated,none.median,none.mode],[0,1,null,[]]);assert.ok(none.items.every(i=>i.count===0&&i.share===null));
  assert.equal(rarityDistribution([]).total,0);
  const data=emptyData();for(const [id,date,rarity] of [['a','2026-10-01','R'],['b','2026-10-02','R'],['c','2026-10-03',null],['e','2026-10-04',null]])saveDream(data,dream(id,date,'night',{rarity}));
  const s=statistics(data,'2026-10-01','2026-10-05','night',T);assert.equal(s.rarity.items.find(i=>i.label==='R').share,1);assert.equal(s.rarity.unrated,2);assert.equal('rarity' in s.metrics,false);
});
test('several dreams on one night are one unit in night scope; nap and all scopes count dreams',()=>{
  const data=emptyData();
  saveDream(data,dream('a','2026-10-01','night',{contentTags:['被追逐'],distress:1}));saveDream(data,dream('b','2026-10-01','night',{contentTags:['被追逐','墜落'],distress:5}));saveDream(data,dream('n','2026-10-01','nap',{contentTags:['被追逐']}));
  const nightScope=statistics(data,'2026-10-01','2026-10-01','night',T),all=statistics(data,'2026-10-01','2026-10-01','all',T),nap=statistics(data,'2026-10-01','2026-10-01','nap',T);
  assert.deepEqual([nightScope.unit,nightScope.units,nightScope.dreams],['night',1,2]);assert.equal(nightScope.categories.contentTags.find(c=>c.label==='被追逐').count,1);assert.equal(nightScope.metrics.distress.value,3);
  assert.deepEqual([all.unit,all.units,all.dreams],['dream',3,3]);assert.equal(all.categories.contentTags.find(c=>c.label==='被追逐').count,3);
  assert.deepEqual([nap.unit,nap.units,nap.dreams],['dream',1,1]);
  assert.deepEqual([nightScope.rate,all.rate,nap.rate],[1,1,1]);
});
test('tag shares leave unfilled nights out instead of counting them as "no"',()=>{
  const data=emptyData();saveDream(data,dream('a','2026-10-01','night',{contentTags:['被追逐']}));for(const [id,date] of [['b','2026-10-02'],['c','2026-10-03'],['e','2026-10-04']])saveDream(data,dream(id,date,'night'));
  const s=statistics(data,'2026-10-01','2026-10-05','night',T);
  assert.deepEqual(s.categoryMeta.contentTags,{units:4,filled:1,unfilled:3});assert.equal(s.categories.contentTags[0].ratio,1);
  const withNoDetails=emptyData();night(withNoDetails,'2026-10-01','yes');const bare=statistics(withNoDetails,'2026-10-01','2026-10-02','night',T);
  assert.deepEqual([bare.units,bare.dreams,bare.categoryMeta.contentTags.filled],[1,0,0]);assert.equal(bare.metrics.distress.missing,1);
});
test('series membership and the recurring tag are counted separately',()=>{
  const data=emptyData();data.series.push({id:'s',name:'上山救人',background:'',status:'Active'});
  saveDream(data,dream('a','2026-10-01','night',{seriesId:'s'}));saveDream(data,dream('b','2026-10-02','night',{structures:['輪迴 / Recurring']}));
  saveDream(data,dream('c','2026-10-03','night',{seriesId:'s',structures:['輪迴 / Recurring']}));saveDream(data,dream('d','2026-10-04','night',{dreamMemory:'yes'}));saveDream(data,dream('e','2026-10-05','night'));
  const s=statistics(data,'2026-10-01','2026-10-05','night',T);
  assert.deepEqual([s.units,s.inSeries,s.recurring,s.recalled],[5,2,2,1]);assert.equal(s.categoryMeta.structures.filled,2);
  assert.equal(recurring(data.dreams[0]),false);assert.equal(inSeries(data.dreams[1]),false);assert.equal(recurring(data.dreams[2])&&inSeries(data.dreams[2]),true);
});
test('sparse windows are not drawn as trends and unavailable is never zero',()=>{
  const data=emptyData();night(data,'2026-10-10','yes');
  const sparse=trendSeries(data,'2026-10-10','2026-10-12','rate',7,T);
  assert.equal(sparse.min,4);assert.equal(sparse.plotted,0);assert.equal(sparse.insufficient,3);assert.ok(sparse.points.every(p=>p.value===1&&p.sample===1&&!p.reliable));
  for(const [date,status] of [['2026-10-11','no'],['2026-10-12','no'],['2026-10-13','yes']])night(data,date,status);
  const enough=trendSeries(data,'2026-10-13','2026-10-13','rate',7,T);assert.deepEqual([enough.plotted,enough.points[0].value,enough.points[0].sample],[1,.5,4]);
  const none=trendSeries(emptyData(),'2026-10-01','2026-10-03','nightmareNights',7,T);assert.equal(none.unavailable,3);assert.ok(none.points.every(p=>p.value===null&&!p.reliable));
  assert.equal(trendSeries(emptyData(),'2026-10-01','2026-10-03','dreams',7,T).unavailable,3);
  const zero=emptyData();for(let i=1;i<=7;i++)night(zero,`2026-10-0${i}`,'no');
  const zeroSeries=trendSeries(zero,'2026-10-07','2026-10-07','nightmareNights',7,T);assert.deepEqual([zeroSeries.points[0].value,zeroSeries.points[0].reliable],[0,true]);
});
test('trend stops at today, ignores future dates and does not count tonight as due',()=>{
  const data=emptyData();night(data,'2026-10-05','no');
  const points=trend(data,'2026-10-01','2026-10-31','night',1,{today:'2026-10-06'});
  assert.equal(points.length,6);assert.equal(points.at(-1).date,'2026-10-06');assert.equal(points.at(-1).due,0);assert.equal(points.at(-1).coverage,null);assert.equal(points.at(-2).due,1);
  assert.equal(trend(data,'2026-11-01','2026-11-30','night',7,{today:'2026-10-06'}).length,0);assert.equal(trendSeries(data,'2026-11-01','2026-11-30','rate',7,{today:'2026-10-06'}).points.length,0);
});
test('rating trends skip unrated dreams instead of treating them as zero',()=>{
  const data=emptyData();for(let i=1;i<=7;i++)saveDream(data,dream(`d${i}`,`2026-10-0${i}`,'night',i<=3?{distress:4}:{}));
  const s=trendSeries(data,'2026-10-07','2026-10-07','distress',7,T);assert.deepEqual([s.points[0].value,s.points[0].sample,s.points[0].reliable],[4,3,true]);
  assert.equal(trendSeries(data,'2026-10-02','2026-10-02','distress',7,T).points[0].reliable,false);
});
test('minimum samples scale with the window and every metric is labelled by kind',()=>{
  assert.deepEqual([trendMinSample('rate',7),trendMinSample('rate',30),trendMinSample('distress',30),trendMinSample('sleepHours',7)],[4,15,ANALYSIS.minScored,4]);
  assert.deepEqual(Object.keys(TREND_METRICS),['rate','nightmareNights','dreams','sleepHours','sleepDisruption','distress','contentIntensity']);
  assert.deepEqual(Object.fromEntries(Object.entries(TREND_METRICS).map(([key,m])=>[key,m.kind])),{rate:'ratio',nightmareNights:'count',dreams:'count',sleepHours:'mean',sleepDisruption:'mean',distress:'mean',contentIntensity:'mean'});
  assert.throws(()=>trendSeries(emptyData(),'2026-10-01','2026-10-02','bogus',7,T));
});
test('sleep analysis accounts for every night and hides percentages for tiny groups',()=>{
  const data=emptyData();night(data,'2026-10-01','yes',4);night(data,'2026-10-02','no',8);night(data,'2026-10-03','unknown',null);upsertDay(data,'2026-10-04',{status:null,sleepHours:6});night(data,'2026-10-05','yes',4.5);
  const s=sleepAnalysis(data,'2026-10-01','2026-10-31',{today:'2026-10-06'});
  assert.deepEqual([s.recorded,s.count,s.missingHours,s.hoursOnly],[4,3,1,1]);assert.ok(s.groups.every(g=>g.reliable===false));assert.deepEqual(s.groups.map(g=>g.known),[2,0,1,0]);
  const big=emptyData();for(let i=1;i<=6;i++)night(big,`2026-10-0${i}`,i<=2?'yes':'no',4);
  const b=sleepAnalysis(big,'2026-10-01','2026-10-31',{today:'2026-10-31'});assert.deepEqual([b.groups[0].reliable,b.groups[0].known,b.groups[0].rate],[true,6,2/6]);
  assert.equal(sleepAnalysis(data,'2026-10-01','2026-10-31',{today:'2026-10-02'}).count,2);
});
test('period comparison needs enough known nights on both sides and never judges',()=>{
  assert.deepEqual(previousRange('2026-10-08','2026-10-14'),{start:'2026-10-01',end:'2026-10-07'});
  assert.deepEqual(previousRange('2026-03-01','2026-03-31'),{start:'2026-01-29',end:'2026-02-28'});
  assert.equal(daysInclusive('2026-10-01','2026-10-31'),31);assert.equal(daysInclusive('2026-10-02','2026-10-01'),0);
  const data=emptyData();for(let i=1;i<=5;i++)night(data,`2026-10-0${i}`,i===1?'yes':'no');for(let i=8;i<=12;i++)night(data,`2026-10-${String(i).padStart(2,'0')}`,i<=10?'yes':'no');
  const c=comparePeriods(data,{start:'2026-10-01',end:'2026-10-07'},{start:'2026-10-08',end:'2026-10-14'},T);
  assert.deepEqual([c.enough,c.a.rate,c.b.rate,c.lengthsDiffer],[true,.2,.6,false]);assert.ok(Math.abs(c.rateDelta-.4)<1e-9);assert.ok(Object.values(c.metricDeltas).every(v=>v===null));
  const thin=comparePeriods(data,{start:'2026-10-01',end:'2026-10-07'},{start:'2026-10-13',end:'2026-10-14'},T);assert.deepEqual([thin.enough,thin.rateDelta],[false,null]);
});
test('empty data produces nulls rather than NaN, Infinity or zero percentages',()=>{
  const s=statistics(emptyData(),'2026-10-01','2026-10-07','night',T);
  assert.deepEqual([s.rate,s.known,s.missing,s.coverage,s.units,s.dreams],[null,0,7,0,0,0]);
  assert.ok(Object.values(s.metrics).every(m=>m.value===null&&m.count===0&&m.missing===0));
  assert.deepEqual(s.categories.contentTags,[]);assert.deepEqual(s.categoryMeta.contentTags,{units:0,filled:0,unfilled:0});assert.equal(s.rarity.median,null);
  assert.ok(finite(s)&&finite(sleepAnalysis(emptyData(),'2026-10-01','2026-10-07',T))&&finite(trendSeries(emptyData(),'2026-10-01','2026-10-07','rate',7,T))&&finite(comparePeriods(emptyData(),{start:'2026-10-01',end:'2026-10-07'},{start:'2026-10-08',end:'2026-10-14'},T)));
  assert.deepEqual(limitNotes(s).map(n=>n.code),['noKnown']);
  assert.deepEqual(limitNotes({known:0,coverage:0,unknown:3}).map(n=>n.code),['noKnown']);
});
test('sleep rolling averages count recorded nights once, include unknown and retain gaps',()=>{
  const data=emptyData();upsertDay(data,'2026-10-01',{status:'yes',sleepHours:4});upsertDay(data,'2026-10-02',{status:'unknown',sleepHours:8});upsertDay(data,'2026-10-03',{status:null,sleepHours:20});
  const points=trend(data,'2026-10-02','2026-10-03','night',2,T);assert.equal(points[0].sleepHours,6);assert.equal(points[1].sleepHours,8);assert.equal(trend(data,'2026-10-04','2026-10-04','night',1,T)[0].sleepHours,null);
});
