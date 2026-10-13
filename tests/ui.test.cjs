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
  const {data}=buildHtml(),ui=createUI(data);assert.equal(ui.api.getFilters().rankingMethod,'weights');
  ui.control('rankingMethod','before');assert.ok(ui.get('content').innerHTML.includes('С учётом СКП до запуска'));
  ui.click({tab:'restaurants'});
  const rows=ui.api.getBenchmark();assert.ok(rows.every(r=>r.model==='before'&&r.expectedQty!==null));
  const out=ui.api.getExport();assert.equal(out.headers[0],'Модель рейтинга');assert.ok(out.rows.every(r=>r[0]==='С учётом СКП до запуска'));
  assert.ok(out.headers.includes('Факт в сравнении, шт.'));assert.ok(out.headers.includes('Охват продаж, %'));assert.ok(!out.headers.some(h=>/^Заказы|количество заказов/i.test(h)));
  ui.click({expectation:String(rows[0].id)});
  for(const text of ['До запуска','После запуска','СКП группы до','Охват базы до','СКП сети до','СКП сети после','Ресторанов для K','Ресторанов для весов','Ожидаемая доля'])assert.ok(ui.get('dishDialog').innerHTML.includes(text),text);
  assert.ok(!/<th[^>]*>Заказы|\bdata-sort="orders"/.test(ui.get('dishDialog').innerHTML));
  ui.get('dishDialog').close();ui.click({dish:'0'});assert.ok(ui.get('dishDialogBody').innerHTML.includes('value="before" selected'));
  ui.control('rankingMethod','classic');assert.equal(ui.api.getFilters().rankingMethod,'classic');ui.get('dishDialog').close();
});
