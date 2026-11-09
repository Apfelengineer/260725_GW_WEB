(function () {
  "use strict";
  const C=globalThis.KptcLegacyConverter,$=id=>document.getElementById(id);
  let files=[], userInputs=new Map(), reference=null, serial=0, loading=false, referenceLoading=false, referenceSerial=0;
  function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function resetResults(){ $("results").hidden=true;$("downloads").replaceChildren();$("preview").replaceChildren();$("issues").replaceChildren(); }
  function invalidate(){resetResults();$("progress").textContent="設定変更後は再度変換してください。";}
  function download(name,text,type="application/json;charset=utf-8") {
    const url=URL.createObjectURL(new Blob([text],{type})),anchor=element("a");anchor.href=url;anchor.download=name;
    document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function button(text,work){const b=element("button",text);b.type="button";b.addEventListener("click",work);return b;}
  function renderMapping(){
    const inventory=C.inventory(files), previousUsers=new Map([...userInputs].map(([k,v])=>[k,v.value]));
    userInputs=new Map();$("members").replaceChildren();
    const groups=new Map();for(const pair of inventory.pairs){if(!groups.has(pair.group))groups.set(pair.group,[]);groups.get(pair.group).push(pair.month);}
    for(const [group,months] of groups){
      const row=element("tr"),input=element("input");input.type="text";input.setAttribute("list","member-options");input.setAttribute("aria-label",`${group}の登録先ユーザーID`);input.placeholder="内部IDを入力／一覧から選択";input.value=previousUsers.get(group)||"";input.addEventListener("input",invalidate);userInputs.set(group,input);
      row.append(element("td",group),element("td",months.join("、")));const cell=element("td");cell.append(input);row.append(cell);$("members").append(row);
    }
    $("inventory").textContent=`${files.length}ファイル／${groups.size}フォルダ／${inventory.pairs.length}か月分の組合せ（対象外ファイル${inventory.ignored.length}件）`;
    $("convert").disabled=!groups.size||referenceLoading;
  }
  async function selectFiles(list){
    const run=++serial;loading=true;resetResults();$("convert").disabled=true;$("progress").textContent="ファイルを読込中…";
    try {
      if(list.length>1000||Array.from(list).reduce((sum,file)=>sum+file.size,0)>50*1024*1024)throw new Error("上限は1000ファイル・合計50MiBです。分けて選択してください");
      const selected=await Promise.all(Array.from(list,async file=>({path:file.webkitRelativePath||file.name,bytes:new Uint8Array(await file.arrayBuffer())})));
      if(run!==serial)return;
      files=selected;renderMapping();$("progress").textContent="登録先ユーザーを指定してください。予定種別は自動変換します。";
    }catch(error){if(run!==serial)return;files=[];$("inventory").textContent=error.message;$("members").replaceChildren();$("progress").textContent="読込を中止しました。";}
    finally{if(run===serial)loading=false;}
  }
  $("files").addEventListener("change",event=>selectFiles(event.target.files));
  $("directory").addEventListener("change",event=>selectFiles(event.target.files));
  $("reference").addEventListener("change",async event=>{
    const run=++referenceSerial;
    invalidate();reference=null;$("member-options").replaceChildren();
    const file=event.target.files[0];if(!file){referenceLoading=false;$("convert").disabled=loading||!files.length;$("reference-status").textContent="参照なし：登録先ID・予定種別名を手入力してください。";return;}
    referenceLoading=true;$("convert").disabled=true;
    try{
      if(file.size>10*1024*1024)throw new Error("参照JSONは10MiB以下にしてください");
      const raw=JSON.parse((await file.text()).replace(/^\uFEFF/,"")), state=raw.payload?.state||raw.state||raw;
      if(run!==referenceSerial)return;
      if(!Array.isArray(state.members)||!state.members.length||state.members.length>10000)throw new Error("membersを含むJSONを指定してください");
      const members=state.members.map(m=>{if(typeof m.id!=="string"||!m.id||typeof m.name!=="string")throw new Error("ユーザーの形式が不正です");return{id:m.id,name:m.name};});
      if(new Set(members.map(m=>m.id)).size!==members.length)throw new Error("内部ユーザーIDが重複しています");
      reference={members};
      for(const member of members){const option=element("option");option.value=member.id;option.label=member.name;$("member-options").append(option);}
      $("reference-status").textContent=`ユーザー${members.length}件を参照中。その他の項目（予定種別・パスワード等）は使用しません。`;
    }catch(error){if(run===referenceSerial)$("reference-status").textContent=`参照読込失敗：${error.message}。現在は手入力・未照合の状態です。`;}
    finally{if(run===referenceSerial){referenceLoading=false;$("convert").disabled=loading||!files.length;event.target.value="";invalidate();}}
  });
  $("memo-mode").addEventListener("change",invalidate);$("zero-duration").addEventListener("change",invalidate);
  $("convert").addEventListener("click",async()=>{
    if(loading||referenceLoading)return;
    $("settings").disabled=true;$("convert").disabled=true;$("directory").disabled=true;$("files").disabled=true;$("progress").textContent="変換・検証中…";resetResults();
    await new Promise(resolve=>setTimeout(resolve,0));
    try{
      const members=Object.fromEntries([...userInputs].map(([key,input])=>[key,input.value.trim()]));
      const options={memoMode:$("memo-mode").value,zeroAsSingle:$("zero-duration").checked,...(reference?{knownMembers:reference.members.map(m=>m.id)}:{})};
      const result=C.convert(files,members,options);
      if(!reference)result.warnings.unshift("参照JSON未指定：登録先ユーザーの存在は未照合です。KPTC取込時に確認してください。");
      const duplicateContent=new Map();let candidates=0;
      for(const item of result.schedules){const {id,...rest}=item,key=JSON.stringify(rest);if(duplicateContent.has(key)){candidates++;result.warnings.push(`同一内容候補：${item.memberId} ${item.date} ${item.title}（自動削除なし）`);}else duplicateContent.set(key,id);}
      const jsons=result.errors.length?[]:C.chunks(result.schedules);
      const report=["KPTC 既存スケジューラ変換レポート",`作成日時：${new Date().toISOString()}`,`結果：${result.errors.length?"エラーのためJSON出力なし":"成功"}`,`予定：${result.schedules.length}件／JSON：${jsons.length}ファイル／同一内容候補：${candidates}件`,"",`メモ区切り：${options.memoMode}`,`期間00を単日：${options.zeroAsSingle}`,"ユーザー対応：",...Object.entries(members).map(([from,to])=>`${from} → ${to}`),"予定種別の自動変換結果：",...result.categoryConversions.map(rule=>`${rule.from||"（空欄）"} → ${rule.to}：${rule.count}件`),"", "入力ファイルSHA-256（同じ元データか確認するための値）：",...files.map(file=>`${file.path}  ${hashBytes(file.bytes)}`),"", "変換元：",...result.sources.map(s=>`${s.source} → ${s.memberId}：${s.count}件`),"", "エラー：",...result.errors,"", "警告：",...result.warnings,"", "対象外ファイル：",...result.ignored].join("\n");
      $("results").hidden=false;$("summary").textContent=result.errors.length?`エラー${result.errors.length}件。予定JSONは出力していません。レポートを確認してください。`:`変換完了：${result.schedules.length}件／JSON ${jsons.length}ファイル。先頭20件を表示しています。`;
      $("summary").className=result.errors.length?"error":"success";
      $("downloads").append(button("確認レポートを保存",()=>download("kptc-conversion-report.txt",report,"text/plain;charset=utf-8")));
      jsons.forEach((json,index)=>$("downloads").append(button(`予定JSON ${index+1}を保存`,()=>download(`kptc-schedules-${String(index+1).padStart(3,"0")}.json`,json))));
      for(const [title,items,className] of [["エラー",result.errors,"error"],["警告",result.warnings,"warning"]])if(items.length){const box=element("details",undefined,className);box.append(element("summary",`${title} ${items.length}件`));const list=element("ul");for(const message of items.slice(0,200))list.append(element("li",message));box.append(list);if(items.length>200)box.append(element("p","全件はレポートを参照してください。"));$("issues").append(box);}
      for(const item of result.schedules.slice(0,20)){const row=element("tr");row.append(element("td",item.memberId),element("td",`${item.date}〜${item.endDate} ${item.start}〜${item.end}`),element("td",`${item.title} ／ ${item.category}`),element("td",`${item.location} ／ ${item.memo}`));$("preview").append(row);}
      $("progress").textContent=result.errors.length?"変換を中止しました。":"保存したJSONをKPTCの管理者モードから取り込んでください。";
    }catch(error){$("results").hidden=false;$("summary").textContent=`変換失敗：${error.message}`;$("summary").className="error";$("progress").textContent="出力を中止しました。";$("downloads").replaceChildren(button("エラーレポートを保存",()=>download("kptc-conversion-report.txt",`変換失敗：${error.message}`,"text/plain;charset=utf-8")));}
    finally{$("settings").disabled=false;$("convert").disabled=false;$("directory").disabled=false;$("files").disabled=false;}
  });
  function hashBytes(bytes){return C.sha256(bytes);}
})();
