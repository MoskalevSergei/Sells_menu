const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('../src/engine.js'),{createUI}=require('./ui-harness.cjs'),{networkSheets}=require('./network-fixture.cjs');
const narrative=ui=>ui.get('content').innerHTML.match(/<p class="network-conclusion">([\s\S]*?)<\/p>/)?.[1];
const open=(s,filters)=>{const ui=createUI(E.buildDataset(s));if(filters)Object.assign(ui.api.getFilters(),filters);ui.click({tab:'conclusions'});return ui;};
const main=ui=>ui.get('content').innerHTML.split('<details class="network-details"')[0];
const typeCards=html=>[...html.matchAll(/<article class="menu-summary-card" data-summary-type="(\d)">([\s\S]*?)<\/article>/g)];
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,`${a} != ${b}`);
const twoTypes=()=>networkSheets({days:14,afterRates:[12,24],dishes:[{name:'Новая',group:'Группа',type:1,start:'2026-05-05',share:day=>day<7?.2:.1},{name:'Сезонная',group:'Группа',type:0,start:'2026-05-05',share:day=>day<7?.1:.09}]});

test('Overview retains dynamics, launch comparison, dish leaders and restaurant rating without the summary',()=>{
  const ui=createUI(E.buildDataset(networkSheets({days:14,dishes:[{name:'Ранняя',group:'Группа',type:1,start:'2026-05-05',share:.1},{name:'Поздняя',group:'Группа',type:0,start:'2026-05-12',share:.1}]}))),html=ui.get('content').innerHTML;
  for(const label of ['Динамика продаж','Сравнение запусков','Блюда: лидеры по СКП','Рестораны: рейтинг продаж','data-control="rankingMethod"','class="daily-matrix"'])assert.ok(html.includes(label),label);
  assert.ok(!/networkSummary|network-conclusion|id="conclusions"|Итоги по сети/.test(html));
  assert.equal(ui.api.getExport().kind,'dynamics');assert.ok(ui.api.getExport().rows.length>0);assert.equal(ui.get('exportBtn').hidden,false);
});

test('Conclusions follows Overview, uses five accessible tabs and restores the selected tab with filters',()=>{
  const template=fs.readFileSync(path.resolve(__dirname,'../src/template.html'),'utf8'),order=[...template.matchAll(/id="tab-([^" ]+)" data-tab=/g)].map(m=>m[1]);
  assert.deepEqual(order,['overview','conclusions','dishes','restaurants','channels']);
  assert.match(template,/id="tab-conclusions"[^>]+role="tab"[^>]+aria-controls="content"/);
  const D=E.buildDataset(twoTypes()),ui=createUI(D);const down=ui.keyTab('ArrowDown','overview');assert.deepEqual(down,{prevented:true,focusedTab:'conclusions'});
  assert.equal(ui.get('tabTitle').textContent,'Выводы');assert.equal(ui.get('content')['aria-labelledby'],'tab-conclusions');assert.equal(ui.get('exportBtn').hidden,true);assert.equal(ui.api.getExport().rows.length,0);
  assert.equal(ui.tabs.find(t=>t.dataset.tab==='conclusions')['aria-selected'],'true');assert.equal(ui.tabs.find(t=>t.dataset.tab==='conclusions').tabindex,'0');
  assert.equal(ui.keyTab('End','conclusions').focusedTab,'channels');assert.equal(ui.get('exportBtn').hidden,false);
  assert.equal(ui.keyTab('Home','channels').focusedTab,'overview');assert.equal(ui.keyTab('ArrowRight','overview').focusedTab,'conclusions');
  const filters=Object.fromEntries(Object.entries(ui.api.getFilters()).map(([k,v])=>[k,v instanceof Set?[...v]:v]));
  const reopened=createUI(JSON.parse(JSON.stringify(D)),{tab:'conclusions',filters});
  assert.equal(reopened.get('tabTitle').textContent,'Выводы');assert.equal(reopened.get('exportBtn').hidden,true);assert.equal(narrative(reopened),narrative(ui));assert.deepEqual(reopened.api.getNetworkSummary(),ui.api.getNetworkSummary());
});

