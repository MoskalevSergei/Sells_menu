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
test('Before sheet roles accept exact aliases and independently detect the order column in D',async()=>{
  for(const names of [['Поток продаж_до','Поток чеков_до'],[' Поток продаж до ',' Поток чеков до ']]){
    const sheets=demoSheets(),expected=E.buildDataset(sheets);
    const sales=sheets['Поток продаж_до'],orders=sheets['Поток чеков_до'];delete sheets['Поток продаж_до'];delete sheets['Поток чеков_до'];
    sheets[names[0]]=sales;sheets[names[1]]=orders;sheets['План до запуска']=[['irrelevant']];
    const actual=await E.parseXlsx(file(await workbookBytes(sheets)));
    assert.equal(JSON.stringify(actual.history),JSON.stringify(expected.history));
    const f={...E.defaults(actual),rankingMethod:'before'};assert.ok(E.benchmark(actual,f).every(r=>r.expectedQty!==null));
  }
});
test('Ambiguous before sources are rejected, while unsupported names are ignored',async()=>{
  const sheets=demoSheets();sheets['Поток продаж до']=sheets['Поток продаж_до'];
  await assert.rejects(E.parseXlsx(file(await workbookBytes(sheets))),/Неоднозначные источники/);
  assert.throws(()=>E.buildDataset(sheets),/Неоднозначные источники/);
});
test('Numeric Excel dates use the workbook 1900/1904 system in all sources including before history',async()=>{
  for(const date1904 of [false,true]){
    const sheets=demoSheets(),epoch=Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30);
    for(const rows of Object.values(sheets))for(const row of rows)for(let i=0;i<row.length;i++)if(typeof row[i]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row[i]))row[i]=(Date.parse(row[i])-epoch)/86400000;
    const actual=await E.parseXlsx(file(await workbookBytes(sheets,{date1904}))),expected=E.buildDataset(demoSheets());
    for(const k of ['dishes','sales','orders','history'])assert.equal(JSON.stringify(actual[k]),JSON.stringify(expected[k]),k);
  }
});
test('Mismatched before sales/order periods cannot create an early-launch baseline',async()=>{
  const sheets=demoSheets();for(const row of sheets['Поток продаж_до'].slice(1))row[3]='2026-10-'+row[3].slice(8);
  const D=await E.parseXlsx(file(await workbookBytes(sheets))),f={...E.defaults(D),rankingMethod:'before'};
  f.dishes=new Set([0]);assert.ok(E.benchmark(D,f).every(r=>r.expectedQty===null&&r.details.every(p=>p.reason==='no_before_group')));
  f.dishes=new Set([3]);assert.ok(E.benchmark(D,f).some(r=>r.expectedQty!==null));
});
test('Before history shares canonical identities and SPR aliases; premature novelty sales are diagnosed',()=>{
  const sheets=demoSheets();sheets['СПР'][0].push('Код','Мозг');sheets['СПР'][1].push('TEST-CODE','Псевдоним новинки');
  const h=sheets['Поток продаж_до'];h[0].push('Код');
  h[1][0]=' обычный   суп 1 ';h[1][1]=' ресторан 1 ';h[1][2]='Летняя терраса';h[1][4]=' супы ';
  h.push(['Псевдоним новинки','Ресторан 1','Без Тарелок','2026-01-04','Супы',100,'TEST-CODE']);
  const D=E.buildDataset(sheets);assert.equal(D.history.audit.prematureSales,1);
  assert.ok(!D.history.sales.some(r=>D.history.items[r[0]].newDish===0&&r[3]<'2026-01-05'));
  assert.ok(D.history.sales.some(r=>D.history.items[r[0]].name==='Обычный суп 1'&&r[1]==='Ресторан 1'&&r[2]==='Зал'));
  h.at(-1)[4]='Завтрак';assert.throws(()=>E.buildDataset(sheets),/группа блюда не совпадает/);
});
