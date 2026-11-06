import {readFile} from 'node:fs/promises'
import {SourceTextModule,SyntheticModule} from 'node:vm'
import assert from 'node:assert/strict'
const source=await readFile(new URL('../desktop-plugin/desktop/plugin.js', import.meta.url),'utf8')
const names=source.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
const atom=x=>({get:()=>x,set:y=>x=y,subscribe:()=>()=>{}})
const route={connectionId:'local',mode:'local',profile:'test',targetProfile:'test'}
let params, result={sessions:[],scope:'stored'}, prefetched, handler, calls=[]
const host={state:{profile:atom('test'),connectionId:atom('local')},profileRoutes:async()=>[route],requestProfile:async(r,m,p)=>{params=p;calls.push(p);return handler ? handler(p) : result}}
const sdk=Object.fromEntries(names.map(n=>[n,()=>{}]));Object.assign(sdk,{host,atom,queryClient:{}})
const modules={'@hermes/plugin-sdk':sdk,react:{},'react/jsx-runtime':{jsx(){},jsxs(){}}}
// Stub imported React symbols without affecting query behavior.
const reactNames=source.match(/import\s*\{([^}]+)\}\s*from 'react'/)?.[1].split(',').map(s=>s.trim())||[]
for(const n of reactNames) modules.react[n]=()=>{}
const m=new SourceTextModule(source);await m.link(async s=>new SyntheticModule(Object.keys(modules[s]),function(){for(const [k,v] of Object.entries(modules[s]))this.setExport(k,v)}));await m.evaluate()
const q=m.namespace.sessionListQuery(route); await q.queryFn()
assert.deepEqual(params,{limit:200,scope:'stored'})
assert.notDeepEqual(q.queryKey,m.namespace.queryKey('sessions',route))
m.namespace.prefetchTimeline(route,{prefetchQuery:async x=>{prefetched=x;return x.queryFn()}});await new Promise(r=>setTimeout(r,0))
assert.deepEqual(prefetched.queryKey,q.queryKey);assert.deepEqual(params,{limit:200,scope:'stored'})
result={error:{message:'denied'}};await assert.rejects(q.queryFn(),/denied/)
result={unexpected:[]};await assert.rejects(q.queryFn(),/invalid|unexpected/i)
result={sessions:[],scope:'live'};await assert.rejects(q.queryFn(),/stored sessions/)
const legacyMessage='invalid params for session.list: scope: Extra inputs are not permitted — the client and the Hermes backend are out of sync (different versions); run `hermes update` and restart both'
for (const shape of ['throw', 'envelope', 'string']) {
  calls=[]; handler=p=>{if(!('scope' in p))return {sessions:[{id:'stored'}]}; if(shape==='throw')throw new Error(legacyMessage); return {error:shape==='string'?legacyMessage:{message:legacyMessage}}}
  assert.equal((await q.queryFn()).sessions[0].id,'stored')
  assert.deepEqual(calls,[{limit:200,scope:'stored'},{limit:200}])
}
for (const message of ['invalid params for session.list: limit: Extra inputs are not permitted', 'invalid params for session.list: scope: Extra inputs are not permitted — limit also invalid', 'invalid_params', 'permission denied']) {
  calls=[];handler=()=>{throw new Error(message)};await assert.rejects(q.queryFn(),e=>e.message===message);assert.equal(calls.length,1)
}
calls=[];handler=p=>'scope' in p ? {error:{message:legacyMessage}} : {error:{message:'legacy failed'}}
await assert.rejects(q.queryFn(),/legacy failed/);assert.equal(calls.length,2)
console.log('PASS query contract, cache key, prefetch, response errors')
