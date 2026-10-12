const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tests=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join('tests',name));
if(!tests.length)throw Error('No tests found');
const result=cp.spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
