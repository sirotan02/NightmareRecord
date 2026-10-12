import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, dateKey, shiftDate, validDate, upsertDay, setNightStatus, saveDream, rewards, statistics, trend, validateData, mergeData, csv } from '../core.js';
import { readData, writeData, recoverableImport, KEY, RECOVERY_KEY } from '../storage.js';
const dream = (id,date,sleepType='night',patch={}) => ({ id,date,sleepType,rarity:null,distress:null,sleepDisruption:null,contentIntensity:null,description:'',contentTags:[],structures:[],fearReasons:[],seriesId:null,dreamMemory:null,predictedEvent:null,changedOutcome:null,lucid:null,...patch });
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
  const stats=statistics(data,'2026-10-01','2026-10-06');assert.equal(stats.rate,2/3);assert.equal(stats.recorded,4);assert.equal(stats.unknown,1);assert.equal(stats.missing,2);
});
test('night means weight nights equally, count zero and exclude null',()=>{
  const data=fixture(),stats=statistics(data,'2026-10-01','2026-10-06');
  assert.equal(stats.metrics.distress.value,3.5);assert.equal(stats.metrics.distress.count,2);assert.equal(stats.metrics.sleepDisruption.value,3);assert.equal(stats.metrics.sleepDisruption.count,1);assert.equal(stats.metrics.contentIntensity.value,null);
  assert.equal(stats.categories.contentTags[0].count,1);assert.equal(stats.categories.contentTags[0].ratio,.5);assert.equal(stats.recurring,1);
  assert.equal(statistics(data,'2026-10-01','2026-10-06','nap').metrics.distress.value,2);
  assert.equal(statistics(data,'2026-10-01','2026-10-06','all').metrics.distress.value,2.6);
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
  const data=fixture();const points=trend(data,'2026-10-01','2026-10-05','night',1);
  assert.equal(points[0].distress,2);assert.equal(points[2].distress,null);assert.equal(points[3].rate,null);
  assert.equal(trend(data,'2026-10-03','2026-10-03','night',3)[0].rate,2/3);
  assert.equal(trend(data,'2026-10-03','2026-10-03','nap',3)[0].dreams,1);
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
