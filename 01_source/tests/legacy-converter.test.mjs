import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import '../tools/legacy-converter/core.js';
const C=globalThis.KptcLegacyConverter;
function line({day='05',start='',end='',category='MEETING',title='Test',location='Room A',memo='',days='',flags='0000',colors=''}={}){
  const base=day+start.padEnd(5)+end.padEnd(5)+category.padEnd(14)+flags+title.padEnd(40)+location.padEnd(40);
  return Buffer.from(base+(memo||days||colors?(memo||'000'):'')+days+colors,'ascii');
}
const file=(path,...rows)=>({path,bytes:Buffer.concat(rows.flatMap(row=>[Buffer.from(row),Buffer.from('\r\n')]))});
const map={'user-A':'m6','user-B':'m7'},cat={MEETING:'機器利用'};
test('SHA-256 is stable for strings and original bytes',()=>{
  for(const value of ['', 'abc', '日本語', 'x'.repeat(1000), new Uint8Array([0,255,128,1])])assert.equal(C.sha256(value),createHash('sha256').update(value).digest('hex'));
});
test('folder/month matching, all-day, inclusive multi-day and year rollover',()=>{
  const files=[file('user-A/202712.sch',line({day:'31',days:'02',flags:'3000'})),file('user-B/202704.sch',line({start:'09:00',end:'12:00'}))];
  const result=C.convert(files,map,cat);
  assert.deepEqual(result.errors,[]);assert.equal(result.schedules.length,2);
  const a=result.schedules.find(item=>item.memberId==='m6');assert.equal(a.date,'2027-12-31');assert.equal(a.endDate,'2028-01-01');assert.equal(a.timePreset,'all-day');assert.equal(a.start,'00:00');assert.equal(a.end,'23:59');
  const b=result.schedules.find(item=>item.memberId==='m7');assert.equal(b.location,'Room A');assert.equal(b.endDate,b.date);
  assert.deepEqual(C.convert([...files].reverse(),map,cat).schedules,result.schedules);
  const renamed=[{...files[0],path:'another-folder/202712.sch'}];
  assert.equal(C.convert(renamed,{'another-folder':'m6'},cat).schedules[0].id,a.id,'ID independent of directory-selection root');
});
test('dtl references, quoted comma/newline modes and short lines',()=>{
  const sch=file('user-A/202704.sch',line({memo:'001'}));
  const dtl=file('user-A/202704.dtl',Buffer.from('001,"Hello, world",second line','ascii'));
  assert.equal(C.convert([sch,dtl],map,cat).schedules[0].memo,'Hello, world,second line');
  assert.equal(C.convert([sch,dtl],map,cat,{memoMode:'newline'}).schedules[0].memo,'Hello, world\nsecond line');
  const short=file('user-A/202705.sch',line().slice(0,76));
  assert.equal(C.convert([short],map,cat).schedules[0].location,'Room A');
});
test('one invalid record blocks all JSON, references and unknown destinations fail',()=>{
  for(const bad of [line({day:'32'}),line({start:'09:00'}),line({start:'13:00',end:'09:00'}),line({days:'00'}),line({memo:'999'}),line({title:''}),line({days:'x2'}),line({day:'29'})]){
    const month=bad===undefined?'202704':'202702';
    const result=C.convert([file('user-A/'+month+'.sch',line(),bad)],map,cat);assert.ok(result.errors.length);assert.equal(result.schedules.length,0);
  }
  assert.ok(C.convert([file('user-A/202704.sch',line())],{},cat).errors.length);
  assert.ok(C.convert([file('user-A/202704.sch',line())],map,cat,{knownMembers:['m8']}).errors.length);
  assert.ok(C.convert([file('user-A/202704.sch',line())],map,cat,{knownCategories:['休暇']}).errors.length);
  assert.ok(C.convert([file('user-A/202704.dtl','001,test')],map,cat).errors.length);
  assert.throws(()=>C.inventory([file('user-A/202704.sch',line()),file('user-A/202704.sch',line())]),/重複/);
  assert.throws(()=>C.inventory([file('user-A/202713.sch',line())]),/日付/);
  assert.throws(()=>C.lines(new Uint8Array([239,187,191,1])),/BOM/);
  const allowed=C.convert([file('user-A/202704.sch',line({days:'00'}))],map,cat,{zeroAsSingle:true});assert.equal(allowed.schedules.length,1);assert.equal(allowed.warnings.length,1);
});
test('CP932 byte offsets, optional colors ignored and Japanese location preserved',()=>{
  const data=line({title:'Test',days:'02',colors:'$0000FF$EEEEEE'});
  Buffer.from('8f8a93e089ef8b63','hex').copy(data,12); // 所内会議
  Buffer.from('8e8e8cb18fea8250','hex').copy(data,70); // 試験場１
  const result=C.convert([file('user-A/202704.sch',data)],map,{'所内会議':'所内会議'});
  assert.deepEqual(result.errors,[]);assert.equal(result.schedules[0].category,'所内会議');assert.equal(result.schedules[0].location,'試験場１');assert.equal(result.schedules[0].endDate,'2027-04-06');
});
test('split output respects both KPTC limits and imports through PHP validator',()=>{
  const item=C.convert([file('user-A/202704.sch',line())],map,cat).schedules[0];
  const exact=C.byteLength(JSON.stringify({schedules:[item]}));
  assert.equal(C.byteLength(C.chunks([item],exact)[0]),exact);
  assert.throws(()=>C.chunks([item],exact-1),/上限/);
  const many=Array.from({length:5001},(_,i)=>({...item,id:'test-'+i}));
  for(const json of C.chunks(many)){assert.ok(C.byteLength(json)<=1048576);assert.ok(JSON.parse(json).schedules.length<=5000);}
  const split=C.chunks(many.slice(0,10),1000,5000);assert.ok(split.length>1);assert.equal(split.reduce((n,s)=>n+JSON.parse(s).schedules.length,0),10);
  const helper=fileURLToPath(new URL('../origin/shared/public/schedule-import.php',import.meta.url));
  const output=execFileSync('php',['-r','require $argv[1]; $raw=stream_get_contents(STDIN); $items=kptc_import_document($raw); $state=["members"=>[["id"=>"m6","name"=>"room"]],"categories"=>[["name"=>"機器利用"]],"schedules"=>[]]; echo kptc_import_plan($items,$state)["added"];',helper],{input:C.chunks([item])[0],encoding:'utf8'});
  assert.equal(output,'1');
});
test('standalone distribution has no network resources and embeds both scripts',async()=>{
  const html=await readFile(new URL('../../02_release/converter/KPTC_既存データJSON変換ツール.html',import.meta.url),'utf8');
  assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.match(html,/KptcLegacyConverter/);assert.match(html,/JSONへ変換して内容を確認/);assert.doesNotMatch(html,/CONVERTER_STYLE|CONVERTER_SCRIPT/);
});