test('Four short sections reuse the summary, show only two menu metrics and close detail tables by default',()=>{
  const ui=open(twoTypes()),html=ui.get('content').innerHTML,S=ui.api.getNetworkSummary(),text=narrative(ui);
  assert.deepEqual([...html.matchAll(/data-conclusion-section="([^"]+)"/g)].map(m=>m[1]),['result','menus','changes','coverage']);
  for(const label of ['Общий результат','Новое и сезонное','Основные изменения','Охват и ограничения'])assert.ok(main(ui).includes(label),label);
  assert.ok(text.includes('выше исходного уровня'));assert.ok(text.includes('на уровне расчётного ожидания'));assert.ok(text.includes('частота покупки новинок снизилась'));assert.ok(text.includes('сильнее у нового меню'));
  assert.ok(text.length<600);assert.ok(!/шт\.|охват|ожидаемо:|загружено/.test(text));
  assert.equal(typeCards(html).length,2);
  for(const card of typeCards(html)){
    const m=S.types.find(m=>m.type===Number(card[1]));assert.equal((card[2].match(/<dd/g)||[]).length,2);
    for(const key of ['deviation','ratePercent']){const raw=key==='deviation'?m.deviation:m.trend.ratePercent;if(Number.isFinite(raw))assert.ok(card[2].includes(`data-summary-metric="${key}" data-value="${raw}"`),key);}
    assert.ok(!/Факт в сравнении|Продано, шт\.|Ожидаемо, шт\.|Охват сравнения/.test(card[2]));
  }
  assert.ok(!main(ui).includes('<table'));assert.match(html,/<details class="network-details" id="conclusionsDetails"><summary>Подробнее<\/summary>/);
  for(const label of ['Продажи и ожидание','Факт в сравнении, шт.','Ожидаемо, шт.','Методика'])assert.ok(html.includes(label),label);
  assert.ok(!/Одинаковый состав ДО и ПОСЛЕ|Исключённые сочетания|<th>Ресторан \/ канал|Доля структуры ДО|По ресторанам|По каналам/.test(html));
  assert.ok(!/<(?:th|dt)[^>]*>\s*(?:Заказы|Количество заказов|База заказов)/i.test(html));
});

test('Mix changes show actual and standardized rates separately instead of assigning one percentage to both',()=>{
  const ui=open(networkSheets({afterOrders:[100,900],days:14})),html=ui.get('content').innerHTML,text=narrative(ui);
  assert.ok(text.includes('на исходном уровне'));assert.ok(!text.includes('выше исходного уровня'));
  assert.match(html,/data-summary-metric="groupPercent" data-value="0">0%/);
  assert.ok(main(ui).includes('с учётом структуры ресторанов и каналов'));
  assert.match(main(ui),/Фактический СКП: <strong>11,00 → 19,00<\/strong> \(\+72,7% фактически\)/);
  assert.ok(html.includes('Разные направления связаны с изменением долей ресторанов и каналов'));
  assert.ok(html.includes('СКП ПОСЛЕ при структуре ДО: <strong>11,00</strong>'));
});

test('Shared restaurant, channel, menu, dish, group, launch and date filters constrain conclusions and model changes affect only expectation',()=>{
  const sheets=networkSheets({afterRates:[12,20],days:14,dishes:[{name:'Новая',group:'Супы',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Салаты',type:0,start:'2026-05-05',share:.1}]}),ui=open(sheets),f=ui.api.getFilters();
  f.restaurants=new Set([0]);f.dishes=new Set([0]);f.groups=new Set(['Супы']);f.type='1';ui.click({tab:'conclusions'});
  let S=ui.api.getNetworkSummary();assert.equal(S.scope.title,'По выбранным ресторанам');assert.ok(main(ui).includes('Выбранные блюда и группы'));assert.ok(main(ui).includes('По выбранным ресторанам'));
  assert.equal(S.types[1].selected,false);assert.ok(typeCards(main(ui))[1][2].includes('Этот тип меню не входит в текущий выбор'));assert.ok(!narrative(ui).includes('Сезонное меню'));
  const dynamics=JSON.stringify(S.launches),weekly=JSON.stringify(S.types.map(m=>m.trend)),beforeExpected=S.overall.expectedQty;
  ui.control('rankingMethod','classic');S=ui.api.getNetworkSummary();assert.notEqual(S.overall.expectedQty,beforeExpected);assert.equal(JSON.stringify(S.launches),dynamics);assert.equal(JSON.stringify(S.types.map(m=>m.trend)),weekly);
  f.channels=new Set();ui.click({tab:'conclusions'});assert.ok(ui.get('content').innerHTML.includes('каналы не выбраны'));assert.ok(ui.get('content').innerHTML.includes('выберите рестораны и каналы'));assert.equal(ui.api.getNetworkSummary().overall.rate,null);
  f.channels=new Set([0]);f.launches=new Set();ui.click({tab:'conclusions'});assert.equal(ui.api.getNetworkSummary().launches.length,0);assert.ok(!narrative(ui).includes('выше исходного уровня'));
  f.launches=new Set(['2026-05-05']);ui.get('startDate').value='2026-05-12';ui.get('startDate').handlers.change();assert.equal(ui.api.getNetworkSummary().types[0].trend.status,'unavailable');assert.ok(main(ui).includes('Для недельной динамики пока недостаточно данных'));
});

test('Partial rating coverage and partial menu filters qualify the narrative instead of claiming the whole menu',()=>{
  const sheets=networkSheets({days:14,dishes:[{name:'Известная новинка',group:'С историей',type:1,start:'2026-05-05',share:.1},{name:'Новая без истории',group:'Без истории',type:1,start:'2026-05-05',share:.1}]});
  sheets['Поток продаж_до']=sheets['Поток продаж_до'].filter((row,i)=>i===0||row[4]!=='Без истории');
  const ui=open(sheets),f=ui.api.getFilters();
  near(ui.api.getNetworkSummary().types[0].coverage,50);near(ui.api.getNetworkSummary().types[0].deviation,0);
  assert.ok(narrative(ui).includes('Сопоставимая часть нового меню на уровне расчётного ожидания'));
  assert.ok(!narrative(ui).includes('Новое меню на уровне расчётного ожидания'));
  f.type='1';ui.click({tab:'conclusions'});near(ui.api.getNetworkSummary().types[0].coverage,50);
  assert.ok(narrative(ui).includes('Сопоставимая часть выбранных новых блюд на уровне расчётного ожидания'));
  f.dishes=new Set([0]);f.groups=new Set(['С историей']);ui.click({tab:'conclusions'});near(ui.api.getNetworkSummary().types[0].coverage,100);
  assert.ok(narrative(ui).includes('Выбранные новые блюда на уровне расчётного ожидания'));
  assert.ok(!narrative(ui).includes('Новое меню на уровне расчётного ожидания'));
});

test('Falling units at unchanged weekly SKP never describe a fall in purchase frequency',()=>{
  const sheets=twoTypes();
  for(const row of sheets['Поток продаж'].slice(1))if(row[3]>='2026-05-12')row[5]*=.5;
  for(const row of sheets['Поток чеков'].slice(1))if(row[2]>='2026-05-12')row[3]*=.5;
  // Remove the fixture share decline while retaining the lower traffic and quantities.
  for(const row of sheets['Поток продаж'].slice(1))if(row[3]>='2026-05-12'){
    if(row[0]==='Новая')row[5]*=2;
    if(row[0]==='Сезонная')row[5]*=10/9;
  }
  const ui=open(sheets),S=ui.api.getNetworkSummary(),text=narrative(ui);
  for(const m of S.types){assert.ok(m.trend.qtyRecent<m.trend.qtyPrevious);near(m.trend.ratePrevious,m.trend.rateRecent);near(m.trend.ratePercent,0);}
  assert.ok(text.includes('частота покупки новинок не изменилась'));assert.ok(!/частота покупки[^.]*снизилась/.test(text));
  for(const card of typeCards(main(ui)))assert.match(card[2],/data-summary-metric="ratePercent" data-value="0">0%/);
});

test('Missing history, partial weeks and overlapping launches stay explicit without false zeros or a pooled group effect',()=>{
  const sheets=networkSheets({days:7});delete sheets['Поток продаж_до'];delete sheets['Поток чеков_до'];
  const ui=open(sheets),S=ui.api.getNetworkSummary(),html=ui.get('content').innerHTML;
  assert.ok(S.overall.qty>0);assert.equal(S.overall.expectedQty,null);assert.ok(html.includes('Нет данных группы до запуска'));assert.ok(!narrative(ui).includes('выше исходного уровня'));
  assert.ok(main(ui).includes('Первые 7 дней наблюдения'));assert.ok(main(ui).includes('Для недельной динамики пока недостаточно данных'));assert.ok(main(ui).includes('есть ограничения'));assert.ok(html.includes('Продано, шт.'));
  const multi=open(networkSheets({days:14,dishes:[{name:'Новая',group:'Группа',type:1,start:'2026-05-05',share:.1},{name:'Сезонная',group:'Группа',type:0,start:'2026-05-12',share:.1}]})),M=multi.api.getNetworkSummary();
  assert.equal(M.launches.length,2);assert.deepEqual([...main(multi).matchAll(/data-summary-launch="([^"]+)"/g)].map(m=>m[1]),['2026-05-05','2026-05-12']);
  assert.ok(main(multi).includes('У каждого запуска своя база до'));assert.ok(main(multi).includes('Изменения разных запусков не складываются'));
  assert.ok(multi.get('content').innerHTML.includes('Период включает следующий запуск'));assert.ok(!/combinedChange|overallGroupChange/.test(multi.get('content').innerHTML));
});

test('Main changes show at most two largest positive and two largest negative group contributions',()=>{
  const dishes=Array.from({length:6},(_,i)=>({name:'Новинка '+i,group:'Группа '+i,type:i%2,start:'2026-05-05',share:.1})),sheets=networkSheets({days:14,dishes});
  const factors=[1.5,1.4,1.1,.9,.6,.5];
  for(const row of sheets['Поток продаж'].slice(1))row[5]*=factors[Number(row[4].slice(-1))];
  const ui=open(sheets),html=main(ui),section=html.match(/data-conclusion-section="changes">([\s\S]*?)<section class="conclusion-section" data-conclusion-section="coverage"/)[1];
  assert.equal((section.match(/<li>/g)||[]).length,4);
  for(const group of ['Группа 0','Группа 1','Группа 4','Группа 5'])assert.ok(section.includes(group),group);
  for(const group of ['Группа 2','Группа 3'])assert.ok(!section.includes(group),group);
});
