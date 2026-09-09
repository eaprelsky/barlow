import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5206;
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${port}`);
 const result=await page.evaluate(async()=>{
  const {setLocale}=await import('/src/i18n/index.ts'),{nativeError}=await import('/src/i18n/nativeError.ts'),{readTableWav}=await import('/src/music/wavetableImport.ts');
  const {learningProject,learningAction,compositionLessons}=await import('/src/music/learning.ts');
  const p=learningProject();p.tracks[4].name='My “Motif” 日本語';p.scenes[0].name='Начало 日本語';const before=JSON.stringify(p);setLocale('en');
  let wav='';try{readTableWav(new ArrayBuffer(0));}catch(e){wav=e.message;}
  const english=nativeError('BARLOW_READ_LIMIT').message,os=nativeError('OS diagnostic 日本語').message,action=learningAction(compositionLessons[0].action,p);
  const worker=async(path,data)=>{const w=new Worker(path,{type:'module'});try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('worker timeout')),5000);w.onmessage=e=>{clearTimeout(timeout);resolve(e.data.error);};w.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};w.postMessage(data);});}finally{w.terminate();}};
  const tableEn=await worker('/src/music/wavetableImport.worker.ts',{locale:'en',buffer:new ArrayBuffer(0),size:2048,count:8});
  const timbreEn=await worker('/src/audio/timbreAnalysis.worker.ts',{locale:'en',samples:new Float32Array(10),sampleRate:48000,rootHz:110});
  const tableRu=await worker('/src/music/wavetableImport.worker.ts',{locale:'ru',buffer:new ArrayBuffer(0),size:2048,count:8});
  setLocale('ru');return {english,russian:nativeError('BARLOW_READ_LIMIT').message,os,wav,tableEn,timbreEn,tableRu,action,unchanged:before===JSON.stringify(p)};
 });
 assert.equal(result.english,'The file exceeds the read limit.');assert.equal(result.russian,'Файл превышает лимит чтения');assert.equal(result.os,'OS diagnostic 日本語');assert.equal(result.wav,result.tableEn);assert.match(result.tableEn,/PCM/);assert.ok(!/[А-Яа-яЁё]/.test(result.tableEn+result.timbreEn));assert.match(result.tableRu,/Нужен/);assert.match(result.action,/My “Motif” 日本語/);assert.match(result.action,/Начало 日本語/);assert.equal(result.unchanged,true);console.log('PASS localized native errors, bounded worker failures and renamed learning references',result);
}finally{await browser?.close();vite.kill();}
