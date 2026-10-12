const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),E=require('../src/engine.js');
function createUI(data){
  const nodes=new Map(),checks=[],tabs=['overview','dishes','restaurants','channels'].map(t=>({dataset:{tab:t},setAttribute(k,v){this[k]=v;}}));
  class Node{
    constructor(id){this.id=id;this.dataset={};this.value='';this.style={};this.handlers={};this.classList={toggle(){}};this._html='';this._text='';}
    addEventListener(name,fn){this.handlers[name]=fn;}setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}
    set innerHTML(v){this._html=v;if(this.id.endsWith('Picker')){for(let i=checks.length-1;i>=0;i--)if(checks[i].owner===this.id)checks.splice(i,1);for(const m of v.matchAll(/<input type="checkbox" data-field="([^"]+)" data-value="([^"]*)"([^>]*)><span>([\s\S]*?)<\/span>/g))checks.push({owner:this.id,dataset:{field:m[1],value:m[2]},checked:m[3].includes('checked'),parentElement:{textContent:m[4]},style:{}});}}
    get innerHTML(){return this._html;}set textContent(v){this._text=v;}get textContent(){return this._text;}showModal(){this.open=true;}close(){this.open=false;this.handlers.close?.();}focus(){}
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};get('dataset').textContent=JSON.stringify(data);
  const document={getElementById:get,querySelector:s=>get(s),querySelectorAll:s=>{const field=s.match(/^input\[data-field="([^"]+)"\]$/);if(field)return checks.filter(c=>c.dataset.field===field[1]);if(s==='[data-tab]')return tabs;return[];},addEventListener(name,fn){this[name]=fn;}};
  const box={document,window:{},MenuEngine:E,Intl,Date,Set,Map,JSON,Number,String,Math,console,setTimeout,clearTimeout,Blob,URL};vm.createContext(box);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8'),box);
  const click=dataset=>{const button={dataset,hasAttribute(){return false;},closest(s){return s==='button'?this:null;}};document.click({target:button});};
  const control=(key,value)=>document.change({target:{dataset:{control:key},value}});
  return {get,click,control,api:box.window.MenuDashboard};
}
module.exports={createUI};
