import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import assert from 'node:assert/strict'

const source = await readFile(new URL('../desktop-plugin/desktop/plugin.js', import.meta.url), 'utf8')
const route = { connectionId: 'remote-1', mode: 'remote', profile: 'profile-a', targetProfile: 'profile-a' }
const calls = [], notices = []
let failCreate = false, failOpen = false
const atom = value => ({ get: () => value, set: v => { value = typeof v === 'function' ? v(value) : v } })
const host = {
  state: { profile: atom('other'), connectionId: atom('other'), busyBySession: atom({}) },
  profileRoutes: async () => [route],
  requestProfile: async (r, method, params) => { calls.push({r, method, params}); if (failCreate) throw Error('create failed'); return {stored_session_id:'s1'} },
  ensureAgent: async (...args) => { calls.push({ensure: args}) },
  openSession: async (...args) => { calls.push({open: args}); if (failOpen) throw Error('open failed') },
  notify: n => notices.push(n), notifyError: (err, msg) => notices.push({err:err.message,msg}),
  navigate: path => calls.push({navigate:path})
}
const sdkNames = source.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
const sdk = Object.fromEntries(sdkNames.map(n => [n, function Component() {}]))
Object.assign(sdk, {host, atom, queryClient:{ invalidateQueries() {} }, useValue: a => a?.get?.(), useQuery: () => ({}), icons:{}})
const react = {useState: v => [v, () => {}], useEffect(){}, useRef: v => ({current:v})}
const jsx = (type, props) => ({type, props:props || {}})
const modules = {'@hermes/plugin-sdk':sdk, react, 'react/jsx-runtime':{jsx,jsxs:jsx}}
const module = new SourceTextModule(source)
await module.link(async spec => { const values = modules[spec]; return new SyntheticModule(Object.keys(values), function(){ for (const [k,v] of Object.entries(values)) this.setExport(k,v) }) })
await module.evaluate()
const plugin = module.namespace
function walk(node) { if (!node || typeof node !== 'object') return []; return [node,...(Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).flatMap(walk)] }
const project = {id:'project-a',label:'Example project',path:'/projects/example',repos:[{path:'/other'}],previewSessions:[],sessionCount:0}
await plugin.createSessionInProject(project, route)
assert.equal(calls.find(c => c.method === 'session.create').params.cwd_explicit, true, 'selected project cwd must override the profile default')
calls.length = 0
const tree = plugin.ProjectCard({project,allProjects:[project],currentId:null,filterQuery:'',route})
const nodes = walk(tree)
const entry = nodes.find(n => n.props?.title === 'Start project session in Example project')
const menu = nodes.find(n => n.props?.children?.some?.(x => x?.props?.children === 'Start project session'))
assert.ok(entry, 'project header must offer accurately labelled project session launch')
assert.ok(menu, 'project context menu must offer accurately labelled project session launch')
for (const click of [() => entry.props.onClick({stopPropagation(){}}), () => menu.props.onSelect()]) {
  calls.length = 0; click(); await new Promise(resolve => setTimeout(resolve, 20))
  const creates = calls.filter(c => c.method === 'session.create')
  assert.equal(creates.length,1)
  assert.deepEqual(creates[0].r, route)
  assert.equal(creates[0].params.cwd, project.path)
  assert.equal(creates[0].params.cwd_explicit, true)
  assert.equal(calls.some(c => c.navigate), false)
  assert.equal(calls.find(c => c.open)?.open[1].profile, route.profile)
}
assert.equal(plugin.resolveProjectCwd({path:null,repos:[{path:'/repo'}]}), '/repo')
assert.equal(plugin.resolveProjectCwd({path:'/primary',repos:[{path:'/repo'}]}), '/primary')
calls.length=0
await plugin.createSessionInProject({isNoProject:true,label:'Home'},route)
assert.deepEqual(calls.find(c=>c.method==='session.create').params,{})
calls.length=0
await assert.rejects(plugin.createSessionInProject({id:'missing',label:'Missing',repos:[]},route), /path|folder|directory/i)
assert.equal(calls.filter(c=>c.method==='session.create').length,0)
for (const stage of ['create','open']) {
  calls.length=0; failCreate=stage==='create'; failOpen=stage==='open'
  await assert.rejects(plugin.createSessionInProject(project,route), /failed/)
  assert.equal(calls.filter(c=>c.method==='session.create').length,1)
  assert.match(notices.at(-1).msg, stage==='open' ? /was created.*could not be opened/ : /Failed to create/)
}
console.log('PASS: both entries, cwd provenance, project tree contract, missing path, route and no retry')
