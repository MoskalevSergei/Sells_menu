const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict'),{buildHtml,root}=require('../scripts/build.cjs');
test('Build is reproducible, standalone and contains only demonstration data',()=>{
  const {html,data}=buildHtml();assert.equal(html,buildHtml().html);assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),html);assert.equal(data.isDemo,true);assert.ok(data.restaurants.every(r=>/^Ресторан \d+$/.test(r)));assert.ok(data.dishes.every(d=>/^(Новое блюдо|Сезонное блюдо|Блюдо без продаж)/.test(d.name)));assert.equal(data.sourceName,'Меню_Продажи_пример.xlsx');
  assert.ok(!/__DATA__|__APP__|__ENGINE__|__ZIP__/.test(html));assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/fetch\(|https:\/\/.*(?:analytics|telemetry)/.test(html));
  assert.ok(html.includes(fs.readFileSync(path.join(root,'src/engine.js'),'utf8')));assert.ok(html.includes(fs.readFileSync(path.join(root,'src/app.js'),'utf8')));assert.ok(html.includes('table th:not(:first-child),table td:not(:first-child){text-align:center}'));
});
