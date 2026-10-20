const E=require('../src/engine.js');
// Invented examples only. Orders belong to a restaurant/channel/date, never to a group.
function networkSheets({beforeOrders=[900,100],afterOrders=beforeOrders,beforeRates=[10,20],afterRates=beforeRates,days=1,
  dishes=[{name:'Новинка',group:'Группа',type:1,start:'2026-05-05',share:.2}],removedShare=0}={}){
  const launch='2026-05-05',groups=[...new Set(dishes.map(d=>d.group))];
  const sh=['Позиция','Ресторан','Подразделение','Дата','Группа меню','Позиций'],oh=['Ресторан','Подразделение','Дата','Заказы'];
  const s={'СПР':[['Код','Позиция','группа','Новое','старт'],...dishes.map((d,i)=>['SYN-'+i,d.name,d.group,d.type,d.start])],
    'Рестораны_Блюдо':[['Код','Ресторан'],...dishes.flatMap((d,i)=>beforeOrders.map((_,r)=>['SYN-'+i,'Ресторан '+r]))],
    'Поток продаж':[sh],'Поток чеков':[oh],'Поток продаж_до':[sh],'Поток чеков_до':[oh]};
  for(let r=0;r<beforeOrders.length;r++){
    for(let offset=-14;offset<0;offset++){
      const dt=E.addDays(launch,offset);s['Поток чеков_до'].push(['Ресторан '+r,'Зал',dt,beforeOrders[r]]);
      for(const group of groups){const q=beforeOrders[r]*beforeRates[r]/100;s['Поток продаж_до'].push(['Обычное '+group,'Ресторан '+r,'Зал',dt,group,q*(1-removedShare)]);if(removedShare)s['Поток продаж_до'].push(['Снятое '+group,'Ресторан '+r,'Зал',dt,group,q*removedShare]);}
    }
    for(let offset=0;offset<days;offset++){
      const dt=E.addDays(launch,offset);s['Поток чеков'].push(['Ресторан '+r,'Зал',dt,afterOrders[r]]);
      for(const group of groups){
        const q=afterOrders[r]*afterRates[r]/100,active=dishes.filter(d=>d.group===group&&d.start<=dt);let newQty=0;
        for(const d of active){const share=typeof d.share==='function'?d.share(offset,r):d.share;newQty+=q*share;s['Поток продаж'].push([d.name,'Ресторан '+r,'Зал',dt,group,q*share]);}
        s['Поток продаж'].push(['Обычное '+group,'Ресторан '+r,'Зал',dt,group,q-newQty]);
      }
    }
  }
  return s;
}
module.exports={networkSheets};
