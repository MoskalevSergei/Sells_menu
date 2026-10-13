const fs=require('node:fs'),path=require('node:path'),E=require('../src/engine.js'),{demoSheets}=require('./demo.cjs');
const root=path.resolve(__dirname,'..');
function buildHtml(){
  const data=E.buildDataset(demoSheets(),'Меню_Продажи_пример.xlsx');
  data.loadedAt='2026-01-20T00:00:00.000Z';data.isDemo=true;
  const parts={DATA:JSON.stringify(data).replace(/</g,'\\u003c'),ZIP:fs.readFileSync(path.join(root,'vendor/jszip.min.js'),'utf8'),ENGINE:fs.readFileSync(path.join(root,'src/engine.js'),'utf8'),APP:fs.readFileSync(path.join(root,'src/app.js'),'utf8')};
  let html=fs.readFileSync(path.join(root,'src/template.html'),'utf8');
  for(const [key,value] of Object.entries(parts)){const token='__'+key+'__';if(!html.includes(token))throw Error('Missing template token: '+key);html=html.replace(token,()=>value);}
  return {html,data};
}
if(require.main===module){const {html,data}=buildHtml();fs.writeFileSync(path.join(root,'index.html'),html);console.log('index.html: demonstration data, '+data.restaurants.length+' restaurants, '+Buffer.byteLength(html)+' bytes');}
module.exports={buildHtml,root};
