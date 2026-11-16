const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),plan=JSON.parse(fs.readFileSync(__dirname+'/../plan.json','utf8'));
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\(async\(\)=>\{\n  await RewardUI.init[\s\S]*?\}\)\(\);/,'');
function context() {
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},classList:{add(){},remove(){}},style:{}});return nodes.get(id)};
 const c=vm.createContext({console,Date,URL,Blob,setTimeout,clearTimeout,RewardUI:{spent:0,equipped:()=>null,render(){},art(){return ''}},navigator:{},window:{},document:{getElementById:node,addEventListener(){}},localStorage:{getItem:()=>null},PLAN:plan});
 vm.runInContext(script,c);vm.runInContext('({WEEKS,CC,GIT,GPT,GEM,GROK,DAYS,EXTRA}=PLAN);planReady=true;derive()',c);return c;
}
test('empty game has original 0 XP/coins, LV1, 0/8 codex',()=>{
 const c=context(),v=vm.runInContext('compute()',c);assert.equal(v.coins,0);assert.equal(v.xp,0);assert.equal(v.lv,1);assert.equal(v.cards.length,0);
});
test('Claude pending never pays; pass pays original daily 50 and full-attendance bonus',()=>{
 const c=context();vm.runInContext('LOG={"2026-11-16":{fit:true,steps:12000,diet:true,eng:true}};SUB={"d_2026-11-16":{status:"pending"}};derive()',c);
 let v=vm.runInContext('compute()',c);assert.equal(v.coins,65);assert.equal(v.xp,65);assert.equal(v.cards.length,0);
 vm.runInContext('VER={"d_2026-11-16":{status:"pass",reply:"通过"}};derive()',c);v=vm.runInContext('compute()',c);assert.equal(v.coins,130);assert.equal(v.xp,130);assert.equal(v.cards.join(','),'c1');
});
test('custom ledger subtracts coins only; XP/stats/level and existing purchases remain unchanged',()=>{
 const c=context();vm.runInContext('LOG={"2026-11-16":{fit:true,steps:12000,diet:true,eng:true}};VER={"d_2026-11-16":{status:"pass"}};PRO={spent:20,owned:["l2"],look:"l2"};derive()',c);
 const before=vm.runInContext('compute()',c);vm.runInContext('RewardUI.spent=50',c);const after=vm.runInContext('compute()',c);
 assert.equal(before.coins,110);assert.equal(after.coins,60);assert.equal(after.xp,before.xp);assert.equal(after.lv,before.lv);assert.deepEqual(after.stats,before.stats);assert.equal(vm.runInContext('S.look',c),'l2');
});
test('Boss verified by Claude retains 2x reward; hidden built-in remains tied to original 8 cards',()=>{
 const c=context();vm.runInContext('VER={w4_quest:{status:"pass"},w4_git:{status:"pass"}};derive()',c);const v=vm.runInContext('compute()',c);assert.equal(v.coins,360);assert.equal(v.bossW.join(','),'4');assert.ok(v.cards.includes('c4'));
 assert.ok(html.includes('const all=c.cards.length===CARDS.length'));assert.ok(html.includes('after.cards.length===CARDS.length&&!S.owned.includes("l8")'));
});
test('Grok export schema retained and does not export local private images',()=>{
 const c=context();const result=vm.runInContext('buildExport()',c);assert.equal(result.schema,'quest12-checkins/v1');assert.ok(!JSON.stringify(result).includes('rewards'));assert.equal(result.plan.rules.fullAttendanceBonus,15);
});
test('existing localStorage schema, verification fetch, task definitions remain accessible',()=>{
 assert.ok(html.includes('const KEY="quest-island-v1"'));assert.ok(html.includes('getJSON("verified.json")'));assert.ok(html.includes('document.visibilityState==="visible"'));
 const c=context();assert.equal(vm.runInContext('DAILY.length',c),5);assert.equal(vm.runInContext('CARDS.length',c),8);assert.equal(vm.runInContext('LOOKS.length',c),8);
});
