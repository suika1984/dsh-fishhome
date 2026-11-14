/**
 * 挂载自测：用「真的会跑 effect」的迷你 React 挂一遍面板，
 * 看有没有渲染死亡循环（这类循环在浏览器里会直接把渲染进程吃爆 → OOM 闪退）。
 *
 * 运行： node test/mount.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, '..', 'client.js')

/* ---- 计时器全部换成不排期的桩：只看渲染循环，不等真实时间 ---- */
const realSetInterval = globalThis.setInterval
const realClearInterval = globalThis.clearInterval
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.setTimeout = () => 0
globalThis.clearTimeout = () => {}

const hooks = {
  state: [],
  effects: [],
  index: 0,
  dirty: false,
  renders: 0,
  pending: [],
  cleanups: [],
}

function useState(initial) {
  const at = hooks.index++
  if (!(at in hooks.state)) {
    hooks.state[at] = { value: typeof initial === 'function' ? initial() : initial }
  }
  const slot = hooks.state[at]
  const setState = (next) => {
    const value = typeof next === 'function' ? next(slot.value) : next
    if (!Object.is(value, slot.value)) {
      slot.value = value
      hooks.dirty = true
    }
  }
  return [slot.value, setState]
}

function useEffect(fn, deps) {
  const at = hooks.index++
  const prev = hooks.effects[at]
  const list = Array.isArray(deps) ? deps : []
  const changed = !prev || list.length !== prev.deps.length || list.some((d, i) => !Object.is(d, prev.deps[i]))
  if (changed) hooks.pending.push({ at, fn, deps: list })
}

function useMemo(factory) {
  return factory()
}

function useRef(initial) {
  const at = hooks.index++
  if (!(at in hooks.state)) hooks.state[at] = { value: initial === undefined ? null : initial }
  return hooks.state[at]
}

const ReactStub = {
  createElement(type, props, ...children) {
    const merged = props || {}
    if (children.length === 1) merged.children = children[0]
    else if (children.length > 1) merged.children = children
    return { type, props: merged, children: children.flat(8) }
  },
  useState,
  useEffect,
  useRef,
  useMemo,
}

let plugin = null
const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      plugin = entry.factory(() => ReactStub)
    },
  },
}
// 面板里用到的浏览器全局
globalThis.window = fakeWindow
globalThis.Image = function StubImage() {
  this.naturalWidth = 100
  this.naturalHeight = 100
  Object.defineProperty(this, 'src', {
    set() {
      // 探针桩：立刻失败，走占位块分支
      if (typeof this.onerror === 'function') this.onerror()
    },
  })
}
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

new Function('window', readFileSync(CLIENT, 'utf8'))(fakeWindow)
assert.ok(plugin, 'client module should register itself')

const model = plugin.__internals
const pet = JSON.parse(readFileSync(path.join(HERE, '..', 'packs', 'bigfish-adult', 'pet.json'), 'utf8'))
const animations = JSON.parse(readFileSync(path.join(HERE, '..', 'packs', 'bigfish-adult', 'animations.json'), 'utf8'))

const views = {}
for (const tag of ['idle', 'walk', 'read', 'work', 'play', 'stretch', 'sleep']) {
  const view = model.buildAnimationView(animations, pet.assets, tag, pet.canvas)
  if (view) views[tag] = view
}

const home = model.createHome(Date.now(), '大肥鱼')
// 覆盖日志卡片（含 offline 记录）和「她不在这个房间」的提示
home.world.map = 'bedroom'
home.world.mapName = '卧室'
home.log.unshift({ at: Date.now() - 1000, code: 'offline', arg: { minutes: 180, capped: false } })
home.log.unshift({ at: Date.now(), code: 'nap' })
home.log.unshift({ at: Date.now(), code: 'pat' })
const store = {
  getSnapshot() {
    return {
      phase: 'ready',
      error: null,
      home,
      now: Date.now(),
      meta: { pack: pet, map: 'living' },
      views,
      saveState: 'saved',
      lastSavedAt: Date.now(),
    }
  },
  subscribe() {
    return () => {}
  },
  interact() {},
  toggleProp() {},
  reload() {},
  boot() {},
  loadPackFiles: async () => ['bed.png', 'chibi.png'],
  setPartImage() {},
  movePart() {},
  movePartByGrid() {},
  bumpPartZ() {},
  rotatePart() {},
  flipPart() {},
  updateEvent() {},
  saveFurniture: async () => 0,
  saveEvents: async () => 0,
  discardFurniture() {},
}

const registry = {}
plugin.apply({
  effect(fn) {
    fn()
  },
  slot(name, callback) {
    callback({ register(_options, component) {
      registry[component.name] = component
      return () => {}
    } })
  },
  slots: {
    inject(_name, callback) {
      return callback()
    },
    register(_options, component) {
      registry[component.name] = component
      return () => {}
    },
  },
  locale: {
    register: () => () => {},
    getLocale: () => ({ id: 'zh', language: 'zh' }),
    subscribe: () => () => {},
  },
})

const Panel = registry.FishHomePanel
assert.ok(Panel, 'panel should register')
// 注册的是带错误兜底的外壳，真正有 hooks 的是里层面板
const PanelView = model.FishHomePanelView || Panel

/** 渲染一次 + 跑本轮 effect；返回本轮渲染次数 */
function pump(maxRounds) {
  for (let round = 0; round < maxRounds; round += 1) {
    hooks.index = 0
    hooks.pending = []
    hooks.dirty = false
    hooks.renders += 1
    hooks.tree = PanelView({ store, translate: model.makeTranslate('zh'), localeSubscribe: () => () => {} })
    for (const entry of hooks.cleanups.splice(0)) entry()
    for (const { at, fn, deps } of hooks.pending) {
      const cleanup = fn()
      hooks.effects[at] = { deps, cleanup }
      if (typeof cleanup === 'function') hooks.cleanups.push(cleanup)
    }
    if (!hooks.dirty) return round + 1
  }
  return maxRounds
}

// 底部按钮由场景决定：这里给 living 场景的 controls，验证按钮文案来自数据
model.applyScene({
  id: 'living',
  room: {},
  furniture: [],
  events: [],
  controls: [
    { kind: 'toggle', key: 'livingLamp', label: { zh: '客厅灯' }, suffix: 'state' },
    { kind: 'event', id: 'watch_tv', label: { zh: '看电视' } },
    { kind: 'reset', label: { zh: '回到中间' } },
  ],
})

function collectText(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node.type === 'function') return collectText(node.type(node.props || {}), out)
  collectText(node.props ? node.props.children : undefined, out)
  return out
}

const rounds = pump(30)
const texts = collectText(hooks.tree)
assert.ok(texts.includes('看电视'), '底部按钮要来自当前场景的 controls')
assert.ok(texts.includes('回到中间'), 'reset 按钮也在')
assert.ok(!texts.includes('躺一会儿'), '别的场景的按钮不该出现')
assert.ok(rounds < 20, `panel re-rendered ${rounds} times without settling — likely a render loop`)
console.log('mount test passed:', { rounds, hooks: hooks.state.length })

globalThis.setInterval = realSetInterval
globalThis.clearInterval = realClearInterval
