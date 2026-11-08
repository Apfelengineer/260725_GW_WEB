/** CSS・変換処理・画面処理を1つのHTMLへまとめます。実行時にNodeや通信は不要です。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const source = new URL('../tools/legacy-converter/', import.meta.url);
const target = new URL('../../02_release/converter/', import.meta.url);
const [template, css, core, app] = await Promise.all(['index.template.html','style.css','core.js','app.js'].map(name=>readFile(new URL(name,source),'utf8')));
const html=template.replace('/*CONVERTER_STYLE*/',()=>css).replace('/*CONVERTER_SCRIPT*/',()=>(core+'\n'+app).replace(/<\/script/gi,'<\\/script'));
await mkdir(target,{recursive:true});
await writeFile(new URL('KPTC_既存データJSON変換ツール.html',target),html,'utf8');
console.log('Standalone offline converter built: 02_release/converter/KPTC_既存データJSON変換ツール.html');
