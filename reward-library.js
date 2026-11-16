/* Device-local rewards. No network requests and no image bytes in localStorage. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RewardLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DB_NAME = 'quest-island-rewards-v1'; // Independent of the current 12-week plan.
  const GAME_KEY = 'quest-island-v1';
  const LIMITS = Object.freeze({image:8*1024*1024, total:80*1024*1024, backup:120*1024*1024, count:100, pixels:24000000, side:8192});
  const RULES = ['level','streak','videos','boss4','boss8','boss12','codex','combined'];
  const TYPES = ['wardrobe','codex','hidden'];
  const fail = message => { throw new Error(message); };
  const plain = o => !!o && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const integer = (n,min,max) => Number.isSafeInteger(n) && n>=min && n<=max;
  const emptyMilestones = () => ({lv:1,maxRun:0,pubs:0,bossW:[],cards:[]});
  const emptyState = () => ({schema:'quest-island-rewards/v1',rev:0,items:[],spent:0,equipped:null,milestones:emptyMilestones()});
  function milestones(m={}) {
    return {lv:Math.max(1,Number(m.lv)||1),maxRun:Math.max(0,Number(m.maxRun)||0),pubs:Math.max(0,Number(m.pubs)||0),
      bossW:[...new Set((Array.isArray(m.bossW)?m.bossW:[]).filter(x=>[4,8,12].includes(x)))].sort((a,b)=>a-b),
      cards:[...new Set((Array.isArray(m.cards)?m.cards:[]).filter(x=>/^c[1-8]$/.test(x)))].sort()};
  }
  function mergeMilestones(a,b) {
    a=milestones(a);b=milestones(b);
    return milestones({lv:Math.max(a.lv,b.lv),maxRun:Math.max(a.maxRun,b.maxRun),pubs:Math.max(a.pubs,b.pubs),bossW:a.bossW.concat(b.bossW),cards:a.cards.concat(b.cards)});
  }
  function eligible(item, stats) {
    const m=milestones(stats),r=item.rule;
    switch(r.kind) {
      case 'level': return m.lv>=r.value;
      case 'streak': return m.maxRun>=r.value;
      case 'videos': return m.pubs>=r.value;
      case 'boss4': return m.bossW.includes(4);
      case 'boss8': return m.bossW.includes(8);
      case 'boss12': return m.bossW.includes(12);
      case 'codex': return m.cards.length===8;
      case 'combined': return m.bossW.includes(12)&&m.cards.length===8;
      default: return false;
    }
  }
  function validateItem(raw) {
    if(!plain(raw)||!/^r_[a-zA-Z0-9_-]{1,80}$/.test(raw.id)) fail('奖励编号无效');
    if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>60) fail('奖励名称需要 1–60 个字');
    if(!TYPES.includes(raw.type)||!plain(raw.rule)||!RULES.includes(raw.rule.kind)) fail('奖励类型或解锁条件无效');
    const value=raw.rule.value??1;
    if(!integer(value,1,10000)||!integer(raw.price,0,1000000)||(raw.type!=='wardrobe'&&raw.price!==0)) fail('金币或条件数值无效');
    if(typeof raw.acquired!=='boolean'||typeof raw.archived!=='boolean') fail('奖励状态无效');
    if(!(raw.image instanceof Blob)) fail('奖励缺少图片');
    return {id:raw.id,name:raw.name.trim(),type:raw.type,rule:{kind:raw.rule.kind,value},price:raw.price,acquired:raw.acquired,archived:raw.archived,image:raw.image};
  }
  function validateState(raw) {
    if(!plain(raw)||raw.schema!=='quest-island-rewards/v1'||!Array.isArray(raw.items)||raw.items.length>LIMITS.count||!integer(raw.spent,0,1000000000)) fail('奖励备份格式无效');
    const items=raw.items.map(validateItem);
    if(new Set(items.map(i=>i.id)).size!==items.length) fail('奖励编号重复');
    if(items.reduce((n,i)=>n+i.image.size,0)>LIMITS.total) fail('图片合计超过 80 MB，请减少图片');
    if(raw.equipped!==null&&!items.some(i=>i.id===raw.equipped&&i.acquired&&!i.archived&&i.type==='wardrobe')) fail('当前造型记录无效');
    if(!plain(raw.milestones)||!integer(raw.milestones.lv,1,10000)||!integer(raw.milestones.maxRun,0,100000)||!integer(raw.milestones.pubs,0,100000)||!Array.isArray(raw.milestones.bossW)||!Array.isArray(raw.milestones.cards)) fail('历史解锁记录无效');
    return {schema:raw.schema,rev:integer(raw.rev,0,Number.MAX_SAFE_INTEGER)?raw.rev:0,items,spent:raw.spent,equipped:raw.equipped,milestones:milestones(raw.milestones)};
  }
  async function validateImage(blob, decode) {
    if(!(blob instanceof Blob)||!blob.size||blob.size>LIMITS.image) fail('每张图片须小于等于 8 MB，支持 JPG、PNG、WebP（HEIC 请先转格式）');
    const b=new Uint8Array(await blob.slice(0,16).arrayBuffer());
    const png=[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
    const jpg=b[0]===255&&b[1]===216&&b[2]===255;
    const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
    const type=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
    if(!type||blob.type!==type) fail('图片格式不符；仅支持真实的 JPG、PNG、WebP，不接受 SVG 或网址');
    const size=await decode(blob);
    if(!size||!integer(size.width,1,LIMITS.side)||!integer(size.height,1,LIMITS.side)||size.width*size.height>LIMITS.pixels) fail('图片太大或无法解码；请缩小到 8192 边长以内、2400 万像素以内');
    return blob;
  }
  function validateGameBackup(d) {
    if(!plain(d)||!['quest-island-backup/v1','quest-island-backup/v2'].includes(d.schema)) fail('这不是冒险岛备份文件');
    const out={};
    for(const k of ['log','wk','ex','sub','pro']) {
      if(d[k]!==undefined&&!plain(d[k])) fail('备份中的 '+k+' 格式无效');
      out[k]=d[k]??{};
    }
    // Reject prototype keys, huge trees, invalid entries before touching either store.
    let nodes=0;
    function inspect(o,depth=0) {
      if(++nodes>200000||depth>15) fail('备份结构过大');
      if(o===null||typeof o!=='object') return;
      for(const [k,v] of Object.entries(o)) {if(['__proto__','constructor','prototype'].includes(k)) fail('备份含不安全字段');inspect(v,depth+1);}
    }
    inspect(out);
    for(const k of ['log','wk','ex','sub']) for(const [id,v] of Object.entries(out[k])) {
      if(!plain(v)) fail('备份记录无效：'+k);
      if(k==='log'&&!/^\d{4}-\d{2}-\d{2}$/.test(id)) fail('打卡日期无效');
      if(k==='wk'&&!/^(?:[1-9]|1[0-2])$/.test(id)) fail('周次无效');
      if(k==='ex'&&(!/^E\d+$/.test(id)||!integer(v.week,1,12))) fail('拓展任务记录无效');
      // Used in an existing numeric input's value attribute; disallow arbitrary HTML.
      if(k==='log') for(const t of ['fit','steps','diet','eng','edit','ai','cc','leave']) {
        if(v[t]!==undefined&&typeof v[t]!=='boolean'&&!(typeof v[t]==='number'&&Number.isFinite(v[t]))&&!(typeof v[t]==='string'&&/^\d{0,6}$/.test(v[t]))) fail('打卡数值无效');
      }
    }
    const p=out.pro;
    if(p.owned!==undefined&&(!Array.isArray(p.owned)||p.owned.some(x=>typeof x!=='string'))) fail('衣橱记录无效');
    if(p.spent!==undefined&&(!Number.isFinite(p.spent)||p.spent<0)) fail('消费记录无效');
    if(p.look!==undefined&&typeof p.look!=='string') fail('造型记录无效');
    if(p.real!==undefined&&(!plain(p.real)||Object.values(p.real).some(x=>!plain(x)))) fail('现实奖励记录无效');
    return out;
  }
  function bytesToBase64(bytes) {
    let s='';for(let n=0;n<bytes.length;n+=32768)s+=String.fromCharCode(...bytes.subarray(n,n+32768));
    return btoa(s);
  }
  function imageFromJSON(image) {
    if(!plain(image)||!['image/png','image/jpeg','image/webp'].includes(image.type)||typeof image.data!=='string'||image.data.length>Math.ceil(LIMITS.image/3)*4||image.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(image.data)||!/^[^=]*={0,2}$/.test(image.data)) fail('备份图片编码无效');
    const s=atob(image.data);return new Blob([Uint8Array.from(s,c=>c.charCodeAt(0))],{type:image.type});
  }
  async function decodeBackup(d,decode) {
    const game=validateGameBackup(d);
    if(d.schema==='quest-island-backup/v1') return {game,rewards:null};
    if(!plain(d.rewards)||!Array.isArray(d.rewards.items)||d.rewards.items.length>LIMITS.count) fail('新版备份缺少奖励图片库');
    const raw={...d.rewards,items:d.rewards.items.map(i=>({...i,image:imageFromJSON(i.image)}))};
    const rewards=validateState(raw);
    for(const i of rewards.items) await validateImage(i.image,decode);
    return {game,rewards};
  }
  class Store {
    constructor({indexedDB=globalThis.indexedDB,localStorage,decode}={}) {
      this.factory=indexedDB;this.local=localStorage||{setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};this.decode=decode;this.state=emptyState();this.queue=Promise.resolve();this.ready=false;
    }
    async init() {
      if(!this.factory) fail('当前浏览器不能保存图片，请使用非无痕 Safari 或 Chrome');
      this.db=await new Promise((resolve,reject)=>{const r=this.factory.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('图片库被其他页面占用，请关闭其他冒险岛页面后重试'));r.onsuccess=()=>resolve(r.result)});
      this.db.onversionchange=()=>{this.db.close();this.ready=false;};
      const raw=await new Promise((resolve,reject)=>{const t=this.db.transaction('data');const r=t.objectStore('data').get('library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      this.state=raw?validateState(raw):emptyState();
      // Durable restore journal: complete an interrupted cross-store restore, never silently reset.
      if(raw?.pendingGame) {
        this.local.setItem(GAME_KEY,raw.pendingGame);
        await this.write(this.state);
      }
      this.ready=true;return this;
    }
    enqueue(fn) {const run=this.queue.then(()=>{if(!this.ready)fail('图片库不可用，请先备份并重新打开页面');return fn()});this.queue=run.catch(()=>{});return run;}
    write(next, pendingGame) {
      const expected=this.state.rev,nextRev=expected+1;
      const record={...next,rev:nextRev,...(pendingGame?{pendingGame}:{})};
      return new Promise((resolve,reject)=>{
        const t=this.db.transaction('data','readwrite'),s=t.objectStore('data');let conflict=false;
        const r=s.get('library');r.onsuccess=()=>{if((r.result?.rev??0)!==expected){conflict=true;t.abort();return}s.put(record,'library')};
        t.oncomplete=()=>{this.state={...next,rev:nextRev};resolve()};
        t.onabort=()=>reject(new Error(conflict?'其他页面已修改图片库，请刷新后重试':t.error?.name==='QuotaExceededError'?'空间不足，未保存；请先备份并减少图片':'图片保存失败，原有奖励未被覆盖'));
        t.onerror=()=>{};
      });
    }
    async addOrEdit(fields,blob) {
      if(blob)await validateImage(blob,this.decode);
      return this.enqueue(async()=>{
        const old=this.state.items.find(i=>i.id===fields.id);
        if(fields.id&&!old)fail('奖励已不存在，请刷新');
        if(old?.type==='wardrobe'&&old.acquired&&fields.type!=='wardrobe')fail('已兑换的衣橱奖励不能改类型，可修改名称、图片或归档');
        const item=validateItem({...fields,id:old?.id||'r_'+globalThis.crypto.randomUUID(),price:fields.type==='wardrobe'?fields.price:0,acquired:old?.acquired??false,archived:old?.archived??false,image:blob||old?.image});
        if(this.state.items.length>=LIMITS.count&&!old)fail('最多保存 100 个奖励，请先导出备份');
        const items=old?this.state.items.map(i=>i.id===item.id?item:i):this.state.items.concat(item);
        const next=validateState({...this.state,items});await this.write(next);return item;
      });
    }
    observe(stats) {
      return this.enqueue(async()=>{const m=mergeMilestones(this.state.milestones,stats);if(JSON.stringify(m)!==JSON.stringify(this.state.milestones))await this.write({...this.state,milestones:m})});
    }
    claim(id,stats,availableCoins) {
      const seenSpent=this.state.spent;
      return this.enqueue(async()=>{
        const i=this.state.items.find(i=>i.id===id);if(!i||i.archived||i.acquired)fail('奖励不可领取或已经领取');
        const m=mergeMilestones(this.state.milestones,stats);
        if(!eligible(i,m))fail('尚未达到解锁条件');
        const price=i.type==='wardrobe'?i.price:0;
        if(price>0&&(!Number.isFinite(availableCoins)||availableCoins-(this.state.spent-seenSpent)<price))fail('金币不足');
        // Coins spent here are separate from the unchanged built-in ledger, and are atomic with ownership.
        await this.write({...this.state,items:this.state.items.map(x=>x.id===id?{...x,acquired:true}:x),spent:this.state.spent+price,milestones:m});
      });
    }
    equip(id) {return this.enqueue(async()=>{if(id!==null&&!this.state.items.some(i=>i.id===id&&i.acquired&&!i.archived&&i.type==='wardrobe'))fail('请先兑换该衣橱奖励');await this.write({...this.state,equipped:id})});}
    archive(id) {return this.enqueue(async()=>{const items=this.state.items.map(i=>i.id===id?{...i,archived:!i.archived}:i);const equipped=items.some(i=>i.id===this.state.equipped&&i.archived)?null:this.state.equipped;await this.write({...this.state,items,equipped})});}
    async backup(game) {
      await this.queue;if(!this.ready)fail('图片库未读通，不能生成不完整备份；请重新打开页面后重试');
      const rewards={...this.state,items:[]};
      for(const i of this.state.items)rewards.items.push({...i,image:{type:i.image.type,data:bytesToBase64(new Uint8Array(await i.image.arrayBuffer()))}});
      return {...game,schema:'quest-island-backup/v2',rewards};
    }
    restore(decoded) {
      return this.enqueue(async()=>{
        const before=this.state,next=decoded.rewards||before;
        const game=JSON.stringify({v:1,...decoded.game,savedAt:Date.now()});
        await this.write(next,game); // Commit images + recovery journal before replacing game data.
        try{this.local.setItem(GAME_KEY,game)}catch(e){
          try{await this.write({...before,rev:this.state.rev})}catch(rollback){this.ready=false;fail('恢复尚未完成，请勿继续操作；空间恢复后重新打开页面会继续恢复。请保留备份文件')}
          fail('本机存储空间不足或受限，恢复已取消，原有数据保留');
        }
        try{await this.write(this.state)}catch(e){this.ready=false;fail('数据已恢复但恢复标记未清除，请重新打开页面完成恢复，不要重复操作')}
      });
    }
  }
  return {Store,LIMITS,RULES,TYPES,GAME_KEY,DB_NAME,emptyState,eligible,mergeMilestones,validateGameBackup,validateImage,validateState,decodeBackup,imageFromJSON};
});
