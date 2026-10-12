const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const {demoSheets}=require('../scripts/demo.cjs'),{workbookBytes}=require('../scripts/generate-example.cjs'),JSZip=require('../vendor/jszip.min.js'),{DOMParser}=require('./xml-dom.cjs');
const box={DOMParser,JSZip,Intl,Date,Set,Map,JSON,Number,String,Math,console,module:{exports:{}}};vm.createContext(box);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/engine.js'),'utf8'),box);const E=box.module.exports;
const file=(bytes,name='Меню_Продажи_пример.xlsx')=>({name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
test('Real XLSX ZIP/XML reader matches the synthetic source tables',async()=>{
  const sheets=demoSheets(),expected=E.buildDataset(sheets),actual=await E.parseXlsx(file(await workbookBytes(sheets),'Отчет_МЕНЮ_ПРОДАЖИ_пример.XLSX'));
  for(const k of ['dishes','restaurants','channels','sales','orders','menuItems','menuSales','availability','menuAvailability'])assert.equal(JSON.stringify(actual[k]),JSON.stringify(expected[k]),k);
  assert.equal(actual.missingOrderSales.length,0);const a=E.calculate(actual,E.defaults(actual)),b=E.calculate(expected,E.defaults(expected));assert.equal(a.qty,b.qty);assert.equal(a.rate,b.rate);
  const changed=demoSheets(),sale=changed['Поток продаж'].find(r=>r[0]==='Новое блюдо 1');sale[5]+=10;
  const next=await E.parseXlsx(file(await workbookBytes(changed))),result=E.calculate(next,E.defaults(next));assert.equal(result.qty,a.qty+10);assert.equal(result.orders,a.orders);
});
test('Swapped group and quantity headings are detected from the data',async()=>{
  const sheets=demoSheets();[sheets['Поток продаж'][0][4],sheets['Поток продаж'][0][5]]=[sheets['Поток продаж'][0][5],sheets['Поток продаж'][0][4]];
  const d=await E.parseXlsx(file(await workbookBytes(sheets)));assert.equal(d.audit.groupQtySwapped,true);assert.equal(E.calculate(d,E.defaults(d)).qty,E.calculate(E.buildDataset(demoSheets()),E.defaults(E.buildDataset(demoSheets()))).qty);
});
test('Multi-row order heading selects orders rather than positions',async()=>{
  const sheets=demoSheets();sheets['Поток чеков']=[['Ресторан','Подразделение','Дата','Кол-во','Кол-во'],[null,null,null,'Позиций','Заказов'],...sheets['Поток чеков'].slice(1).map(([r,c,d,n])=>[r,c,d,n*9,n])];
  const d=await E.parseXlsx(file(await workbookBytes(sheets))),expected=E.buildDataset(demoSheets());assert.equal(JSON.stringify(d.orders),JSON.stringify(expected.orders));
});
test('Invalid filenames are rejected before reading bytes',async()=>{
  for(const name of ['Другая.xlsx','Меню_Продажи.csv']){let read=false;await assert.rejects(E.parseXlsx({name,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0);}}),/Меню_Продажи/);assert.equal(read,false);}
  await assert.rejects(E.parseXlsx(file(Buffer.from('not a zip'))));
});
