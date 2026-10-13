const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js');
const saleHeader=['Позиция меню (блюдо)','Ресторан','Подразделение','Дата','Группа меню','Позиций'];
const orderHeader=['Ресторан','Подразделение','Дата','Заказы'];
const close=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${a} != ${b}`);
// All codes, restaurants, names and counts are invented.
function fixture(){
  const sheets={
    'СПР':[['Код','Позиция','группа','Новое','старт'],[101,'Новинка','Группа',1,'2026-05-05'],[303,'Без продаж','Группа',0,'2026-05-05']],
    'Рестораны_Блюдо':[['Позиция','Ресторан','Код'],['Иное название','Цель','101'],['Иное название','База 1',101],['Без продаж','Цель',303],['Новинка','База 2',999]],
    'Поток продаж':[saleHeader],'Поток чеков':[orderHeader],
    'Поток продаж_до':[saleHeader],'Поток чеков_до':[orderHeader]
  };
  for(const [r,novelty,ordinary,orders] of [['Цель',20,80,100],['База 1',100,900,1000],['База 2',30,70,100]]){
    sheets['Поток продаж'].push(['Новинка',r,'Зал','2026-05-05','Группа',novelty],['Обычное',r,'Зал','2026-05-05','Группа',ordinary]);
    sheets['Поток чеков'].push([r,'Зал','2026-05-05',orders]);
    for(let day=-14;day<0;day++){
      const dt=E.addDays('2026-05-05',day);
      sheets['Поток продаж_до'].push(['Обычное',r,'Зал',dt,'Группа',r==='База 2'?70:orders]);
      if(r==='База 2')sheets['Поток продаж_до'].push(['Новинка',r,'Зал',dt,'Группа',30]);
      sheets['Поток чеков_до'].push([r,'Зал',dt,orders]);
    }
  }
  return sheets;
}
test('Launches join by code, ignore unknown codes, deduplicate pairs and require every SPR code',()=>{
  const sheets=fixture();sheets['Рестораны_Блюдо'].push(['Ошибочное название','  цель  ','101']);
  const D=E.buildDataset(sheets);assert.equal(D.launchPairs.length,3);assert.equal(D.audit.launches.duplicateRows,1);
  assert.deepEqual(D.audit.launches.unknownCodes,['999']);assert.equal(D.audit.launches.unknownRows,1);
  assert.ok(!D.launchPairs.some(([d,r])=>r==='База 2'));assert.equal(D.dishes.length,2);
  sheets['Рестораны_Блюдо']=sheets['Рестораны_Блюдо'].filter((r,i)=>i===0||String(r[2])!=='303');
  assert.throws(()=>E.buildDataset(sheets),/303 — Без продаж/);
  // The same name under a different code cannot satisfy the required SPR entry.
  sheets['Рестораны_Блюдо'].push(['Без продаж','Цель',999]);assert.throws(()=>E.buildDataset(sheets),/303 — Без продаж/);
});
test('Missing codes or incomplete launch rows reject the source, and leading zero codes stay distinct',()=>{
  let s=fixture();s['СПР'][1][0]='';assert.throws(()=>E.buildDataset(s),/СПР, строка 2: нужен код/);
  s=fixture();s['Рестораны_Блюдо'].push(['Новинка','',101]);assert.throws(()=>E.buildDataset(s),/заполните код блюда и ресторан/);
  s=fixture();s['СПР'][1][0]='00101';assert.throws(()=>E.buildDataset(s),/00101 — Новинка/);
  for(const row of s['Рестораны_Блюдо'].slice(1))if(String(row[2])==='101')row[2]='00101';
  assert.equal(E.buildDataset(s).launchPairs.length,3);
});
test('Disallowed sales and order bases disappear from every launch total, matrix, daily row and classic comparison',()=>{
  const D=E.buildDataset(fixture()),f=E.defaults(D),c=E.calculate(D,f),r=D.restaurants.indexOf('База 2');
  assert.equal(c.qty,120);assert.equal(c.orders,1100);close(c.rate,120/1100*100);
  assert.equal(c.restaurantRows.find(x=>x.id===r).qty,0);assert.equal(c.restaurantRows.find(x=>x.id===r).orders,0);
  assert.equal(c.matrixAvailable.has('0|'+r),false);assert.equal(c.matrixQty.has('0|'+r),false);
  assert.equal(c.daily[0].qty,120);assert.equal(c.cohort[0].points[0].qty,120);
  assert.equal(E.dishDaily(D,f,c).rows[0].cells[0].qty,120);
  assert.equal(D.audit.launches.outsideLaunchRows,1);assert.equal(D.audit.launches.outsideLaunchQty,30);
  f.restaurants=new Set([D.restaurants.indexOf('Цель')]);
  const row=E.benchmark(D,{...f,rankingMethod:'classic'})[0];close(row.expectedQty,10);close(row.deviation,100);
  assert.equal(row.details[0].peerRestaurants,1);
  // The launch restriction also protects calculations from an older serialized sales array.
  const copy=JSON.parse(JSON.stringify(D));copy.sales.push([0,r,0,'2026-05-05',900]);copy.availability.push([0,r,0]);copy.missingOrderSales.push([0,r,0,'2026-05-05']);
  const guarded=E.calculate(copy,E.defaults(copy));assert.equal(guarded.qty,120);assert.equal(guarded.orders,1100);assert.equal(guarded.missingOrderSales.length,0);
});
test('Disallowed novelty sales remain ordinary group alternatives, including history before its global launch',()=>{
  const s=fixture();s['Поток продаж'].push(['Новинка','База 2','Зал','2026-05-04','Группа',30]);
  const D=E.buildDataset(s),r=D.restaurants.indexOf('База 2'),i=D.menuItems.findIndex(i=>i.newDish===0);
  assert.ok(D.menuSales.some(x=>x[0]===i&&x[1]===r&&x[3]==='2026-05-04'&&x[4]===30));
  assert.equal(D.history.audit.prematureSales,0);
  assert.equal(D.history.sales.filter(x=>x[0]===i&&x[1]==='База 2').length,14);
  const f=E.defaults(D);f.restaurants=new Set([D.restaurants.indexOf('Цель')]);
  for(const rankingMethod of ['weights','before']){
    const row=E.benchmark(D,{...f,rankingMethod})[0];close(row.expectedQty,20);close(row.deviation,0);close(row.coverage,100);
    assert.equal(row.details[0].peerRestaurants,2);
    if(rankingMethod==='before'){close(row.details[0].networkBefore,100);close(row.details[0].networkAfter,100);close(row.details[0].networkFactor,1);}
  }
});
test('A SPR dish not launched at the target can provide its ordinary comparable group reference',()=>{
  const s=fixture();s['СПР'][2]=[303,'Обычное','Группа',0,'2026-05-05'];
  s['Рестораны_Блюдо']=s['Рестораны_Блюдо'].filter((r,i)=>i===0||r[2]!==303);
  s['Рестораны_Блюдо'].push(['Обычное','База 1',303],['Обычное','База 2',303]);
  delete s['Поток продаж_до'];delete s['Поток чеков_до'];
  const D=E.buildDataset(s),f={...E.defaults(D),rankingMethod:'weights'};f.dishes=new Set([0]);f.restaurants=new Set([D.restaurants.indexOf('Цель')]);
  const row=E.benchmark(D,f)[0];close(row.qty,20);close(row.expectedQty,20);close(row.coverage,100);
  assert.equal(row.details[0].comparisonGroupQty,100);
});
test('Launch list is not proof of a working channel or sales; separate launches and union bases stay intact',()=>{
  const s=fixture();s['СПР'][2]=[303,'Позднее','Группа',0,'2026-05-06'];s['Рестораны_Блюдо'][3][0]='Позднее';
  s['Поток продаж'].push(['Позднее','Цель','Зал','2026-05-06','Группа',4]);
  s['Поток чеков'].push(['Цель','Зал','2026-05-06',200],['Цель','Интернет-магазин','2026-05-05',900]);
  const D=E.buildDataset(s),f=E.defaults(D);f.restaurants=new Set([D.restaurants.indexOf('Цель')]);
  let c=E.calculate(D,f);assert.equal(c.orders,300);assert.equal(c.dishRows[0].orders,300);assert.equal(c.dishRows[1].orders,200);assert.equal(c.qty,24);
  f.window=1;c=E.calculate(D,f);assert.equal(c.orders,300);assert.equal(c.dishRows[0].orders,100);assert.equal(c.dishRows[1].orders,200);
  assert.ok(E.benchmark(D,f)[0].details.every(p=>D.channels[p.channel]==='Зал'));
  const restored=JSON.parse(JSON.stringify(D));assert.deepEqual(restored.launchPairs,D.launchPairs);
  for(const rankingMethod of ['weights','classic','before'])assert.deepEqual(E.benchmark(restored,{...f,rankingMethod}),E.benchmark(D,{...f,rankingMethod}));
});
