import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSessionInProject,
  resolveProjectCwd
} from '../desktop-plugin/desktop/plugin.js'
import {
  host,
  resetRouteMocks,
  setRouteMockHandler
} from './sdk-stub.mjs'

test('resolveProjectCwd returns null for home / null / isNoProject', () => {
  assert.equal(resolveProjectCwd(null), null)
  assert.equal(resolveProjectCwd({ isNoProject: true, label: 'Home' }), null)
  assert.equal(resolveProjectCwd({ isNoProject: true, path: '/example/home' }), null)
})

test('resolveProjectCwd returns project.path or repo path', () => {
  assert.equal(
    resolveProjectCwd({ id: 'example-project', path: '/projects/example' }),
    '/projects/example'
  )
  assert.equal(
    resolveProjectCwd({ id: 'repo-only', repos: [{ path: '/projects/repo' }] }),
    '/projects/repo'
  )
})

test('createSessionInProject creates project session and navigates in-place', async () => {
  resetRouteMocks()
  let capturedMethod = null
  let capturedParams = null

  setRouteMockHandler((method, params) => {
    capturedMethod = method
    capturedParams = params
    if (method === 'session.create') {
      return { session_id: 'runtime-fixture', stored_session_id: 'stored-fixture' }
    }
    return {}
  })

  const route = {
    connectionId: '__legacy_active__',
    mode: 'legacy',
    profile: 'default',
    targetProfile: 'default'
  }

  const project = {
    id: 'example-project',
    label: 'Example Project',
    path: '/projects/example'
  }

  const createdId = await createSessionInProject(project, route)
  assert.equal(createdId, 'stored-fixture')
  assert.equal(capturedMethod, 'session.create')
  assert.deepEqual(capturedParams, {
    cwd: '/projects/example',
    cwd_explicit: true
  })
  assert.equal(host.lastOpenedSession?.sessionId, 'stored-fixture')
  assert.equal(host.lastOpenedSession?.options?.intent, 'in-place')
  assert.match(host.lastNotification?.message || '', /Started new session in Example Project/)
})

test('createSessionInProject creates home session when isNoProject', async () => {
  resetRouteMocks()
  let capturedParams = null

  setRouteMockHandler((method, params) => {
    if (method === 'session.create') {
      capturedParams = params
      return { session_id: 's_home_999' }
    }
    return {}
  })

  const route = {
    connectionId: '__legacy_active__',
    mode: 'legacy',
    profile: 'default',
    targetProfile: 'default'
  }

  const createdId = await createSessionInProject({ isNoProject: true, label: 'Home' }, route)
  assert.equal(createdId, 's_home_999')
  assert.deepEqual(capturedParams, {})
  assert.equal(capturedParams.cwd, undefined)
  assert.equal(host.lastOpenedSession?.sessionId, 's_home_999')
  assert.match(host.lastNotification?.message || '', /Started new session in Home/)
})
