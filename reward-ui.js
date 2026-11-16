/* UI adapter: local image URLs only; no upload, fetch, or external image source. */
const RewardUI = (() => {
  'use strict';
  let store, hooks, busy=false, editing=null, selectedBlob=null, previewURL=null, imageSelection=0;
  const urls=new Map();
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const error=e=>{const text=e?.name==='QuotaExceededError'?'空间不足，未保存。请先备份，再减少图片尺寸。':(e?.message||'操作失败，请保留备份后重试');$('rewardStatus').textContent=text;hooks.notify(text)};
  const ruleText=r=>({level:`等级达到 LV${r.value}`,streak:`连续全勤 ${r.value} 天（历史最高）`,videos:`发视频次数达到 ${r.value}（历史最高）`,boss4:'通过第 4 周 Boss（两关）',boss8:'通过第 8 周 Boss（两关）',boss12:'通过第 12 周 Boss（两关）',codex:'集齐原有 8 张图鉴',combined:'第 12 周 Boss + 原有 8 张图鉴全部完成'}[r.kind]);
  async function decode(blob) {
    if(typeof createImageBitmap==='function') {
      let bitmap;try{bitmap=await createImageBitmap(blob);return {width:bitmap.width,height:bitmap.height}}finally{bitmap?.close()}
    }
    return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve({width:img.naturalWidth,height:img.naturalHeight})};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片无法读取，请转换为 JPG 或 PNG'))};img.src=url});
  }
  function urlFor(item) {
    const old=urls.get(item.id);
    if(old?.blob===item.image)return old.url;
    if(old)URL.revokeObjectURL(old.url);
    const url=URL.createObjectURL(item.image);urls.set(item.id,{blob:item.image,url});return url;
  }
  function art(item,cls='') {return `<img class="${cls}" src="${urlFor(item)}" alt="${escape(item.name)}" loading="lazy">`;}
  function equipped() {return store?.state.items.find(i=>i.id===store.state.equipped&&i.acquired&&!i.archived&&i.type==='wardrobe');}
  async function action(fn) {
    if(busy)return;
    busy=true;$('rewardPanel').setAttribute('aria-busy','true');
    try{await fn();hooks.changed()}catch(e){error(e)}finally{busy=false;$('rewardPanel').removeAttribute('aria-busy')}
  }
  function status() {
    if(!store?.ready)return;
    const size=store.state.items.reduce((n,i)=>n+i.image.size,0)/1024/1024;
    $('rewardStatus').textContent=`本机图片库：${store.state.items.length} / 100 项 · ${size.toFixed(1)} / 80 MB。只存在当前设备；请定期导出含图片备份。`;
  }
  function render(stats) {
    if(!store?.ready)return;
    for(const [id,entry] of urls)if(!store.state.items.some(i=>i.id===id)){URL.revokeObjectURL(entry.url);urls.delete(id)}
    const m=RewardLibrary.mergeMilestones(store.state.milestones,stats);
    const cards=store.state.items.filter(i=>!i.archived).map(i=>{
      const ok=RewardLibrary.eligible(i,m),hidden=i.type==='hidden'&&!i.acquired;
      let button=i.acquired?(i.type==='wardrobe'?`<button data-reward-equip="${i.id}" aria-label="${store.state.equipped===i.id?'当前本地造型：':'换上本地奖励：'}${escape(i.name)}" ${store.state.equipped===i.id?'disabled class="worn"':'class="eq"'}>${store.state.equipped===i.id?'当前造型':'换上'}</button>`:'<button disabled>已收藏 ✓</button>'):`<button data-reward-claim="${i.id}" ${!ok||(i.type==='wardrobe'&&i.price>0&&stats.coins<i.price)?'disabled':''}>${i.type==='wardrobe'?`兑换 · 🪙 ${i.price}`:'领取收藏'}</button>`;
      return `<div class="item ${i.acquired?'':'locked'}"><div class="ph">${hidden?'<div class="art art-l8" role="img" aria-label="隐藏奖励">❔</div>':art(i)}</div><div class="n">${hidden?'隐藏奖励':escape(i.name)}</div><div class="d">${i.type==='wardrobe'?'衣橱':i.type==='hidden'?'隐藏款':'收藏'} · ${escape(ruleText(i.rule))}</div>${button}<button class="reward-secondary" data-reward-edit="${i.id}">编辑</button></div>`;
    }).join('');
    $('localRewards').innerHTML=cards||'<p class="note">还没有本地奖励。点「添加奖励图」，选好图片、名称和规则即可。</p>';
    $('rewardManager').innerHTML=store.state.items.map(i=>`<div class="reward-manage-row"><span>${escape(i.name)}${i.acquired?' · 已解锁':''}${i.archived?' · 已归档':''}</span><button class="xbtn" data-reward-edit="${i.id}">编辑</button><button class="xbtn" data-reward-archive="${i.id}">${i.archived?'放回奖励栏':'归档'}</button></div>`).join('')||'<p class="note">暂无奖励。</p>';
    $('rewardDefault').hidden=!store.state.equipped;
    status();
    store.observe(stats).catch(error);
  }
  function preview(blob) {
    if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null}
    $('rewardPreview').hidden=!blob;
    if(blob){previewURL=URL.createObjectURL(blob);$('rewardPreview').src=previewURL}else $('rewardPreview').removeAttribute('src');
  }
  function openEditor(id) {
    if(!store?.ready){hooks.notify('图片库尚未可用');return}
    const i=store.state.items.find(i=>i.id===id);editing=i?.id||null;selectedBlob=null;imageSelection++;
    $('rewardEditTitle').textContent=i?'编辑奖励':'添加奖励图';
    $('rewardName').value=i?.name||'';$('rewardType').value=i?.type||'wardrobe';
    $('rewardPrice').value=i?.price??300;$('rewardRule').value=i?.rule.kind||'level';$('rewardValue').value=i?.rule.value??1;
    $('rewardImage').value='';$('rewardSave').disabled=false;$('rewardEditorError').textContent='';
    $('rewardOwnedNote').hidden=!i?.acquired;
    $('rewardType').disabled=!!(i?.acquired&&i.type==='wardrobe');
    preview(i?.image);fields();$('rewardEditor').showModal();$('rewardName').focus();
  }
  function fields() {
    const paid=$('rewardType').value==='wardrobe';$('rewardPriceField').hidden=!paid;$('rewardPrice').disabled=!paid;
    const quantified=['level','streak','videos'].includes($('rewardRule').value);$('rewardValueField').hidden=!quantified;$('rewardValue').disabled=!quantified;
  }
  function closeEditor() {$('rewardEditor').close();imageSelection++;preview(null);selectedBlob=null;editing=null;}
  async function init(options) {
    hooks=options;
    $('rewardAdd').disabled=true;
    try {store=new RewardLibrary.Store({decode});await store.init();$('rewardAdd').disabled=false;status()}
    catch(e){error(e);$('rewardStatus').textContent+=' 图片功能不可用；原有打卡不受影响。';}
    $('rewardAdd').addEventListener('click',()=>openEditor());
    $('rewardCancel').addEventListener('click',closeEditor);
    $('rewardEditor').addEventListener('cancel',()=>{imageSelection++;preview(null);selectedBlob=null;editing=null});
    $('rewardType').addEventListener('change',fields);$('rewardRule').addEventListener('change',fields);
    $('rewardImage').addEventListener('change',async ev=>{
      const selection=++imageSelection,blob=ev.target.files[0];selectedBlob=null;preview(store.state.items.find(i=>i.id===editing)?.image);
      $('rewardSave').disabled=true;$('rewardEditorError').textContent='';
      try{if(blob){await RewardLibrary.validateImage(blob,decode);if(selection!==imageSelection)return;selectedBlob=blob;preview(blob)}}catch(e){if(selection!==imageSelection)return;$('rewardEditorError').textContent=e.message;ev.target.value=''}finally{if(selection===imageSelection)$('rewardSave').disabled=false}
    });
    $('rewardForm').addEventListener('submit',async ev=>{
      ev.preventDefault();if(busy)return;
      const fields={id:editing,name:$('rewardName').value.trim(),type:$('rewardType').value,price:Number($('rewardPrice').value),rule:{kind:$('rewardRule').value,value:$('rewardValue').disabled?1:Number($('rewardValue').value)}};
      $('rewardSave').disabled=true;busy=true;
      try{await store.addOrEdit(fields,selectedBlob);closeEditor();hooks.changed();hooks.notify('奖励已保存在本机，请记得备份')}
      catch(e){$('rewardEditorError').textContent=e.message;error(e)}finally{busy=false;$('rewardSave').disabled=false}
    });
    $('rewardPanel').addEventListener('click',ev=>{
      const b=ev.target.closest('button');if(!b||b.disabled||busy)return;
      if(b.dataset.rewardEdit){openEditor(b.dataset.rewardEdit);return}
      if(b.dataset.rewardClaim)return action(async()=>{await store.claim(b.dataset.rewardClaim,hooks.stats(),hooks.stats().coins);hooks.notify('奖励已解锁，将跨十二周保留')});
      if(b.dataset.rewardEquip)return action(()=>store.equip(b.dataset.rewardEquip));
      if(b.dataset.rewardArchive)return action(()=>store.archive(b.dataset.rewardArchive));
    });
    $('rewardDefault').addEventListener('click',()=>action(()=>store.equip(null)));
  }
  async function backup(game) {if(!store?.ready)throw new Error('图片库不可用，不能导出不完整备份。请先恢复图片库访问');return store.backup(game);}
  async function readBackup(file) {
    if(file.size>RewardLibrary.LIMITS.backup)throw new Error('备份超过 120 MB，无法导入');
    let data;try{data=JSON.parse(await file.text())}catch(e){throw new Error('文件不是有效的 JSON 备份')}
    return RewardLibrary.decodeBackup(data,decode);
  }
  async function restore(decoded) {if(!store?.ready)throw new Error('图片库不可用，请换非无痕浏览器后重试');await store.restore(decoded);}
  return {init,render,equipped,art,backup,readBackup,restore,error,
    get spent(){return store?.state.spent||0},
    async useBuiltin(fn){return action(async()=>{if(store?.state.equipped)await store.equip(null);fn()})},
    get busy(){return busy},
    async exclusive(fn){return action(fn)}
  };
})();
