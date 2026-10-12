const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT||3000);
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)||!['/','/index.html'].includes(new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end('Not found');return;}
  const data=fs.readFileSync(path.join(root,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
});
server.listen(port,'127.0.0.1',()=>console.log('Dashboard: http://127.0.0.1:'+port));
