(() => {
  const E=MenuEngine,$=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=(v,d=0)=>v===null||v===undefined||!Number.isFinite(v)?'—':new Intl.NumberFormat('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
  const signedPercent=v=>v===null||!Number.isFinite(v)?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1,signDisplay:'exceptZero'}).format(Math.abs(v)<.05?0:v)+'%';
  const fmtDate=(s,year=false)=>s?`${s.slice(8,10)}.${s.slice(5,7)}${year?'.'+s.slice(0,4):''}`:'—';
  const shortName=s=>s.length>48?s.slice(0,45)+'…':s,colors=['#067b8a','#235dc1','#bd6c17','#7c5ac4','#ad4464','#4a6e92'];
  let D=JSON.parse($('dataset').textContent),F=E.defaults(D),ctx=null,tab='overview',metric='qty',sort={key:'rate',dir:-1},search='',page=1,restView='table',heatMetric='rate',channelMetric='rate',toastTimer=null,currentExport=[],activeDish=null,activeExpectation=null,expectationDish=null,benchmarkCache=null,knownDishDataset=null,knownDishIds=null;
  const savedView=JSON.parse($('dashboardState')?.textContent||'{}');
  let overviewSort={key:null,dir:-1};
  if(['qty','rate'].includes(savedView.metric))metric=savedView.metric;
  if(savedView.overviewSort&&(savedView.overviewSort.key==='total'||/^\d{4}-\d{2}-\d{2}$/.test(savedView.overviewSort.key))&&[1,-1].includes(savedView.overviewSort.dir))overviewSort={...savedView.overviewSort};
  let filtersOpen=false,filterOpener=null;
  function setFiltersOpen(open,restoreFocus=true){
    if(open&&!filtersOpen)filterOpener=document.activeElement;
    filtersOpen=open;$('filterDrawer').hidden=!open;$('filterBackdrop').hidden=!open;
    $('workspace').inert=open;document.body.classList.toggle('drawer-open',open);
    for(const id of ['filtersBtn','reportFiltersBtn'])$(id).setAttribute('aria-expanded',String(open));
    if(open)$('closeFiltersBtn').focus();
    else{
      document.querySelectorAll('#filterDrawer details[open]').forEach(p=>p.open=false);
      if(restoreFocus)(filterOpener||$('filtersBtn')).focus();
    }
  }
  if(savedView.filters){
    for(const field of ['start','end','type','window'])if(savedView.filters[field]!==undefined)F[field]=savedView.filters[field];
    if(['weights','classic','before'].includes(savedView.filters.rankingMethod))F.rankingMethod=savedView.filters.rankingMethod;
    for(const field of ['restaurants','channels','groups','dishes','launches'])if(Array.isArray(savedView.filters[field]))F[field]=new Set(savedView.filters[field].filter(v=>F[field].has(v)));
    if(['overview','dishes','restaurants','channels'].includes(savedView.tab))tab=savedView.tab;
  }
  function dishesWithSales(){
    if(knownDishDataset!==D){knownDishDataset=D;knownDishIds=new Set((D.availability||D.sales.filter(([d,r,c,date,q])=>q>0&&date>=D.dishes[d].start)).map(p=>p[0]));}
    return knownDishIds;
  }
  const visibleDishRows=(rows=ctx.dishRows)=>rows.filter(r=>dishesWithSales().has(r.id)&&r.start<=F.end&&(r.orders>0||r.qty!==0||r.cells?.some(p=>p.available)));
  function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',error?14000:5000);}
  function picker(field,title,entries,target,suffix=''){
    const html=`<span class="filter-label">${esc(title)}</span><details class="picker" data-picker="${field}"><summary id="summary-${field}${suffix}"></summary><div class="picker-pop"><input type="search" placeholder="Поиск" aria-label="Поиск: ${esc(title)}"><div class="picker-actions"><button class="text" data-pickall="${field}">Все</button><button class="text" data-picknone="${field}">Очистить</button></div><div class="picker-list">${entries.map(([value,label])=>`<label class="picker-option" data-label="${esc(label.toLocaleLowerCase('ru'))}"><input type="checkbox" data-field="${field}" data-value="${esc(value)}" ${F[field].has(value)?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div></div></details>`;
    $(target).innerHTML=html;
  }
  const partialRanking=()=>F.rankingMethod==='weights'||F.rankingMethod==='before';
  const rankingName=()=>({weights:'С весами ассортимента',classic:'По СКП остальной сети',before:'С учётом СКП до запуска'})[F.rankingMethod];
  function rankingControls(){return `<select data-control="rankingMethod" aria-label="Модель рейтинга"><option value="weights" ${F.rankingMethod==='weights'?'selected':''} ${D.menuItems?'':'disabled'}>С весами ассортимента</option><option value="classic" ${F.rankingMethod==='classic'?'selected':''}>По СКП остальной сети</option><option value="before" ${F.rankingMethod==='before'?'selected':''}>С учётом СКП до запуска</option></select>`;}
  function rankingDescription(){return F.rankingMethod==='before'?'Ожидание учитывает СКП сопоставимой части группы за 14 дней до запуска, динамику остальной сети и ассортимент. Сам ресторан исключён из весов и сетевой динамики':F.rankingMethod==='weights'?'Сравнение по общей части ассортимента, с весами остальной сети и отдельно по действующим каналам. Сам ресторан исключён.':'Ожидание по среднему СКП других ресторанов с равными весами; учтены ассортимент, каналы и даты запуска';}
  function setupFilters(){
    $('startDate').value=F.start;$('endDate').value=F.end;$('typeFilter').value=F.type;$('windowFilter').value=F.window;
    const dishes=D.dishes.map((d,i)=>({...d,id:i})).filter(d=>dishesWithSales().has(d.id)),launches=[...new Set(dishes.map(d=>d.start))].sort();
    picker('launches','Запуск',launches.map(x=>[x,fmtDate(x,true)]),'launchPicker');
    picker('restaurants','Ресторан',D.restaurants.map((r,i)=>[i,r]),'restaurantPicker');
    picker('channels','Канал',D.channels.map((r,i)=>[i,r]),'channelPicker');
    picker('groups','Группа',[...new Set(dishes.map(d=>d.group))].sort(E.collator.compare).map(x=>[x,x]),'groupPicker');
    picker('dishes','Блюдо',dishes.map(d=>[d.id,d.name]).sort((a,b)=>E.collator.compare(a[1],b[1])),'dishPicker');
    $('dataMeta').textContent=`${D.isDemo?'Демонстрационные данные · ':''}Данные: ${fmtDate(D.minDate,true)} — ${fmtDate(D.maxDate,true)} · ${dishes.length} блюд с продажами · ${D.restaurants.length} ресторанов в файле`;
    $('methodsBody').innerHTML=`<p><strong>Продажи на 100 заказов (СКП)</strong> считаются в штуках. Ассортимент определяется отдельно для каждого сочетания блюда, ресторана и канала по всей загруженной истории: хотя бы одна продажа после запуска в разрешённом для запуска ресторане означает, что блюдо там продаётся. В этом сочетании берём заказы с общей даты запуска, включая дни до первой продажи. При отсутствии продаж во всём файле заказы этого сочетания в базу блюда не входят. Календарный фильтр не меняет определение ассортимента. В итогах по нескольким блюдам подходящие заказы учитываются один раз.</p><p>Окно «Первые 7/14/28 дней» отсчитывается отдельно от даты запуска каждого блюда и пересекается с выбранным календарным периодом. Столбец «Дней данных» показывает дни с заказами, а не дни с продажами блюда. СКП блюд с разными датами запуска нельзя складывать.</p><p>Зал включает летнюю террасу и «Без Тарелок». Сезонные блюда имеют признак 0, новые — 1. Справочник ПК и таблица «Кухня_по КП» не используются.</p><p>Ноль означает, что блюдо входит в ассортимент и за выбранный период есть заказы, но нет продаж. Пустая ячейка — ресторан не участвует в запуске блюда либо его продаж нет во всей загруженной истории выбранных каналов. При отсутствии подходящих заказов СКП обозначен «—». Общий СКП показывает фактические продажи меню на 100 подходящих заказов. Для рейтинга ресторанов используем отклонение от ожидаемых продаж: (факт ÷ ожидание − 1) × 100%. +20% означает продажи на 20% выше ожидаемых, −20% — ниже, 0% — на уровне ожидания.</p><p><strong>Прежний расчёт ожидания по СКП:</strong> отдельно для каждого блюда и канала считаем СКП каждого другого ресторана с даты запуска с учётом выбранного периода и окна. Берём среднее арифметическое этих СКП: у каждого ресторана одинаковый вес независимо от числа заказов. В среднее входят рестораны, где блюдо продаётся в этом канале и есть подходящие заказы за выбранный период; нулевые продажи за период учитываются. Полученное среднее умножаем на подходящие заказы оцениваемого ресторана и делим на 100. Складываем ожидания только по его ассортименту. Сам ресторан из сравнения исключён; выбор ресторанов в фильтре ограничивает строки рейтинга, но база сравнения включает всю остальную сеть. «Ожидаемый СКП» — ожидаемые продажи на 100 заказов оцениваемого ресторана. Факт и ожидание здесь имеют одну базу заказов. Отклонения не обязаны суммироваться в ноль: у ресторанов могут различаться ассортимент, каналы и сроки продаж.</p><p>Рейтинг по умолчанию отсортирован по отклонению от ожидания. В прежнем расчёте по СКП, если для хотя бы одного продаваемого блюда и канала нет базы заказов в остальных ресторанах, ожидание и отклонение всего меню обозначены «—». При нулевом ожидании процентное отклонение также не рассчитывается. Наведите на «—», чтобы увидеть причину.</p><p>Источники: «Поток продаж», «СПР», ${D.launchPairs?'«Рестораны_Блюдо», ':''}«${esc(D.audit.checksSource)}». Данные сводных таблиц не используются. В файле ${n(D.audit.rawSales)} строк продаж; после объединения каналов — ${n(D.sales.length)}.</p>${D.audit.unknownSales?`<p><strong>За пределами справочника:</strong> ${n(D.audit.unknownSales)} строк продаж (${esc(D.audit.unknownNames.slice(0,8).join(', '))}). Они не входят в продажи нового и сезонного меню.</p>`:''}${D.audit.beforeStart?`<p><strong>До дат запуска:</strong> ${n(D.audit.beforeStart)} строк продаж. Они исключены из расчёта.</p>`:''}<p>Загрузка нового Excel полностью заменяет текущие данные. Справочник, классификация и даты запуска читаются заново. «Сохранить с данными» создаёт HTML для следующего открытия или передачи коллегам. Интернет для работы не нужен.</p>`;
    updateSummaries();
    $('methodsBody').innerHTML+=`<p><strong>Рейтинг с весами ассортимента.</strong> Для каждого нового или сезонного блюда подбираем веса популярности по продажам всей его группы в остальной сети с даты запуска, отдельно по каналам и выбранному периоду. Оцениваемый ресторан полностью исключён; каждый другой ресторан имеет одинаковый вес независимо от объёма продаж группы. Количество и популярность альтернатив учитываются через сумму их весов. Фильтры отдельных блюд, Новое и Сезонное ограничивают оцениваемые блюда, а база весов использует всю группу.</p><p><strong>Общая база сравнения.</strong> В оцениваемом ресторане берём доступные блюда группы, для которых есть сопоставимый вес в остальной сети. Локальные блюда без такого веса исключаются и из суммы весов, и из продаж группы для ожидания. Их фактические продажи сохраняются в общих показателях. Ожидание за день = продажи сопоставимой части группы × вес новинки ÷ сумму весов сопоставимых доступных блюд. При разных наборах ассортимента используем общие блюда, позволяющие связать их веса. За дни, блюда и каналы ожидания суммируются.</p><p><strong>Каналы и охват.</strong> Канал, в котором ресторан не продаёт выбранное меню, не участвует в его рейтинге. Для действующего канала используем данные других ресторанов в этом же канале. Если для отдельной новинки или дня нет веса новинки либо сопоставимых обычных блюд группы, только соответствующие продажи остаются вне сравнения. Рейтинг остальных продаж рассчитывается. «Продано» — все продажи выбранных блюд, «Факт в сравнении» — продажи, вошедшие в оценку. «Охват» — доля положительных продаж новинок, для которых рассчитано ожидание. При охвате 0% рейтинг отсутствует. Нажмите «Ожидаемо, шт.» для списка исключений и расчёта.</p><p>Отклонение = (факт в сравнении ÷ ожидание − 1) × 100%. «СКП факт в сравнении» и ожидаемый СКП используют одну базу: объединение подходящих записей по сравниваемым блюдам, каналам и дням; каждую запись учитываем один раз, с даты запуска, включая дни до первой продажи. В других таблицах и общих итогах СКП относится ко всем выбранным продажам. При нулевом ожидании процентное отклонение не рассчитывается. Результаты с разным охватом следует читать с учётом того, какая часть продаж оценена.</p><p>Ассортимент определяется по всей истории отдельно по ресторану и каналу; новинки включаются с общей даты запуска, обычные блюда — за весь период. При новой загрузке веса и общая база пересчитываются. Оценка показывает результат новинок внутри сопоставимого ассортимента их групп; она не измеряет прирост общего спроса или выручки относительно периода до запуска. Отклонения ресторанов не обязаны суммироваться в ноль.</p>${D.menuItems?`<p>В базе весов: ${n(D.menuItems.length)} блюд, включая обычное меню, из ${n(new Set(D.menuItems.map(i=>i.group)).size)} групп. По умолчанию включён рейтинг «С учётом СКП до запуска»; модель с весами и прежний расчёт по СКП доступны в переключателе.</p>`:'<p>Для модели с весами нужен столбец «Группа меню» и продажи всех блюд этих групп на листе «Поток продаж». Для расчёта без групп можно выбрать «По СКП остальной сети».</p>'}`;
    $('methodsBody').innerHTML+=`<p><strong>С учётом СКП до запуска:</strong> для каждого блюда и канала берём собственный СКП сопоставимой части группы за 14 дней перед запуском. Умножаем его на отношение средних СКП после и до по одному набору остальных ресторанов и на долю блюда в текущем ассортименте. Сам ресторан исключён из весов и динамики сети. История до хранится отдельно; она не меняет основные продажи и ассортимент. Отсутствующий источник группы не подменяется нулём. Охват базы до и охват рейтинга показаны отдельно в детализации. Показатель — описательный ориентир. ${D.history?.audit.prematureSales?`В истории исключено строк с продажами новинок до их запуска: ${n(D.history.audit.prematureSales)}.`:''}</p>`;
    $('methodsBody').innerHTML+=launchInfo();
  }
  function launchInfo(){
    if(!D.launchPairs){
      $('launchMeta').textContent='Список запусков не загружен. Для расчёта по новым правилам загрузите Excel с листом «Рестораны_Блюдо».';
      return '<p><strong>Ранее сохранённые данные:</strong> список запусков отсутствует; применяется прежнее определение по продажам. Загрузите новый Excel с листом «Рестораны_Блюдо».</p>';
    }
    const a=D.audit.launches;
    $('launchMeta').textContent=`Запуски по списку · ${n(D.launchPairs.length)} пар блюдо–ресторан · все блюда СПР найдены`;
    return `<p><strong>Список запусков:</strong> «СПР» и «Рестораны_Блюдо» сопоставлены строго по коду, названия на листе запусков не используются. Все блюда СПР, включая сезонные и блюда без продаж, должны иметь хотя бы один ресторан в списке. Оцениваем только указанные пары; список сам по себе не подтверждает действующий канал. ${a?.unknownCodes.length?`Кодов вне СПР: ${n(a.unknownCodes.length)} — они не добавляют новинки.`:''}</p><p>Продажи блюда СПР в ресторане вне списка не входят в показатели нового и сезонного меню, его базу заказов и факт рейтинга. В подходящей группе они остаются обычными продажами для весов и истории, в том числе до общей даты запуска блюда. Для разрешённых пар сохраняются дата запуска, отдельные окна и действующие каналы. ${a?.outsideLaunchRows?`За все даты «Потока продаж» вне списка запусков: ${n(a.outsideLaunchRows)} строк, ${n(a.outsideLaunchQty)} шт.`:''}</p>`;
  }
  function updateSummaries(){
    for(const field of ['launches','restaurants','channels','groups','dishes']){
      const checks=[...document.querySelectorAll(`input[data-field="${field}"]`)];
      for(const c of checks){const v=['restaurants','channels','dishes'].includes(field)?Number(c.dataset.value):c.dataset.value;c.checked=F[field].has(v);}
      const uniqueCount=new Set(checks.map(c=>c.dataset.value)).size,selectedCount=new Set(checks.filter(c=>c.checked).map(c=>c.dataset.value)).size;
      const label=selectedCount===0?'Ничего не выбрано':selectedCount===uniqueCount?'Все':selectedCount===1?checks.find(c=>c.checked)?.parentElement.textContent.trim():`Выбрано: ${selectedCount} из ${uniqueCount}`;
      $('summary-'+field).textContent=label;$('summary-'+field).title=label;
      // The expectation dialog has no restaurant picker, including during a resize render.
      const dialogSummary=field==='restaurants'&&$('dishDialog').open?$('summary-restaurants-dialog'):null;
      if(dialogSummary){dialogSummary.textContent=label;dialogSummary.title=label;}
    }
  }
  function updateFilterBar(){
    const chips=[`Период: ${fmtDate(F.start,true)} — ${fmtDate(F.end,true)}`];
    let count=Number(F.start!==D.minDate||F.end!==D.maxDate);
    if(F.type!=='all'){chips.push(`Меню: ${F.type==='1'?'Новое':'Сезонное'}`);count++;}
    if(F.window){chips.push(`После запуска: первые ${F.window} дней`);count++;}
    for(const [field,label] of [['launches','Запуск'],['restaurants','Ресторан'],['channels','Канал'],['groups','Группа'],['dishes','Блюдо']]){
      const value=$('summary-'+field).textContent;
      if(value!=='Все'){chips.push(`${label}: ${value}`);count++;}
    }
    if(F.rankingMethod!=='before'){chips.push(`Рейтинг: ${rankingName()}`);count++;}
    $('activeFilters').innerHTML=chips.map(s=>`<span class="filter-chip">${esc(s)}</span>`).join('')+(count?'':'<span class="muted">Все рестораны и каналы · весь ассортимент</span>');
    $('filterCount').textContent=count;$('filterCount').hidden=!count;
    $('resetBtn').disabled=!count;
    $('tabTitle').textContent={overview:'Обзор',dishes:'Блюда',restaurants:'Рестораны',channels:'Каналы'}[tab];
    $('content').setAttribute('aria-labelledby','tab-'+tab);
  }
  function panel(title,body,sub='',controls=''){return`<section class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${sub?`<p class="sub">${esc(sub)}</p>`:''}</div>${controls}</div>${body}</section>`;}
  const empty=message=>`<div class="empty">${esc(message||'Нет данных для выбранных фильтров.')}</div>`;
  const months=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const shortDate=s=>s?Number(s.slice(8,10))+'.'+months[Number(s.slice(5,7))-1]:'';
  const dishOrder=(a,b)=>a.start.localeCompare(b.start)||b.qty-a.qty||E.collator.compare(a.name,b.name);
  const valueOf=(row,key)=>row&&(row.orders>0||row.qty!==0)?row[key]:null;
  function softScale(values){
    const numbers=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!numbers.length)return()=>'';
    const lo=numbers[0],hi=numbers.at(-1),middle=(numbers[Math.floor((numbers.length-1)/2)]+numbers[Math.ceil((numbers.length-1)/2)])/2;
    const mid=middle>lo&&middle<hi?middle:(lo+hi)/2;
    const red=[250,222,222],yellow=[255,243,201],green=[211,237,216];
    return v=>{
      if(!Number.isFinite(v))return '';
      if(hi===lo)return 'rgb('+yellow.join(',')+')';
      const lower=v<=mid,a=lower?red:yellow,b=lower?yellow:green;
      const t=Math.max(0,Math.min(1,lower?(v-lo)/(mid-lo):(v-mid)/(hi-mid)));
      return 'rgb('+a.map((x,i)=>Math.round(x+(b[i]-x)*t)).join(',')+')';
    };
  }
  function coloredCell(v,scale,decimals=0,title='',classes='',missing=''){
    const valid=Number.isFinite(v),color=valid?scale(v):'';
    return `<td class="${classes}${valid?' heat-cell':''}"${color?` style="background:${color};color:var(--ink)"`:''}${valid?` data-value="${v}"`:''}${title?` title="${esc(title)}"`:''}>${valid?n(v,decimals):missing}</td>`;
  }
  function totalCell(v,decimals=0,classes=''){
    return `<td class="total-cell ${classes}"${Number.isFinite(v)?` data-value="${v}"`:''}>${Number.isFinite(v)?n(v,decimals):''}</td>`;
  }
  function heatLegend(){return '<p class="sub heat-legend"><span><i class="heat-low"></i>Низкие значения</span><span><i class="heat-mid"></i>Средние</span><span><i class="heat-high"></i>Высокие</span></p>';}
  function chartControls(extra=''){
    return `<div class="chart-controls"><select data-control="metric" aria-label="Показатель таблицы и сравнения запусков"><option value="qty" ${metric==='qty'?'selected':''}>Продано, шт.</option><option value="rate" ${metric==='rate'?'selected':''}>СКП на 100 заказов</option></select>${extra}</div>`;
  }
  function lineChart(labels,series,unit='СКП на 100 заказов',host='content'){
    if(!labels.length)return empty();const width=Math.max(320,Math.round(($(host).clientWidth||1042)-(host==='dishDialogBody'?92:42))),height=310,left=58,right=22,top=25,bottom=47,plotW=width-left-right,plotH=height-top-bottom;
    const vals=series.flatMap(s=>s.values).filter(v=>v!==null&&Number.isFinite(v));if(!vals.length)return empty('Заказы для расчёта отсутствуют.');
    const min=Math.min(0,...vals),max=Math.max(0,...vals),rawStep=Math.max(1,(max-min)/4),power=10**Math.floor(Math.log10(rawStep)),step=[1,2,5,10].map(m=>m*power).find(v=>v>=rawStep);
    const lo=Math.floor(min/step)*step,hi=Math.max(lo+step,Math.ceil(max/step)*step);
    const y=v=>top+(hi-v)/(hi-lo)*plotH,x=i=>left+(labels.length===1?plotW/2:i/(labels.length-1)*plotW),grid=[];
    for(let v=lo;v<=hi;v+=step){const yy=y(v);grid.push(`<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#e0e7ef"/><text x="${left-12}" y="${yy+4}" text-anchor="end" fill="#627385" font-size="13">${esc(n(v,0))}</text>`);}
    const every=Math.max(1,Math.ceil(labels.length/10));for(let i=0;i<labels.length;i++){if(i%every===0||i===labels.length-1)grid.push(`<text x="${x(i)}" y="${height-16}" text-anchor="middle" fill="#627385" font-size="13">${esc(labels[i])}</text>`);}
    const lines=series.map(s=>{let paths=[],cur=[];s.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v)){if(cur.length)paths.push(cur.join(' '));cur=[];}else cur.push((cur.length?'L':'M')+x(i).toFixed(2)+' '+y(v).toFixed(2));});if(cur.length)paths.push(cur.join(' '));return paths.map(p=>`<path d="${p}" fill="none" stroke="${s.color}" stroke-width="2.8" stroke-linejoin="round"/>`).join('')+s.values.map((v,i)=>v===null||!Number.isFinite(v)?'':`<circle cx="${x(i)}" cy="${y(v)}" r="${labels.length>50?2:3.4}" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${esc(n(v,unit==='Продано, шт.'?0:2))}</title></circle>`).join('');}).join('');
    return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(unit)}"><title>${esc(unit)}. ${series.map(s=>esc(s.name)).join(', ')}</title>${grid.join('')}${lines}</svg></div><div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function salesDynamics(){
    const data=E.dishDaily(D,F,ctx),decimals=metric==='qty'?0:2;
    const rows=visibleDishRows(data.rows).sort(dishOrder),cellValue=p=>p?.available?p[metric]:null;
    if(overviewSort.key&&overviewSort.key!=='total'&&!data.dates.includes(overviewSort.key))overviewSort={key:null,dir:-1};
    if(overviewSort.key){
      const index=data.dates.indexOf(overviewSort.key),value=r=>overviewSort.key==='total'?valueOf(r,metric):cellValue(r.cells[index]);
      rows.sort((a,b)=>{
        const av=value(a),bv=value(b),validA=Number.isFinite(av),validB=Number.isFinite(bv);
        return validA!==validB?(validA?-1:1):validA?(av-bv)*overviewSort.dir||dishOrder(a,b):dishOrder(a,b);
      });
    }
    const scale=softScale(rows.flatMap(r=>r.cells.map(cellValue)));
    const starts=[...new Set(rows.map(r=>r.start))],exportRows=[];
    const dishRow=r=>{
      const values=r.cells.map(cellValue),total=valueOf(r,metric);
      exportRows.push([r.name,r.start,...values,total]);
      return `<tr data-daily-dish="${r.id}"><td class="name"><button class="text" data-dish="${r.id}">${esc(r.name)}</button>${overviewSort.key?`<div class="sub">Запуск ${shortDate(r.start)}</div>`:''}</td>${r.cells.map(p=>coloredCell(cellValue(p),scale,decimals,r.name+' · '+fmtDate(p.date,true))).join('')}${totalCell(total,decimals,'total-col')}</tr>`;
    };
    const groups=overviewSort.key?rows.map(dishRow).join(''):starts.map(start=>{
      const group=E.calculate(D,{...F,launches:new Set([start])}),points=new Map(group.daily.map(p=>[p.date,p]));
      const values=data.dates.map(date=>valueOf(points.get(date),metric)),total=valueOf(group,metric);
      exportRows.push(['Запуск '+shortDate(start),start,...values,total]);
      const head=`<tr class="launch-row"><td>Запуск ${shortDate(start)}</td>${values.map(v=>totalCell(v,decimals)).join('')}${totalCell(total,decimals,'total-col')}</tr>`;
      const body=rows.filter(r=>r.start===start).map(dishRow).join('');
      return head+body;
    }).join('');
    const totalPoints=new Map(ctx.daily.map(p=>[p.date,p])),totalValues=data.dates.map(date=>valueOf(totalPoints.get(date),metric)),grand=valueOf(ctx,metric);
    exportRows.push(['Итого','',...totalValues,grand]);
    currentExport={kind:'dynamics',headers:['Блюдо','Запуск',...data.dates.map(shortDate),'Итого'],rows:exportRows};
    const heading=(label,key,classes='',title=label)=>{
      const selected=overviewSort.key===key;
      return `<th class="${classes}" title="${esc(title)}" aria-sort="${selected?(overviewSort.dir===1?'ascending':'descending'):'none'}"><button data-daily-sort="${key}" aria-label="Сортировать: ${esc(title)}">${esc(label)}${selected?(overviewSort.dir===1?' ↑':' ↓'):''}</button></th>`;
    };
    return `<div class="table-wrap"><table class="daily-matrix"><thead><tr><th>Блюдо</th>${data.dates.map(date=>heading(shortDate(date),date,'',fmtDate(date,true))).join('')}${heading('Итого','total','total-col')}</tr></thead><tbody>${groups}</tbody><tfoot><tr><td>Итого</td>${totalValues.map(v=>totalCell(v,decimals)).join('')}${totalCell(grand,decimals,'total-col')}</tr></tfoot></table></div>${heatLegend()}`;
  }
  function launchComparison(){
    const cohorts=ctx.cohort.filter(c=>c.points.some(p=>Number.isFinite(p[metric])&&(p.orders>0||p.qty!==0)));
    if(cohorts.length<=1)return '';
    const maxDay=Math.max(...cohorts.flatMap(c=>c.points.map(p=>p.day)));
    const series=cohorts.map((c,i)=>({name:'Запуск '+shortDate(c.start),color:colors[i%colors.length],values:Array.from({length:maxDay},(_,d)=>c.points.find(p=>p.day===d+1)?.[metric]??null)}));
    const pending=visibleDishRows().filter(d=>F.window&&d.days<F.window);
    const note=F.window&&pending.length?`${pending.length} блюд: доступно меньше ${F.window} дней. Сравнение использует только загруженные данные.`:'Показатели каждого запуска отсчитываются от его собственной даты старта.';
    return panel('Сравнение запусков',lineChart(Array.from({length:maxDay},(_,i)=>String(i+1)),series,metric==='rate'?'СКП на 100 заказов':'Продано, шт.'),'Горизонтальная ось — день после запуска. '+note);
  }
  function rankings(rows,isDish){
    const measure=isDish?'rate':'deviation',top=rows.filter(r=>r[measure]!==null).sort((a,b)=>b[measure]-a[measure]).slice(0,7),max=Math.max(1,...top.map(r=>Math.abs(r[measure])));
    if(!top.length)return empty(isDish?'Нет данных для рейтинга блюд.':'Нет базы для сравнения ресторанов. '+(F.rankingMethod==='before'?[...new Set(rows.flatMap(r=>(r.details||[]).filter(p=>p.reason).map(pairReason)))].join('; '):''));
    return`<div class="rank-list">${top.map(r=>{const v=r[measure],bar=isDish?`<div class="rank-bar"><div style="width:${Math.max(0,v)/max*100}%"></div></div>`:`<div class="rank-bar delta"><div style="left:${v<0?50-Math.abs(v)/max*50:50}%;width:${Math.abs(v)/max*50}%;background:${v<0?'#af332b':'#067b8a'}"></div></div>`;return`<div class="rank-item ${isDish?'':'performance'}"><div class="rank-label">${isDish?`<button class="text" data-dish="${r.id}" title="${esc(r.name)}">${esc(shortName(r.name))}</button>`:esc(r.name)}${r.model==='before'?`<div class="sub">Охват ${coverageText(r.coverage)}</div>`:''}</div>${bar}<div class="rank-value ${!isDish&&v>0?'positive':!isDish&&v<0?'negative':''}" ${isDish?'':`title="Факт в сравнении: ${n(['weights','before'].includes(r.model)?r.comparisonQty:r.qty)} шт.; ожидание: ${n(r.expectedQty,1)} шт."`}>${isDish?n(v,2):signedPercent(v)}</div></div>`;}).join('')}</div>`;
  }
  function renderOverview(){
    return panel('Динамика продаж',salesDynamics(),'Нажмите дату или «Итого» для сортировки. СКП считается по общей базе.',chartControls(overviewSort.key?'<button class="text" data-daily-reset>По запускам</button>':''))+launchComparison()+`<div class="two-col">${panel('Блюда: лидеры по СКП',rankings(visibleDishRows(),true),'Шт. на 100 заказов с даты запуска каждого блюда')}${panel('Рестораны: рейтинг продаж',(F.rankingMethod==='before'?rankingStatus():'')+rankings(benchmarkRows().filter(r=>r.qty!==0),false),rankingDescription(),rankingControls())}</div>`;
  }
  function sorted(rows){return rows.filter(r=>!search||keySearch(r.name).includes(keySearch(search))).sort((a,b)=>{const av=a[sort.key],bv=b[sort.key];if((av===null||av===undefined)&&(bv===null||bv===undefined))return E.collator.compare(a.name,b.name);if(av===null||av===undefined)return 1;if(bv===null||bv===undefined)return-1;return(typeof av==='string'?E.collator.compare(av,bv):av-bv)*sort.dir||E.collator.compare(a.name,b.name);});}
  const keySearch=x=>String(x).toLocaleLowerCase('ru');
  function th(label,key){return`<th><button data-sort="${key}" aria-label="Сортировать: ${esc(label)}">${esc(label)}${sort.key===key?(sort.dir===1?' ↑':' ↓'):''}</button></th>`;}
  function tableToolbar(extra=''){return`<div class="toolbar"><input type="search" id="tableSearch" placeholder="Поиск по названию" aria-label="Поиск в таблице" value="${esc(search)}"><div class="toolbar-right">${extra}</div></div>`;}
  function dishTable(rows,dialog=false){
    const r=dialog?rows:sorted(rows),qtyScale=softScale(r.map(x=>valueOf(x,'qty'))),rateScale=softScale(r.map(x=>x.rate));
    if(!dialog)currentExport={kind:'dishes',headers:['Блюдо','Группа','Тип','Запуск','Продано, шт.','СКП на 100 заказов','Дней данных','Ресторанов с продажами'],rows:r.map(x=>[x.name,x.group,x.type?'Новое':'Сезонное',x.start,valueOf(x,'qty'),x.rate,x.days,x.restaurants])};
    return `<div class="table-wrap"><table><thead><tr>${th('Блюдо','name')}${th('Группа','group')}${th('Тип','type')}${th('Запуск','start')}${th('Продано, шт.','qty')}${th('СКП на 100','rate')}${th('Дней данных','days')}${th('Ресторанов','restaurants')}</tr></thead><tbody>${r.map(x=>`<tr data-dish-row="${x.id}"><td class="name"><button class="text" data-dish="${x.id}">${esc(x.name)}</button></td><td class="group-cell">${esc(x.group)}</td><td><span class="tag ${x.type?'':'season'}">${x.type?'Новое':'Сезонное'}</span></td><td>${shortDate(x.start)}</td>${coloredCell(valueOf(x,'qty'),qtyScale)}${coloredCell(x.rate,rateScale,2)}<td title="Дни с данными после запуска">${n(x.days)}${F.window&&x.days<F.window?` <span class="muted">/ ${F.window}</span>`:''}</td><td>${n(x.restaurants)}</td></tr>`).join('')||`<tr><td colspan="8">${empty()}</td></tr>`}</tbody></table></div>`;
  }
  function renderDishes(){return panel('Продажи по блюдам',tableToolbar()+dishTable(visibleDishRows()),'СКП рассчитан с даты запуска в ресторанах и каналах, где блюдо входит в ассортимент. Нажмите название для карточки.');}
  function benchmarkRows(c=ctx,filters=F){
    if(benchmarkCache?.context===c)return benchmarkCache.rows;
    const rows=E.benchmark(D,filters,c);benchmarkCache={context:c,rows};return rows;
  }
  function pairReason(p){return ({no_before_group:'Нет данных группы до запуска',incomplete_history:'История не покрывает все 14 дней до запуска',zero_before:'Нулевой СКП группы до запуска',source_conflict:'Конфликт пересекающихся источников',no_network_base:'Нет ресторанов с корректной базой до и после для динамики сети',missing_groups:'нет продаж всех блюд группы',no_orders:'нет данных для расчёта СКП',incomplete_orders:'Продажи без подходящей записи заказов',only_new:'в группе нет обычных блюд для сравнения',no_peer_dish:'нет базы по блюду в остальной сети',not_converged:'недостаточно устойчивое решение модели',unseen_items:'неизвестен вес блюд: '+(p.unseenItems||[]).join(', '),no_comparable_group:'нет сопоставимых обычных блюд группы в этом канале',no_group_reference:'нет положительных весов группы',disconnected:'не хватает общих блюд между наборами ассортимента',negative_counts:'Отрицательные продажи базы'})[p.reason]||'нет базы сравнения в остальной сети';}
  function comparisonReason(r){
    if(r.missingPairs?.length)return r.missingPairs.map(p=>D.dishes[p.dish].name+' / '+D.channels[p.channel]+': '+pairReason(p)).join('; ');
    if(r.orders<=0)return 'Нет подходящих заказов за выбранный период.';
    if(r.expectedQty===0)return 'Ожидаемые продажи равны нулю; процентное отклонение не рассчитывается.';
    return 'Нет данных для сравнения.';
  }
  const coverageText=v=>v===null||v===undefined?'—':n(v,Math.abs(v-100)<1e-9?0:2)+'%';
  function comparisonNotes(r){
    const messages=[];
    if(r.details?.some(p=>p.localItems?.length))messages.push('Локальные альтернативы исключены из продаж и весов базы группы.');
    for(const p of r.details||[])if(p.reason)messages.push(D.dishes[p.dish].name+' / '+D.channels[p.channel]+': '+pairReason(p));
    if(r.model==='before')for(const p of r.details||[]){
      if(p.beforeCoverage!==null)messages.push(D.dishes[p.dish].name+' / '+D.channels[p.channel]+': охват базы до '+coverageText(p.beforeCoverage)+'.');
      if(p.networkRestaurants===1)messages.push('Динамика сети рассчитана по одному ресторану; оценка чувствительна к составу базы.');
    }
    if(r.deviation===null&&!messages.length)messages.push(comparisonReason(r));
    return [...new Set(messages)].join(' ');
  }
  function restTable(rows,compact=false){
    const weighted=partialRanking(),r=(compact?rows:sorted(rows)).filter(x=>x.qty!==0);
    const scales=Object.fromEntries(['qty','comparisonQty','comparisonRate','coverage','expectedQty','rate','othersRate','deviation','diff'].map(k=>[k,softScale(r.map(x=>x[k]))]));
    if(!compact)currentExport=weighted?{kind:'restaurants',headers:['Ресторан','Отклонение от ожидаемых продаж, %','Продано всего, шт.','Факт в сравнении, шт.','Ожидаемо, шт.','Охват продаж, %','СКП факт в сравнении на 100','Ожидаемый СКП на 100','Разница, шт. на 100','Блюд с продажами','Пояснение'],rows:r.map(x=>[x.name,x.deviation,x.qty,x.comparisonQty,x.expectedQty,x.coverage,x.comparisonRate,x.othersRate,x.diff,x.dishes,comparisonNotes(x)])}:{kind:'restaurants',headers:['Ресторан','Отклонение от ожидаемых продаж, %','Продано, шт.','Ожидаемо, шт.','СКП факт на 100','Ожидаемый СКП на 100','Разница, шт. на 100','Блюд с продажами','Причина отсутствия сравнения'],rows:r.map(x=>[x.name,x.deviation,x.qty,x.expectedQty,x.rate,x.othersRate,x.diff,x.dishes,x.deviation===null?comparisonReason(x):''])};
    if(!compact){currentExport.headers.unshift('Модель рейтинга');currentExport.rows.forEach(row=>row.unshift(rankingName()));}
    const headers=compact?'<th>Ресторан</th><th>Отклонение, %</th><th>Факт, шт.</th><th>Ожидаемо, шт.</th>'+(weighted?'<th>Охват</th>':'<th>СКП факт</th>'):th('Ресторан','name')+th('Отклонение, %','deviation')+th('Продано, шт.','qty')+(weighted?th('Факт в сравнении, шт.','comparisonQty'):'')+th('Ожидаемо, шт.','expectedQty')+(weighted?th('Охват','coverage'):'')+th(weighted?'СКП факт в сравнении':'СКП факт',weighted?'comparisonRate':'rate')+th('Ожидаемый СКП','othersRate')+th('Разница, шт. на 100','diff')+th('Блюд','dishes');
    const body=r.map(x=>{
      const fact=weighted?x.comparisonQty:x.qty,rate=weighted?x.comparisonRate:x.rate,note=comparisonNotes(x),coverage=weighted?`<td title="Доля продаж, вошедшая в сравнение. ${esc(note)}">${coverageText(x.coverage)}</td>`:'';
      const expectedCell=weighted&&(!compact||F.rankingMethod==='before')?`<td${Number.isFinite(x.expectedQty)?` style="background:${scales.expectedQty(x.expectedQty)}"`:''}><button class="text expected-value" data-expectation="${x.id}" title="${esc(x.expectedQty===null?comparisonReason(x):'Нажмите для расчёта ожидания и состава общей базы')}">${n(x.expectedQty,1)}</button></td>`:coloredCell(x.expectedQty,scales.expectedQty,1,x.expectedQty===null?comparisonReason(x):rankingDescription(),'','—');
      return `<tr data-restaurant-row="${x.id}"><td class="name">${esc(x.name)}</td><td class="${x.deviation>0?'positive':x.deviation<0?'negative':''}"${x.deviation!==null?` style="background:${scales.deviation(x.deviation)}"`:''} title="${esc(x.deviation===null?comparisonReason(x):'(Факт '+(weighted?'в сравнении ':'')+'÷ ожидание − 1) × 100%')}"><strong>${signedPercent(x.deviation)}</strong></td>${compact?coloredCell(fact,weighted?scales.comparisonQty:scales.qty):coloredCell(x.qty,scales.qty)+(weighted?coloredCell(fact,scales.comparisonQty,0,'Продажи, для которых удалось рассчитать ожидание. '+note):'')}${expectedCell}${compact?(weighted?coverage:coloredCell(rate,scales.rate,2,'','','—')):coverage+coloredCell(rate,weighted?scales.comparisonRate:scales.rate,2,weighted?'СКП продаж в сравнении; база общая с ожидаемым СКП.':'','','—')+coloredCell(x.othersRate,scales.othersRate,2,'Ожидаемые продажи на 100 подходящих заказов сравниваемой части меню.','','—')+`<td class="${x.diff>0?'positive':x.diff<0?'negative':''}"${x.diff!==null?` style="background:${scales.diff(x.diff)}"`:''}>${x.diff>0?'+':''}${n(x.diff,2)}</td><td>${n(x.dishes)}</td>`}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${body||`<tr><td colspan="${compact?5:weighted?10:8}">${empty()}</td></tr>`}</tbody></table></div>`;
  }
  function heatmap(){
    const ds=visibleDishRows().sort(dishOrder);
    const rs=sorted(benchmarkRows()).filter(r=>ds.some(d=>ctx.matrixAvailable.has(d.id+'|'+r.id)));
    const filtered={...F,restaurants:new Set(rs.map(r=>r.id))},totals=E.calculate(D,filtered),dishTotals=new Map(totals.dishRows.map(d=>[d.id,d])),decimals=heatMetric==='qty'?0:2;
    const cell=(d,r)=>{const key=d.id+'|'+r.id,q=ctx.matrixQty.get(key)||0,b=ctx.matrixOrders.get(key)||0,available=ctx.matrixAvailable.has(key);return {q,v:available?(heatMetric==='qty'?q:b>0&&!ctx.badMatrix.has(key)?100*q/b:null):null};};
    const scale=softScale(rs.flatMap(r=>ds.map(d=>cell(d,r).v))),grand=valueOf(totals,heatMetric);
    currentExport={kind:'matrix',headers:['Ресторан',...ds.map(d=>d.name),'Итого'],rows:[...rs.map(r=>[r.name,...ds.map(d=>cell(d,r).v),valueOf(r,heatMetric)]),['Итого',...ds.map(d=>valueOf(dishTotals.get(d.id),heatMetric)),grand]]};
    const body=rs.map(r=>`<tr data-matrix-restaurant="${r.id}"><td>${esc(r.name)}</td>${ds.map(d=>{const p=cell(d,r);return coloredCell(p.v,scale,decimals,d.name+' · '+r.name+(p.v!==null?': '+n(p.q)+' шт.':''));}).join('')}${totalCell(valueOf(r,heatMetric),decimals,'total-col')}</tr>`).join('');
    return `<div class="table-wrap"><table class="matrix"><thead><tr><th>Ресторан</th>${ds.map(d=>`<th data-matrix-dish="${d.id}"><button class="text" data-dish="${d.id}">${esc(d.name)}</button><div class="muted">${shortDate(d.start)}</div></th>`).join('')}<th class="total-col">Итого</th></tr></thead><tbody>${body||`<tr><td colspan="${ds.length+2}">${empty()}</td></tr>`}</tbody>${rs.length?`<tfoot><tr><td>Итого</td>${ds.map(d=>totalCell(valueOf(dishTotals.get(d.id),heatMetric),decimals)).join('')}${totalCell(grand,decimals,'total-col')}</tr></tfoot>`:''}</table></div>${heatLegend()}<p class="sub">Пусто — блюдо не входит в ассортимент или нет данных для расчёта. Ноль — блюдо входит в ассортимент, но за период нет продаж. Итоговый СКП рассчитан из суммарных продаж и подходящей базы, с учётом дат запуска.</p>`;
  }
  function rankingStatus(){
    if(!partialRanking())return '';
    const rows=benchmarkRows().filter(r=>r.qty!==0),scored=rows.filter(r=>r.deviation!==null),partial=rows.filter(r=>r.coverage!==null&&r.coverage<100-1e-9).length;
    return `<p class="sub">Рейтинг рассчитан для ${n(scored.length)} из ${n(rows.length)} ресторанов с продажами.${partial?' Частичный охват: '+n(partial)+' ресторанов.':''} Отклонение использует «Факт в сравнении». Локальные альтернативы и причины исключений доступны по нажатию «Ожидаемо, шт.».</p>`;
  }
  function renderRestaurants(){
    const extra=`<div class="seg"><button data-restview="table" class="${restView==='table'?'selected':''}">Рейтинг</button><button data-restview="matrix" class="${restView==='matrix'?'selected':''}">Ресторан × Блюдо</button></div>${restView==='matrix'?`<select data-control="heatMetric" aria-label="Показатель матрицы"><option value="rate" ${heatMetric==='rate'?'selected':''}>СКП на 100 заказов</option><option value="qty" ${heatMetric==='qty'?'selected':''}>Продано, шт.</option></select>`:rankingControls()}`;
    return panel(restView==='table'?'Рейтинг продаж ресторанов':'Ресторан × Блюдо',tableToolbar(extra)+(restView==='table'?rankingStatus()+restTable(benchmarkRows()):heatmap()),restView==='table'?'Отклонение = (факт '+(partialRanking()?'в сравнении ':'')+'÷ ожидаемые продажи − 1) × 100%. '+rankingDescription():'Блюда расположены по дате запуска, внутри запуска — по убыванию продаж.');
  }
  function renderChannels(){
    const rows=ctx.channelRows,positiveTotal=rows.reduce((a,r)=>a+Math.max(0,r.qty),0),qtyScale=softScale(rows.map(r=>valueOf(r,'qty'))),rateScale=softScale(rows.map(r=>r.rate));
    const cards=`<div class="channel-card">${rows.map((r,i)=>`<section class="channel-box" style="border-top:4px solid ${colors[i%colors.length]}"><h3>${esc(r.name)}</h3><div class="big">${n(r.rate,2)}</div><div class="sub">шт. на 100 заказов</div><div class="sub">${n(r.qty)} шт.</div></section>`).join('')}</div>`;
    const dist=`<div class="stackbar">${rows.map((r,i)=>`<div style="width:${positiveTotal?Math.max(0,r.qty)/positiveTotal*100:0}%;background:${colors[i%colors.length]}" title="${esc(r.name)}: ${n(r.share,1)}%">${r.share>=7?n(r.share,1)+'%':''}</div>`).join('')}</div><div class="legend">${rows.map((r,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(r.name)}: ${n(r.share,1)}%</span>`).join('')}</div>`;
    const table=`<div class="table-wrap"><table><thead><tr><th>Канал</th><th>Продано, шт.</th><th>Доля продаж, %</th><th>СКП на 100</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td>${coloredCell(valueOf(r,'qty'),qtyScale)}<td>${n(r.share,1)}</td>${coloredCell(r.rate,rateScale,2)}</tr>`).join('')}</tbody></table></div>`;
    const tableRows=sorted(visibleDishRows()),sales=new Map();for(const [d,r,ch,date,q] of ctx.sales){const key=d+'|'+ch;sales.set(key,(sales.get(key)||0)+q);}
    const cell=(d,ch)=>{const key=d.id+'|'+ch.id,q=sales.get(key)||0,b=ctx.dishChannelOrders.get(key)||0;return {qty:ctx.dishChannelAvailable.has(key)?q:null,rate:b>0&&!ctx.badDishChannels.has(key)?100*q/b:null};};
    const decimals=channelMetric==='qty'?0:2,label=channelMetric==='qty'?'Шт.':'СКП на 100',detailScale=softScale(tableRows.flatMap(d=>rows.map(ch=>cell(d,ch)[channelMetric])));
    currentExport={kind:'channels',headers:['Блюдо',...rows.map(ch=>ch.name+', '+label),'Итого, '+label],rows:tableRows.map(d=>[d.name,...rows.map(ch=>cell(d,ch)[channelMetric]),valueOf(d,channelMetric)])};
    const detail=`<div class="table-wrap"><table class="channel-matrix"><thead><tr><th>Блюдо</th>${rows.map(ch=>`<th>${esc(ch.name)}<br><span class="muted small">${label}</span></th>`).join('')}<th class="total-col">Итого<br><span class="muted small">${label}</span></th></tr></thead><tbody>${tableRows.map(d=>`<tr data-channel-dish="${d.id}"><td class="name"><button class="text" data-dish="${d.id}">${esc(d.name)}</button></td>${rows.map(ch=>{const p=cell(d,ch),hint=channelMetric==='qty'?(p.rate!==null?'СКП на 100: '+n(p.rate,2):''):(p.qty!==null?n(p.qty)+' шт.':'');return coloredCell(p[channelMetric],detailScale,decimals,hint);}).join('')}${totalCell(valueOf(d,channelMetric),decimals,'total-col')}</tr>`).join('')||`<tr><td colspan="${rows.length+2}">${empty()}</td></tr>`}</tbody></table></div>`;
    const controls=`<select data-control="channelMetric" aria-label="Показатель таблицы Блюда по каналам"><option value="qty" ${channelMetric==='qty'?'selected':''}>Штуки</option><option value="rate" ${channelMetric==='rate'?'selected':''}>СКП на 100 заказов</option></select>`;
    return cards+panel('Распределение продаж по каналам',dist+table,'Доля в штуках показывает структуру продаж.')+panel('Блюда по каналам',tableToolbar(controls)+detail,'Выбранный показатель используется в каналах и в итоге. Итоговый СКП рассчитан по общей подходящей базе.');
  }
  function render(){
    updateSummaries();updateFilterBar();currentExport={headers:[],rows:[]};ctx=E.calculate(D,F);const bounds=ctx.dates.length?`${fmtDate(ctx.dates[0])} — ${fmtDate(ctx.dates.at(-1),true)}`:'нет заказов';
    $('filterMeta').textContent=`Выбрано ${visibleDishRows().length} блюд · период данных: ${bounds}`;
    $('kpis').innerHTML=[['СКП на 100 заказов',n(ctx.rate,2),'Шт. в выбранном меню'],['Продано, шт.',n(ctx.qty),'Новое и сезонное по фильтрам'],['Блюд с продажами',`${ctx.activeDishes} / ${visibleDishRows().length}`,'Из выбранного справочника']].map(([label,value,foot])=>`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`).join('');
    const selected=F.start<=F.end&&F.start&&F.end;
    $('content').innerHTML=!selected?empty('Начало периода должно быть не позже его окончания.'):!visibleDishRows().length?empty(F.dishes.size&&F.groups.size&&F.launches.size?'В выбранном периоде нет запущенных блюд с продажами в загруженном файле.':'Выберите хотя бы одно блюдо, группу, тип меню и запуск.'):(tab==='overview'?renderOverview():tab==='dishes'?renderDishes():tab==='restaurants'?renderRestaurants():renderChannels());
    if(ctx.missingOrderSales.length){const labels=[...new Set(ctx.missingOrderSales.map(([d,r,c,dt])=>D.restaurants[r]+' / '+D.channels[c]+' / '+fmtDate(dt,true)))];$('content').innerHTML=`<div class="status-note">В «Потоке чеков» отсутствуют данные: ${esc(labels.join('; '))}. Затронутые СКП показаны как «—». Продажи в штуках и рейтинг с весами рассчитываются по продажам блюд и групп.</div>`+$('content').innerHTML;}
    document.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===tab));b.setAttribute('tabindex',b.dataset.tab===tab?'0':'-1');});
    if($('dishDialog').open&&activeExpectation!==null)openExpectation(activeExpectation);
    if($('dishDialog').open&&activeDish!==null){if(dishesWithSales().has(activeDish)&&D.dishes[activeDish]?.start<=F.end)openDish(activeDish);else $('dishDialog').close();}
  }
  function reset(){F=E.defaults(D);overviewSort={key:null,dir:-1};search='';page=1;sort={key:tab==='restaurants'?'deviation':'rate',dir:-1};setupFilters();render();}
  function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function save(){
    const clone=document.documentElement.cloneNode(true);
    clone.querySelector('#dataset').textContent=JSON.stringify(D).replace(/</g,'\\u003c');
    clone.querySelector('#dashboardState').textContent=JSON.stringify({tab,metric,overviewSort,filters:Object.fromEntries(Object.entries(F).map(([k,v])=>[k,v instanceof Set?[...v]:v]))}).replace(/</g,'\\u003c');
    clone.querySelector('#dishDialog').innerHTML='';clone.querySelector('#dishDialog').removeAttribute('open');
    clone.querySelector('#toast').style.display='none';clone.querySelector('#loading').style.display='none';
    clone.querySelector('body').classList.remove('drawer-open');clone.querySelector('#workspace').removeAttribute('inert');
    for(const id of ['filterDrawer','filterBackdrop'])clone.querySelector('#'+id).hidden=true;
    for(const id of ['filtersBtn','reportFiltersBtn'])clone.querySelector('#'+id).setAttribute('aria-expanded','false');
    for(const p of clone.querySelectorAll('details'))p.removeAttribute('open');
    download(new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'}),'Меню_Продажи_дашборд.html');toast('HTML сохранён с текущими данными.');
  }
  function exportCsv(){if(!currentExport.rows?.length){toast('Нет строк для выгрузки.');return;}const cell=x=>{const s=typeof x==='number'?String(Math.round(x*1000000)/1000000).replace('.',','):String(x??'');const safe=/^[=+@-]/.test(s)&&typeof x!=='number'?"'"+s:s;return '"'+safe.replace(/"/g,'""')+'"';};const text=[currentExport.headers,...currentExport.rows].map(row=>row.map(cell).join(';')).join('\r\n');download(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),'Меню_'+currentExport.kind+'_'+F.end+'.csv');toast('Таблица выгружена в CSV для Excel.');}
  function openExpectation(id){
    if(activeDish!==null)expectationDish=activeDish;
    const filters=expectationDish===null?F:{...F,dishes:new Set([expectationDish]),groups:new Set([D.dishes[expectationDish].group]),launches:new Set([D.dishes[expectationDish].start]),type:String(D.dishes[expectationDish].type)};
    const row=(expectationDish===null?benchmarkRows():benchmarkRows(E.calculate(D,filters),filters)).find(r=>r.id===id);
    if(!row||!['weights','before'].includes(row.model)){if(activeExpectation!==null)$('dishDialog').close();return;}
    activeDish=null;activeExpectation=id;
    if(row.model==='before'){openBeforeExpectation(row);return;}
    const rows=row.details.map(p=>`<tr><td>${esc(D.dishes[p.dish].name)}<div class="sub">${esc(p.group)}</div></td><td>${esc(D.channels[p.channel])}</td><td>${n(p.qty)}</td><td>${n(p.comparisonQty)}</td><td>${n(p.comparisonGroupQty,1)}</td><td>${p.expectedShare===null?'—':n(p.expectedShare*100,2)+'%'}</td><td>${n(p.expectedQty,1)}</td><td>${n(p.peerRestaurants)}</td><td>${p.minAssortment===null?'—':p.minAssortment===p.maxAssortment?n(p.minAssortment):n(p.minAssortment)+'–'+n(p.maxAssortment)}</td><td>${p.reason?esc(pairReason(p))+(p.expectedQty!==null?' · учтена доступная часть':''):p.localItems.length?'Локальные альтернативы исключены из базы группы':'Рассчитано'}${p.localItems.length?`<details><summary>Вне базы группы (${n(p.localItems.length)})</summary><p>${esc(p.localItems.join('; '))}</p></details>`:''}</td></tr>`).join('');
    $('dishDialog').innerHTML=`<div class="dialog-head"><div><h2>Расчёт ожидания: ${esc(row.name)}</h2><p class="sub">${rankingDescription()}</p></div><button class="close" data-close aria-label="Закрыть расчёт">×</button></div><div class="dialog-body"><p>Ожидание за день = продажи сопоставимой части группы × вес блюда ÷ сумму весов доступных сопоставимых блюд. Локальные альтернативы без сопоставимого веса исключаем и из продаж этой базы, и из её весов. Доля в таблице усреднена по продажам сопоставимой группы: «База группы, шт.» × «Ожидаемая доля» = «Ожидаемо, шт.».</p><p>Продано всего: <strong>${n(row.qty)} шт.</strong> · факт в сравнении: <strong>${n(row.comparisonQty)} шт.</strong> · ожидаемо: <strong>${n(row.expectedQty,1)} шт.</strong> · отклонение: <strong>${signedPercent(row.deviation)}</strong> · охват: <strong>${coverageText(row.coverage)}</strong></p>${row.details.some(p=>p.reason)?`<div class="status-note">Часть сочетаний не вошла в сравнение: ${n(row.qty-row.comparisonQty)} шт. Отклонение рассчитано по факту и ожиданию доступной части. Причины указаны в таблице.</div>`:''}<div class="table-wrap"><table><thead><tr><th>Блюдо / группа</th><th>Канал</th><th>Продано, шт.</th><th>Факт в сравнении, шт.</th><th>База группы, шт.</th><th>Ожидаемая доля</th><th>Ожидаемо, шт.</th><th>Ресторанов в базе</th><th>Блюд в базе группы</th><th>Статус</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Итого меню</td><td></td><td>${n(row.qty)}</td><td>${n(row.comparisonQty)}</td><td></td><td></td><td>${n(row.expectedQty,1)}</td><td></td><td></td><td>Охват ${coverageText(row.coverage)}</td></tr></tfoot></table></div><p class="sub">Продажи базы группы повторяются в строках её новинок; их нельзя суммировать между блюдами. Даты запуска учитываются каждый день. Каналы, где ресторан не продаёт выбранное меню, не участвуют в оценке. Сам ресторан не входит в базу весов. Охват относится к продажам выбранных новинок; локальные обычные блюда остаются в исходных данных группы.</p></div>`;
    if(!$('dishDialog').open)$('dishDialog').showModal();
  }
  function openBeforeExpectation(row){
    const period=(start,end)=>fmtDate(start,true)+' — '+fmtDate(end,true);
    const rows=row.details.map(p=>{
      const excluded=[...new Set([...(p.localItems||[]),...(p.beforeExcludedItems||[])])];
      const status=[p.reason?pairReason(p):'Рассчитано',...(p.excludedDays||[]).map(x=>fmtDate(x.date,true)+': '+pairReason(x))].join('; ');
      const peers=p.peers||[],peerExclusions=p.peerExclusions||[];
      return `<tr><td>${esc(D.dishes[p.dish].name)}<div class="sub">${esc(p.group)}</div></td><td>${esc(D.channels[p.channel])}</td><td>${period(p.beforeStart,p.beforeEnd)}</td><td>${period(p.afterStart,p.afterEnd)}</td><td>${n(p.qty)}</td><td>${n(p.comparisonQty)}</td><td>${n(p.beforeRate,2)}</td><td>${coverageText(p.beforeCoverage)}</td><td>${n(p.networkBefore,2)}</td><td>${n(p.networkAfter,2)}</td><td>${n(p.networkFactor,4)}</td><td>${n(p.networkRestaurants)}</td><td>${n(p.peerRestaurants)}</td><td>${p.expectedShare===null?'—':n(p.expectedShare*100,2)+'%'}</td><td>${n(p.expectedQty,1)}</td><td>${esc(status)}${p.networkRestaurants===1?'<p class="sub">Динамика по одному ресторану; оценка чувствительна к составу базы.</p>':''}${excluded.length?`<details><summary>Исключённые блюда (${n(excluded.length)})</summary><p>${esc(excluded.join('; '))}</p></details>`:''}${peers.length||peerExclusions.length?`<details><summary>Состав базы динамики сети</summary><p>${peers.map(x=>esc(D.restaurants[x.restaurant])+': '+n(x.beforeRate,2)+' → '+n(x.afterRate,2)).join('; ')||'Нет пригодных ресторанов'}</p>${peerExclusions.length?`<p>Вне базы: ${peerExclusions.map(x=>esc(D.restaurants[x.restaurant])+': '+esc(pairReason(x))).join('; ')}</p>`:''}</details>`:''}</td></tr>`;
    }).join('');
    $('dishDialog').innerHTML=`<div class="dialog-head"><div><h2 id="dialogTitle">Расчёт ожидания: ${esc(row.name)}</h2><p class="sub">${rankingDescription()}</p></div><button class="close" data-close aria-label="Закрыть расчёт">×</button></div><div class="dialog-body"><p>Ожидание за день = подходящая база заказов ÷ 100 × СКП сопоставимой группы до × K × доля блюда в доступном ассортименте. K — отношение средних СКП после и до по одному и тому же набору остальных ресторанов. Каждый ресторан даёт равный вклад. Показатель — описательный ориентир.</p><p>Продано всего: <strong>${n(row.qty)} шт.</strong> · факт в сравнении: <strong>${n(row.comparisonQty)} шт.</strong> · ожидаемо: <strong>${n(row.expectedQty,1)} шт.</strong> · отклонение: <strong>${signedPercent(row.deviation)}</strong> · охват рейтинга: <strong>${coverageText(row.coverage)}</strong></p><p class="sub">СКП и охват базы до относятся к отдельному блюду и каналу с собственной датой запуска. Охват базы до и охват рейтинга — разные показатели. Ожидаемая доля взвешена по подходящей базе заказов каждого дня; промежуточные значения не округляются. Чем меньше ресторанов в базе K, тем чувствительнее оценка к её составу.</p><div class="table-wrap"><table><thead><tr><th>Блюдо / группа</th><th>Канал</th><th>До запуска</th><th>После запуска</th><th>Продано, шт.</th><th>Факт в сравнении, шт.</th><th>СКП группы до</th><th>Охват базы до</th><th>СКП сети до</th><th>СКП сети после</th><th>K</th><th>Ресторанов для K</th><th>Ресторанов для весов</th><th>Ожидаемая доля</th><th>Ожидаемо, шт.</th><th>Статус / исключения</th></tr></thead><tbody>${rows}</tbody></table></div><p>${esc(comparisonNotes(row))}</p></div>`;
    if(!$('dishDialog').open)$('dishDialog').showModal();
  }
  function openDish(id){
    const filters={...F,dishes:new Set([id]),groups:new Set([D.dishes[id].group]),launches:new Set([D.dishes[id].start]),type:String(D.dishes[id].type)},c=E.calculate(D,filters),d=D.dishes[id],row=c.dishRows[0];
    const top=benchmarkRows(c,filters).filter(r=>r.qty!==0&&(F.rankingMethod==='before'||r.deviation!==null)).sort((a,b)=>(b.deviation??-Infinity)-(a.deviation??-Infinity));
    const fresh=!$('dishDialog').open||activeDish!==id;activeDish=id;activeExpectation=null;expectationDish=null;
    if(fresh){
      $('dishDialog').innerHTML=`<div class="dialog-sticky"><div class="dialog-head"><div><h2 id="dialogTitle">${esc(d.name)}</h2><p class="sub" id="dishDialogMeta"></p></div><button class="close" data-close aria-label="Закрыть карточку">×</button></div><div class="dialog-filters"><div id="dialogRestaurantPicker"></div><p class="sub">Рестораны для карточки и всех вкладок дашборда.</p></div></div><div class="dialog-body" id="dishDialogBody"></div>`;
      picker('restaurants','Ресторан',D.restaurants.map((r,i)=>[i,r]),'dialogRestaurantPicker','-dialog');
    }
    $('dishDialogMeta').textContent=`${d.group} · ${d.type?'Новое':'Сезонное'} · запуск ${fmtDate(d.start,true)} · ${row.days} дней данных`;
    $('dishDialogBody').innerHTML=`<div class="kpis">${[['СКП на 100 заказов',n(c.rate,2)],['Продано, шт.',n(c.qty)]].map(([label,v])=>`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>${panel('Динамика блюда',lineChart(c.daily.map(r=>fmtDate(r.date)),[{name:d.name,color:'#067b8a',values:c.daily.map(r=>r.rate)}],'СКП на 100 заказов','dishDialogBody'),'СКП на 100 заказов по выбранным ресторанам и каналам')}<div class="two-col">${panel('Рестораны: лидеры по отклонению',restTable(top.slice(0,7),true),rankingDescription())}${panel('Продажи по каналам',`<div class="table-wrap"><table><thead><tr><th>Канал</th><th>Шт.</th><th>СКП на 100</th></tr></thead><tbody>${c.channelRows.map(r=>`<tr><td>${esc(r.name)}</td>${coloredCell(valueOf(r,'qty'),softScale(c.channelRows.map(x=>valueOf(x,'qty'))))}${coloredCell(r.rate,softScale(c.channelRows.map(x=>x.rate)),2)}</tr>`).join('')}</tbody></table></div>`)}</div>${panel('Рестораны: нижняя часть рейтинга',restTable(top.slice(-7).reverse(),true),rankingDescription())}<button class="primary" data-focusdish="${id}">Показать только это блюдо в дашборде</button>`;
    if(!$('dishDialog').open)$('dishDialog').showModal();updateSummaries();if(fresh)$('dishDialog').scrollTop=0;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(b?.dataset.tab){if(filtersOpen)setFiltersOpen(false,false);tab=b.dataset.tab;search='';page=1;sort={key:tab==='restaurants'?'deviation':'rate',dir:-1};render();}
    if(b?.dataset.dish!==undefined)openDish(Number(b.dataset.dish));
    if(b?.dataset.expectation!==undefined)openExpectation(Number(b.dataset.expectation));
    if(b?.hasAttribute('data-close'))$('dishDialog').close();
    if(b?.dataset.focusdish!==undefined){const id=Number(b.dataset.focusdish);F.dishes=new Set([id]);F.groups=new Set([D.dishes[id].group]);F.launches=new Set([D.dishes[id].start]);F.type=String(D.dishes[id].type);$('typeFilter').value=F.type;tab='dishes';$('dishDialog').close();search='';page=1;render();}
    if(b?.dataset.sort){sort=sort.key===b.dataset.sort?{key:sort.key,dir:-sort.dir}:{key:b.dataset.sort,dir:['name','group','start'].includes(b.dataset.sort)?1:-1};page=1;render();}
    if(b?.dataset.dailySort){overviewSort={key:b.dataset.dailySort,dir:overviewSort.key===b.dataset.dailySort?-overviewSort.dir:-1};render();document.querySelector(`[data-daily-sort="${overviewSort.key}"]`)?.focus();}
    if(b?.hasAttribute('data-daily-reset')){overviewSort={key:null,dir:-1};render();}
    if(b?.dataset.page){page=Number(b.dataset.page);render();}
    if(b?.dataset.restview){restView=b.dataset.restview;page=1;render();}
    if(b?.dataset.pickall||b?.dataset.picknone){const field=b.dataset.pickall||b.dataset.picknone,all=[...document.querySelectorAll(`input[data-field="${field}"]`)];F[field]=new Set(b.dataset.pickall?all.map(c=>['restaurants','channels','dishes'].includes(field)?Number(c.dataset.value):c.dataset.value):[]);page=1;render();}
    if(!e.target.closest('details.picker'))document.querySelectorAll('details.picker[open]').forEach(d=>d.open=false);
  });
  document.addEventListener('change',e=>{
    const el=e.target;if(el.dataset.field){const field=el.dataset.field,v=['restaurants','channels','dishes'].includes(field)?Number(el.dataset.value):el.dataset.value;if(el.checked)F[field].add(v);else F[field].delete(v);page=1;render();}
    if(el.dataset.control){if(el.dataset.control==='metric')metric=el.value;if(el.dataset.control==='heatMetric')heatMetric=el.value;if(el.dataset.control==='channelMetric')channelMetric=el.value;if(el.dataset.control==='rankingMethod'){F.rankingMethod=el.value;sort={key:'deviation',dir:-1};}render();}
  });
  let searchTimer;document.addEventListener('input',e=>{const el=e.target;if(el.type==='search'&&el.closest('.picker-pop')){const v=keySearch(el.value);for(const l of el.closest('.picker-pop').querySelectorAll('.picker-option'))l.style.display=l.dataset.label.includes(v)?'flex':'none';}if(el.id==='tableSearch'){search=el.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const pos=el.selectionStart;page=1;render();const t=$('tableSearch');if(t){t.focus();if(t.type!=='search')t.setSelectionRange(pos,pos);}},160);}});
  for(const [id,field] of [['startDate','start'],['endDate','end'],['typeFilter','type'],['windowFilter','window']])$(id).addEventListener('change',()=>{F[field]=field==='window'?Number($(id).value):$(id).value;page=1;render();});
  for(const id of ['filtersBtn','reportFiltersBtn'])$(id).onclick=()=>setFiltersOpen(!filtersOpen);
  for(const id of ['closeFiltersBtn','applyFiltersBtn','filterBackdrop'])$(id).onclick=()=>setFiltersOpen(false);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&filtersOpen){setFiltersOpen(false);e.preventDefault();}});
  $('resetBtn').onclick=reset;$('resetDrawerBtn').onclick=reset;$('allPeriod').onclick=()=>{F.start=D.minDate;F.end=D.maxDate;$('startDate').value=F.start;$('endDate').value=F.end;page=1;render();};$('last7').onclick=()=>{F.end=D.maxDate;F.start=[D.minDate,E.addDays(D.maxDate,-6)].sort().at(-1);$('startDate').value=F.start;$('endDate').value=F.end;page=1;render();};
  $('loadBtn').onclick=()=>$('fileInput').click();$('saveBtn').onclick=save;$('exportBtn').onclick=exportCsv;
  $('fileInput').addEventListener('change',async()=>{const file=$('fileInput').files[0];if(!file)return;$('loading').style.display='flex';$('loadBtn').disabled=true;try{const next=await E.parseXlsx(file);D=next;reset();$('dataset').textContent=JSON.stringify(D).replace(/</g,'\\u003c');toast(`Данные обновлены: ${D.dishes.length} блюд, ${D.restaurants.length} ресторанов. Сохраните HTML с данными.`);}catch(err){toast('Не удалось обновить данные. '+err.message,true);}finally{$('loading').style.display='none';$('loadBtn').disabled=false;$('fileInput').value='';}});
  $('dishDialog').addEventListener('close',()=>{activeDish=null;activeExpectation=null;expectationDish=null;$('dishDialog').innerHTML='';updateSummaries();});
  $('dishDialog').addEventListener('click',e=>{if(e.target===$('dishDialog')){const r=$('dishDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dishDialog').close();}});
  document.querySelector('.tabs').addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!e.target.matches('[data-tab]'))return;const btns=[...document.querySelectorAll('[data-tab]')],i=btns.indexOf(e.target),idx=e.key==='Home'?0:e.key==='End'?btns.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+btns.length)%btns.length;btns[idx].click();btns[idx].focus();e.preventDefault();});
  let resizeTimer;window.addEventListener?.('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,160);});
  setFiltersOpen(false,false);setupFilters();render();window.MenuDashboard={getData:()=>D,getFilters:()=>F,getContext:()=>ctx,calculate:E.calculate,benchmark:E.benchmark,getBenchmark:()=>benchmarkRows(),getExport:()=>currentExport,reset};
})();
