const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js');
const sheets={
 'СПР':[['Позиция','группа','Новое','старт'],['Раннее','Группа',1,'2026-01-05'],['Позднее','Группа',0,'2026-01-06'],['Без продаж','Группа',1,'2026-01-05']],
 'Поток продаж':[['Позиция меню (блюдо)','Ресторан','Подразделение','Дата_Отчет','Позиций'],['Раннее','А','Интернет-магазин','2026-01-07',3],['Раннее','Б','Зал','2026-01-05',2],['Позднее','А','Интернет-магазин','2026-01-07',4]],
 'Поток чеков':[['Ресторан','Подразделение','Дата','Заказы'],...[5,6,7].flatMap(day=>[['А','Интернет-магазин','2026-01-0'+day,(day-4)*100],['А','Зал','2026-01-0'+day,1000],['Б','Зал','2026-01-0'+day,10],['Б','Интернет-магазин','2026-01-0'+day,900]])]
};
test('Aggregate SKP uses a union order base and cannot be obtained by adding dish SKPs',()=>{
  const D=E.buildDataset(sheets),c=E.calculate(D,E.defaults(D));assert.equal(c.qty,9);assert.equal(c.orders,630);assert.equal(c.dishRows[0].orders,630);assert.equal(c.dishRows[1].orders,500);assert.equal(c.rate,100*9/630);assert.notEqual(c.rate,c.dishRows.slice(0,2).reduce((s,d)=>s+d.rate,0));assert.equal(c.dishRows[2].rate,null);
});
test('Orders from launch count before the first sale, availability uses all history',()=>{
  const D=E.buildDataset(sheets),f=E.defaults(D);f.dishes=new Set([0]);f.channels=new Set([D.channels.indexOf('Интернет-магазин')]);f.end='2026-01-06';const c=E.calculate(D,f);assert.equal(c.qty,0);assert.equal(c.orders,300);assert.equal(c.rate,0);
  const short=structuredClone(sheets);short['Поток продаж']=short['Поток продаж'].filter((r,i)=>i===0||r[3]<='2026-01-06');const Z=E.buildDataset(short),z=E.defaults(Z);z.dishes=new Set([0]);z.channels=new Set([Z.channels.indexOf('Интернет-магазин')]);z.end='2026-01-06';assert.equal(E.calculate(Z,z).rate,null);
});
test('Hall incorporates terrace and no-plates sales and orders',()=>{
  const raw=structuredClone(sheets);raw['Поток продаж'].push(['Раннее','А','Летняя терраса','2026-01-07',1]);raw['Поток чеков'].push(['А','Без Тарелок','2026-01-05',50],['А','Летняя терраса','2026-01-05',20]);const D=E.buildDataset(raw);assert.equal(E.calculate(D,E.defaults(D)).dishRows[0].orders,3700);assert.equal(D.channels.filter(c=>c==='Зал').length,1);
});
test('Launch windows apply separately to each dish and aggregate a union of order records',()=>{
  const D=E.buildDataset(sheets),f=E.defaults(D);f.window=1;
  const c=E.calculate(D,f);
  assert.equal(c.dishRows[0].orders,110);
  assert.equal(c.dishRows[1].orders,200);
  assert.equal(c.orders,310);
  assert.equal(c.qty,2);
  assert.equal(c.rate,100*2/310);
});
