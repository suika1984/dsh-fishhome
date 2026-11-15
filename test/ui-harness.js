/**
 * 界面测试的共享脚手架：加载 client.js、造 React 替身、准备 home/views/store/render。
 * 拆分自原来的 test/ui.test.js（第 1~154 行），各部分按顺序 import 这里的东西。
 */
/**
 * 界面树自测：用一个极简 React 替身把面板渲染成文本，检查有没有
 * 未定义的组件、缺失的文案 key 或渲染期异常。
 * 运行： node test/ui.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8')
const packDir = path.join(here, '..', 'packs', 'bigfish-adult')
const pet = JSON.parse(readFileSync(path.join(packDir, 'pet.json'), 'utf8'))
const animations = JSON.parse(readFileSync(path.join(packDir, pet.animations), 'utf8'))

let captured = null
const fakeWindow = {
  __ModuleLoader__: { load(entry) { captured = entry } },
  // currentMap() 会读这个；测试里默认「没记住房间」
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
}
new Function('window', source)(fakeWindow)

const ReactStub = {
  createElement(type, props, ...children) {
    // 与 React 一致：children 会同时出现在 props.children 里
    const config = props || {}
    if (children.length === 1) config.children = children[0]
    else if (children.length > 1) config.children = children
    return { type, props: config, children: children.flat(4) }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useRef(value) {
    return { current: value === undefined ? null : value }
  },
  useMemo(fn) {
    return fn()
  },
}
const plugin = captured.factory(() => ReactStub)
const model = plugin.__internals

const home = model.createHome(Date.now(), '大肥鱼')
home.world.props.deskLamp = true
home.world.props.curtainOpen = false
const views = {}
for (const tag of ['idle', 'read', 'work', 'play', 'stretch', 'sleep']) {
  const view = model.buildAnimationView(animations, pet.assets, tag)
  if (view) views[tag] = view
}
assert.ok(views.idle, 'idle view should resolve from the pack')

const store = {
  getSnapshot() {
    return {
      phase: 'ready',
      error: null,
      home,
      now: Date.now(),
      meta: { pack: pet },
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
}

function render(node, out = [], stats = { classes: new Set(), tags: {}, images: [] }) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) render(child, out, stats)
    return out
  }
  assert.ok(node && typeof node === 'object', `unexpected node: ${String(node)}`)
  assert.ok(node.type !== undefined, `element without type: ${JSON.stringify(node.props)}`)
  if (typeof node.type === 'function') {
    const rendered = node.type(node.props)
    render(rendered, out, stats)
    return out
  }
  assert.equal(typeof node.type, 'string', `bad element type: ${String(node.type)}`)
  stats.tags[node.type] = (stats.tags[node.type] || 0) + 1
  if (node.type === 'image' && typeof node.props.href === 'string') stats.images.push(node.props.href)
  if (node.type === 'polygon' && typeof node.props.points === 'string') {
    for (const pair of node.props.points.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      stats.bounds = stats.bounds || { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      stats.bounds.minX = Math.min(stats.bounds.minX, x)
      stats.bounds.maxX = Math.max(stats.bounds.maxX, x)
      stats.bounds.minY = Math.min(stats.bounds.minY, y)
      stats.bounds.maxY = Math.max(stats.bounds.maxY, y)
    }
  }
  if (typeof node.props.className === 'string') {
    for (const name of node.props.className.split(/\s+/)) {
      if (name !== '') stats.classes.add(name)
    }
  }
  if (node.type === 'style') return out
  render(node.children, out, stats)
  return out
}

const translate = model.makeTranslate('zh')

// 用模块内部注册的面板组件：apply 时传入 slots 桩，捕获注册内容。
let registered = null
const slotsStub = {
  inject(_name, callback) {
    return callback()
  },
  register(_options, component) {
    registered = registered || {}
    registered[component.name || 'component'] = component
    return () => {}
  },
}
const disposers = []
const fakeCtx = {
  locale: {
    register() {
      return () => {}
    },
    getLocale() {
      return { id: 'zh' }
    },
    subscribe() {
      return () => {}
    },
  },
  effect(fn) {
    const disposer = fn()
    if (typeof disposer === 'function') disposers.push(disposer)
    return disposer
  },
  slots: slotsStub,
}
plugin.apply(fakeCtx)
assert.ok(registered, 'apply should register a panel and an icon')
const components = Object.values(registered)
const Panel = components.find((component) => component.name === 'FishHomePanel')
assert.ok(Panel, 'FishHomePanel should be registered')

export {
  assert,
  model,
  plugin,
  ReactStub,
  home,
  views,
  store,
  render,
  translate,
  pet,
  animations,
  packDir,
  here,
  registered,
  components,
  Panel,
  disposers,
  fakeCtx,
  slotsStub,
}
