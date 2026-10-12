// Entirely invented fixtures: no names, counts or records copied from operational data.
function demoSheets(){
  const spr=[['Позиция','группа','Новое','старт'],['Новое блюдо 1','Супы',1,'2026-01-05'],['Сезонное блюдо 1','Супы',0,'2026-01-12'],['Новое блюдо 2','Салаты/Закуски',1,'2026-01-05'],['Новое блюдо 3','Завтрак',1,'2026-01-19'],['Блюдо без продаж','Завтрак',1,'2026-02-01']];
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
  return {'СПР':spr,'Поток продаж':sales,'Поток чеков':orders};
}
module.exports={demoSheets};
