/* Menu dashboard calculation engine. Quantities are units, never portion coefficients. */
const MenuEngine = (() => {
  const dayMs=86400000, collator=new Intl.Collator('ru',{numeric:true});
  const norm=x=>String(x??'').trim().replace(/\s+/g,' ');
  const key=x=>norm(x).toLocaleLowerCase('ru');
  const addDays=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*dayMs).toISOString().slice(0,10);
  const diffDays=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/dayMs);
  function number(x){if(typeof x==='number')return Number.isFinite(x)?x:null;let s=norm(x).replace(/[\s\u00a0]/g,'').replace(',','.');return s!==''&&Number.isFinite(Number(s))?Number(s):null;}
  function date(x,date1904=false){
    if(typeof x==='number'&&x>0){return new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(x)*dayMs).toISOString().slice(0,10);}
    const s=norm(x),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/),ru=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    const r=iso?`${iso[1]}-${iso[2]}-${iso[3]}`:ru?`${ru[3]}-${ru[2].padStart(2,'0')}-${ru[1].padStart(2,'0')}`:null;
    return r&&new Date(r+'T00:00:00Z').toISOString().slice(0,10)===r?r:null;
  }
  function channel(x){const s=key(x);if(['зал','летняя терраса','без тарелок'].includes(s))return 'Зал';if(['инернет-магазин','интернет-магазин','интернет магазин'].includes(s))return 'Интернет-магазин';if(['агрегаторы-доставки','агрегаторы','агрегаторы доставки'].includes(s))return 'Агрегаторы';if(['заказы с собой','с собой'].includes(s))return 'С собой';return norm(x);}
  function header(rows,required){const i=rows.slice(0,12).findIndex(row=>required.every(aliases=>row.some(v=>aliases.includes(key(v)))));if(i<0)throw Error('Не найдены обязательные заголовки: '+required.map(x=>x[0]).join(', '));return i;}
  function column(row,aliases,required=true){const i=row.findIndex(v=>aliases.includes(key(v)));if(i<0&&required)throw Error('Не найден столбец «'+aliases[0]+'».');return i;}
  function buildDataset(sheets,sourceName='Меню_Продажи.xlsx',date1904=false){
    const spr=sheets['СПР'],flow=sheets['Поток продаж'],checks=sheets['Поток чеков']||sheets['ПотокЧеков'];
    if(!spr||!flow||!checks)throw Error('Нужны листы «СПР», «Поток продаж» и «Поток чеков» (или «ПотокЧеков»).');
    const hi=header(spr,[['позиция'],['группа'],['новое'],['старт']]),sh=spr[hi];
    const ix={name:column(sh,['позиция с корректировкой','позиция с коррект'],false),original:column(sh,['позиция']),alias:column(sh,['мозг'],false),code:column(sh,['код'],false),group:column(sh,['группа']),type:column(sh,['новое']),start:column(sh,['старт'])};
    const dishes=[],aliasMap=new Map(),codeMap=new Map();let skippedSpr=0;
    for(let n=hi+1;n<spr.length;n++){
      const r=spr[n],name=norm(r[ix.name]||r[ix.original]);if(!name||/^(итог|общий итог)$/i.test(name))continue;
      const start=date(r[ix.start],date1904),type=number(r[ix.type]);if(!start||![0,1].includes(type))throw Error('СПР, строка '+(n+1)+': проверьте «Новое» (0 или 1) и дату старта.');
      const group=norm(r[ix.group])||'Без группы',id=dishes.findIndex(d=>key(d.name)===key(name));let di=id;
      if(id>=0){const d=dishes[id];if(d.start!==start||d.type!==type||d.group!==group)throw Error('В СПР несколько разных определений блюда «'+name+'».');skippedSpr++;}else{di=dishes.length;dishes.push({name,group,type,start,code:norm(r[ix.code])});}
      for(const a of [name,r[ix.original],r[ix.alias]])if(norm(a)){const ak=key(a);if(aliasMap.has(ak)&&aliasMap.get(ak)!==di)throw Error('Неоднозначное название блюда в СПР: '+norm(a));aliasMap.set(ak,di);}
      if(norm(r[ix.code])){const c=norm(r[ix.code]);if(codeMap.has(c)&&codeMap.get(c)!==di)throw Error('Неоднозначный код в СПР: '+c);codeMap.set(c,di);}
    }
    if(!dishes.length)throw Error('В справочнике не найдено блюд с датами запуска.');
    const fh=header(flow,[['ресторан'],['подразделение','кп'],['позиций','количество'],['дата_отчет','дата отчёт','дата']]),f=flow[fh];
    const fi={name:column(f,['позиция меню (блюдо)','позиция','блюдо']),corrected:column(f,['позиция с коррект','позиция с корректировкой'],false),code:column(f,['код','код позиции'],false),restaurant:column(f,['ресторан']),channel:column(f,['подразделение','кп']),date:column(f,['дата_отчет','дата отчёт','дата']),qty:column(f,['позиций','количество']),group:column(f,['группа','группа меню'],false)};
    const sample=flow.slice(fh+1,fh+101).filter(r=>norm(r[fi.name]));
    const groupQtySwapped=fi.group>=0&&sample.length>0&&sample.every(r=>number(r[fi.qty])===null&&norm(r[fi.qty])&&number(r[fi.group])!==null);
    if(groupQtySwapped)[fi.qty,fi.group]=[fi.group,fi.qty];
    const groupNames=new Map(dishes.map(d=>[key(d.group),d.group])),menuItems=[],menuItemMap=new Map(),menuSaleMap=new Map(),menuAvailabilitySet=new Set();
    const saleMap=new Map(),availabilitySet=new Set(),restaurants=new Set(),channels=new Set();let rawSales=0,unknownSales=0,beforeStart=0,ordinaryRows=0,otherGroupRows=0;const unknownNames=new Set();
    for(let n=fh+1;n<flow.length;n++){
      const r=flow[n];if(!norm(r[fi.name])||/^(итог|общий итог)$/i.test(norm(r[fi.name])))continue;
      const restaurant=norm(r[fi.restaurant]),ch=channel(r[fi.channel]),dt=date(r[fi.date],date1904),qty=number(r[fi.qty]);
      if(!restaurant||!ch||!dt||qty===null)throw Error('Поток продаж, строка '+(n+1)+': не заполнен ресторан, канал, дата или количество.');rawSales++;
      const di=codeMap.get(norm(r[fi.code]))??aliasMap.get(key(r[fi.name]))??aliasMap.get(key(r[fi.corrected]));
      if(di!==undefined&&dt<dishes[di].start){beforeStart++;continue;}
      if(fi.group>=0){
        const sourceGroup=norm(r[fi.group]);if(!sourceGroup||number(sourceGroup)!==null)throw Error('Поток продаж, строка '+(n+1)+': не заполнена группа меню.');
        const group=groupNames.get(key(sourceGroup));
        if(di!==undefined&&key(dishes[di].group)!==key(sourceGroup))throw Error('Поток продаж, строка '+(n+1)+': группа блюда не совпадает с СПР.');
        if(group){
          const name=di!==undefined?dishes[di].name:norm(r[fi.name]),itemKey=di!==undefined?'new|'+di:JSON.stringify([group,key(name)]);
          let item=menuItemMap.get(itemKey);if(item===undefined){item=menuItems.length;menuItemMap.set(itemKey,item);menuItems.push({name,group,newDish:di??null,start:di!==undefined?dishes[di].start:null});}
          const mk=JSON.stringify([item,restaurant,ch,dt]);menuSaleMap.set(mk,(menuSaleMap.get(mk)||0)+qty);if(qty>0)menuAvailabilitySet.add(JSON.stringify([item,restaurant,ch]));
          restaurants.add(restaurant);channels.add(ch);if(di===undefined)ordinaryRows++;
        }else otherGroupRows++;
      }
      if(di===undefined){if(fi.group<0){unknownSales++;unknownNames.add(norm(r[fi.name]));}continue;}
      restaurants.add(restaurant);channels.add(ch);const k=JSON.stringify([di,restaurant,ch,dt]);saleMap.set(k,(saleMap.get(k)||0)+qty);if(qty>0)availabilitySet.add(JSON.stringify([di,restaurant,ch]));
    }
    const ch=header(checks,[['ресторан'],['подразделение','кп'],['дата']]),c=checks[ch];
    const explicitOrderColumn=column(c,['заказы','кол-во заказов','количество заказов'],false);
    const multirowOrderColumn=c.findIndex((v,i)=>key(v)==='кол-во'&&checks.slice(ch+1,ch+4).some(row=>key(row[i]).includes('заказ')));
    const ci={restaurant:column(c,['ресторан']),channel:column(c,['подразделение','кп']),date:column(c,['дата']),orders:explicitOrderColumn>=0?explicitOrderColumn:multirowOrderColumn>=0?multirowOrderColumn:column(c,['заказы','кол-во','кол-во заказов','количество заказов'])};
    const orderMap=new Map();let rawOrders=0;
    for(let n=ch+1;n<checks.length;n++){
      const r=checks[n],restaurant=norm(r[ci.restaurant]);if(!restaurant||/^(итог|общий итог)$/i.test(restaurant))continue;
      const dt=date(r[ci.date],date1904),chName=channel(r[ci.channel]),orders=number(r[ci.orders]);
      if(!dt||!chName||orders===null||orders<0)throw Error('Поток чеков, строка '+(n+1)+': проверьте дату, канал и количество заказов.');
      restaurants.add(restaurant);channels.add(chName);const k=JSON.stringify([restaurant,chName,dt]);orderMap.set(k,(orderMap.get(k)||0)+orders);rawOrders++;
    }
    if(!orderMap.size)throw Error('Не найдены строки с количеством заказов.');
    let missing=0;const examples=[],missingOrderSales=[];
    for(const [k,q] of saleMap){const [dish,r,c,d]=JSON.parse(k);if(q!==0&&!orderMap.has(JSON.stringify([r,c,d]))){missing++;missingOrderSales.push([dish,r,c,d]);const label=r+' / '+c+' / '+d;if(examples.length<3&&!examples.includes(label))examples.push(label);}}
    if(missing&&fi.group<0)throw Error('Для '+missing+' сочетаний ресторан / канал / дата с продажами нет заказов. Примеры: '+examples.join('; ')+'. Проверьте совпадение выгрузок.');
    const restaurantList=[...restaurants].sort(collator.compare),defaultChannels=['Зал','Интернет-магазин','Агрегаторы','С собой'],channelList=[...channels].sort((a,b)=>(defaultChannels.indexOf(a)<0?99:defaultChannels.indexOf(a))-(defaultChannels.indexOf(b)<0?99:defaultChannels.indexOf(b))||collator.compare(a,b));
    const ri=new Map(restaurantList.map((r,i)=>[r,i])),cci=new Map(channelList.map((r,i)=>[r,i]));
    const sales=[...saleMap].map(([k,q])=>{const [d,r,c,dt]=JSON.parse(k);return[d,ri.get(r),cci.get(c),dt,q];});
    const orders=[...orderMap].map(([k,q])=>{const [r,c,dt]=JSON.parse(k);return[ri.get(r),cci.get(c),dt,q];});
    const orderDates=orders.map(x=>x[2]).sort(),saleDates=sales.map(x=>x[3]).sort();
    const minDate=orderDates[0],maxDate=orderDates.at(-1),salesMaxDate=saleDates.at(-1)||maxDate;
    const availability=[...availabilitySet].map(k=>{const [d,r,c]=JSON.parse(k);return[d,ri.get(r),cci.get(c)];});
    const menuSales=[...menuSaleMap].map(([k,q])=>{const [i,r,c,dt]=JSON.parse(k);return[i,ri.get(r),cci.get(c),dt,q];}),menuAvailability=[...menuAvailabilitySet].map(k=>{const [i,r,c]=JSON.parse(k);return[i,ri.get(r),cci.get(c)];});
    return {schema:fi.group>=0?2:1,sourceName,loadedAt:new Date().toISOString(),dishes,restaurants:restaurantList,channels:channelList,sales,orders,availability,minDate,maxDate,
      ...(fi.group>=0?{menuItems,menuSales,menuAvailability,missingOrderSales:missingOrderSales.map(([d,r,c,dt])=>[d,ri.get(r),cci.get(c),dt])}:{}),
      audit:{rawSales,rawOrders,combinedSales:sales.length,combinedOrders:orders.length,unknownSales,unknownNames:[...unknownNames],beforeStart,skippedSpr,checksSource:sheets['Поток чеков']?'Поток чеков':'ПотокЧеков',salesMaxDate,ordersMaxDate:maxDate,...(fi.group>=0?{ordinaryRows,otherGroupRows,groupQtySwapped,menuItems:menuItems.length,menuRows:menuSales.length}: {})}};
  }
  async function parseXlsx(file){
    if(!/меню_продажи/i.test(file.name)||!/\.xlsx$/i.test(file.name))throw Error('Выберите файл .xlsx, в названии которого есть «Меню_Продажи».');
    const zip=await JSZip.loadAsync(await file.arrayBuffer()),parse=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Не удалось прочитать XML внутри Excel.');return d;},items=(d,name)=>[...d.getElementsByTagNameNS('*',name)];
    const wbfile=zip.file('xl/workbook.xml'),relfile=zip.file('xl/_rels/workbook.xml.rels');if(!wbfile||!relfile)throw Error('Файл должен быть в формате .xlsx.');
    const wb=parse(await wbfile.async('string')),rels=parse(await relfile.async('string')),targets=new Map(items(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
    const sharedFile=zip.file('xl/sharedStrings.xml'),shared=sharedFile?items(parse(await sharedFile.async('string')),'si').map(si=>items(si,'t').map(t=>t.textContent).join('')):[];
    const pr=items(wb,'workbookPr')[0],date1904=pr&&['1','true'].includes(pr.getAttribute('date1904'));
    const sheets={};
    for(const s of items(wb,'sheet')){
      const name=norm(s.getAttribute('name'));if(!['СПР','Поток продаж','Поток чеков','ПотокЧеков'].includes(name))continue;
      const rid=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||s.getAttribute('r:id');let target=targets.get(rid);if(!target)throw Error('Не найден лист '+name);
      target=target.startsWith('/')?target.slice(1):'xl/'+target;target=target.replace(/(^|\/)\.\//g,'$1');const parts=[];for(const p of target.split('/')){if(p==='..')parts.pop();else parts.push(p);}target=parts.join('/');
      const sf=zip.file(target);if(!sf)throw Error('Не найден лист '+name);
      // Read only source columns and cached values, avoiding large helper formula trees.
      const xml=await sf.async('string'),rowPattern=/<row\b[^>]*>[\s\S]*?<\/row>/g,headerRows=[];
      for(const match of xml.matchAll(rowPattern)){if(Number(match[0].match(/\br="(\d+)"/)?.[1]||headerRows.length+1)>12)break;headerRows.push(match[0]);}
      const withoutFormulas=s=>s.replace(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/g,'');
      const opening=xml.match(/<worksheet\b[^>]*>/)?.[0]||'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      const headerDoc=parse(opening+'<sheetData>'+withoutFormulas(headerRows.join(''))+'</sheetData></worksheet>');
      const aliases=new Set(name==='СПР'?['позиция','позиция с корректировкой','позиция с коррект','мозг','код','группа','новое','старт']:name==='Поток продаж'?['позиция меню (блюдо)','позиция','блюдо','позиция с коррект','позиция с корректировкой','код','код позиции','ресторан','подразделение','кп','дата_отчет','дата отчёт','дата','позиций','количество','группа','группа меню']:['ресторан','подразделение','кп','дата','заказы','кол-во','кол-во заказов','количество заказов']);
      const keep=new Set();for(const cell of items(headerDoc,'c')){const type=cell.getAttribute('t'),v=items(cell,'v')[0]?.textContent,label=type==='s'?shared[Number(v)]:type==='inlineStr'?items(cell,'t').map(t=>t.textContent).join(''):v;if(aliases.has(key(label)))keep.add((cell.getAttribute('r')||'A1').match(/^[A-Z]+/)[0]);}
      if(!keep.size)throw Error('Не найдены исходные столбцы листа «'+name+'».');
      const compact=[];for(const match of xml.matchAll(rowPattern)){
        const row=match[0],rn=row.match(/\br="(\d+)"/)?.[1],cells=[];
        for(const m of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
          const address=m[1].match(/\br="([A-Z]+\d+)"/)?.[1],body=m[2];if(!address||!keep.has(address.match(/^[A-Z]+/)[0])||!body)continue;
          const type=m[1].match(/\bt="([^"]+)"/)?.[1],value=withoutFormulas(body);if(!/<(?:v|is)\b/.test(value))continue;
          cells.push('<c r="'+address+'"'+(type?' t="'+type+'"':'')+'>'+value+'</c>');
        }
        if(cells.length)compact.push('<row'+(rn?' r="'+rn+'"':'')+'>'+cells.join('')+'</row>');
      }
      const doc=parse('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+compact.join('')+'</sheetData></worksheet>'),rows=[];
      for(const r of items(doc,'row')){const row=[];for(const cell of items(r,'c')){const address=cell.getAttribute('r')||'A1',letters=address.match(/^[A-Z]+/)[0];let col=0;for(const l of letters)col=col*26+l.charCodeAt(0)-64;const type=cell.getAttribute('t'),v=items(cell,'v')[0]?.textContent;
          let value=null;if(type==='s')value=shared[Number(v)]??null;else if(type==='inlineStr')value=items(cell,'t').map(t=>t.textContent).join('');else if(['str','d','e'].includes(type))value=v??null;else if(v!==undefined)value=Number(v);row[col-1]=value;}
        rows[Number(r.getAttribute('r')||rows.length+1)-1]=row;}
      sheets[name]=Array.from({length:rows.length},(_,i)=>rows[i]||[]);
    }
    return buildDataset(sheets,file.name,date1904);
  }
  function defaults(D){return {start:D.minDate,end:D.maxDate,type:'all',window:0,rankingMethod:D.menuItems?'weights':'classic',restaurants:new Set(D.restaurants.map((_,i)=>i)),channels:new Set(D.channels.map((_,i)=>i)),launches:new Set(D.dishes.map(d=>d.start)),groups:new Set(D.dishes.map(d=>d.group)),dishes:new Set(D.dishes.map((_,i)=>i))};}
  const availabilityCache=new WeakMap();
  function availabilityFor(D){
    if(availabilityCache.has(D))return availabilityCache.get(D);
    const map=new Map(D.dishes.map((_,i)=>[i,new Set()]));
    const triples=D.availability||D.sales.filter(([d,r,c,date,q])=>q>0&&date>=D.dishes[d].start).map(([d,r,c])=>[d,r,c]);
    for(const [d,r,c] of triples)map.get(d)?.add(r+'|'+c);
    availabilityCache.set(D,map);return map;
  }
  function calculate(D,f){
    const availability=availabilityFor(D);
    const ids=D.dishes.map((_,i)=>i).filter(i=>f.dishes.has(i)&&f.groups.has(D.dishes[i].group)&&f.launches.has(D.dishes[i].start)&&(f.type==='all'||String(D.dishes[i].type)===f.type));
    const ranges=new Map(ids.map(i=>{const d=D.dishes[i];return[i,{start:[f.start,d.start].sort().at(-1),end:f.window?[f.end,addDays(d.start,f.window-1)].sort()[0]:f.end}];}));
    const inRange=(di,date)=>{const r=ranges.get(di);return r&&date>=r.start&&date<=r.end;};
    const eligible=(di,r,c,date)=>inRange(di,date)&&availability.get(di).has(r+'|'+c);
    // The union counts each restaurant/channel/date order record once across dishes.
    const orders=D.orders.filter(([r,c,date])=>f.restaurants.has(r)&&f.channels.has(c)&&ids.some(i=>eligible(i,r,c,date)));
    const sales=D.sales.filter(([d,r,c,date])=>ranges.has(d)&&f.restaurants.has(r)&&f.channels.has(c)&&inRange(d,date));
    const missingOrderSales=(D.missingOrderSales||[]).filter(([d,r,c,dt])=>f.restaurants.has(r)&&f.channels.has(c)&&inRange(d,dt));
    const incomplete=(test)=>missingOrderSales.some(test),badDishChannels=new Set(missingOrderSales.map(([d,r,c])=>d+'|'+c)),badMatrix=new Set(missingOrderSales.map(([d,r])=>d+'|'+r));
    const qty=sales.reduce((a,s)=>a+s[4],0),base=orders.reduce((a,o)=>a+o[3],0),rate=base>0&&!missingOrderSales.length?qty/base*100:null;
    const dishQty=new Map(),matrixQty=new Map(),matrixOrders=new Map(),matrixAvailable=new Set(),dishChannelOrders=new Map(),dishChannelAvailable=new Set(),restQty=new Map(),restOrders=new Map(),channelQty=new Map(),channelOrders=new Map();
    for(const [d,r,c,date,q] of sales){dishQty.set(d,(dishQty.get(d)||0)+q);matrixQty.set(d+'|'+r,(matrixQty.get(d+'|'+r)||0)+q);restQty.set(r,(restQty.get(r)||0)+q);channelQty.set(c,(channelQty.get(c)||0)+q);}
    for(const [r,c,date,o] of orders){restOrders.set(r,(restOrders.get(r)||0)+o);channelOrders.set(c,(channelOrders.get(c)||0)+o);}
    const dishRows=ids.map(id=>{
      const dd=D.dishes[id],os=orders.filter(([r,c,date])=>eligible(id,r,c,date)),q=dishQty.get(id)||0,b=os.reduce((a,o)=>a+o[3],0),dateSet=new Set(os.filter(o=>o[3]>0).map(o=>o[2]));
      for(const r of f.restaurants)for(const c of f.channels)if(availability.get(id).has(r+'|'+c)){matrixAvailable.add(id+'|'+r);dishChannelAvailable.add(id+'|'+c);}
      for(const [r,c,dt,n] of os){matrixOrders.set(id+'|'+r,(matrixOrders.get(id+'|'+r)||0)+n);dishChannelOrders.set(id+'|'+c,(dishChannelOrders.get(id+'|'+c)||0)+n);}
      return {id,name:dd.name,group:dd.group,type:dd.type,start:dd.start,qty:q,orders:b,rate:b>0&&!incomplete(s=>s[0]===id)?q/b*100:null,share:qty!==0?q/qty*100:null,days:dateSet.size,restaurants:new Set(sales.filter(s=>s[0]===id&&s[4]>0).map(s=>s[1])).size};
    });
    const restaurantRows=[...f.restaurants].map(id=>{const q=restQty.get(id)||0,b=restOrders.get(id)||0;return{id,name:D.restaurants[id],qty:q,orders:b,rate:b>0&&!incomplete(s=>s[1]===id)?q/b*100:null,dishes:new Set(sales.filter(s=>s[1]===id&&s[4]>0).map(s=>s[0])).size};});
    const channelRows=[...f.channels].map(id=>{const q=channelQty.get(id)||0,b=channelOrders.get(id)||0;return{id,name:D.channels[id],qty:q,orders:b,rate:b>0&&!incomplete(s=>s[2]===id)?q/b*100:null,share:qty!==0?q/qty*100:null};});
    const dates=[...new Set(orders.map(o=>o[2]))].sort();
    const daily=dates.map(date=>{
      const os=orders.filter(o=>o[2]===date),ss=sales.filter(s=>s[3]===date),b=os.reduce((a,o)=>a+o[3],0),q=ss.reduce((a,s)=>a+s[4],0),v={date,qty:q,orders:b,incomplete:incomplete(s=>s[3]===date),rate:b>0&&!incomplete(s=>s[3]===date)?q/b*100:null};
      for(const type of [1,0]){const tq=ss.filter(s=>D.dishes[s[0]].type===type).reduce((a,s)=>a+s[4],0),tb=os.filter(([r,c,date])=>ids.some(i=>D.dishes[i].type===type&&eligible(i,r,c,date))).reduce((a,o)=>a+o[3],0);v['q'+type]=tq;v['b'+type]=tb;v['i'+type]=incomplete(s=>D.dishes[s[0]].type===type&&s[3]===date);v['r'+type]=tb>0&&!v['i'+type]?tq/tb*100:null;}return v;
    });
    const cohort=[...new Set(ids.map(i=>D.dishes[i].start))].sort().map(start=>{
      const di=ids.filter(i=>D.dishes[i].start===start),o=orders.filter(([r,c,date])=>di.some(i=>eligible(i,r,c,date))),s=sales.filter(s=>di.includes(s[0]));
      const ds=[...new Set(o.map(o=>o[2]))].sort();return {start,points:ds.map(date=>{const b=o.filter(o=>o[2]===date).reduce((a,o)=>a+o[3],0),q=s.filter(s=>s[3]===date).reduce((a,s)=>a+s[4],0);return{day:diffDays(date,start)+1,date,qty:q,orders:b,rate:b>0&&!incomplete(s=>di.includes(s[0])&&s[3]===date)?q/b*100:null};})};
    });
    return {ids,ranges,qty,orders:base,rate,sales,orderRecords:orders,dishRows,restaurantRows,channelRows,matrixQty,matrixOrders,matrixAvailable,dishChannelOrders,dishChannelAvailable,daily,cohort,dates,missingOrderSales,badDishChannels,badMatrix,activeDishes:dishRows.filter(d=>d.qty>0).length};
  }
  function dishDaily(D,f,context=null){
    const c=context||calculate(D,f),availability=availabilityFor(D),qty=new Map(),base=new Map();
    const add=(map,key,value)=>map.set(key,(map.get(key)||0)+value);
    for(const [d,r,ch,date,q] of c.sales)add(qty,d+'|'+date,q);
    for(const [r,ch,date,n] of c.orderRecords)for(const d of c.ids){
      const range=c.ranges.get(d);
      if(date>=range.start&&date<=range.end&&availability.get(d).has(r+'|'+ch))add(base,d+'|'+date,n);
    }
    const dates=[...new Set([...c.dates,...c.sales.map(s=>s[3])])].sort();
    return {dates,rows:c.dishRows.map(d=>({...d,cells:dates.map(date=>{
      const key=d.id+'|'+date,q=qty.get(key)||0,b=base.get(key)||0;
      return {date,qty:q,orders:b,rate:b>0&&!c.missingOrderSales.some(s=>s[0]===d.id&&s[3]===date)?100*q/b:null,available:b>0||q!==0};
    })}))};
  }
  function weekly(rows){const groups=new Map();for(const row of rows){const dt=new Date(row.date+'T00:00:00Z'),monday=addDays(row.date,-((dt.getUTCDay()+6)%7));if(!groups.has(monday))groups.set(monday,{date:monday,qty:0,orders:0,q0:0,q1:0,b0:0,b1:0});const g=groups.get(monday);for(const flag of ['incomplete','i0','i1'])g[flag]=Boolean(g[flag]||row[flag]);for(const p of ['qty','orders','q0','q1','b0','b1'])g[p]+=row[p]||0;}return[...groups.values()].map(g=>({...g,rate:g.orders>0&&!g.incomplete?100*g.qty/g.orders:null,r0:g.b0>0&&!g.i0?100*g.q0/g.b0:null,r1:g.b1>0&&!g.i1?100*g.q1/g.b1:null}));}
  function benchmarkClassic(D,f,context=null){
    const own=context||calculate(D,f),allFilters={...f,restaurants:new Set(D.restaurants.map((_,i)=>i))};
    const network=f.restaurants.size===D.restaurants.length?own:calculate(D,allFilters),availability=availabilityFor(D);
    const ownQty=new Map(),ownOrders=new Map(),poolQty=new Map(),poolOrders=new Map(),badPairs=new Set(network.missingOrderSales.map(([d,r,c])=>d+'|'+r+'|'+c));
    const increment=(map,key,value)=>map.set(key,(map.get(key)||0)+value);
    for(const [d,r,c,date,q] of network.sales){increment(ownQty,d+'|'+r+'|'+c,q);increment(poolQty,d+'|'+c,q);}
    for(const [r,c,date,o] of network.orderRecords)for(const d of network.ids){
      const range=network.ranges.get(d);
      if(availability.get(d).has(r+'|'+c)&&date>=range.start&&date<=range.end){increment(ownOrders,d+'|'+r+'|'+c,o);increment(poolOrders,d+'|'+c,o);}
    }
    // Every eligible restaurant contributes one dish/channel rate, regardless of volume.
    const poolRateSum=new Map(),poolRestaurantCount=new Map();
    for(const [key,orders] of ownOrders){
      if(orders<=0||badPairs.has(key))continue;
      const [d,r,c]=key.split('|'),poolKey=d+'|'+c;
      increment(poolRateSum,poolKey,100*(ownQty.get(key)||0)/orders);
      increment(poolRestaurantCount,poolKey,1);
    }
    return own.restaurantRows.map(row=>{
      const details=[],missingPairs=[];let expected=0;
      for(const d of own.ids)for(const c of f.channels){
        if(!availability.get(d).has(row.id+'|'+c))continue;
        const key=d+'|'+row.id+'|'+c,orders=ownOrders.get(key)||0,qty=ownQty.get(key)||0;
        if(orders<=0&&qty===0)continue;
        const peerOrders=(poolOrders.get(d+'|'+c)||0)-orders,peerQty=(poolQty.get(d+'|'+c)||0)-qty;
        const validOwn=orders>0&&!badPairs.has(key),poolKey=d+'|'+c,peerRestaurants=(poolRestaurantCount.get(poolKey)||0)-(validOwn?1:0);
        const peerRate=peerRestaurants>0?((poolRateSum.get(poolKey)||0)-(validOwn?100*qty/orders:0))/peerRestaurants:null;
        const expectedQty=validOwn&&peerRate!==null?orders*peerRate/100:null;
        details.push({dish:d,channel:c,qty,orders,peerQty,peerOrders,peerRestaurants,peerRate,expectedQty});
        if(expectedQty===null)missingPairs.push({dish:d,channel:c,reason:badPairs.has(key)?'incomplete_orders':null});else expected+=expectedQty;
      }
      // A missing reference never becomes a zero expectation or a partial whole-menu score.
      const expectedQty=details.length&&row.orders>0&&!missingPairs.length?expected:null;
      const othersRate=expectedQty!==null?100*expectedQty/row.orders:null;
      const deviation=expectedQty>0?100*(row.qty/expectedQty-1):null;
      return {...row,expectedQty,othersRate,deviation,diff:othersRate!==null&&row.rate!==null?row.rate-othersRate:null,details,missingPairs};
    });
  }
  const weightedCache=new WeakMap();
  function weightedIndex(D){
    if(weightedCache.has(D))return weightedCache.get(D);
    if(!D.menuItems||!D.menuSales)return null;
    const index={baskets:new Map(),daily:new Map(),bases:new Map(),fits:new Map(),itemByDish:new Map()};
    D.menuItems.forEach((item,i)=>{if(item.newDish!==null)index.itemByDish.set(item.newDish,i);});
    for(const [i,r,c] of D.menuAvailability||[]){const k=JSON.stringify([D.menuItems[i].group,c,r]);if(!index.baskets.has(k))index.baskets.set(k,new Set());index.baskets.get(k).add(i);}
    const points=new Map(),positiveOrders=new Set(D.orders.filter(o=>o[3]>0).map(o=>JSON.stringify(o.slice(0,3))));
    for(const [i,r,c,date,q] of D.menuSales){
      const item=D.menuItems[i],k=JSON.stringify([item.group,c,r,date]);
      if(!points.has(k))points.set(k,{restaurant:r,channel:c,date,group:item.group,counts:new Map()});
      const p=points.get(k);p.counts.set(i,(p.counts.get(i)||0)+q);
    }
    for(const p of points.values()){
      const groupKey=JSON.stringify([p.group,p.channel]),available=[...(index.baskets.get(JSON.stringify([p.group,p.channel,p.restaurant]))||[])].filter(i=>!D.menuItems[i].start||D.menuItems[i].start<=p.date).sort((a,b)=>a-b);
      p.basket=available;p.signature=available.join(',');p.total=[...p.counts.values()].reduce((sum,q)=>sum+q,0);p.invalid=[...p.counts.values()].some(q=>q<0);p.hasOrders=positiveOrders.has(JSON.stringify([p.restaurant,p.channel,p.date]));
      if(!index.daily.has(groupKey))index.daily.set(groupKey,[]);index.daily.get(groupKey).push(p);
    }
    weightedCache.set(D,index);return index;
  }
  function weightedBase(D,index,group,channel,start,end){
    const key=JSON.stringify([group,channel,start,end]);if(index.bases.has(key))return index.bases.get(key);
    const base={key,restaurants:new Map(),points:new Map()};
    for(const p of index.daily.get(JSON.stringify([group,channel]))||[]){
      if(p.date<start||p.date>end)continue;
      if(!base.points.has(p.restaurant))base.points.set(p.restaurant,[]);base.points.get(p.restaurant).push(p);
      if(p.invalid||p.total<=0)continue;
      if(!base.restaurants.has(p.restaurant))base.restaurants.set(p.restaurant,{total:0,counts:new Map(),bins:new Map()});
      const r=base.restaurants.get(p.restaurant);r.total+=p.total;
      for(const [i,q] of p.counts)r.counts.set(i,(r.counts.get(i)||0)+q);
      if(!r.bins.has(p.signature))r.bins.set(p.signature,{basket:p.basket,mass:0});r.bins.get(p.signature).mass+=p.total;
    }
    index.bases.set(key,base);return base;
  }
  function fitMenuWeights(base,excludedRestaurant){
    const counts=new Map(),bins=new Map();let peerRestaurants=0;
    // Each restaurant contributes one unit of likelihood, independent of its volume.
    for(const [id,r] of base.restaurants){
      if(id===excludedRestaurant)continue;peerRestaurants++;
      for(const [i,q] of r.counts)counts.set(i,(counts.get(i)||0)+q/r.total);
      for(const [signature,b] of r.bins){if(!bins.has(signature))bins.set(signature,{basket:b.basket,mass:0});bins.get(signature).mass+=b.mass/r.total;}
    }
    const candidates=new Set([...bins.values()].flatMap(b=>b.basket)),ids=[...candidates].filter(i=>(counts.get(i)||0)>0),positions=new Map(ids.map((i,p)=>[i,p])),observed=ids.map(i=>counts.get(i)),total=observed.reduce((s,x)=>s+x,0);
    const parents=ids.map((_,i)=>i),root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    const rows=[...bins.values()].map(b=>({mass:b.mass,positions:b.basket.filter(i=>positions.has(i)).map(i=>positions.get(i))}));
    for(const row of rows)for(const p of row.positions.slice(1))parents[root(p)]=root(row.positions[0]);
    let weights=observed.map(c=>c/total),converged=ids.length===0,iterations=0,residual=0;
    for(;iterations<2000&&ids.length;iterations++){
      const denominator=ids.map(()=>0);
      for(const row of rows){const s=row.positions.reduce((v,p)=>v+weights[p],0);if(s>0)for(const p of row.positions)denominator[p]+=row.mass/s;}
      residual=Math.max(...weights.map((w,p)=>Math.abs(w*denominator[p]-observed[p])))/Math.max(1,peerRestaurants);
      if(residual<1e-9){converged=true;break;}
      const next=observed.map((c,p)=>denominator[p]>0?c/denominator[p]:0),sum=next.reduce((s,w)=>s+w,0);weights=next.map(w=>w/sum);
    }
    const result=new Map([...candidates].map(i=>[i,positions.has(i)?weights[positions.get(i)]:0])),components=new Map(ids.map((i,p)=>[i,root(p)]));
    return {weights:result,components,peerRestaurants,converged,iterations,residual};
  }
  function weightedFit(index,base,restaurant){
    const key=base.key+'|'+restaurant;if(index.fits.has(key))return index.fits.get(key);
    const fit=fitMenuWeights(base,restaurant);if(index.fits.size>=4096)index.fits.clear();index.fits.set(key,fit);return fit;
  }
  function benchmarkWeighted(D,f,context=null){
    const own=context||calculate(D,f),index=weightedIndex(D),availability=availabilityFor(D),pairQty=new Map(),pairOrders=new Map();
    const add=(map,k,v)=>map.set(k,(map.get(k)||0)+v);
    for(const [d,r,c,date,q] of own.sales)add(pairQty,d+'|'+r+'|'+c,q);
    for(const [r,c,date,n] of own.orderRecords)for(const d of own.ids){const range=own.ranges.get(d);if(availability.get(d).has(r+'|'+c)&&date>=range.start&&date<=range.end)add(pairOrders,d+'|'+r+'|'+c,n);}
    return own.restaurantRows.map(row=>{
      const details=[],missingPairs=[],comparisonOrderKeys=new Set();let expected=0,comparisonQty=0,coveredPositive=0,totalPositive=0,incompleteOrders=false;
      for(const d of own.ids)for(const c of f.channels){
        if(!availability.get(d).has(row.id+'|'+c))continue;
        const key=d+'|'+row.id+'|'+c,orders=pairOrders.get(key)||0,qty=pairQty.get(key)||0;if(orders<=0&&qty===0)continue;
        const range=own.ranges.get(d),group=D.dishes[d].group,detail={dish:d,channel:c,group,qty,orders,groupQty:0,comparisonQty:0,comparisonGroupQty:0,expectedQty:null,expectedShare:null,peerRestaurants:0,minAssortment:null,maxAssortment:null,model:'weights',reason:null,unseenItems:[],localItems:[],excludedDays:0};
        if(!index)detail.reason='missing_groups';
        else {
          const base=weightedBase(D,index,group,c,range.start,range.end),points=base.points.get(row.id)||[],item=index.itemByDish.get(d),fit=weightedFit(index,base,row.id),assortment=index.baskets.get(JSON.stringify([group,c,row.id]))||new Set(),localItems=new Set(),assessments=new Map();let score=0,includedDays=0;
          detail.groupQty=points.reduce((s,p)=>s+p.total,0);
          detail.peerRestaurants=fit.peerRestaurants;detail.fitIterations=fit.iterations;detail.fitResidual=fit.residual;
          // Conditional choice probabilities use both the units and weights of the same comparable basket.
          const assess=date=>{
            if(assessments.has(date))return assessments.get(date);
            const basket=[...assortment].filter(i=>!D.menuItems[i].start||D.menuItems[i].start<=date),result={basket,comparable:[],weightSum:0,reason:null};
            if(!fit.peerRestaurants||!fit.weights.has(item))result.reason='no_peer_dish';
            else if(!fit.converged)result.reason='not_converged';
            else {
              const component=fit.components.get(item),positiveNew=(fit.weights.get(item)||0)>0;
              result.comparable=basket.filter(i=>fit.weights.has(i)&&(!positiveNew||!(fit.weights.get(i)>0)||fit.components.get(i)===component));
              for(const i of basket)if(!result.comparable.includes(i))localItems.add(D.menuItems[i].name);
              result.weightSum=result.comparable.reduce((s,i)=>s+(fit.weights.get(i)||0),0);
              if(!result.comparable.some(i=>D.menuItems[i].newDish===null&&fit.weights.get(i)>0))result.reason='no_comparable_group';
              else if(result.weightSum<=0)result.reason='no_group_reference';
            }
            assessments.set(date,result);return result;
          };
          for(const p of points){
            const assessment=assess(p.date),reason=p.invalid||p.total<0?'negative_counts':assessment.reason,newQty=p.counts.get(item)||0;totalPositive+=Math.max(0,newQty);
            if(reason){detail.reason=detail.reason||reason;detail.excludedDays++;continue;}
            const count=assessment.comparable.length,groupQty=assessment.comparable.reduce((s,i)=>s+(p.counts.get(i)||0),0);
            detail.minAssortment=detail.minAssortment===null?count:Math.min(detail.minAssortment,count);detail.maxAssortment=Math.max(detail.maxAssortment||0,count);
            score+=groupQty*(fit.weights.get(item)||0)/assessment.weightSum;detail.comparisonQty+=newQty;detail.comparisonGroupQty+=groupQty;coveredPositive+=Math.max(0,newQty);includedDays++;
          }
          const invalidDates=new Set(points.filter(p=>p.invalid||p.total<0).map(p=>p.date));
          for(const [r,ch,date] of own.orderRecords){
            if(r!==row.id||ch!==c||date<range.start||date>range.end)continue;
            const assessment=assess(date);if(assessment.reason||invalidDates.has(date)){detail.reason=detail.reason||assessment.reason;continue;}
            comparisonOrderKeys.add(r+'|'+ch+'|'+date);includedDays++;
          }
          if(own.missingOrderSales.some(([dish,r,ch,date])=>dish===d&&r===row.id&&ch===c&&!assess(date).reason&&!invalidDates.has(date)))incompleteOrders=true;
          detail.localItems=[...localItems].sort(collator.compare);detail.excludedQty=qty-detail.comparisonQty;
          if(includedDays){detail.expectedQty=score;detail.expectedShare=detail.comparisonGroupQty>0?score/detail.comparisonGroupQty:null;}
          else detail.reason=detail.reason||'no_comparable_group';
        }
        details.push(detail);if(detail.expectedQty===null)missingPairs.push(detail);else{expected+=detail.expectedQty;comparisonQty+=detail.comparisonQty;}
      }
      const expectedQty=details.some(p=>p.expectedQty!==null)?expected:null,comparisonOrders=own.orderRecords.filter(([r,c,date])=>comparisonOrderKeys.has(r+'|'+c+'|'+date)).reduce((s,o)=>s+o[3],0);
      const comparisonRate=comparisonOrders>0&&!incompleteOrders?100*comparisonQty/comparisonOrders:null,othersRate=expectedQty!==null&&comparisonRate!==null?100*expectedQty/comparisonOrders:null,deviation=expectedQty>0?100*(comparisonQty/expectedQty-1):null;
      const coverage=totalPositive>0?100*coveredPositive/totalPositive:null;
      return {...row,comparisonQty,comparisonOrders,comparisonRate,coverage,expectedQty,othersRate,deviation,diff:othersRate!==null&&comparisonRate!==null?comparisonRate-othersRate:null,details,missingPairs,model:'weights',modelVersion:2};
    });
  }
  function benchmark(D,f,context=null){return f.rankingMethod==='weights'?benchmarkWeighted(D,f,context):benchmarkClassic(D,f,context);}
  return {buildDataset,parseXlsx,defaults,calculate,benchmark,benchmarkClassic,benchmarkWeighted,dishDaily,weekly,addDays,diffDays,collator};
})();
if(typeof module!=='undefined')module.exports=MenuEngine;
