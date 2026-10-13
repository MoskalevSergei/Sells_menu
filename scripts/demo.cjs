// Entirely invented fixtures: no names, counts or records copied from operational data.
function demoSheets(){
  const spr=[['Позиция','группа','Новое','старт','Код'],['Новое блюдо 1','Супы',1,'2026-01-05','DEMO-001'],['Сезонное блюдо 1','Супы',0,'2026-01-12','DEMO-002'],['Новое блюдо 2','Салаты/Закуски',1,'2026-01-05','DEMO-003'],['Новое блюдо 3','Завтрак',1,'2026-01-19','DEMO-004'],['Блюдо без продаж','Завтрак',1,'2026-02-01','DEMO-005']];
  const launches=[['Код','Позиция','Ресторан'],...spr.slice(1).flatMap(d=>[1,2,3].map(r=>[d[4],d[0],'Ресторан '+r]))];
  const sales=[['Позиция меню (блюдо)','Ресторан','Подразделение','Дата_Отчет','Группа меню','Позиций']],orders=[['Ресторан','Подразделение','Дата','Заказы']];
  const add=(name,r,c,date,g,q)=>sales.push([name,r,c,date,g,q]);
  for(let day=5;day<=20;day++)for(let r=1;r<=3;r++){
    const restaurant='Ресторан '+r,date='2026-01-'+String(day).padStart(2,'0');
    const channels=r===1?['Зал','Интернет-магазин']:r===2?['Зал','Интернет-магазин','Агрегаторы-доставки']:['Зал'];
    for(const ch of channels){
      const hall=ch==='Зал',volume=hall?3:1;
      orders.push([restaurant,ch,date,(hall?60:18)+r*7+(day%4)*3]);
      add('Обычный суп 1',restaurant,ch,date,'Супы',volume*(9+r+(day%2)));
      add('Обычный суп 2',restaurant,ch,date,'Супы',volume*(6+r));
      add('Новое блюдо 1',restaurant,ch,date,'Супы',volume*(r+2+(day%3)));
      if(day>=12)add('Сезонное блюдо 1',restaurant,ch,date,'Супы',volume*(1+(day+r)%3));
      add('Обычный салат 1',restaurant,ch,date,'Салаты/Закуски',volume*(8+r));
      add('Обычный салат 2',restaurant,ch,date,'Салаты/Закуски',volume*(5+r));
      add('Новое блюдо 2',restaurant,ch,date,'Салаты/Закуски',volume*(2+r+(day%2)));
      add('Обычный завтрак 1',restaurant,ch,date,'Завтрак',volume*(7+r));
      add('Обычный завтрак 2',restaurant,ch,date,'Завтрак',volume*(4+r));
      if(day>=19)add('Новое блюдо 3',restaurant,ch,date,'Завтрак',volume*(1+r));
    }
    if(r===1&&day===8)add('Локальное обычное блюдо',restaurant,'Зал',date,'Супы',7);
    if(r===3&&day>=12){orders.push([restaurant,'Заказы с собой',date,5]);if(day===18)add('Сезонное блюдо 1',restaurant,'Заказы с собой',date,'Супы',1);}
  }
  const beforeSales=[['Позиция меню (блюдо)','Ресторан','Подразделение','Дата','Группа меню','Позиций']];
  const beforeOrders=[['Ресторан','Подразделение','Дата','Кол-во','Кол-во'],[null,null,null,'заказов,','позиций'],[null,null,null,'шт.','шт.']];
  for(let offset=-14;offset<0;offset++)for(let r=1;r<=3;r++){
    const date=new Date(Date.UTC(2026,0,5+offset)).toISOString().slice(0,10),restaurant='Ресторан '+r;
    const channels=r===1?['Зал','Интернет-магазин']:r===2?['Зал','Интернет-магазин','Агрегаторы-доставки']:['Зал'];
    for(const ch of channels){
      const hall=ch==='Зал',volume=hall?3:1,orders=(hall?60:18)+r*7;
      beforeOrders.push([restaurant,ch,date,orders,orders*2]);
      for(const [group,name,q] of [['Супы','Обычный суп 1',9+r],['Супы','Обычный суп 2',6+r],['Салаты/Закуски','Обычный салат 1',8+r],['Салаты/Закуски','Обычный салат 2',5+r],['Завтрак','Обычный завтрак 1',7+r],['Завтрак','Обычный завтрак 2',4+r]])beforeSales.push([name,restaurant,ch,date,group,volume*q]);
      if(r===1&&ch==='Зал')beforeSales.push(['Только в прежнем меню',restaurant,ch,date,'Супы',2]);
    }
  }
  return {'СПР':spr,'Рестораны_Блюдо':launches,'Поток продаж':sales,'Поток чеков':orders,'Поток продаж_до':beforeSales,'Поток чеков_до':beforeOrders};
}
module.exports={demoSheets};
