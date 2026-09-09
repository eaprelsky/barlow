import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const catalogs={},bad=[];
for(const file of fs.readdirSync('src/i18n/catalogs')){
 const exports=await import(pathToFileURL(path.resolve('src/i18n/catalogs',file)).href);
 for(const values of Object.values(exports))for(const [key,value] of Object.entries(values)){
  if(catalogs[key])bad.push(`Duplicate key: ${key}`);catalogs[key]=value;
  const params=s=>(s.match(/\{\w+\}/g)||[]).sort();
  if(!value.ru||!value.en||JSON.stringify(params(value.ru))!==JSON.stringify(params(value.en)))bad.push(`Incomplete message: ${key}`);
 }
}
function walk(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){
 const name=path.join(dir,file.name);if(file.isDirectory()){if(file.name!=='i18n')walk(name);continue;}if(!/\.tsx?$/.test(name))continue;
 const sf=ts.createSourceFile(name,fs.readFileSync(name,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n){if(ts.isCallExpression(n)&&['msg','localeText'].includes(n.expression.getText(sf))&&ts.isStringLiteral(n.arguments[0])){
   const key=n.arguments[0].text,message=catalogs[key];if(message){const expected=[...new Set(message.en.match(/(?<=\{)\w+(?=\})/g)||[])].sort(),arg=n.arguments[1];
    if(!arg||ts.isObjectLiteralExpression(arg)){const actual=arg?arg.properties.map(p=>p.name?.getText(sf).replace(/^['"]|['"]$/g,'')).sort():[];
     if(JSON.stringify(expected)!==JSON.stringify(actual))bad.push(`${name}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1} ${key}: needs ${expected}, got ${actual}`);}
   }
  }ts.forEachChild(n,visit);}visit(sf);
}}
walk('src');assert.deepEqual(bad,[]);console.log(`PASS ${Object.keys(catalogs).length} catalog keys: unique, bilingual, matching placeholders at call sites`);
