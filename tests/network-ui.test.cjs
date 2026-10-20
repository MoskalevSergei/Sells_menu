const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js'),{createUI}=require('./ui-harness.cjs'),{networkSheets}=require('./network-fixture.cjs');
const narrative=ui=>ui.get('content').innerHTML.match(/<p class="network-conclusion">([\s\S]*?)<\/p>/)?.[1];
test('Overview starts with one locally computed network summary; text and card metrics share its result',()=>{
  const D=E.buildDataset(networkSheets({afterRates:[12,24]})),ui=createUI(D),html=ui.get('content').innerHTML,S=ui.api.getNetworkSummary();
  assert.ok(html.indexOf('id="networkSummary"')<html.indexOf('class="daily-matrix"'));
  assert.ok(narrative(ui).includes('выросла на 20,0%'));assert.ok(narrative(ui).includes('отклонение от ожидания 0%'));
  for(const metric of ['qty','rate','comparisonQty','expectedQty','deviation','coverage']){
    if(Number.isFinite(S.overall[metric]))assert.ok(html.includes(`data-summary-metric="${metric}" data-value="${S.overall[metric]}"`),metric);
  }
  assert.ok(!/<(?:th|dt)[^>]*>\s*(?:Заказы|Количество заказов|База заказов)/i.test(html));
  assert.ok(!ui.api.getExport().headers.some(h=>/^(?:Заказы|Количество заказов|База заказов)/i.test(h)));
});
test('Mix changes are explained without calling the standardized rate actual or claiming a group increase',()=>{
  const ui=createUI(E.buildDataset(networkSheets({afterOrders:[100,900]}))),text=narrative(ui),html=ui.get('content').innerHTML;
  assert.ok(text.includes('не изменилась'));assert.ok(text.includes('11,00 → 19,00'));assert.ok(text.includes('изменением долей ресторанов и каналов'));
  assert.ok(html.includes('СКП ПОСЛЕ при структуре ДО'));assert.ok(html.includes('Фактический СКП ДО → ПОСЛЕ'));
});
test('Restaurant, dish and type filters constrain the narrative; changing model updates expectations and saved views reproduce the text',()=>{
  const D=E.buildDataset(networkSheets({afterRates:[12,20],dishes:[{name:'Новая',group:'Супы',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Салаты',type:0,start:'2026-05-05',share:.1}]})),ui=createUI(D),f=ui.api.getFilters();
  f.restaurants=new Set([0]);f.dishes=new Set([0]);f.groups=new Set(['Супы']);ui.click({tab:'overview'});
  let S=ui.api.getNetworkSummary();assert.equal(S.scope.title,'По выбранным ресторанам');assert.ok(ui.get('content').innerHTML.includes('Выбранные блюда и группы'));
  assert.equal(S.types[1].selected,false);assert.ok(ui.get('content').innerHTML.includes('Этот тип меню не входит в текущий выбор'));
  const dynamics=JSON.stringify(S.launches),beforeExpected=S.overall.expectedQty;
  ui.control('rankingMethod','classic');S=ui.api.getNetworkSummary();assert.notEqual(S.overall.expectedQty,beforeExpected);assert.equal(JSON.stringify(S.launches),dynamics);
  const saved={tab:'overview',filters:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v instanceof Set?[...v]:v]))};
  const reopened=createUI(JSON.parse(JSON.stringify(D)),saved);assert.equal(narrative(reopened),narrative(ui));assert.deepEqual(reopened.api.getNetworkSummary(),S);
});
test('Missing history keeps sales visible and names the missing source; short observations do not invent novelty growth',()=>{
  const s=networkSheets({days:7});delete s['Поток продаж_до'];delete s['Поток чеков_до'];
  const ui=createUI(E.buildDataset(s)),S=ui.api.getNetworkSummary(),html=ui.get('content').innerHTML;
  assert.ok(S.overall.qty>0);assert.equal(S.overall.expectedQty,null);assert.ok(narrative(ui).includes('Нет данных группы до запуска'));
  assert.ok(html.includes('Первые 7 дней наблюдения'));assert.ok(!narrative(ui).includes('Рост продаж выбранных новинок'));
  ui.api.getFilters().restaurants=new Set();ui.click({tab:'overview'});
  assert.ok(ui.get('content').innerHTML.includes('id="networkSummary"'));assert.ok(ui.get('content').innerHTML.includes('выберите рестораны и каналы'));
});
