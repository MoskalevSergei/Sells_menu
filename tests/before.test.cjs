const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js');
const saleHeader=['Позиция меню (блюдо)','Ресторан','Подразделение','Дата','Группа меню','Позиций'];
const orderHeader=['Ресторан','Подразделение','Дата','Заказы'];
// The unchanged iterative weight fit stops at a 1e-9 likelihood residual.
const close=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${a} != ${b}`);
// All names and quantities in this file are invented mathematical examples.
function fixture({before=[100,100,100],after=[100,100,100],novelty=[22,20,20],launch='2026-05-05'}={}){
  const sheets={'СПР':[['Позиция','группа','Новое','старт'],['Новинка','Группа',1,launch]],'Поток продаж':[saleHeader],'Поток чеков':[orderHeader],'Поток продаж_до':[saleHeader],'Поток чеков_до':[orderHeader]};
  for(let r=0;r<3;r++){
    for(const [name,qty] of [['Новинка',novelty[r]],['Обычное',after[r]-novelty[r]]])sheets['Поток продаж'].push([name,'Ресторан '+r,'Зал',launch,'Группа',qty]);
    sheets['Поток чеков'].push(['Ресторан '+r,'Зал',launch,100]);
    for(let day=-14;day<0;day++){
      const dt=E.addDays(launch,day);sheets['Поток продаж_до'].push(['Обычное','Ресторан '+r,'Зал',dt,'Группа',before[r]]);
      sheets['Поток чеков_до'].push(['Ресторан '+r,'Зал',dt,100]);
    }
  }
  return sheets;
}
function score(sheets,{restaurant=0,...changes}={}){
  const D=E.buildDataset(sheets),f={...E.defaults(D),rankingMethod:'before',...changes};
  const row=E.benchmark(D,f).find(r=>r.name==='Ресторан '+restaurant);return {D,f,row,p:row.details[0]};
}

test('Own before SKP produces expectations 20 and 10, and deviations +10% and +30%',()=>{
  let {row,p}=score(fixture());close(p.beforeRate,100);close(p.networkFactor,1);close(p.expectedShare,.2);close(row.othersRate,20);close(row.deviation,10);
  ({row,p}=score(fixture({before:[50,100,100],after:[65,100,100],novelty:[13,20,20]})));
  close(p.beforeRate,50);close(row.othersRate,10);close(row.deviation,30);
});
test('Network-wide growth adjusts expected SKP instead of reporting a spurious +20%',()=>{
  const {row,p}=score(fixture({after:[120,120,120],novelty:[24,24,24]}));
  close(p.networkFactor,1.2);close(row.othersRate,24);close(row.deviation,0);
});
test('K is the ratio of two means on the same peers, independent of their volume',()=>{
  const sheets=fixture({before:[100,10,20],after:[100,20,20],novelty:[20,4,4]});
  const a=score(sheets);close(a.p.networkBefore,15);close(a.p.networkAfter,20);close(a.p.networkFactor,4/3);assert.equal(a.p.networkRestaurants,2);
  for(const name of ['Поток продаж','Поток продаж_до'])for(const row of sheets[name].slice(1))if(row[1]==='Ресторан 1')row[5]*=17;
  for(const name of ['Поток чеков','Поток чеков_до'])for(const row of sheets[name].slice(1))if(row[0]==='Ресторан 1')row[3]*=17;
  close(score(sheets).p.networkFactor,a.p.networkFactor);
});
test('Target after sales do not change its weights, K or expectation; own before sales do',()=>{
  const sheets=fixture(),a=score(sheets);
  sheets['Поток продаж'].find(r=>r[0]==='Новинка'&&r[1]==='Ресторан 0')[5]*=7;
  sheets['Поток продаж'].find(r=>r[0]==='Обычное'&&r[1]==='Ресторан 0')[5]*=9;
  const b=score(sheets);close(b.p.expectedShare,a.p.expectedShare);close(b.p.networkFactor,a.p.networkFactor);close(b.row.expectedQty,a.row.expectedQty);
  for(const r of sheets['Поток продаж_до'].slice(1))if(r[1]==='Ресторан 0')r[5]*=2;
  const c=score(sheets);close(c.row.expectedQty,2*a.row.expectedQty);close(c.p.networkFactor,a.p.networkFactor);close(c.p.expectedShare,a.p.expectedShare);
  const filtered=score(sheets,{restaurants:new Set([0])});close(filtered.row.expectedQty,c.row.expectedQty);
});
test('Local and before-only dishes reduce visible before coverage and never enter comparable quantities',()=>{
  const sheets=fixture();
  sheets['Поток продаж'].push(['Локальное','Ресторан 0','Зал','2026-05-05','Группа',900]);
  for(let day=-14;day<0;day++)for(const name of ['Локальное','Только до'])sheets['Поток продаж_до'].push([name,'Ресторан 0','Зал',E.addDays('2026-05-05',day),'Группа',50]);
  const {D,p,row}=score(sheets);close(p.beforeRate,100);close(p.beforeCoverage,50);close(row.expectedQty,20);
  assert.deepEqual(p.beforeExcludedItems,['Локальное','Только до']);assert.ok(!D.menuItems.some(i=>i.name==='Только до'));
});
test('Identical overlapping aggregates are counted once; conflicting sales/orders invalidate only affected bases',()=>{
  const sheets=fixture(),first=sheets['Поток продаж_до'][1],check=sheets['Поток чеков_до'][1];
  sheets['Поток продаж'].push([...first]);sheets['Поток чеков'].push([...check]);
  close(score(sheets).p.beforeRate,100);
  sheets['Поток продаж'].at(-1)[5]+=1;assert.equal(score(sheets).p.reason,'source_conflict');
  sheets['Поток продаж'].at(-1)[5]-=1;sheets['Поток чеков'].at(-1)[3]+=1;assert.equal(score(sheets).p.reason,'source_conflict');
  assert.notEqual(score(sheets,{restaurant:2}).row.expectedQty,null);
});
test('Missing group, incomplete global history, no orders, zero before, negative counts and missing checks have distinct reasons',()=>{
  const absent=fixture();delete absent['Поток продаж_до'];delete absent['Поток чеков_до'];assert.equal(score(absent).p.reason,'no_before_group');
  const short=fixture();short['Поток продаж_до']=short['Поток продаж_до'].filter((r,i)=>i===0||r[3]!=='2026-04-21');assert.equal(score(short).p.reason,'incomplete_history');
  const noOrders=fixture();noOrders['Поток продаж_до']=noOrders['Поток продаж_до'].filter((r,i)=>i===0||r[1]!=='Ресторан 0');noOrders['Поток чеков_до']=noOrders['Поток чеков_до'].filter((r,i)=>i===0||r[0]!=='Ресторан 0');assert.equal(score(noOrders).p.reason,'no_orders');
  const zero=fixture({before:[0,100,100]});assert.equal(score(zero).p.reason,'zero_before');
  const negative=fixture();negative['Поток продаж_до'][1][5]=-1;assert.equal(score(negative).p.reason,'negative_counts');
  const missing=fixture();missing['Поток чеков_до'].splice(1,1);assert.equal(score(missing).p.reason,'incomplete_orders');
  const empty=fixture({before:[100,0,0]});assert.equal(score(empty).p.reason,'no_network_base');
});
test('Missing channels and peers with invalid periods are excluded from both halves of K',()=>{
  const sheets=fixture({before:[100,10,20],after:[100,20,20],novelty:[20,4,4]});
  sheets['Поток чеков_до'].splice(sheets['Поток чеков_до'].findIndex(r=>r[0]==='Ресторан 1'),1);
  const {p}=score(sheets);assert.equal(p.networkRestaurants,1);close(p.networkBefore,20);close(p.networkAfter,20);close(p.networkFactor,1);
  sheets['Поток продаж'].push(['Новинка','Ресторан 0','Интернет-магазин','2026-05-05','Группа',10],['Обычное','Ресторан 0','Интернет-магазин','2026-05-05','Группа',90]);
  sheets['Поток чеков'].push(['Ресторан 0','Интернет-магазин','2026-05-05',100]);
  const {row}=score(sheets);assert.equal(row.details.find(p=>p.channel!==0).expectedQty,null);close(row.coverage,100*20/30);
});
test('A known zero after participates in K, and K=0 keeps expectation zero with no percent rating',()=>{
  const sheets=fixture();
  // A third peer provides positive weights but has no before base. The paired peer has zero selected-period sales.
  for(const r of sheets['Поток продаж'].slice(1))if(r[1]==='Ресторан 1')r[3]='2026-05-06';
  sheets['Поток чеков'].push(['Ресторан 1','Зал','2026-05-06',100]);
  for(const r of sheets['Поток продаж_до'].slice(1))if(r[1]==='Ресторан 2')r[5]=0;
  const {row,p}=score(sheets,{end:'2026-05-05'});assert.equal(p.networkRestaurants,1);close(p.networkAfter,0);close(p.networkFactor,0);assert.equal(row.expectedQty,0);assert.equal(row.deviation,null);
});
test('Invalid own after days are excluded, while zero-sale days with valid orders still contribute',()=>{
  const sheets=fixture();
  for(let day=6;day<=7;day++){
    for(let r=0;r<3;r++){
      const dt='2026-05-0'+day;sheets['Поток чеков'].push(['Ресторан '+r,'Зал',dt,100]);
      if(r!==0)sheets['Поток продаж'].push(['Новинка','Ресторан '+r,'Зал',dt,'Группа',20],['Обычное','Ресторан '+r,'Зал',dt,'Группа',80]);
    }
  }
  sheets['Поток продаж'].push(['Новинка','Ресторан 0','Зал','2026-05-06','Группа',5],['Обычное','Ресторан 0','Зал','2026-05-06','Группа',-1]);
  const {row,p}=score(sheets);assert.deepEqual(p.excludedDays,[{date:'2026-05-06',reason:'negative_counts'}]);close(row.expectedQty,40);assert.equal(row.comparisonQty,22);close(row.coverage,100*22/27);assert.equal(row.comparisonOrders,200);
});
test('Adding before sources changes none of the two old models, arrays, assortment or filter defaults',()=>{
  const full=fixture(),bare={...full};delete bare['Поток продаж_до'];delete bare['Поток чеков_до'];
  const a=E.buildDataset(bare),b=E.buildDataset(full);
  for(const k of ['sales','orders','menuSales','menuAvailability','availability','restaurants','channels','minDate','maxDate'])assert.deepEqual(a[k],b[k]);
  assert.deepEqual(E.defaults(a),E.defaults(b));assert.deepEqual(E.calculate(a,E.defaults(a)),E.calculate(b,E.defaults(b)));
  for(const method of ['weights','classic'])assert.deepEqual(E.benchmark(a,{...E.defaults(a),rankingMethod:method}),E.benchmark(b,{...E.defaults(b),rankingMethod:method}));
});

function twoLaunches(){
  const sheets=fixture();
  sheets['СПР'].push(['Следующий запуск','Группа',0,'2026-05-19']);
  sheets['Поток продаж']=[saleHeader];sheets['Поток чеков']=[orderHeader];
  for(let day=5;day<=19;day++)for(let r=0;r<3;r++){
    const dt='2026-05-'+String(day).padStart(2,'0');
    sheets['Поток продаж'].push(['Обычное','Ресторан '+r,'Зал',dt,'Группа',day<19?80:64],['Новинка','Ресторан '+r,'Зал',dt,'Группа',day<19?20:16]);
    if(day===19)sheets['Поток продаж'].push(['Следующий запуск','Ресторан '+r,'Зал',dt,'Группа',20]);
    sheets['Поток чеков'].push(['Ресторан '+r,'Зал',dt,100]);
  }
  return sheets;
}
test('Different launches keep fixed before windows; the later launch can use primary sheets alone',()=>{
  const sheets=twoLaunches(),a=score(sheets),b=score(sheets,{start:'2026-05-10'});
  assert.deepEqual(a.row.details.map(p=>[p.beforeStart,p.beforeEnd]),[['2026-04-21','2026-05-04'],['2026-05-05','2026-05-18']]);
  assert.deepEqual(b.row.details.map(p=>[p.beforeStart,p.beforeEnd]),a.row.details.map(p=>[p.beforeStart,p.beforeEnd]));
  close(b.row.details[1].beforeRate,100);
  delete sheets['Поток продаж_до'];delete sheets['Поток чеков_до'];
  const {row}=score(sheets);assert.equal(row.details[0].reason,'no_before_group');close(row.details[1].expectedQty,20);assert.equal(row.details[1].reason,null);
});
test('Daily shares change at the next launch; expected SKP uses one union across both dishes',()=>{
  const {row,D,f}=score(twoLaunches());
  close(row.details[0].expectedQty,296);close(row.details[0].expectedShare,(14*.2+.16)/15);close(row.details[1].expectedQty,20);
  assert.equal(row.comparisonQty,316);assert.equal(row.comparisonOrders,1500);close(row.othersRate,100*316/1500);close(row.deviation,0);
  const one=E.benchmark(D,{...f,start:'2026-05-19'})[0];close(one.expectedQty,36);assert.equal(one.comparisonOrders,100);close(one.othersRate,36);
});
test('Disconnected alternatives are excluded, while a known zero novelty weight stays a valid zero',()=>{
  const disconnected=fixture();disconnected['Поток продаж']=disconnected['Поток продаж'].filter(r=>!(r[0]==='Новинка'&&r[1]==='Ресторан 2'));
  for(const r of disconnected['Поток продаж'].slice(1))if(r[1]==='Ресторан 2')r[0]='Несвязанное';
  disconnected['Поток продаж'].push(['Несвязанное','Ресторан 0','Зал','2026-05-05','Группа',500]);
  const a=score(disconnected);close(a.row.expectedQty,20);assert.equal(a.p.networkRestaurants,1);assert.ok(a.p.localItems.includes('Несвязанное'));
  const zero=fixture();for(const r of zero['Поток продаж'].slice(1))if(r[0]==='Новинка'&&r[1]!=='Ресторан 0')r[3]='2026-05-06';
  for(let r=1;r<=2;r++)zero['Поток чеков'].push(['Ресторан '+r,'Зал','2026-05-06',100]);
  const b=score(zero,{end:'2026-05-05'});assert.equal(b.p.reason,null);assert.equal(b.p.expectedShare,0);assert.equal(b.row.expectedQty,0);assert.equal(b.row.deviation,null);
});
test('A group with no before source removes only its own part and leaves a truthful partial menu score',()=>{
  const sheets=fixture();sheets['СПР'].push(['Новый суп','Супы',1,'2026-05-05']);
  for(let r=0;r<3;r++)sheets['Поток продаж'].push(['Новый суп','Ресторан '+r,'Зал','2026-05-05','Супы',10],['Обычный суп','Ресторан '+r,'Зал','2026-05-05','Супы',90]);
  const {D,f,row}=score(sheets);assert.equal(row.qty,32);assert.equal(row.comparisonQty,22);close(row.expectedQty,20);close(row.coverage,100*22/32);assert.equal(row.comparisonOrders,100);
  const soup=E.benchmark(D,{...f,dishes:new Set([1])})[0];assert.equal(soup.expectedQty,null);assert.equal(soup.details[0].reason,'no_before_group');
});
test('Serialized data preserves history, all new-model results and independent caches after a reload',()=>{
  const {D,f,row}=score(twoLaunches()),loaded=JSON.parse(JSON.stringify(D));
  assert.deepEqual(E.benchmark(loaded,f).find(r=>r.id===row.id),row);
  const changed=twoLaunches();for(const r of changed['Поток продаж_до'].slice(1))if(r[1]==='Ресторан 0')r[5]*=2;
  const next=score(changed).row;
  close(next.details[0].expectedQty,2*row.details[0].expectedQty);
  close(next.details[1].expectedQty,row.details[1].expectedQty); // Later launch uses the unchanged primary history.
  close(next.expectedQty,2*row.details[0].expectedQty+row.details[1].expectedQty);
  assert.deepEqual(E.benchmark(D,f).find(r=>r.id===row.id),row);
});
test('Irregular before channels need no daily orders; an incomplete peer after period is removed from both means',()=>{
  const sheets=fixture({before:[100,10,20],after:[100,20,20],novelty:[20,4,4]});
  const keep=new Set(['2026-04-21','2026-05-04']);
  sheets['Поток продаж_до']=sheets['Поток продаж_до'].filter((r,i)=>i===0||r[1]!=='Ресторан 0'||keep.has(r[3]));
  sheets['Поток чеков_до']=sheets['Поток чеков_до'].filter((r,i)=>i===0||r[0]!=='Ресторан 0'||keep.has(r[2]));
  const a=score(sheets);close(a.p.beforeRate,100);close(a.p.networkFactor,4/3);
  sheets['Поток чеков']=sheets['Поток чеков'].filter((r,i)=>i===0||r[0]!=='Ресторан 1');
  const b=score(sheets);assert.equal(b.p.networkRestaurants,1);close(b.p.networkBefore,20);close(b.p.networkAfter,20);close(b.p.networkFactor,1);
});

module.exports={fixture,saleHeader,orderHeader};
