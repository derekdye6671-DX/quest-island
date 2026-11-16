const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
for(const [n,m] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries())new vm.Script(m[1],{filename:`index-inline-${n}.js`});
for(const file of ['reward-library.js','reward-ui.js','sw.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'duplicate HTML ids');
for(const file of ['reward-library.js','reward-ui.js','rewards.css'])assert.ok(fs.readFileSync('sw.js','utf8').includes(`"${file}"`),`${file} missing offline cache`);
const ui=fs.readFileSync('reward-ui.js','utf8');assert.ok(!/\bfetch\s*\(/.test(ui),'private rewards must not fetch');assert.ok(!/https?:\/\//.test(ui),'no remote image URLs');
console.log('Inline/external JS syntax, unique IDs, offline assets and no-image-network guards: PASS');