test('offline UI event flow reads files, accepts mapping and downloads valid JSON; errors suppress JSON',async()=>{
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.value='';this.checked=false;this.textContent='';}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,callback){this.events[name]=callback;}
    remove(){}
    click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}
  }
  const nodes=new Map(),downloads=[],blobs=new Map();
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);},createElement:tag=>new Element(tag),body:new Element('body')};
  document.getElementById('memo-mode').value='comma';
  const app=await readFile(new URL('../tools/legacy-converter/app.js',import.meta.url),'utf8');
  vm.runInNewContext(app,{KptcLegacyConverter:C,document,Blob,URL:{createObjectURL(blob){const url='blob:test-'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(url){blobs.delete(url);}},setTimeout(callback){callback();return 0;}});
  const bytes=file('202704.sch',line()).bytes;
  await nodes.get('files').events.change({target:{files:[{name:'202704.sch',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]}});
  const user=nodes.get('members').children[0].children[2].children[0];user.value='m6';
  const category=nodes.get('categories').children[0].children[1].children[0];category.value='機器利用';
  await nodes.get('convert').events.click();
  assert.match(nodes.get('summary').textContent,/変換完了：1件/);
  await nodes.get('downloads').children[1].events.click();
  assert.equal(downloads[0].name,'kptc-schedules-001.json');
  const parsed=JSON.parse(await downloads[0].blob.text());assert.equal(parsed.schedules[0].memberId,'m6');assert.equal(parsed.schedules[0].location,'Room A');
  user.value='';user.events.input();await nodes.get('convert').events.click();
  assert.match(nodes.get('summary').textContent,/予定JSONは出力していません/);assert.equal(nodes.get('downloads').children.length,1,'Only report download on error');
});
