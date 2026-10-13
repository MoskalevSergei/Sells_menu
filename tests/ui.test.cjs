const test=require('node:test'),assert=require('node:assert/strict'),{createUI}=require('./ui-harness.cjs'),{buildHtml}=require('../scripts/build.cjs');
test('All dashboard tabs, comparison details and exports work with demonstration data',()=>{
  const {data}=buildHtml(),ui=createUI(data);assert.ok(ui.get('dataMeta').textContent.includes('Демонстрационные данные'));assert.ok(!ui.get('dishPicker').innerHTML.includes('Блюдо без продаж'));
  for(const tab of ['overview','dishes','restaurants','channels']){ui.click({tab});assert.ok(ui.get('content').innerHTML.length>500);assert.ok(!/<th[^>]*>Заказы|data-sort="orders"/.test(ui.get('content').innerHTML));assert.ok(!ui.get('content').innerHTML.includes('Не продаётся'));assert.ok(ui.api.getExport().rows.length>0);}
  ui.click({tab:'restaurants'});const rows=ui.api.getBenchmark();assert.equal(rows.filter(r=>r.deviation!==null).length,3);assert.ok(rows.some(r=>r.coverage<100));ui.click({expectation:String(rows[0].id)});assert.ok(ui.get('dishDialog').innerHTML.includes('Ожидаемая доля'));ui.get('dishDialog').close();
  ui.click({restview:'matrix'});assert.ok(ui.get('content').innerHTML.includes('<tfoot>'));assert.ok(ui.api.getExport().headers.at(-1)==='Итого');
  ui.click({tab:'channels'});for(const metric of ['qty','rate']){ui.control('channelMetric',metric);const out=ui.api.getExport();for(const r of out.rows){const d=ui.api.getContext().dishRows.find(d=>d.name===r[0]);assert.equal(r.at(-1),d[metric]);}}
  ui.click({tab:'overview'});ui.control('metric','rate');const out=ui.api.getExport();assert.equal(out.rows.at(-1).at(-1),ui.api.getContext().rate);
  ui.get('endDate').value='2026-01-18';ui.get('endDate').handlers.change();ui.click({tab:'dishes'});assert.ok(!ui.get('content').innerHTML.includes('Новое блюдо 3'));
});
test('The third rating mode is available everywhere and exposes coverage, reasons and a named CSV model',()=>{
  const {data}=buildHtml(),ui=createUI(data);assert.equal(ui.api.getFilters().rankingMethod,'before');
  assert.ok(ui.get('content').innerHTML.includes('С учётом СКП до запуска'));
  ui.click({tab:'restaurants'});
  const rows=ui.api.getBenchmark();assert.ok(rows.every(r=>r.model==='before'&&r.expectedQty!==null));
  const out=ui.api.getExport();assert.equal(out.headers[0],'Модель рейтинга');assert.ok(out.rows.every(r=>r[0]==='С учётом СКП до запуска'));
  assert.ok(out.headers.includes('Факт в сравнении, шт.'));assert.ok(out.headers.includes('Охват продаж, %'));assert.ok(!out.headers.some(h=>/^Заказы|количество заказов/i.test(h)));
  ui.click({expectation:String(rows[0].id)});
  for(const text of ['До запуска','После запуска','СКП группы до','Охват базы до','СКП сети до','СКП сети после','Ресторанов для K','Ресторанов для весов','Ожидаемая доля'])assert.ok(ui.get('dishDialog').innerHTML.includes(text),text);
  assert.ok(!/<th[^>]*>Заказы|\bdata-sort="orders"/.test(ui.get('dishDialog').innerHTML));
  ui.get('dishDialog').close();ui.click({dish:'0'});assert.ok(!ui.get('dishDialogBody').innerHTML.includes('data-control="rankingMethod"'));assert.ok(ui.get('dishDialogBody').innerHTML.includes('Ожидание учитывает СКП сопоставимой части группы'));
  ui.control('rankingMethod','classic');assert.equal(ui.api.getFilters().rankingMethod,'classic');ui.get('dishDialog').close();
});
function overviewFixture(){
  const E=require('../src/engine.js');
  return E.buildDataset({
    'СПР':[['Код','Позиция','группа','Новое','старт'],[1,'Раннее','Группа',1,'2026-05-05'],[2,'Позднее','Группа',0,'2026-05-06'],[3,'Вне запуска','Группа',1,'2026-05-05'],[4,'Известный ноль','Группа',1,'2026-05-05']],
    'Рестораны_Блюдо':[['Код','Ресторан'],[1,'Ресторан 1'],[1,'Ресторан 2'],[2,'Ресторан 1'],[3,'Ресторан 2'],[4,'Ресторан 1']],
    'Поток продаж':[['Позиция','Ресторан','Подразделение','Дата','Группа меню','Позиций'],['Раннее','Ресторан 1','Зал','2026-05-05','Группа',4],['Раннее','Ресторан 1','Зал','2026-05-06','Группа',1],['Раннее','Ресторан 1','Интернет-магазин','2026-05-05','Группа',20],['Позднее','Ресторан 1','Зал','2026-05-06','Группа',12],['Вне запуска','Ресторан 2','Зал','2026-05-05','Группа',99],['Известный ноль','Ресторан 1','Зал','2026-05-07','Группа',2]],
    'Поток чеков':[['Ресторан','Подразделение','Дата','Заказы'],['Ресторан 1','Зал','2026-05-05',100],['Ресторан 1','Зал','2026-05-06',50],['Ресторан 1','Зал','2026-05-07',100],['Ресторан 1','Интернет-магазин','2026-05-05',1000],['Ресторан 2','Зал','2026-05-05',100]]
  });
}
function filteredOverview(){
  const data=overviewFixture(),ui=createUI(data),f=ui.api.getFilters();
  f.restaurants=new Set([data.restaurants.indexOf('Ресторан 1')]);f.channels=new Set([data.channels.indexOf('Зал')]);
  ui.get('endDate').value='2026-05-06';ui.get('endDate').handlers.change();return {data,ui,f};
}
test('Overview sorts all dishes across launches by a date or total, keeps missing cells last and preserves union totals',()=>{
  const {ui}=filteredOverview(),names=()=>Array.from(ui.api.getExport().rows.slice(0,-1),r=>r[0]);
  ui.click({dailySort:'total'});assert.deepEqual(names(),['Позднее','Раннее','Известный ноль']);
  assert.equal(ui.api.getExport().rows.at(-1).at(-1),17);
  ui.click({dailySort:'total'});assert.deepEqual(names(),['Известный ноль','Раннее','Позднее']);
  ui.click({dailySort:'2026-05-05'});assert.deepEqual(names(),['Раннее','Известный ноль','Позднее']);
  ui.click({dailySort:'2026-05-05'});assert.deepEqual(names(),['Известный ноль','Раннее','Позднее']);
  ui.click({dailySort:'2026-05-06'});assert.deepEqual(names(),['Позднее','Раннее','Известный ноль']);
  ui.control('metric','rate');assert.equal(ui.api.getExport().rows.at(-1).at(-1),17/150*100);
  ui.get('startDate').value='2026-05-06';ui.get('startDate').handlers.change();
  assert.ok(!ui.get('content').innerHTML.includes('data-daily-sort="2026-05-05"'));
});
test('Overview hides dishes without selected restaurant/channel data while retaining confirmed zero sales',()=>{
  const {data,ui,f}=filteredOverview();assert.ok(!ui.get('content').innerHTML.includes('Вне запуска'));
  assert.ok(ui.get('content').innerHTML.includes('Известный ноль'));assert.equal(ui.api.getContext().qty,17);
  f.channels=new Set([data.channels.indexOf('Интернет-магазин')]);ui.click({tab:'overview'});
  assert.ok(!ui.get('content').innerHTML.includes('Известный ноль'));assert.ok(!ui.get('content').innerHTML.includes('Позднее'));
  assert.ok(ui.get('content').innerHTML.includes('Раннее'));assert.equal(ui.api.getContext().qty,20);
});
test('New and reset reports default to before, saved explicit methods and overview sort are restored, and dish cards inherit the shared method',()=>{
  const {data,ui,f}=filteredOverview();assert.equal(f.rankingMethod,'before');
  ui.control('rankingMethod','weights');ui.click({dish:'0'});
  assert.ok(!ui.get('dishDialogBody').innerHTML.includes('data-control="rankingMethod"'));
  assert.ok(ui.get('dishDialogBody').innerHTML.includes('Сравнение по общей части ассортимента'));
  ui.get('dishDialog').close();
  const filters=Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v instanceof Set?[...v]:v]));
  const restored=createUI(data,{tab:'overview',filters,metric:'rate',overviewSort:{key:'total',dir:-1}});
  assert.equal(restored.api.getFilters().rankingMethod,'weights');assert.ok(restored.get('content').innerHTML.includes('aria-sort="descending"'));
  assert.equal(restored.api.getExport().rows[0][0],'Позднее');
  restored.api.reset();assert.equal(restored.api.getFilters().rankingMethod,'before');
  assert.ok(restored.get('content').innerHTML.includes('class="launch-row"'));
});
