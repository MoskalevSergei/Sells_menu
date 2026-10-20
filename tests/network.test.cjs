const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js'),{networkSheets}=require('./network-fixture.cjs');
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,`${a} != ${b}`);
const summary=(s,changes={})=>{const D=E.buildDataset(s),f={...E.defaults(D),...changes};return {D,f,S:E.networkSummary(D,f)};};
test('Network SKP is order weighted: 900 at 10 and 100 at 20 give 11; mix alone gives actual 19 but standardized 11',()=>{
  let {S}=summary(networkSheets());let t=S.launches[0];near(t.beforeRate,11);near(t.actualAfterRate,11);near(t.standardizedAfterRate,11);near(t.change,0);near(S.overall.rate,2.2);
  ({S}=summary(networkSheets({afterOrders:[100,900]})));t=S.launches[0];near(t.beforeRate,11);near(t.actualAfterRate,19);near(t.standardizedAfterRate,11);near(t.change,0);near(t.mixEffect,8);assert.equal(t.directionsDiffer,true);
  ({S}=summary(networkSheets({dishes:[{name:'Новинка',group:'Группа',type:1,start:'2026-05-05',share:1}]})));near(S.overall.rate,11);near(S.types[0].rate,11);
});
test('Full groups grow 20% while novelties at expectation have zero model deviation; rating mode cannot change group dynamics',()=>{
  const {D,f,S}=summary(networkSheets({afterRates:[12,24]}));near(S.launches[0].percent,20);near(S.overall.deviation,0);near(S.types[0].deviation,0);
  const varied=summary(networkSheets({afterRates:[12,20]}));
  for(const rankingMethod of ['weights','classic']){
    const other=E.networkSummary(varied.D,{...varied.f,rankingMethod});assert.deepEqual(other.launches,varied.S.launches);assert.notEqual(other.overall.expectedQty,varied.S.overall.expectedQty);
  }
});
test('Contributions add to the standardized change by pairs, restaurants, channels and groups on one composition',()=>{
  const {S}=summary(networkSheets({afterRates:[12,18],dishes:[{name:'Новая',group:'Супы',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Салаты',type:0,start:'2026-05-05',share:.1}]}));
  const t=S.launches[0];near(t.beforeRate,22);near(t.actualAfterRate,25.2);near(t.change,3.2);
  for(const dimension of ['pairs','restaurants','channels','groups'])near(t.contributions[dimension].reduce((s,p)=>s+p.change,0),t.change);
  assert.ok(t.contributions.restaurants.some(p=>p.change>0));assert.ok(t.contributions.restaurants.some(p=>p.change<0));
  near(S.overall.comparisonQty,S.types.reduce((sum,p)=>sum+(p.comparisonQty||0),0));near(S.overall.expectedQty,S.types.reduce((sum,p)=>sum+(p.expectedQty||0),0));
});
test('New and seasonal dishes share one group once; different launches keep separate periods and never add an effect',()=>{
  let {S}=summary(networkSheets({dishes:[{name:'Новая',group:'Группа',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Группа',type:0,start:'2026-05-05',share:.1}]}));
  assert.equal(S.launches.length,1);assert.deepEqual(S.launches[0].includedGroups,['Группа']);near(S.launches[0].beforeRate,11);near(S.overall.rate,2.2);
  ({S}=summary(networkSheets({days:14,dishes:[{name:'Новая',group:'Группа',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Группа',type:0,start:'2026-05-12',share:.1}]})));
  assert.equal(S.launches.length,2);assert.equal(S.launches[0].beforeStart,'2026-04-21');assert.equal(S.launches[1].beforeStart,'2026-04-28');
  assert.deepEqual(S.sharedGroups,['Группа']);assert.deepEqual(S.launches[0].nextLaunches,['2026-05-12']);assert.equal(S.launches[0].calendarDays,14);assert.equal(S.launches[1].calendarDays,7);
  assert.equal('combinedChange' in S,false);assert.equal('overallGroupChange' in S,false);
  assert.notEqual(S.overall.rate,S.types.reduce((sum,p)=>sum+(p.rate||0),0));
});
test('Retired and local dishes remain in the full before group, independently of model weights',()=>{
  const {S,D,f}=summary(networkSheets({removedShare:.2}));near(S.launches[0].beforeRate,11);near(S.launches[0].change,0);
  const row=E.benchmark(D,f).find(r=>r.name==='Ресторан 0');near(row.details[0].beforeRate,8);assert.ok(row.details[0].beforeExcludedItems.includes('Снятое Группа'));
});
test('Known premature sales are preserved only for full groups; existing model arrays and results remain unchanged',()=>{
  const base=networkSheets(),changed=structuredClone(base);changed['Поток продаж_до'].push(['Новинка','Ресторан 0','Зал','2026-05-04','Группа',5]);
  const a=summary(base),b=summary(changed);assert.equal(b.D.fullGroupExtras.before.length,1);
  assert.deepEqual(E.benchmark(a.D,a.f),E.benchmark(b.D,b.f));near(b.S.launches[0].beforeRate,11+5/14000*100);
  changed['Поток продаж'].push(['Новинка','Ресторан 0','Зал','2026-05-04','Группа',5]);
  const c=summary(changed);near(c.S.launches[0].beforeRate,b.S.launches[0].beforeRate);
  const old=JSON.parse(JSON.stringify(b.D));delete old.fullGroupExtras;
  const incomplete=E.networkSummary(old,E.defaults(old));assert.ok(incomplete.launches[0].issues.includes('incomplete_full_groups'));assert.equal(incomplete.overall.qty,b.S.overall.qty);
});
test('Missing group history stays unknown, excluded after sales lower coverage, and current sales remain available',()=>{
  const s=networkSheets({dishes:[{name:'Новая',group:'Известная',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Без истории',type:0,start:'2026-05-05',share:.1}]});
  s['Поток продаж_до']=s['Поток продаж_до'].filter((r,i)=>i===0||r[4]!=='Без истории');
  const {S}=summary(s),t=S.launches[0];assert.deepEqual(t.includedGroups,['Известная']);assert.ok(t.excludedGroups.some(g=>g.group==='Без истории'&&g.reasons.includes('no_before_group')));
  assert.equal(t.coverage.before.percent,null);near(t.coverage.after.percent,50);assert.ok(S.overall.qty>0);assert.ok(S.types[1].qty>0);assert.equal(S.types[1].expectedQty,null);
});
test('Incomplete periods, conflicting overlaps and sales without orders never form false complete comparisons',()=>{
  let s=networkSheets();s['Поток продаж_до']=s['Поток продаж_до'].filter((r,i)=>i===0||r[3]!=='2026-04-22');
  let {S}=summary(s);assert.ok(S.launches[0].issues.includes('incomplete_history'));assert.equal(S.launches[0].beforeRate,null);assert.equal(S.launches[0].coverage.before.percent,null);
  s=networkSheets();const first=s['Поток продаж_до'][1],check=s['Поток чеков_до'][1];s['Поток продаж'].push([...first]);s['Поток чеков'].push([...check]);
  ({S}=summary(s));near(S.launches[0].beforeRate,11);
  s['Поток продаж'].at(-1)[5]+=1;({S}=summary(s));assert.equal(S.launches[0].restaurantCount,1);assert.equal(S.launches[0].coverage.before.percent,null);near(S.launches[0].actualAfterRate,20);
  s=networkSheets();s['Поток чеков']=s['Поток чеков'].filter((r,i)=>i===0||r[0]!=='Ресторан 1');
  ({S}=summary(s));assert.equal(S.launches[0].restaurantCount,1);near(S.launches[0].coverage.after.percent,100*90/110);assert.equal(S.overall.qty,22);
});
test('A conflict in one group removes the pair from all groups, preserving additive contributions on one denominator',()=>{
  const s=networkSheets({dishes:[{name:'А',group:'Группа А',type:1,start:'2026-05-05',share:.1},{name:'Б',group:'Группа Б',type:0,start:'2026-05-05',share:.1}]});
  const row=s['Поток продаж_до'].find(r=>r[0]==='Обычное Группа Б'&&r[1]==='Ресторан 0');s['Поток продаж'].push([...row]);s['Поток продаж'].at(-1)[5]+=1;
  const {S}=summary(s),t=S.launches[0];assert.equal(t.restaurantCount,1);near(t.beforeRate,40);near(t.actualAfterRate,40);near(t.change,0);
  assert.deepEqual(t.contributions.groups.map(g=>g.beforeRate),[20,20]);near(t.contributions.groups.reduce((n,g)=>n+g.change,0),t.change);
});
test('Zero full-group baseline has an absolute change and no percentage; a fully removed group has a known zero after',()=>{
  let {S}=summary(networkSheets({beforeRates:[0,0],afterRates:[10,20]}));let t=S.launches[0];near(t.beforeRate,0);near(t.standardizedAfterRate,11);near(t.change,11);assert.equal(t.percent,null);
  const s=networkSheets({afterRates:[0,0]});s['Поток продаж']=s['Поток продаж'].filter((r,i)=>i===0||r[0]!=='Обычное Группа');
  ({S}=summary(s));t=S.launches[0];near(t.beforeRate,11);near(t.actualAfterRate,0);near(t.change,-11);
});
test('Temporal growth uses two fully loaded equal post-launch windows and never compares novelties to zero before launch',()=>{
  let {S}=summary(networkSheets({days:14,dishes:[{name:'Новинка',group:'Группа',type:1,start:'2026-05-05',share:day=>day<7?.2:.3}]}));
  near(S.launches[0].change,0);near(S.noveltyTrend.percent,50);assert.equal(S.noveltyTrend.completeSelection,true);assert.equal(S.possibleSubstitution,true);
  ({S}=summary(networkSheets({days:7})));assert.equal(S.noveltyTrend.status,'unavailable');assert.equal(S.noveltyTrend.percent,null);assert.equal(S.possibleSubstitution,false);
  const s=networkSheets({days:14});s['Поток продаж']=s['Поток продаж'].filter((r,i)=>i===0||r[3]!=='2026-05-10');
  ({S}=summary(s));assert.equal(S.noveltyTrend.status,'unavailable');
});
test('Filters, explicit selected menu types and serialization preserve summary scope and numbers',()=>{
  const {D,f,S}=summary(networkSheets({days:14}));const selected={...f,restaurants:new Set([0]),dishes:new Set([0])},a=E.networkSummary(D,selected);
  assert.equal(a.scope.title,'По выбранным ресторанам');assert.equal(a.scope.partialRestaurants,true);assert.equal(a.types[1].selected,false);assert.equal(a.types[1].expectedQty,null);
  assert.deepEqual(E.networkSummary(JSON.parse(JSON.stringify(D)),selected),a);
  const direct=E.calculate(D,f),rating=E.benchmark(D,f,direct);assert.deepEqual(E.networkSummary(D,f,direct,rating),S);
});
test('Network expectations sum admissible facts and expectations, never restaurant percentages',()=>{
  const {D,f,S}=summary(networkSheets({afterRates:[12,20]})),rows=E.benchmark(D,f);
  near(S.overall.comparisonQty,rows.reduce((n,r)=>n+r.comparisonQty,0));near(S.overall.expectedQty,rows.reduce((n,r)=>n+r.expectedQty,0));
  near(S.overall.deviation,(S.overall.comparisonQty/S.overall.expectedQty-1)*100);
  assert.ok(Math.abs(S.overall.deviation-rows.reduce((n,r)=>n+r.deviation,0)/rows.length)>1);
});
test('Before-only restaurants and channels reduce before coverage in the full network, and stay outside an explicit restaurant selection',()=>{
  const s=networkSheets();
  for(let day=-14;day<0;day++){
    const dt=E.addDays('2026-05-05',day);s['Поток продаж_до'].push(['Обычное Группа','Закрытый ресторан','Прежний канал',dt,'Группа',110]);s['Поток чеков_до'].push(['Закрытый ресторан','Прежний канал',dt,1000]);
  }
  const {D,f,S}=summary(s),t=S.launches[0];near(t.beforeRate,11);near(t.coverage.before.percent,50);near(t.coverage.after.percent,100);
  assert.ok(t.excludedPairs.some(p=>p.restaurant==='Закрытый ресторан'&&p.channel==='Прежний канал'));
  const selected=E.networkSummary(D,{...f,restaurants:new Set([0])});near(selected.launches[0].coverage.before.percent,100);
  assert.ok(!selected.launches[0].excludedPairs.some(p=>p.restaurant==='Закрытый ресторан'));
});
test('A group absent from all launches at selected restaurants does not become an affected group',()=>{
  const s=networkSheets({dishes:[{name:'А',group:'Группа А',type:1,start:'2026-05-05',share:.1},{name:'Б',group:'Группа Б',type:0,start:'2026-05-05',share:.1}]});
  s['Рестораны_Блюдо']=s['Рестораны_Блюдо'].filter((r,i)=>i===0||!(r[0]==='SYN-1'&&r[1]==='Ресторан 0'));
  const {D,f}=summary(s),S=E.networkSummary(D,{...f,restaurants:new Set([0])});assert.deepEqual(S.scope.groups,['Группа А']);assert.deepEqual(S.launches[0].requestedGroups,['Группа А']);
});
test('Future selected dates do not create fictional observation days or zeros',()=>{
  const {D,f}=summary(networkSheets({days:7})),S=E.networkSummary(D,{...f,end:'2099-12-31'}),t=S.launches[0];
  assert.equal(t.afterEnd,'2026-05-11');assert.equal(t.observedDays,7);assert.equal(t.calendarDays,7);near(t.change,0);
});
test('Group casing cannot double the full-group volume when new and seasonal definitions refer to the same group',()=>{
  const s=networkSheets({dishes:[{name:'Новая',group:'Группа',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Группа',type:0,start:'2026-05-05',share:.1}]});
  s['СПР'][2][2]='группа';const {S}=summary(s);assert.equal(S.launches[0].requestedGroups.length,1);near(S.launches[0].beforeRate,11);near(S.launches[0].actualAfterRate,11);
});
