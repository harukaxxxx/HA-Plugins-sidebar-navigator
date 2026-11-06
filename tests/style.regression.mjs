import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const source = await readFile(new URL('../desktop-plugin/desktop/plugin.js', import.meta.url),'utf8')
const css = await readFile(process.env.HERMES_DESKTOP_CSS || (() => { throw Error("Set HERMES_DESKTOP_CSS to the executing Desktop stylesheet") })(),'utf8')
const atom = v => ({ get:()=>v, set:x=>{v=x} })
const names=source.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
const sdk=Object.fromEntries(names.map(x=>[x,function Mock(){}]))
Object.assign(sdk,{atom,host:{state:{profile:atom('test'),connectionId:atom('local')}}, useValue:a=>a?.get?.(), useQuery:()=>({}),queryClient:{},icons:{}})
const jsx=(type,props)=>({type,props:props||{}})
const mods={'@hermes/plugin-sdk':sdk,react:{useState:v=>[v,()=>{}],useEffect(){},useRef:v=>({current:v})},'react/jsx-runtime':{jsx,jsxs:jsx}}
const m=new SourceTextModule(source); await m.link(async s=>new SyntheticModule(Object.keys(mods[s]),function(){for(const [k,v] of Object.entries(mods[s]))this.setExport(k,v)})); await m.evaluate()
const tree=m.namespace.NavigatorShell({onClose:()=>{}})
function walk(n){return n&&typeof n==='object'?[n,...(Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).flatMap(walk)]:[]}
const nodes=walk(tree), active=nodes.find(n=>n.props?.children==='Projects'), idle=nodes.find(n=>n.props?.children==='Timeline'), input=nodes.find(n=>n.props?.type==='search')
assert.ok(active&&idle&&input)
const route={connectionId:'local',mode:'local',profile:'test',targetProfile:'test'}
m.namespace.browseStateAtom.set({manual:true,selected:route,unavailable:null})
const profileComponent=nodes.find(n=>n.type?.name==='ProfileSelector').type
const profileTree=profileComponent({catalog:{routes:[route],status:'ready'},activeRoute:route})
const profileButton=walk(profileTree).find(n=>n.props?.['aria-pressed'])
assert.deepEqual(profileButton.props.style,active.props.style,'chosen profile and active view share theme styling')
m.namespace.viewAtom.set('sessions')
const switched=walk(m.namespace.NavigatorShell({})).find(n=>n.props?.children==='Timeline')
assert.deepEqual(switched.props.style,active.props.style,'Timeline receives selected styling when switched')
const browser=await chromium.launch({headless:true})
const page=await browser.newPage(); await page.setContent('<!doctype html><html><head></head><body></body></html>'); await page.addStyleTag({content:css})
for(const theme of [{name:'light',base:'#1f2328',surface:'#fefefe',accent:'#0053fd'},{name:'dark',base:'#f0f0f0',surface:'#202124',accent:'#8ab4ff'}]){
 const out=await page.evaluate(({theme,root,active,idle,input})=>{
  document.documentElement.style.cssText=`--ui-base:${theme.base};--ui-accent:${theme.accent};--ui-editor-surface-background:${theme.surface};--theme-fill-primary-accent-mix:16%;--theme-control-active-accent-mix:16%;--theme-control-hover-accent-mix:8%`; const parent=document.createElement('div'); parent.style.background='var(--ui-editor-surface-background)'; document.body.replaceChildren(parent)
  const make=(tag,id,p)=>{let el=document.createElement(tag);el.id=id;el.className=p.className||'';Object.assign(el.style,p.style||{});el.textContent=id;return el}
  let shell=make('div','shell',root); parent.append(shell); for(const [id,p,tag] of [['active',active,'button'],['idle',idle,'button'],['input',input,'input']]) shell.append(make(tag,id,p));
  const color=(str)=>{let c=document.createElement('canvas');c.width=c.height=1;let x=c.getContext('2d');x.clearRect(0,0,1,1);x.fillStyle=str;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data]}
  const mix=(fg,bg)=>fg.slice(0,3).map((v,i)=>Math.round(v*fg[3]/255+bg[i]*(1-fg[3]/255))).concat(255)
  const get=(id)=>{let s=getComputedStyle(document.getElementById(id));return {bg:s.backgroundColor,fg:s.color}}
  let p=color(getComputedStyle(parent).backgroundColor), r=get('shell'),a=get('active'),i=get('idle'),inp=get('input'); let surface=mix(color(r.bg),p), abg=mix(color(a.bg),surface), afg=mix(color(a.fg),abg)
  const lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0)
  const contrast=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05)
  return {parent:p,shell:r,active:a,idle:i,input:inp,surface,activeBg:abg,contrast:contrast(afg,abg)}
 },{theme,root:{className:tree.props.className,style:tree.props.style},active:{className:active.props.className,style:active.props.style},idle:{className:idle.props.className,style:idle.props.style},input:{className:input.props.className,style:input.props.style}})
 console.log(theme.name,JSON.stringify(out))
 assert.deepEqual(out.surface,out.parent,`${theme.name}: Navigator must match the native surface without an accent wash`)
 assert.notDeepEqual(out.activeBg,out.surface,`${theme.name}: active segment must be visible`)
 assert.ok(out.contrast>=4.5,`${theme.name}: active text contrast ${out.contrast}`)
 await page.locator('#idle').hover()
 const hover=await page.locator('#idle').evaluate(el=>getComputedStyle(el).backgroundColor)
 assert.notEqual(hover,'rgba(0, 0, 0, 0)',`${theme.name}: idle hover is visible`)
 console.log(theme.name,'hover',hover)
}
await browser.close();console.log('PASS actual NavigatorShell props + shipped CSS, light/dark composite and active contrast')
