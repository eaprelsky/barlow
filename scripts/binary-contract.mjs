import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url)),port=5185;
mkdirSync(root+'/tmp',{recursive:true});writeFileSync(root+'/tmp/binary-contract.html','<!doctype html><title>Binary I/O contract</title>');
const vite=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(vite.exitCode!==null)throw Error('Vite exited');try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch({executablePath:process.env.BARLOW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/tmp/binary-contract.html`);
 const checks=await page.evaluate(async()=>{
  const {encodeBinaryFile,decodeBinaryFile,BINARY_LIMITS}=await import('/src/binaryFile.ts');
  const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});let index=null,writes=0,lastSave,picker=new ArrayBuffer(0),saveCancel=false,wrongName=false;
  const files=new Map();
  window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
   if(cmd==='sample_index_read')return index;
   if(cmd==='sample_index_write'){index=args.json;writes++;return;}
   if(cmd==='sample_write'){if(!(args instanceof Uint8Array))throw Error('sample write was serialized as JSON');const file=decodeBinaryFile(args.buffer,BINARY_LIMITS.sample);files.set(file.name,file.data.slice());writes++;return;}
   if(cmd==='sample_read'){const data=files.get(args.name);return data?encodeBinaryFile(wrongName?'other.wav':args.name,data,BINARY_LIMITS.sample).buffer:new ArrayBuffer(0);}
   if(cmd==='sample_delete'){files.delete(args.name);writes++;return;}
   if(cmd==='save_project'){if(!(args instanceof Uint8Array))throw Error('save was serialized as JSON');lastSave=decodeBinaryFile(args.buffer,BINARY_LIMITS.save);return saveCancel?null:'D:/chosen/output.wav';}
   if(cmd==='open_project')return picker;
   throw Error('unexpected native command '+cmd);
  }};
  const {saveBlob,pickProjectFile,nativeSamples}=await import('/src/platform.ts');
  const payload=new Uint8Array(1024*1024);for(let i=0;i<payload.length;i++)payload[i]=i%256;
  const path=await saveBlob(new Blob([payload]),'пьеса — IDM.wav');
  check('native save receives raw bytes and Unicode filename',path==='D:/chosen/output.wav'&&lastSave.name==='пьеса — IDM.wav'&&lastSave.data.length===payload.length&&lastSave.data[1023]===255);
  saveCancel=true;check('cancelled save returns null',await saveBlob(new Blob([payload]),'cancel.wav')===null);
  check('cancelled picker returns null',await pickProjectFile()===null);
  picker=encodeBinaryFile('проект.json',new Uint8Array(),0).buffer;
  const empty=await pickProjectFile();check('empty selected file is distinct from cancellation',empty.name==='проект.json'&&empty.size===0);
  const {putSample,putSamples,getSampleBlob,listSamples,deleteSample}=await import('/src/audio/library.ts');
  const meta=await putSample(new Blob([payload],{type:'audio/wav'}),'IDM recording');
  const blob=await getSampleBlob(meta.id);const round=new Uint8Array(await blob.arrayBuffer());
  check('native library binary content and MIME survive roundtrip',round.length===payload.length&&round[1023]===255&&blob.type==='audio/wav');
  const before=writes;await putSample(new Blob([payload],{type:'audio/wav'}),'new name');
  check('dedup preserves existing metadata and does not rewrite sample content',(await listSamples())[0].name==='IDM recording'&&files.size===1&&writes===before+1);
  wrongName=true;let mismatch=false;try{await nativeSamples.read(meta.file);}catch{mismatch=true;}wrongName=false;check('mismatched native response filename is rejected',mismatch);
  const validIndex=index;index='{';const beforeCorrupt=writes;let corrupt=false;
  try{await putSamples([{blob:new Blob(['new']),name:'new'}]);}catch(e){corrupt=String(e).includes('повреждён');}
  check('corrupt index blocks writes and is never silently replaced',corrupt&&writes===beforeCorrupt&&index==='{');
  index=JSON.stringify([JSON.parse(validIndex)[0],JSON.parse(validIndex)[0]]);let duplicate=false;try{await listSamples();}catch{duplicate=true;}check('duplicate native index IDs rejected',duplicate);
  index=validIndex;await deleteSample(meta.id);check('native delete removes metadata and content',files.size===0&&(await listSamples()).length===0);
  return checks;
 });
 for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);assert.ok(checks.every(c=>c.pass));
}finally{await browser?.close();vite.kill();}
