/* オフライン変換専用。通信・元ファイルの書換え・ブラウザへの永続保存は行いません。 */
(function (root) {
  "use strict";
  const utf8 = new TextEncoder();
  const decoder = new TextDecoder("shift_jis", { fatal: true });
  const byteLength = text => utf8.encode(text).length;
  const allowedCategories = Object.freeze(["休暇","機器点検","機器利用","キャンセル待ち","所内会議","出張・外出"]);
  const normalizeCategory = name => allowedCategories.includes(name.trim()) ? name.trim() : "その他";

  // file://でも利用できる同期SHA-256。IDは対象ユーザー・年月・元の行位置から固定します。
  function sha256(text) {
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const input = typeof text === "string" ? utf8.encode(text) : text, bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input); bytes[input.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length-8, Math.floor(input.length / 0x20000000)); view.setUint32(bytes.length-4, input.length * 8);
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const r = (x,n) => (x>>>n)|(x<<(32-n)), w = new Uint32Array(64);
    for (let offset=0;offset<bytes.length;offset+=64) {
      for(let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++) w[i]=(w[i-16]+(r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3))+w[i-7]+(r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10)))>>>0;
      let [a,b,c,d,e,f,g,j]=h;
      for(let i=0;i<64;i++) {
        const t1=(j+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0;
        const t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
        j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,j].forEach((x,i)=>h[i]=(h[i]+x)>>>0);
    }
    return h.map(x=>x.toString(16).padStart(8,"0")).join("");
  }

  function lines(bytes) {
    if ((bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)||(bytes[0]===0xff&&bytes[1]===0xfe)||(bytes[0]===0xfe&&bytes[1]===0xff)) throw new Error("CP932ではないBOM付きファイルです。文字コードを確認してください");
    const result=[];let start=0;
    for(let i=0;i<bytes.length;i++) if(bytes[i]===10||bytes[i]===13){result.push(bytes.slice(start,i));if(result.length>100001)throw new Error("1ファイルの行数が多すぎます。分割してください");if(bytes[i]===13&&bytes[i+1]===10)i++;start=i+1;}
    if(start<bytes.length) result.push(bytes.slice(start));
    return result;
  }
  const field=(line,start,end)=>decoder.decode(line.slice(start,end)).replace(/ +$/g,"");
  function csv(text) {
    const parts=[];let value="", quoted=false, closed=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
      else if(c===","){parts.push(value);value="";closed=false;}
      else if(c==='"'&&value===""&&!closed) quoted=true;
      else {if(closed) throw new Error("引用符の後に未対応の文字があります"); value+=c;}
    }
    if(quoted) throw new Error("メモの引用符が閉じていません");
    parts.push(value);return parts;
  }
  function details(bytes, mode="comma") {
    const result=new Map();
    lines(bytes).forEach((line,index)=>{
      if(!line.length)return;
      try {
        const parts=csv(decoder.decode(line)), id=parts.shift();
        if(!/^\d{3}$/.test(id)||id==="000"||parts.length===0||result.has(id)) throw new Error("メモ番号が不正、または重複しています");
        result.set(id,parts.join(mode==="newline"?"\n":","));
      }catch(error){throw new Error(`dtl ${index+1}行目：${error.message}`);}
    });return result;
  }
  function dateKey(year,month,day) {
    if(year<1000||year>9999||month<1||month>12||day<1||day>31) throw new Error("日付が不正です");
    const date=new Date(Date.UTC(year,month-1,day,12));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day) throw new Error("存在しない日付です");
    return date.toISOString().slice(0,10);
  }
  function schedule(line, month, memberId, number, memoMap, options={}) {
    if(line.length<30||line.length>129||(line.length>110&&line.length<113)||line.length===114) throw new Error("予定行のバイト長が不正、または未対応です");
    if(!/^[0-9]{6}$/.test(month)) throw new Error("ファイル名はYYYYMM.schにしてください");
    const year=Number(month.slice(0,4)), m=Number(month.slice(4)), day=field(line,0,2);
    if(!/^\d{2}$/.test(day)) throw new Error("日の指定が不正です");
    const date=dateKey(year,m,Number(day));
    let start=field(line,2,7).trim(),end=field(line,7,12).trim(),timePreset="custom";
    if(!start&&!end){start="00:00";end="23:59";timePreset="all-day";}
    else if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)) throw new Error("開始・終了時刻が不正です（片方だけ空欄も不可）");
    const duration=field(line,113,115).trim();
    let days=duration===""?1:Number(duration);const warnings=[];
    if(duration&&!/^\d{2}$/.test(duration)) throw new Error("期間欄は2桁の日数で指定してください");
    if(days===0&&options.zeroAsSingle){days=1;warnings.push("期間00を指定により単日として変換");}
    if(!Number.isInteger(days)||days<1||days>99) throw new Error("期間00または不正な期間です。単日扱いの設定か元データを確認してください");
    const endDay=new Date(`${date}T12:00:00Z`);endDay.setUTCDate(endDay.getUTCDate()+days-1);
    if(endDay.getUTCFullYear()>9999) throw new Error("終了日が対応範囲を超えています");
    if(days===1&&end<=start) throw new Error("終了時刻が開始時刻以前です");
    const category=field(line,12,26).trim(), title=field(line,30,70).trim(),location=field(line,70,110).trim(),detailId=field(line,110,113).trim();
    if(!title) throw new Error("件名が空です");
    if(detailId&&!/^\d{3}$/.test(detailId)) throw new Error("詳細メモ番号が不正です");
    if(detailId&&detailId!=="000"&&!memoMap.has(detailId)) throw new Error(`詳細メモ${detailId}がありません。対応するdtlを選択してください`);
    const memo=memoMap.get(detailId)||"";
    if(byteLength(memo)>20000) throw new Error("メモがKPTC上限の20000バイトを超えています");
    return {item:{id:"legacy-"+sha256(JSON.stringify([memberId,month,number])),memberId,date,endDate:endDay.toISOString().slice(0,10),start,end,timePreset,title,location,category,memo,private:false},warnings,detailId};
  }

  // files: {path, bytes}。複数選択でもディレクトリ選択でも相対パスだけで対応付けます。
  function inventory(files) {
    const pairs=new Map(),ignored=[];
    for(const file of files) {
      const path=file.path.replace(/\\/g,"/"), parts=path.split("/"), name=parts.pop();
      if(!/\.(sch|dtl)$/i.test(name)){ignored.push(path);continue;}
      const match=/^(\d{6})\.(sch|dtl)$/i.exec(name);
      if(!match) throw new Error(`${path}：ファイル名はYYYYMM.sch／YYYYMM.dtlにしてください`);
      dateKey(Number(match[1].slice(0,4)),Number(match[1].slice(4)),1);
      const group=parts.join("/")||"（直接選択）", key=JSON.stringify([group,match[1]]);
      if(!pairs.has(key))pairs.set(key,{group,month:match[1]});
      const pair=pairs.get(key), extension=match[2].toLowerCase();
      if(pair[extension])throw new Error(`${path}：同じフォルダ・年月のファイルが重複しています`);
      pair[extension]=file;
    }
    return {pairs:[...pairs.values()].sort((a,b)=>(a.group+"/"+a.month).localeCompare(b.group+"/"+b.month)),ignored};
  }
  function convert(files,members,options={}) {
    const input=inventory(files),schedules=[],errors=[],warnings=[],sources=[],ids=new Set(),categoryCounts=new Map();
    const knownMembers=options.knownMembers;
    for(const pair of input.pairs){
      const source=`${pair.group}/${pair.month}`,memberId=(members[pair.group]||"").trim();
      if(!memberId||memberId.length>120||/[\x00-\x20\x7f]/.test(memberId)){errors.push(`${source}：登録先の内部ユーザーIDを指定してください`);continue;}
      if(knownMembers&&!knownMembers.includes(memberId)){errors.push(`${source}：参照データにないユーザーIDです`);continue;}
      if(!pair.sch){errors.push(`${source}：schがありません（dtlだけでは変換できません）`);continue;}
      try{
        const memoMap=pair.dtl?details(pair.dtl.bytes,options.memoMode):new Map(),used=new Set();let count=0;
        lines(pair.sch.bytes).forEach((line,index)=>{
          if(!line.length)return;
          try{
            if(schedules.length>=100000)throw new Error("一度に変換できる予定は100000件までです");
            const converted=schedule(line,pair.month,memberId,index+1,memoMap,options),item=converted.item;
            const originalCategory=item.category;
            item.category=normalizeCategory(originalCategory);
            if(ids.has(item.id))throw new Error("同じユーザー・年月・行位置への重複割当です。元フォルダと登録先を確認してください");
            ids.add(item.id);schedules.push(item);count++;if(converted.detailId)used.add(converted.detailId);
            if(!categoryCounts.has(originalCategory)) categoryCounts.set(originalCategory,{from:originalCategory,to:item.category,count:0});
            categoryCounts.get(originalCategory).count++;
            converted.warnings.forEach(w=>warnings.push(`${source} ${index+1}行目：${w}`));
          }catch(error){errors.push(`${source} ${index+1}行目：${error.message}`);}
        });
        for(const id of memoMap.keys())if(!used.has(id))warnings.push(`${source}：参照されていない詳細メモ${id}があります`);
        sources.push({source,memberId,count});
      }catch(error){errors.push(`${source}：${error.message}`);}
    }
    if(!input.pairs.length)errors.push("sch／dtlファイルを選択してください");
    if(schedules.length>100000)errors.push("一度に変換できる予定は100000件までです");
    if(!errors.length&&!schedules.length)errors.push("予定が0件です");
    return {schedules:errors.length?[]:schedules,errors,warnings,sources,ignored:input.ignored,categoryConversions:[...categoryCounts.values()]};
  }
  function chunks(items,maxBytes=1048576,maxCount=5000) {
    const result=[],overhead=byteLength('{"schedules":[]}');let current=[],size=overhead;
    for(const item of items){const text=JSON.stringify(item),bytes=byteLength(text);if(bytes+overhead>maxBytes)throw new Error("1件がJSONファイルの上限を超えています");
      if(current.length&&(current.length>=maxCount||size+bytes+1>maxBytes)){result.push('{"schedules":['+current.join(",")+']}');current=[];size=overhead;}
      size+=bytes+(current.length?1:0);current.push(text);
    }if(current.length)result.push('{"schedules":['+current.join(",")+']}');return result;
  }
  root.KptcLegacyConverter={sha256,lines,details,schedule,inventory,convert,allowedCategories,normalizeCategory,chunks,byteLength};
})(globalThis);
