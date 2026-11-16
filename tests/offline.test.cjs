// VM/unit diagnostics, NOT a real browser or service-worker integration test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');const R=require('../reward-library.js');
const fixture=JSON.parse(fs.readFileSync(__dirname+'/fixtures/neutral-rewards-v2.json','utf8'));
async function uiHarness() {
 const indexedDB=new IDBFactory(),values=new Map(),localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},decode=async()=>({width:32,height:32});
 const seed=new R.Store({indexedDB,localStorage,decode});await seed.init();await seed.restore(await R.decodeBackup(fixture,decode));await seed.claim('r_neutral_wardrobe',{lv:1},10);
 const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{listeners:{},attrs:{},addEventListener(t,fn){this.listeners[t]=fn},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},hidden:false,disabled:false});return nodes.get(id)}
 const notices=[];let changes=0;
 class LocalStore extends R.Store {constructor(opts){super({...opts,indexedDB,localStorage})}}
 const context=vm.createContext({RewardLibrary:{...R,Store:LocalStore},document:{getElementById:node},URL,Blob,Image:class{},fetch(){throw new Error('Unexpected network request from reward controls')},createImageBitmap:async()=>({width:32,height:32,close(){}}),hooks:{stats:()=>({lv:1,coins:0,cards:[]}),changed(){changes++;vm.runInContext('RewardUI.render(hooks.stats())',context)},notify:t=>notices.push(t)}});
 vm.runInContext(fs.readFileSync(__dirname+'/../reward-ui.js','utf8'),context);await vm.runInContext('RewardUI.init(hooks)',context);vm.runInContext('RewardUI.render(hooks.stats())',context);
 return {context,node,notices,get changes(){return changes},async click(dataset){await node('rewardPanel').listeners.click({target:{closest:()=>({dataset,disabled:false})}})}};
}
test('offline UI can equip persisted image, return to built-in and equip again without network',async()=>{
 const h=await uiHarness();assert.match(h.node('localRewards').innerHTML,/data-reward-equip="r_neutral_wardrobe"/);
 await h.click({rewardEquip:'r_neutral_wardrobe'});assert.equal(vm.runInContext('RewardUI.equipped().id',h.context),'r_neutral_wardrobe');assert.equal(vm.runInContext('RewardUI.busy',h.context),false);assert.equal(h.node('rewardPanel').attrs['aria-busy'],undefined);assert.match(h.node('localRewards').innerHTML,/aria-label="当前本地造型：/);
 await vm.runInContext('RewardUI.useBuiltin(()=>{})',h.context);assert.equal(vm.runInContext('RewardUI.equipped()',h.context),undefined);
 await h.click({rewardEquip:'r_neutral_wardrobe'});assert.equal(vm.runInContext('RewardUI.equipped().id',h.context),'r_neutral_wardrobe');assert.equal(h.notices.length,0);
});
test('failed local equip releases busy/pointer-event guard and later equip still works',async()=>{
 const h=await uiHarness();await h.click({rewardEquip:'r_does_not_exist'});assert.equal(vm.runInContext('RewardUI.busy',h.context),false);assert.equal(h.node('rewardPanel').attrs['aria-busy'],undefined);assert.equal(h.notices.length,1);
 await h.click({rewardEquip:'r_neutral_wardrobe'});assert.equal(vm.runInContext('RewardUI.equipped().id',h.context),'r_neutral_wardrobe');
});
function swHarness(fetch,cached) {
 const calls=[],timers=[],responses=new Map(Object.entries(cached||{})),handlers={};
 const c=vm.createContext({AbortController,URL,fetch,self:{addEventListener:(k,v)=>handlers[k]=v},location:{origin:'http://localhost:8766'},caches:{match:async key=>{calls.push(key);return responses.get(key)}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}});
 vm.runInContext(fs.readFileSync(__dirname+'/../sw.js','utf8'),c);return {c,calls,timers,handlers};
}
test('worker stalled navigation falls back within bounded timer instead of hanging boot',async()=>{
 const marker={cached:'page'},h=swHarness(()=>new Promise(()=>{}),{'index.html':marker});const p=vm.runInContext('freshOrCached({},"http://localhost:8766/",true,()=>{})',h.c);h.timers[0]();assert.equal(await p,marker);
});
test('worker offline JSON uses only its matching cache, never an HTML page',async()=>{
 const marker={cached:'json'},h=swHarness(()=>Promise.reject(new Error('offline')),{'http://localhost:8766/plan.json':marker,'index.html':{html:true}});assert.equal(await vm.runInContext('freshOrCached({},"http://localhost:8766/plan.json",false,()=>{})',h.c),marker);
 await assert.rejects(vm.runInContext('freshOrCached({},"http://localhost:8766/verified.json",false,()=>{})',h.c),/offline/);assert.ok(!h.calls.includes('index.html'));
});
test('worker online request prefers fresh verification over existing cache',async()=>{
 const fresh={ok:true,clone(){return this}},h=swHarness(()=>Promise.resolve(fresh),{'http://localhost:8766/verified.json':{stale:true}});assert.equal(await vm.runInContext('freshOrCached({},"http://localhost:8766/verified.json",false,()=>{})',h.c),fresh);assert.equal(h.calls.length,0);
});
test('page JSON request has bounded fallback even under an old worker',async()=>{
 const html=fs.readFileSync(__dirname+'/../index.html','utf8'),code=html.slice(html.indexOf('async function getJSON('),html.indexOf('async function fetchPlan('));const timers=[];
 const c=vm.createContext({AbortController,URL,Date,fetch:()=>new Promise(()=>{}),location:{href:'http://localhost:8766/'},caches:{match:async()=>({ok:true,json:async()=>({offline:true})})},setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){}});vm.runInContext(code,c);const p=vm.runInContext('getJSON("plan.json")',c);timers[0]();assert.deepEqual(await p,{offline:true});
});
test('blocked storage constructor does not prevent original game boot after reward init',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},disabled:false,textContent:''});return nodes.get(id)};const notices=[];
 const c=vm.createContext({RewardLibrary:{Store:class{constructor(){throw new DOMException('Blocked','SecurityError')}}},document:{getElementById:node},DOMException,hooks:{notify:t=>notices.push(t)}});
 vm.runInContext(fs.readFileSync(__dirname+'/../reward-ui.js','utf8'),c);await vm.runInContext('RewardUI.init(hooks)',c);assert.equal(node('rewardAdd').disabled,true);assert.equal(notices.length,1);assert.equal(vm.runInContext('RewardUI.spent',c),0);
});
