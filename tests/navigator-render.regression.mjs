import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'http://localhost/'})
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const { atom } = await import(pathToFileURL(require.resolve('nanostores')).href)
const { useStore } = await import(pathToFileURL(require.resolve('@nanostores/react')).href)
const jsx = require('react/jsx-runtime')
const source = await readFile(new URL('../desktop-plugin/desktop/plugin.js', import.meta.url),'utf8')
const route = {connectionId:'local',mode:'local',profile:'test',targetProfile:'test'}
const names = source.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
const component = ({children}) => React.createElement(React.Fragment,null,children)
const sdk=Object.fromEntries(names.map(name=>[name,component]))
let plugin
const host={state:{profile:atom('test'),connectionId:atom('local'),busyBySession:atom({}),busy:atom(false)}, profileRoutes:async()=>[route], ensureAgent:async()=>{},openSession:async id=>{plugin.focusAtom.set(id)},notify(){},notifyError(error){throw error}}
Object.assign(sdk,{host,atom,useValue:useStore,useQuery:({queryKey})=>({status:'success',data:queryKey?.[1]==='sessions'?{sessions:[{id:'target',title:'Target session',message_count:1}]}:{projects:[]}}),queryClient:{},icons:{}})
const modules={'@hermes/plugin-sdk':sdk,react:React,'react/jsx-runtime':jsx}
const m=new SourceTextModule(source); await m.link(async spec=>new SyntheticModule(Object.keys(modules[spec]),function(){for(const [k,v] of Object.entries(modules[spec]))this.setExport(k,v)})); await m.evaluate(); plugin=m.namespace
let caught
class Boundary extends React.Component {constructor(p){super(p);this.state={error:null}} static getDerivedStateFromError(error){return {error}} componentDidCatch(error){caught=error} render(){return this.state.error ? React.createElement('div',null,'render failed') : this.props.children}}
const root=createRoot(document.getElementById('root'))
await React.act(async()=>{root.render(React.createElement(Boundary,null,React.createElement(plugin.SessionBrowser,{route})))})
const button=[...document.querySelectorAll('button')].find(el=>el.title==='Target session')
assert.ok(button,'actual session row rendered')
await React.act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,0))})
if(caught) console.error('RENDER ERROR:',caught.stack)
assert.equal(caught,undefined,'clicking a local session must not crash the navigator')
assert.equal(plugin.focusAtom.get(),'target')
assert.ok(document.querySelector('button[title="Target session"]'))
await React.act(async()=>{host.state.busy.set(true)})
assert.ok(document.querySelector('.arc-row'),'focused busy fallback displays activity')
await React.act(async()=>{host.state.busyBySession.set({target:true});host.state.busy.set(false)})
assert.ok(document.querySelector('.arc-row'),'per-session busy displays activity')
await React.act(async()=>{host.state.busyBySession.set({});plugin.focusAtom.set('')})
assert.ok(document.querySelector('button[title="Target session"]'))
assert.equal(document.querySelector('.arc-row'),null,'idle row is not busy')
await React.act(async()=>root.unmount())
console.log('PASS: real React SessionBrowser click → focused → busy → unfocused; native nanostores useStore')
