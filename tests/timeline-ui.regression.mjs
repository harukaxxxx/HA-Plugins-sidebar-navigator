import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {JSDOM}=require('jsdom'); const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'})
globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'); const {createRoot}=require('react-dom/client'); const jsx=require('react/jsx-runtime')
const {atom}=await import(pathToFileURL(require.resolve('nanostores')).href); const {useStore}=await import(pathToFileURL(require.resolve('@nanostores/react')).href)
const {QueryClient,QueryClientProvider,useQuery}=require('@tanstack/react-query')
const source=await readFile(new URL('../desktop-plugin/desktop/plugin.js', import.meta.url),'utf8')
const names=source.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
const component=({children})=>React.createElement(React.Fragment,null,children); const sdk=Object.fromEntries(names.map(n=>[n,component]))
const route={connectionId:'local',mode:'local',profile:'test',targetProfile:'test'}
let behavior, listCalls=0
const host={state:{profile:atom('test'),connectionId:atom('local'),busyBySession:atom({}),busy:atom(false)},requestProfile:async(r,m,p)=>{if(m==='session.list'){listCalls++;return behavior()}return {projects:[]}},profileRoutes:async()=>[route],notify(){},notifyError(){}}
const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
Object.assign(sdk,{host,atom,useValue:useStore,useQuery,queryClient:client,icons:{}})
const modules={'@hermes/plugin-sdk':sdk,react:React,'react/jsx-runtime':jsx}
const m=new SourceTextModule(source);await m.link(async s=>new SyntheticModule(Object.keys(modules[s]),function(){for(const [k,v] of Object.entries(modules[s]))this.setExport(k,v)}));await m.evaluate()
const root=createRoot(document.getElementById('root'));const wait=()=>new Promise(r=>setTimeout(r,35))
async function render(){await React.act(async()=>{root.render(React.createElement(QueryClientProvider,{client},React.createElement(m.namespace.SessionBrowser,{route})));await wait()});await React.act(wait)}
async function reset(){await React.act(async()=>{root.render(null);await wait()});client.clear()}
behavior=()=>Promise.resolve({sessions:Array.from({length:200},(_,i)=>({id:String(i),message_count:0})),scope:'stored'});await render()
assert.match(document.body.textContent,/200/);assert.match(document.body.textContent,/limit|maximum|at most/i);assert.match(document.body.textContent,/may|older|more/i);assert.doesNotMatch(document.body.textContent,/200 sessions total/i)
await reset();behavior=()=>Promise.resolve({error:{message:'denied'}});await render();assert.match(document.body.textContent,/Couldn’t load.*denied/);assert.doesNotMatch(document.body.textContent,/0 sessions/)
await reset();behavior=()=>Promise.resolve({sessions:[],scope:'stored'});await render();assert.match(document.body.textContent,/0 matching sessions/);assert.match(document.body.textContent,/200/)
await reset();behavior=()=>Promise.resolve({sessions:Array.from({length:101},(_,i)=>({id:String(i),title:`Fixture ${i}`,message_count:1})),scope:'stored'});await render()
assert.match(document.body.textContent,/Fixture 0/);assert.doesNotMatch(document.body.textContent,/Fixture 100/)
const button=[...document.querySelectorAll('button')].find(b=>/Show 1 more loaded/.test(b.textContent));assert.ok(button)
const before=listCalls;await React.act(async()=>{button.click();await wait()});assert.match(document.body.textContent,/Fixture 100/);assert.equal(listCalls,before)
await React.act(async()=>root.unmount());client.clear();console.log('PASS UI cap notice, error object, empty, rows and local show-more')
