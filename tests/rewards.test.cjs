const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const R=require('../reward-library.js');
const fs=require('node:fs');
const png=()=>new Blob([fs.readFileSync(__dirname+'/fixtures/neutral.png')],{type:'image/png'});
const decode=async()=>({width:1,height:1}); // Core tests use a neutral fixture; real browser decoder is manually checked.
const makeLocal=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),values}};
async function setup(opts={}){const localStorage=opts.localStorage||makeLocal(),indexedDB=opts.indexedDB||new IDBFactory();const store=new R.Store({localStorage,indexedDB,decode});await store.init();return {store,localStorage,indexedDB};}
const fields=(extra={})=>({name:'中性测试奖励',type:'wardrobe',price:50,rule:{kind:'level',value:1},...extra});
const oldGame=(extra={})=>({schema:'quest-island-backup/v1',log:{},wk:{},ex:{},sub:{},pro:{},...extra});

test('new store is empty and does not change the stable game key',async()=>{
 const {store,localStorage}=await setup();assert.equal(R.GAME_KEY,'quest-island-v1');assert.equal(store.state.items.length,0);assert.equal(localStorage.getItem(R.GAME_KEY),null);
});
test('add/edit, claim once, equip, archive, restart persist without localStorage image bytes',async()=>{
 const {store,localStorage,indexedDB}=await setup();const i=await store.addOrEdit(fields(),png());
 assert.equal(store.state.items[0].acquired,false);
 await store.claim(i.id,{lv:1},50);assert.equal(store.state.spent,50);
 await assert.rejects(store.claim(i.id,{lv:1},50),/已经领取/);
 await store.equip(i.id);assert.equal(store.state.equipped,i.id);
 await store.addOrEdit(fields({id:i.id,name:'修改名称',price:100}),null);assert.equal(store.state.items[0].acquired,true);assert.equal(store.state.spent,50);
 await assert.rejects(store.addOrEdit(fields({id:i.id,type:'codex'})),/不能改类型/);
 await store.archive(i.id);assert.equal(store.state.equipped,null);assert.equal(store.state.items[0].archived,true);
 const again=(await setup({localStorage,indexedDB})).store;assert.equal(again.state.items[0].name,'修改名称');assert.equal(again.state.spent,50);assert.equal(localStorage.values.size,0);
});
test('eligibility rules are specific, combined requires both, original codex only',()=>{
 for(const [kind,no,yes] of [
 ['level',{lv:2},{lv:3}],['streak',{maxRun:2},{maxRun:3}],['videos',{pubs:2},{pubs:3}],
 ['boss4',{bossW:[8]},{bossW:[4]}],['boss8',{bossW:[4]},{bossW:[8]}],['boss12',{bossW:[4,8]},{bossW:[12]}],
 ['codex',{cards:['c1']},{cards:Array.from({length:8},(_,i)=>'c'+(i+1))}],
 ['combined',{bossW:[12],cards:['c1']},{bossW:[12],cards:Array.from({length:8},(_,i)=>'c'+(i+1))}]
 ]){const item={rule:{kind,value:3}};assert.equal(R.eligible(item,no),false,kind);assert.equal(R.eligible(item,yes),true,kind);}
});
test('milestones and unclaimed rewards survive the next plan with lower stats',async()=>{
 const {store}=await setup();const i=await store.addOrEdit(fields({type:'hidden',rule:{kind:'combined',value:1}}),png());
 await store.observe({lv:10,maxRun:21,pubs:2,bossW:[12],cards:Array.from({length:8},(_,i)=>'c'+(i+1))});
 await store.observe({lv:1,maxRun:0,pubs:0,bossW:[],cards:[]});
 await store.claim(i.id,{lv:1},0);assert.equal(store.state.items[0].acquired,true);assert.equal(store.state.spent,0);assert.equal(store.state.milestones.lv,10);
});
test('no claim before condition, insufficient coins, or archived',async()=>{
 const {store}=await setup();const i=await store.addOrEdit(fields({rule:{kind:'level',value:5}}),png());
 await assert.rejects(store.claim(i.id,{lv:1},100),/尚未/);await assert.rejects(store.claim(i.id,{lv:5},49),/金币不足/);
 await store.archive(i.id);await assert.rejects(store.claim(i.id,{lv:5},100),/不可领取/);assert.equal(store.state.spent,0);
});
test('queued redemptions cannot double-spend the same balance',async()=>{
 const {store}=await setup();const a=await store.addOrEdit(fields(),png()),b=await store.addOrEdit(fields(),png());
 const result=await Promise.allSettled([store.claim(a.id,{lv:1},50),store.claim(b.id,{lv:1},50)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(store.state.spent,50);
});
test('full v2 backup roundtrip includes image bytes, ownership, archival, ledger, equipped and game',async()=>{
 const {store}=await setup();const i=await store.addOrEdit(fields(),png());await store.claim(i.id,{lv:1},100);await store.equip(i.id);
 const original=oldGame({log:{'2026-11-16':{steps:12000,diet:true}},sub:{d_test:{status:'pending'}},pro:{owned:['l1'],spent:300}});
 const exported=await store.backup(original);assert.equal(exported.schema,'quest-island-backup/v2');assert.equal(typeof exported.rewards.items[0].image.data,'string');
 const decoded=await R.decodeBackup(JSON.parse(JSON.stringify(exported)),decode);const other=await setup();await other.store.restore(decoded);
 assert.equal(other.store.state.spent,50);assert.equal(other.store.state.equipped,i.id);assert.equal(other.store.state.items[0].acquired,true);
 assert.deepEqual(Buffer.from(await other.store.state.items[0].image.arrayBuffer()),Buffer.from(await png().arrayBuffer()));
 assert.deepEqual(JSON.parse(other.localStorage.getItem(R.GAME_KEY)).log,original.log);
 assert.equal(other.store.state.pendingGame,undefined);
});
test('old v1 backup imports missing optional fields but preserves current reward library and spending',async()=>{
 const {store,localStorage}=await setup();const i=await store.addOrEdit(fields(),png());await store.claim(i.id,{lv:1},50);
 await store.restore(await R.decodeBackup({schema:'quest-island-backup/v1'},decode));assert.equal(store.state.items.length,1);assert.equal(store.state.spent,50);assert.deepEqual(JSON.parse(localStorage.getItem(R.GAME_KEY)).log,{});
});
test('invalid backup, duplicate IDs, HTML in numeric log, invalid ex, unsafe keys do not mutate data',async()=>{
 const {store}=await setup();await store.addOrEdit(fields(),png());const exported=await store.backup(oldGame());
 for(const bad of [null,{},oldGame({log:[]}),oldGame({log:{'2026-11-16':{steps:'"><img src=x>'}}}),oldGame({ex:{E1:{}}}),JSON.parse('{"schema":"quest-island-backup/v1","pro":{"__proto__":{}}}'),{...exported,rewards:{...exported.rewards,items:exported.rewards.items.concat(exported.rewards.items)}}])await assert.rejects(R.decodeBackup(bad,decode));
 assert.equal(store.state.items.length,1);
});
test('reject remote URLs, SVG, corrupt/oversize images, mismatched MIME and decoded pixel bombs',async()=>{
 await assert.rejects(R.validateImage(new Blob(['<svg/>'],{type:'image/svg+xml'}),decode));
 await assert.rejects(R.validateImage(new Blob([new Uint8Array(R.LIMITS.image+1)],{type:'image/png'}),decode));
 await assert.rejects(R.validateImage(new Blob([await png().arrayBuffer()],{type:'image/jpeg'}),decode));
 await assert.rejects(R.validateImage(png(),async()=>({width:10000,height:10000})),/太大/);
 assert.throws(()=>R.imageFromJSON({type:'image/png',data:'https://example.com/private.png'}));
 assert.throws(()=>R.imageFromJSON({type:'image/svg+xml',data:'PHN2Zy8+'}));
});
test('long base64 validator has no regex stack overflow',()=>{
 const blob=R.imageFromJSON({type:'image/png',data:'AAAA'.repeat(2000000)});assert.equal(blob.size,6000000);
});
test('IDB quota abort preserves item list and coin ledger',async()=>{
 const {store}=await setup();const i=await store.addOrEdit(fields(),png());
 // Simulate a transaction quota abort at the actual storage boundary.
 const original=store.db.transaction.bind(store.db);
 store.db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const os=tx.objectStore.bind(tx);tx.objectStore=name=>{const result=os(name);result.put=()=>{queueMicrotask(()=>tx.abort());return {}};return result}}return tx};
 await assert.rejects(store.claim(i.id,{lv:1},100),/保存失败/);assert.equal(store.state.spent,0);assert.equal(store.state.items[0].acquired,false);
});
test('localStorage quota failure rolls back restore library and retains old game',async()=>{
 const localStorage=makeLocal();localStorage.setItem(R.GAME_KEY,'original-game');const {store}=await setup({localStorage});
 await store.addOrEdit(fields(),png());const before=store.state.items[0].id;
 localStorage.setItem=()=>{throw new DOMException('Quota','QuotaExceededError')};
 await assert.rejects(store.restore({game:R.validateGameBackup(oldGame()),rewards:R.emptyState()}),/恢复已取消/);
 assert.equal(store.state.items[0].id,before);assert.equal(localStorage.getItem(R.GAME_KEY),'original-game');
});
test('interrupted restore journal finishes on next startup',async()=>{
 const {store,indexedDB,localStorage}=await setup();const i=await store.addOrEdit(fields(),png());
 await store.write({...store.state,spent:12},JSON.stringify({v:1,log:{'2026-11-16':{diet:true}}}));
 assert.equal(localStorage.getItem(R.GAME_KEY),null);const again=(await setup({indexedDB,localStorage})).store;
 assert.equal(JSON.parse(localStorage.getItem(R.GAME_KEY)).log['2026-11-16'].diet,true);assert.equal(again.state.items[0].id,i.id);assert.equal(again.state.spent,12);
});
test('a stale browser tab fails safely instead of overwriting newer rewards',async()=>{
 const {store,indexedDB,localStorage}=await setup();const other=(await setup({indexedDB,localStorage})).store;
 await store.addOrEdit(fields({name:'保留'}),png());await assert.rejects(other.addOrEdit(fields({name:'旧标签页'}),png()),/其他页面/);
 const again=(await setup({indexedDB,localStorage})).store;assert.equal(again.state.items.length,1);assert.equal(again.state.items[0].name,'保留');
});
test('archive is reversible and survives full image backup without removing coins',async()=>{
 const {store}=await setup();const i=await store.addOrEdit(fields(),png());await store.claim(i.id,{lv:1},50);await store.archive(i.id);
 const other=await setup();await other.store.restore(await R.decodeBackup(await store.backup(oldGame()),decode));
 assert.equal(other.store.state.items[0].archived,true);assert.equal(other.store.state.spent,50);
 await other.store.archive(i.id);assert.equal(other.store.state.items[0].archived,false);assert.equal(other.store.state.items[0].acquired,true);
});
test('backup rejects corrupt image and missing v2 library before changes; unavailable DB cannot export partial backup',async()=>{
 const {store}=await setup();await store.addOrEdit(fields(),png());const backup=await store.backup(oldGame());
 backup.rewards.items[0].image={type:'image/png',data:btoa('not really a png')};await assert.rejects(R.decodeBackup(backup,decode),/格式不符/);
 await assert.rejects(R.decodeBackup({schema:'quest-island-backup/v2'},decode),/缺少/);
 store.ready=false;await assert.rejects(store.backup(oldGame()),/不完整备份/);
});
test('free codex and zero-price wardrobe remain claimable with negative restored balance',async()=>{
 const {store}=await setup();const a=await store.addOrEdit(fields({type:'codex'}),png()),b=await store.addOrEdit(fields({price:0}),png());
 await store.claim(a.id,{lv:1},-100);await store.claim(b.id,{lv:1},-100);assert.equal(store.state.spent,0);assert.equal(store.state.items.filter(i=>i.acquired).length,2);
});
