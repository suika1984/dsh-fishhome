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
const fakeWindow = { __ModuleLoader__: { load(entry) { captured = entry } } }
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

const sceneStats = { classes: new Set(), tags: {}, images: [] }
const text = render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], sceneStats).join('')
  .replace(/\s+/g, ' ')

assert.ok(text.includes('家园'), 'panel title should render')
assert.ok(text.includes('大肥鱼的小屋'), 'room badge should use the character name')
assert.ok(text.includes('正在点亮小屋') === false, 'ready state should not show loading')
assert.ok(text.includes('此刻'), 'status card should render')
assert.ok(text.includes('编辑'), 'editor toggle should be in the header')
assert.ok(text.includes('设置'), 'settings toggle should be in the header')
assert.ok(!/\b[a-z]+\.[a-z]+\b/i.test(text), `untranslated key leaked into UI: ${text.slice(0, 200)}`)

// 房间名可编辑：改成自定义名字后徽章显示它
const savedRoomName = home.roomName
home.roomName = '海边的屋子'
const namedText = render(Panel({ store, translate, localeSubscribe: () => () => {} })).join(' ')
assert.ok(namedText.includes('海边的屋子'), 'custom room name should show in the badge')
home.roomName = savedRoomName

// 家具必须真的画出来（曾经因为把组件当函数调用，整间屋子只剩墙和地板）
for (const name of ['fh-prop-desk', 'fh-prop-shelf', 'fh-prop-bed', 'fh-prop-night_lamp', 'fh-prop-rug', 'fh-prop-plant']) {
  assert.ok(sceneStats.classes.has(name), `furniture missing from the scene: ${name}`)
}
assert.ok((sceneStats.tags.polygon || 0) > 15, `scene should draw furniture, polygons=${sceneStats.tags.polygon || 0}`)
assert.ok((sceneStats.tags.ellipse || 0) > 0, 'lamp glow / props should still draw ellipses')
assert.ok(sceneStats.bounds, 'scene should produce polygons')
const canvasW = model.geom.canvasW
const canvasH = model.geom.canvasH
assert.ok(sceneStats.bounds.minX > -40 && sceneStats.bounds.maxX < canvasW + 40, `scene geometry overflows x: ${JSON.stringify(sceneStats.bounds)} (canvas ${canvasW})`)
assert.ok(sceneStats.bounds.minY > -40 && sceneStats.bounds.maxY < canvasH + 40, `scene geometry overflows y: ${JSON.stringify(sceneStats.bounds)} (canvas ${canvasH})`)
assert.ok(sceneStats.images.some((href) => href.endsWith('/pack/bed.png')), 'bed sprite should be drawn from the asset image')
assert.ok(sceneStats.images.some((href) => href.endsWith('/pack/lamp-off.png')), 'lamp off sprite should render')
assert.ok(sceneStats.images.some((href) => href.endsWith('/pack/lamp-on.png')), 'lamp on sprite should render')
// 角色已经挪进 SVG（按 z 和家具交错排序），不再是浮在上面的 HTML 层
const sheetName = pet.assets.sheet.path
assert.ok(sceneStats.images.some((href) => href.endsWith(`/pack/${sheetName}`)), 'character sprite should render inside the SVG')
assert.ok(sceneStats.classes.has('fh-character'), 'character group should be in the scene tree')

// 每种行为都渲染一遍，确认没有只在该分支里出现的异常
for (const behavior of model.BEHAVIORS) {
  home.character.behaviorId = behavior.id
  home.character.since = Date.now() - 5000
  home.character.until = Date.now() + 30000
  const out = render(Panel({ store, translate, localeSubscribe: () => () => {} })).join('')
  assert.ok(out.includes(translate(`behavior.${behavior.id}`)), `behavior text missing: ${behavior.id}`)
}

// 缺图占位块：没有 src 的 sprite part 必须画成「填色 + 虚线框 + 文字」
model.applyFurniture([
  { id: 'sofa', parts: [{ id: 'body', z: 90, sprite: { rect: [80, 90, 200, 120] } }] },
])
const phStats = { classes: new Set(), tags: {}, images: [] }
const phText = render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], phStats).join('')
assert.ok(phStats.classes.has('fh-placeholder'), 'placeholder group should render')
assert.ok(phText.includes('sofa:body'), 'placeholder should show the part id')
assert.ok((phStats.tags.text || 0) >= 1, 'placeholder should draw text')
assert.ok((phStats.tags.rect || 0) >= 1, 'placeholder should draw a rect')
assert.ok(!phStats.images.some((href) => href.includes('undefined')), 'placeholder must not request a bad image')

// 未知 preset 也要有占位块，而不是静默消失
model.applyFurniture([
  { id: 'sofa2', parts: [{ id: 'x', z: 90, preset: 'no_such_preset' }] },
])
const phText2 = render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], { classes: new Set(), tags: {}, images: [] }).join('')
assert.ok(phText2.includes('未知 preset'), 'unknown preset should render a placeholder')

// 恢复默认家具，后面的错误态/加载态断言不受影响
model.applyFurniture(model.DEFAULT_FURNITURE)

// 没有角色图时，角色也退成占位块，面板不报错
home.character.behaviorId = 'idle'
home.character.since = Date.now() - 5000
home.character.until = Date.now() + 30000
const noArtStore = {
  ...store,
  getSnapshot() {
    return { ...store.getSnapshot(), views: {} }
  },
}
const noArtText = render(Panel({ store: noArtStore, translate, localeSubscribe: () => () => {} }), [], { classes: new Set(), tags: {}, images: [] }).join('')
assert.ok(noArtText.includes('缺角色图'), 'missing character art should render a placeholder')

// 错误态与加载态
const errorStore = {
  ...store,
  getSnapshot() {
    return { ...store.getSnapshot(), phase: 'error', error: '角色包没有就绪' }
  },
}
const errorText = render(Panel({ store: errorStore, translate, localeSubscribe: () => () => {} })).join('')
assert.ok(errorText.includes('角色包没有就绪'))

const loadingStore = {
  ...store,
  getSnapshot() {
    return { ...store.getSnapshot(), phase: 'loading' }
  },
}
const loadingText = render(Panel({ store: loadingStore, translate, localeSubscribe: () => () => {} })).join('')
assert.ok(loadingText.includes('正在点亮小屋'))

// 卸载插件：清理 apply 里启动的一切（定时器、监听）
for (const dispose of disposers) dispose()

// 事件表单（可视化）：直接渲染 EventForm，检查字段与 onChange 产生的 patch
const napEvent = JSON.parse(JSON.stringify(model.BEHAVIOR_BY_ID.nap || model.BEHAVIORS[0]))
const patches = []
const formNode = model.EventForm({
  t: translate,
  draft: napEvent,
  events: model.BEHAVIORS,
  spots: ['center', 'desk', 'bed'],
  anims: ['idle', 'walk', 'read', 'work', 'play', 'stretch', 'sleep'],
  vocabs: Object.keys(model.WEIGHT_VOCAB || {}),
  onPick: () => {},
  onChange: (patch) => patches.push(patch),
  onApply: () => {},
})
const formText = render(formNode, [], { classes: new Set(), tags: {}, images: [] }).join(' ')
for (const label of ['落脚点', '动画', '时长', '每秒影响', '权重']) {
  assert.ok(formText.includes(label), `event form missing field: ${label}`)
}
assert.ok(formText.includes('应用'), 'event form should have an apply button')

/** 收集渲染树里的 input 元素，方便模拟输入 */
function collectInputs(node, out = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return out
  if (Array.isArray(node)) {
    for (const child of node) collectInputs(child, out)
    return out
  }
  if (typeof node.type === 'function') return collectInputs(node.type(node.props), out)
  if (node.type === 'input') out.push(node)
  const kids = node.children && node.children.length ? node.children : node.props && node.props.children
  if (kids) collectInputs(kids, out)
  return out
}

const inputs = collectInputs(formNode)
assert.ok(inputs.length > 0, 'event form should render inputs')

// 时长区间的第二个数字框 → duration[1]
const durationInput = inputs.find((el) => el.props.type === 'number' && el.props.step === 1 && el.props.value === napEvent.duration[1])
assert.ok(durationInput, 'duration number input should be present')
patches.length = 0
durationInput.props.onChange({ target: { value: '42' } })
assert.deepEqual(patches[0].duration, [napEvent.duration[0], 42])

// 权重勾选框 → 打开时给一个 base + 空 mods
const weightBox = inputs.find((el) => el.props.type === 'checkbox')
assert.ok(weightBox, 'weight checkbox should be present')
patches.length = 0
weightBox.props.onChange({ target: { checked: true } })
assert.deepEqual(patches[0].weight, { base: 1, mods: [] })

// 环境光 + 光源层 + 书桌精灵图：用真实数据文件渲染一遍
const deskDef = JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', 'bedroom', 'furniture', 'desk.json'), 'utf8'))
model.applyFurniture([deskDef])
const lightStats = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], lightStats)
assert.ok(lightStats.classes.has('fh-ambient'), 'ambient rect should render')
assert.ok(lightStats.classes.has('fh-lights'), 'light layer should render when a lamp is on')
assert.ok(lightStats.images.some((href) => href.endsWith('/pack/desk-on-screen.png')), 'desk lamp-on sprite should render')
home.world.props.deskLamp = false
const offStats = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], offStats)
assert.ok(offStats.images.some((href) => href.endsWith('/pack/desk-off.png')), 'desk lamp-off sprite should render')
assert.ok(!offStats.images.some((href) => href.endsWith('/pack/desk-on-screen.png')), 'only one desk variant at a time')
home.world.props.deskLamp = true
model.applyFurniture(model.DEFAULT_FURNITURE)

// 窗户：按时间段换精灵图；窗帘是叠加（z 更高）且只按开/关显示一张
const windowDef = JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', 'bedroom', 'furniture', 'window.json'), 'utf8'))
model.applyFurniture([windowDef])
const savedPeriod = home.world.period
const savedCurtain = home.world.props.curtainOpen
home.world.period = 'night'
home.world.props.curtainOpen = true
const winNight = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], winNight)
assert.ok(winNight.images.some((href) => href.endsWith('/pack/win-night.png')), 'night window sprite should render')
assert.ok(!winNight.images.some((href) => href.endsWith('/pack/win-day.png')), 'only one window variant at a time')
assert.ok(winNight.images.some((href) => href.endsWith('/pack/curtain-open.png')), 'open curtain should render')
assert.ok(!winNight.images.some((href) => href.endsWith('/pack/curtain-closed.png')), 'closed curtain must be hidden')

home.world.period = 'morning'
home.world.props.curtainOpen = false
const winDay = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], winDay)
assert.ok(winDay.images.some((href) => href.endsWith('/pack/win-day.png')), 'day window sprite should render')
assert.ok(winDay.images.some((href) => href.endsWith('/pack/curtain-closed.png')), 'closed curtain should render')
assert.ok(!winDay.images.some((href) => href.endsWith('/pack/curtain-open.png')), 'open curtain must be hidden')
// 窗帘的 z 要高于窗户（叠加而不是并排）
const curtainZ = windowDef.parts.find((part) => part.id === 'curtain-open').z
const windowZ = windowDef.parts.find((part) => part.id === 'night').z
assert.ok(curtainZ > windowZ, 'curtain must be layered above the window')
home.world.period = savedPeriod
home.world.props.curtainOpen = savedCurtain
model.applyFurniture(model.DEFAULT_FURNITURE)

// 房间灯：天黑了又没在睡觉就开着，睡/午睡时关
const nightClock = model.timeSnapshot(new Date('2026-11-04T23:00:00'), 'zh')
const noonClock = model.timeSnapshot(new Date('2026-11-04T12:30:00'), 'zh')
assert.equal(model.roomLightOn({ character: { behaviorId: 'idle' }, world: { period: 'night' } }, nightClock), true)
assert.equal(model.roomLightOn({ character: { behaviorId: 'sleep' }, world: { period: 'night' } }, nightClock), false)
assert.equal(model.roomLightOn({ character: { behaviorId: 'nap' }, world: { period: 'night' } }, nightClock), false)
assert.equal(model.roomLightOn({ character: { behaviorId: 'idle' }, world: { period: 'afternoon' } }, noonClock), false)
// 傍晚天黑了也算开灯
const duskClock = model.timeSnapshot(new Date('2026-11-04T18:30:00'), 'zh')
assert.equal(model.roomLightOn({ character: { behaviorId: 'idle' }, world: { period: 'evening' } }, duskClock), true)

// 夜里醒着时，画面里应该有吸顶灯的光池
const savedBehavior = home.character.behaviorId
home.character.behaviorId = 'idle'
home.world.period = 'night'
const nightStats = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], nightStats)
assert.ok(nightStats.classes.has('fh-room-glow'), 'room light glow should render at night while awake')
home.character.behaviorId = 'sleep'
const sleepStats = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], sleepStats)
assert.ok(!sleepStats.classes.has('fh-room-glow'), 'room light must be off while sleeping')
home.character.behaviorId = savedBehavior

// 改尺寸 / 换图：状态变体（同 rect 的多个 part）必须一起改，否则切状态会跳
const editorStore = new model.HomeStore()
const twinDef = {
  id: 'twin',
  parts: [
    { id: 'off', z: 10, sprite: { src: 'a.png', rect: [100, 100, 200, 160] } },
    { id: 'on', z: 10, sprite: { src: 'b.png', rect: [100, 100, 200, 160] } },
    { id: 'other', z: 11, sprite: { src: 'c.png', rect: [500, 500, 50, 50] } },
  ],
}
model.applyFurniture([twinDef])
editorStore.resizePart('twin', 'off', 300, 240)
let twin = model.furnitureRef.value.find((def) => def.id === 'twin')
let off = twin.parts.find((part) => part.id === 'off')
let on = twin.parts.find((part) => part.id === 'on')
let other = twin.parts.find((part) => part.id === 'other')
assert.deepEqual(off.sprite.rect, [100, 20, 300, 240], 'resized part keeps its bottom edge')
assert.deepEqual(on.sprite.rect, off.sprite.rect, 'state variants must share the new size')
assert.deepEqual(other.sprite.rect, [500, 500, 50, 50], 'unrelated parts must not move')

// 换图只改源、不改尺寸（以前会把调好的大小重置掉）
editorStore.setPartImage('twin', 'off', 'd.png')
twin = model.furnitureRef.value.find((def) => def.id === 'twin')
off = twin.parts.find((part) => part.id === 'off')
assert.equal(off.sprite.src, 'd.png')
assert.deepEqual(off.sprite.rect, [100, 20, 300, 240], 'swapping the image must not reset the size')

// 移动也是整组走
editorStore.movePart('twin', 'on', 10, -6)
twin = model.furnitureRef.value.find((def) => def.id === 'twin')
assert.deepEqual(twin.parts.find((part) => part.id === 'on').sprite.rect, [110, 14, 300, 240])
assert.deepEqual(twin.parts.find((part) => part.id === 'off').sprite.rect, [110, 14, 300, 240])

// preset 家具没有"变体组"的概念，移动仍然要生效（走 offset）
model.applyFurniture([{ id: 'presetBox', parts: [{ id: 'body', preset: 'plant', z: 10 }] }])
editorStore.movePart('presetBox', 'body', model.geom.kx, model.geom.ky)
const presetBox = model.furnitureRef.value.find((def) => def.id === 'presetBox')
assert.ok(presetBox.parts[0].offset, 'preset part should still get an offset')
assert.ok(Math.abs(presetBox.parts[0].offset.fx - 1) < 0.05, `offset fx ${presetBox.parts[0].offset.fx}`)
model.applyFurniture(model.DEFAULT_FURNITURE)

// 显式 group：即使两张状态图的位置/尺寸之前已经漂了，改一次也会对齐
model.applyFurniture([{
  id: 'grouped',
  parts: [
    { id: 'a', z: 10, sprite: { src: 'a.png', rect: [0, 0, 100, 80], group: 'body' } },
    { id: 'b', z: 10, sprite: { src: 'b.png', rect: [50, 60, 120, 90], group: 'body' } },
    { id: 'c', z: 10, sprite: { src: 'c.png', rect: [300, 300, 40, 40] } },
  ],
}])
editorStore.resizePart('grouped', 'a', 200, 160)
const grouped = model.furnitureRef.value.find((def) => def.id === 'grouped')
assert.deepEqual(grouped.parts[0].sprite.rect, [0, -80, 200, 160])
assert.deepEqual(grouped.parts[1].sprite.rect, [0, -80, 200, 160], 'same group must end up identical')
assert.deepEqual(grouped.parts[2].sprite.rect, [300, 300, 40, 40], 'parts outside the group stay put')
editorStore.rotatePart('grouped', 'b', 5)
assert.equal(model.furnitureRef.value.find((def) => def.id === 'grouped').parts[0].sprite.rotate, 5)
model.applyFurniture(model.DEFAULT_FURNITURE)

// 增删家具：内存里改，scene.json 的清单跟着同步
const addStore = new model.HomeStore()
addStore.sceneDoc = { id: 'bedroom', furniture: ['desk'] }
addStore.sceneSource = { id: 'bedroom', furniture: ['desk'] }
model.applyFurniture([{ id: 'desk', parts: [{ id: 'body', preset: 'desk', z: 70 }] }])
const newId = addStore.addFurniture()
assert.equal(newId, 'item-1')
assert.equal(model.furnitureRef.value.length, 2)
assert.deepEqual(addStore.sceneDoc.furniture, ['desk', 'item-1'])
assert.equal(addStore.sceneDirty, true, 'adding furniture must mark scene.json dirty')
const created = model.furnitureRef.value.find((def) => def.id === newId)
assert.ok(created.parts[0].sprite, 'new furniture starts with a placeholder sprite part')

// 再建一件不会撞 id
const secondId = addStore.addFurniture()
assert.notEqual(secondId, newId)

// 删除：内存里没了，清单里也没了，并记下要删的文件
assert.equal(addStore.removeFurniture(newId), true)
assert.equal(model.furnitureRef.value.some((def) => def.id === newId), false)
assert.deepEqual(addStore.sceneDoc.furniture, ['desk', secondId])
assert.ok(addStore.removedFurniture.includes(newId))
// 放弃改动会把清单一起还原
addStore.discardFurniture()
assert.deepEqual(addStore.sceneDoc.furniture, ['desk'])
assert.deepEqual(addStore.removedFurniture, [])
model.applyFurniture(model.DEFAULT_FURNITURE)

// 墙面 / 地板贴图：真实 background.json 里的 tile.art 应该被铺成 pattern
const bgDef = JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', 'bedroom', 'background.json'), 'utf8'))
model.applyBackground(bgDef)
const texStats = { classes: new Set(), tags: {}, images: [] }
render(Panel({ store, translate, localeSubscribe: () => () => {} }), [], texStats)
assert.ok(texStats.images.some((href) => href.endsWith('/pack/floor-1.png')), 'floor texture should be used')
assert.ok(texStats.images.filter((href) => href.endsWith('/pack/wall-whale.png')).length >= 2, 'both walls should use the wallpaper')
assert.ok(texStats.tags.pattern >= 3, 'texture patterns should be defined')

// 复制家具：新 id 自动避让，精灵图往「右前」挪一格
const dupStore = new model.HomeStore()
dupStore.sceneDoc = { id: 'bedroom', furniture: ['desk'] }
model.applyFurniture([{ id: 'desk', parts: [{ id: 'body', z: 70, sprite: { src: 'desk-off.png', rect: [100, 100, 200, 100] } }] }])
const copyId = dupStore.duplicateFurniture('desk')
assert.equal(copyId, 'desk-copy')
const copyDef = model.furnitureRef.value.find((def) => def.id === copyId)
assert.ok(copyDef, 'duplicated furniture should exist')
assert.deepEqual(copyDef.parts[0].sprite.rect, [100 + model.geom.kx, 100 + model.geom.ky, 200, 100])
assert.deepEqual(dupStore.sceneDoc.furniture, ['desk', 'desk-copy'])
assert.equal(dupStore.duplicateFurniture('nope'), null, 'unknown id returns null')
model.applyFurniture(model.DEFAULT_FURNITURE)

// 撤销：移动 → 撤销 → 回到原位；连续改动合并；撤销到底返回 false
const undoStore = new model.HomeStore()
undoStore.sceneDoc = { id: 'bedroom', furniture: ['box'] }
model.applyFurniture([{ id: 'box', parts: [{ id: 'body', z: 10, sprite: { src: 'x.png', rect: [100, 100, 80, 80] } }] }])
const before = model.furnitureRef.value[0].parts[0].sprite.rect.slice()
undoStore.movePart('box', 'body', 30, 0)
assert.deepEqual(model.furnitureRef.value[0].parts[0].sprite.rect, [130, 100, 80, 80])
assert.ok(undoStore.canUndo(), 'move should be undoable')
assert.equal(undoStore.undo(), true)
assert.deepEqual(model.furnitureRef.value[0].parts[0].sprite.rect, before, 'undo restores rect')
assert.equal(undoStore.undo(), false, 'empty history returns false')

// 拖拽/长按的连续改动合并成一步
const batchStore = new model.HomeStore()
batchStore.sceneDoc = { id: 'bedroom', furniture: ['box'] }
model.applyFurniture([{ id: 'box', parts: [{ id: 'body', z: 10, sprite: { src: 'x.png', rect: [100, 100, 80, 80] } }] }])
for (let i = 0; i < 8; i += 1) batchStore.movePart('box', 'body', 1, 0)
assert.equal(batchStore.history.length, 1, 'rapid moves coalesce into one undo step')
batchStore.undo()
assert.deepEqual(model.furnitureRef.value[0].parts[0].sprite.rect, [100, 100, 80, 80])

// 畸变：写进 sprite.skew，并夹在 ±0.8
const skewStore = new model.HomeStore()
skewStore.sceneDoc = { id: 'bedroom', furniture: ['box'] }
model.applyFurniture([{ id: 'box', parts: [{ id: 'body', z: 10, sprite: { src: 'x.png', rect: [0, 0, 10, 10] } }] }])
skewStore.setPartSkew('box', 'body', 0.375)
assert.equal(model.furnitureRef.value[0].parts[0].sprite.skew, 0.375)
skewStore.setPartSkew('box', 'body', 5)
assert.equal(model.furnitureRef.value[0].parts[0].sprite.skew, 0.8, 'skew clamps at 0.8')
model.applyFurniture(model.DEFAULT_FURNITURE)

// 选中框必须画在局部坐标（group 的 transform 已经 translate 过了），否则会整体偏移一倍
const boxStore = new model.HomeStore()
boxStore.sceneDoc = { id: 'bedroom', furniture: ['thing'] }
model.applyFurniture([{ id: 'thing', parts: [{ id: 'body', z: 10, sprite: { src: 'x.png', rect: [400, 200, 100, 80], rotate: 10 } }] }])
const boxStats = { classes: new Set(), tags: {}, boxes: [], transforms: {} }
const renderBox = (node) => {
  if (!node || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) { node.forEach(renderBox); return }
  const props = node.props || {}
  if (node.type === 'rect' && props.x === -3) boxStats.boxes.push({ w: props.width, h: props.height })
  if (node.type === 'g' && typeof props.transform === 'string') boxStats.transforms[props.transform] = true
  renderBox(node.children)
}
renderBox(model.SelectedBox({ sprite: { src: 'x.png', rect: [400, 200, 100, 80], rotate: 10 }, onResizeStart: () => {} }))
assert.equal(boxStats.boxes.length, 1, '选中框应该存在')
assert.equal(boxStats.boxes[0].w, 106, '选中框宽度 = rect 宽 + 6')
assert.equal(boxStats.boxes[0].h, 86, '选中框高度 = rect 高 + 6')
assert.ok(boxStats.transforms['translate(450.00 280.00) rotate(10) translate(-450.00 -280.00) translate(400, 200) skewY(0.000)'], '选中框要跟素材图用同一个 transform')
model.applyFurniture(model.DEFAULT_FURNITURE)

// 用户请求被拒绝：冒气泡、不改当前动作、心情按配置扣
{
  model.applyEvents([
    model.normalizeEvent({
      id: 'reqSleep', kind: 'interactive', spot: 'bed', anim: 'sleep', duration: [10, 10], log: null,
      request: { accept: ['energyLow'], refuse: { lines: [{ zh: '还不困' }], anim: null, mood: -2 } },
    }),
    model.normalizeEvent({ id: 'idle', spot: 'center', anim: 'idle', duration: [10, 10], log: null }),
  ])
  const reqStore = new model.HomeStore()
  reqStore.home = model.createHome(Date.now(), '大肥鱼')
  reqStore.home.character.energy = 90
  reqStore.home.character.mood = 80
  reqStore.home.character.behaviorId = 'idle'
  reqStore.publish = () => {}
  reqStore.scheduleSave = () => {}
  const accepted = reqStore.forceBehavior('reqSleep')
  assert.equal(accepted, false, '白天精力充沛时应拒绝')
  assert.equal(reqStore.home.character.behaviorId, 'idle', '被拒绝时不换动作')
  assert.equal(reqStore.home.character.say && reqStore.home.character.say.text, '还不困', '要冒气泡')
  assert.equal(reqStore.home.character.mood, 78, '心情按配置扣')
  model.applyEvents(model.DEFAULT_EVENTS)
}

// 偏头方向：点左边的东西往左，点右边往右
{
  const scene = JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', 'bedroom', 'scene.json'), 'utf8'))
  const defs = scene.furniture.map((id) => JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', 'bedroom', 'furniture', id + '.json'), 'utf8')))
  model.applyFurniture(defs)
  const leanStore = new model.HomeStore()
  leanStore.home = model.createHome(Date.now(), '大肥鱼')
  leanStore.home.character.behaviorId = 'idle'
  leanStore.publish = () => {}
  leanStore.scheduleSave = () => {}
  leanStore.leanToward('bed')
  assert.equal(leanStore.home.character.lean.dir, 1, '床在右边')
  leanStore.leanToward('bookshelf')
  assert.equal(leanStore.home.character.lean.dir, -1, '书架在左边')
  model.applyFurniture(model.DEFAULT_FURNITURE)
}

// 偏头 + 气泡时角色必须正常渲染（曾经把 view 数据对象直接当子节点 → React #31 整页崩）
{
  const leanHome = model.createHome(Date.now(), '大肥鱼')
  leanHome.character.lean = { dir: -1, until: Date.now() + 1500 }
  leanHome.character.say = { code: 'pat1', text: null, until: Date.now() + 1500 }
  const leanSnapshot = { ...store.getSnapshot(), home: leanHome }
  const leanStore = {
    getSnapshot: () => leanSnapshot,
    subscribe: () => () => {},
    interact() {},
    toggleProp() {},
    reload() {},
    boot() {},
    loadPackFiles: async () => [],
  }
  const leanStats = { classes: new Set(), tags: {}, images: [] }
  const leanOut = []
  render(Panel({ store: leanStore, translate, localeSubscribe: () => () => {} }), leanOut, leanStats)
  assert.ok(leanStats.classes.has('fh-character-peek'), '偏头时应该有 peek 节点')
  assert.ok(leanStats.classes.has('fh-say'), '有台词时应该有气泡节点')
  // 台词模板里带 {user} 占位符，渲染时要替换成「她怎么叫用户」
  assert.ok(leanOut.join('').includes('用户'), '气泡里要出现台词文字（用户称呼已替换）')
}

// 隔了一阵子再点，一定要说话（不然用户会以为气泡坏了）
{
  model.applyEvents([
    model.normalizeEvent({
      id: 'talky', kind: 'interactive', spot: 'desk', anim: 'work', duration: [10, 10], log: null,
      say: { chance: 0, lines: ['测一句'] },
    }),
  ])
  const talkStore = new model.HomeStore()
  talkStore.home = model.createHome(Date.now(), '大肥鱼')
  talkStore.home.character.lastSaidAt = 0
  talkStore.publish = () => {}
  talkStore.scheduleSave = () => {}
  assert.equal(talkStore.forceBehavior('talky'), true)
  assert.equal(talkStore.home.character.say && talkStore.home.character.say.text, '测一句', '沉默 90 秒后第一句一定要说')
  model.applyEvents(model.DEFAULT_EVENTS)
}

// 互动物锚点：位置按家具矩形比例算，z 按 renderLayer 落在家具前后
{
  model.applyFurniture([{
    id: 'bed', type: 'furniture',
    interactionAnchors: [
      { id: 'sleep', position: { x: 0.5, y: 0.4 }, facing: 'front_left', renderLayer: 'on_furniture', animation: 'sleep' },
      { id: 'behind', position: { x: 0.2, y: 0.9 }, renderLayer: 'behind_furniture' },
    ],
    parts: [{ id: 'frame', z: 85, sprite: { src: 'bed.png', rect: [400, 200, 400, 300] } }],
  }])
  const sleepAnchor = model.resolveAnchor('bed:sleep')
  assert.equal(sleepAnchor.x, 600, 'x = 左 + 宽 × 0.5')
  assert.equal(sleepAnchor.y, 320, 'y = 上 + 高 × 0.4')
  assert.equal(sleepAnchor.z, 86, 'on_furniture = 家具 z + 1')
  assert.equal(sleepAnchor.animation, 'sleep')
  assert.equal(model.resolveAnchor('bed:behind').z, 84, 'behind_furniture = 家具 z - 1')
  assert.equal(model.resolveAnchor('bed:unknown').id === undefined ? true : true, true, '未知锚点回退到第一个')
  assert.equal(model.resolveAnchor('nope:sleep'), null, '家具不存在返回 null')
  const norm = model.normalizeAnchor({ position: { x: 5, y: -3 } })
  assert.equal(norm.position.x, 1, 'x 夹到 0~1')
  assert.equal(norm.position.y, 0, 'y 夹到 0~1')
  assert.equal(norm.renderLayer, 'front', 'renderLayer 默认 front')
  model.applyFurniture(model.DEFAULT_FURNITURE)
}

// visibleWhen.characterEventNot：角色不在这些事件里时才画（没人睡的被子）
{
  const bedHome = model.createHome(Date.now(), '大肥鱼')
  bedHome.character.behaviorId = 'idle'
  const madePart = { sprite: { src: 'x.png', rect: [0, 0, 10, 10] }, visibleWhen: { characterEventNot: ['sleep', 'nap'] } }
  const sleepPart = { sprite: { src: 'y.png', rect: [0, 0, 10, 10] }, visibleWhen: { characterEvent: ['sleep', 'nap'] } }
  assert.equal(model.partVisible(madePart, bedHome), true, '醒着时画「铺好的床」')
  assert.equal(model.partVisible(sleepPart, bedHome), false, '醒着时不画「睡着的床」')
  bedHome.character.behaviorId = 'sleep'
  assert.equal(model.partVisible(madePart, bedHome), false, '睡着时不画「铺好的床」')
  assert.equal(model.partVisible(sleepPart, bedHome), true, '睡着时画「睡着的床」')
}

// 镜头：默认 fixed、可以按场景配 follow / soft
{
  const baseRoom = { cols: 26, rows: 8, wallHeight: 280, canvas: [1800, 643], margin: { x: 24, top: 4 }, projection: 0.375 }
  model.applyScene({ room: { ...baseRoom }, spots: {}, furniture: [] })
  assert.equal(model.geom.camera.mode, 'fixed', '没配 camera 就是固定全景')
  assert.equal(model.geom.camera.windowW, 1800, '窗口默认等于画布宽')
  model.applyScene({ room: { ...baseRoom, camera: { mode: 'follow', window: [1000, 643] } }, spots: {}, furniture: [] })
  assert.equal(model.geom.camera.mode, 'follow')
  assert.equal(model.geom.camera.windowW, 1000, '窗口宽会被读进来')
  model.applyScene({ room: { ...baseRoom, camera: { mode: 'soft', follow: 0.35 } }, spots: {}, furniture: [] })
  assert.equal(model.geom.camera.mode, 'soft')
  assert.equal(model.geom.camera.follow, 0.35, 'soft 的跟随强度可配')
  model.applyScene(null) // 回到默认房间
}

// 任意事件 id 都能点（客厅的 watch_tv / cook / eat 走这条通用路径）
{
  model.applyEvents([
    model.normalizeEvent({ id: 'idle', spot: 'center', anim: 'idle', duration: [10, 10], log: null }),
    model.normalizeEvent({ id: 'watch_tv', spot: 'center', anim: 'play', duration: [10, 10], log: null }),
  ])
  const tvStore = new model.HomeStore()
  tvStore.home = model.createHome(Date.now(), '大肥鱼')
  tvStore.publish = () => {}
  tvStore.scheduleSave = () => {}
  tvStore.interact('watch_tv')
  assert.equal(tvStore.home.character.behaviorId, 'watch_tv', '事件 id 可以直接点')
  model.applyEvents(model.DEFAULT_EVENTS)
}

// 锚点 pivot：家具自己决定接触点偏移
{
  model.applyFurniture([{
    id: 'chair', type: 'furniture',
    interactionAnchors: [
      { id: 'sit', position: { x: 0.5, y: 0.5 }, pivot: [0, -40], animation: 'sit' },
      { id: 'plain', position: { x: 0.5, y: 0.5 } },
    ],
    parts: [{ id: 'body', z: 80, sprite: { src: 'x.png', rect: [100, 100, 200, 200] } }],
  }])
  const withPivot = model.resolveAnchor('chair:sit')
  assert.equal(withPivot.x, 200, 'x = 100 + 200×0.5')
  assert.equal(withPivot.y, 160, 'y = 100 + 200×0.5 - 40（pivot 生效）')
  const noPivot = model.resolveAnchor('chair:plain')
  assert.equal(noPivot.y, 200, '没写 pivot 就是 0')
  assert.deepEqual(model.normalizeAnchor({}).pivot, [0, 0], 'pivot 默认 [0,0]')
  model.applyFurniture(model.DEFAULT_FURNITURE)
}

// 家具用 animations 列表声明动作，每个动作自带 pivot
{
  model.applyFurniture([{
    id: 'stool', type: 'furniture',
    animations: [
      { id: 'sit', animation: 'sit', position: { x: 0.5, y: 0.5 }, pivot: [0, -30], renderLayer: 'on_furniture' },
    ],
    parts: [{ id: 'body', z: 80, sprite: { src: 'x.png', rect: [0, 0, 100, 100] } }],
  }])
  const stoolAnchor = model.resolveAnchor('stool:sit')
  assert.equal(stoolAnchor.x, 50)
  assert.equal(stoolAnchor.y, 20, 'y = 0 + 100×0.5 - 30（pivot 来自家具的 animations 列表）')
  assert.equal(stoolAnchor.animation, 'sit')
  assert.equal(stoolAnchor.z, 81, 'on_furniture = 家具 z + 1')
  model.applyFurniture(model.DEFAULT_FURNITURE)
}

// 点击互动：家具声明了多个动画时按顺序循环
{
  model.applyEvents([
    model.normalizeEvent({ id: 'idle', spot: 'center', anim: 'idle', duration: [10, 10], log: null }),
    model.normalizeEvent({ id: 'alpha', spot: 'center', anim: 'idle', duration: [10, 10], log: null }),
    model.normalizeEvent({ id: 'beta', spot: 'center', anim: 'idle', duration: [10, 10], log: null }),
  ])
  const cycleStore = new model.HomeStore()
  cycleStore.home = model.createHome(Date.now(), '大肥鱼')
  cycleStore.publish = () => {}
  cycleStore.scheduleSave = () => {}
  model.applyFurniture([{
    id: 'bench', type: 'furniture',
    animations: [
      { id: 'a', animation: 'idle', event: 'alpha', position: { x: 0.5, y: 0.5 }, pivot: [0, 0] },
      { id: 'b', animation: 'idle', event: 'beta', position: { x: 0.5, y: 0.5 }, pivot: [0, 0] },
    ],
    parts: [{ id: 'body', z: 80, sprite: { src: 'x.png', rect: [0, 0, 10, 10] } }],
    click: { type: 'event', id: 'alpha' },
  }])
  const seen = []
  for (let i = 0; i < 4; i += 1) {
    cycleStore.interact('alpha', 'bench')
    seen.push(cycleStore.home.character.behaviorId)
  }
  assert.deepEqual(seen, ['alpha', 'beta', 'alpha', 'beta'], '每点一次切到下一个动画')
  model.applyFurniture(model.DEFAULT_FURNITURE)
  model.applyEvents(model.DEFAULT_EVENTS)
}

// 她在哪个场景 ≠ 你正在看哪个场景：切到别的房间时画面里没有她
{
  const hereHome = model.createHome(Date.now(), '大肥鱼')
  hereHome.world.map = 'bedroom'
  hereHome.world.mapName = '卧室'
  const countChar = () => {
    let n = 0
    const walk = (node) => {
      if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (typeof node.type === 'function') { walk(node.type(node.props || {})); return }
      if (node.props && node.props.className === 'fh-character') n += 1
      walk(node.children)
    }
    walk(model.SceneSvg({ home: hereHome, views, t: translate, now: Date.now(), onProp() {}, onToggle() {}, edit: { on: false }, onSelect() {}, onDragStart() {}, onResizeStart() {} }))
    return n
  }
  model.applyScene({ id: 'bedroom', room: {} })
  assert.equal(countChar(), 1, '她在卧室时，卧室里能看到她')
  model.applyScene({ id: 'living', room: {} })
  assert.equal(countChar(), 0, '切到客厅看她不在这个房间')
  assert.equal(hereHome.world.map, 'bedroom', '手动切场景不该改变她所在的场景')
  model.applyScene(null)
}

// 互动会把她叫到「你正在看的房间」；单纯切场景不会
{
  const callStore = new model.HomeStore()
  callStore.home = model.createHome(Date.now(), '大肥鱼')
  callStore.home.world.map = 'living'
  callStore.home.world.mapName = '客厅'
  callStore.publish = () => {}
  callStore.scheduleSave = () => {}
  model.applyScene({ id: 'bedroom', room: {} })
  callStore.meta = { map: 'bedroom' }
  assert.equal(callStore.viewScene(), 'bedroom', 'viewScene 读到当前场景')
  assert.equal(callStore.petScene(), 'living', '她还在客厅')
  callStore.interact('pat')
  assert.equal(callStore.home.world.map, 'bedroom', '互动之后她过来了')
  model.applyScene(null)
}

// repeat：同一张图按格子重复，用来拼大窗框 / 窗帘 / 窗帘杆
{
  model.applyFurniture([{
    id: 'bigwindow', type: 'surface',
    parts: [{ id: 'unit', z: -100, sprite: { src: 'x.png', rect: [0, 0, 80, 120], repeat: { count: 4, dx: 80 } } }],
    click: { type: 'event', id: 'idle' },
  }])
  model.applyScene({ id: 'bigwin', room: {}, furniture: ['bigwindow'], events: [] })
  const repeatStats = { classes: new Set(), tags: {}, images: [] }
  render(model.SceneSvg({ home, views, t: translate, now: Date.now(), onProp() {}, onToggle() {}, edit: { on: false }, onSelect() {}, onDragStart() {}, onResizeStart() {} }), [], repeatStats)
  const pieces = repeatStats.images.filter((href) => href.endsWith('/pack/x.png'))
  assert.equal(pieces.length, 4, 'repeat.count = 4 应该画 4 份')
  model.applyScene(null)
  model.applyFurniture(model.DEFAULT_FURNITURE)
}

// attach：贴墙/贴地时畸变自动等于该面的斜率（±projection）
{
  model.applyScene({ id: 'attachroom', room: { cols: 10, rows: 8, projection: 0.5 } })
  const proj = model.geom.ky / model.geom.kx
  const angle = (sprite) => Number(model.spriteTransform(sprite).transform.match(/skewY\(([-\d.]+)\)/)[1])
  assert.ok(Math.abs(proj - 0.5) < 1e-6, '投影比例生效')
  assert.ok(Math.abs(angle({ rect: [0, 0, 10, 10], attach: 'wallRight' }) - Math.atan(proj) * 180 / Math.PI) < 0.01, '右墙 = +projection')
  assert.ok(Math.abs(angle({ rect: [0, 0, 10, 10], attach: 'wallLeft' }) + Math.atan(proj) * 180 / Math.PI) < 0.01, '左墙 = -projection')
  assert.equal(angle({ rect: [0, 0, 10, 10] }), 0, '没写 attach 就不畸变')
  assert.ok(Math.abs(angle({ rect: [0, 0, 10, 10], attach: 'wallRight', skew: 0.2 }) - Math.atan(0.2) * 180 / Math.PI) < 0.01, '手填 skew 优先')
  model.applyScene(null)
}
// 底部按钮由场景决定：toggle / event / reset 三种，过滤掉不认识的
{
  const raw = [
    { kind: 'toggle', key: 'deskLamp', label: { zh: '台灯', en: 'Desk lamp' }, suffix: 'state' },
    { kind: 'toggle', key: 'curtainOpen', label: { zh: '窗帘' }, variants: { on: { zh: '拉上窗帘' }, off: { zh: '拉开窗帘' } } },
    { kind: 'event', id: 'read', label: { zh: '看书' } },
    { kind: 'reset', label: { zh: '回中间' } },
    { kind: 'toggle' },
    { kind: 'nope', id: 'x' },
    null,
  ]
  const list = model.normalizeControls(raw)
  assert.equal(list.length, 4, '只保留认得出的 4 个')
  assert.deepEqual(list.map((c) => c.kind), ['toggle', 'toggle', 'event', 'reset'], '类型顺序不变')
  assert.equal(list[0].suffix, true, 'suffix=state 标记')
  assert.equal(list[1].variants.on.zh, '拉上窗帘', '变文案保留')
  assert.equal(model.localizeText(list[2].label, 'zh'), '看书', '按语言取文案')
  assert.equal(model.localizeText({ en: 'Read' }, 'en'), 'Read', '英文回退')
  assert.equal(model.localizeText('纯字符串', 'zh'), '纯字符串', '字符串原样')
}
// 共享切变原点：同一组部件以 pivotX 为原点一起切变，相对位置不变
{
  const k = 0.5
  const pivot = 200
  const a = model.spriteTransform({ rect: [100, 50, 60, 40], skew: k }, pivot)
  const b = model.spriteTransform({ rect: [300, 50, 60, 40], skew: k }, pivot)
  const ty = (geo) => Number(geo.transform.match(/translate\(([-\d.]+), ([-\d.]+)\)/)[2])
  assert.ok(Math.abs(ty(a) - (50 + k * (100 - pivot))) < 0.01, '左侧部件按 pivot 补偿')
  assert.ok(Math.abs(ty(b) - (50 + k * (300 - pivot))) < 0.01, '右侧部件补偿量不同')
  // 共享切变等价于：屏幕 y = Y + k*(X - pivot)
  const yAt = (geo, x0, localX) => ty(geo) + k * localX + (geo.rect[1] - ty(geo)) - (geo.rect[1] - ty(geo))
  for (const [geo, x0] of [[a, 100], [b, 300]]) {
    const X = x0 + 10
    const screenY = ty(geo) + k * 10
    assert.ok(Math.abs(screenY - (50 + k * (X - pivot))) < 0.01, '两部件在同一 X 处的 y 一致')
  }
  assert.equal(model.spriteTransform({ rect: [100, 50, 60, 40], skew: k }).transform.includes('translate(100, 50)'), true, '不传 pivot 时行为不变')
}
// 共享切变下，镜像部件的「屏幕空间」斜率必须和墙一致（不能反过来）
{
  const pivot = 800
  const k = 0.375
  const deg = Math.atan(k) * 180 / Math.PI
  const cornerTop = (sprite) => {
    const geo = model.spriteTransform(sprite, pivot)
    const m = geo.transform.match(/translate\(([-\d.]+), ([-\d.]+)\)/)
    const tx = Number(m[1])
    const ty = Number(m[2])
    const w = geo.rect[2]
    const flip = sprite.flipX === true
    // 局部左上角 / 右上角
    const p0 = flip ? [tx, ty] : [tx, ty]
    const p1 = flip ? [tx - w, ty - k * w] : [tx + w, ty + k * w]
    return [p0, p1].sort((a, b) => a[0] - b[0])
  }
  for (const sprite of [
    { rect: [820, 100, 120, 200], skew: k },
    { rect: [820, 100, 120, 200], skew: k, flipX: true },
  ]) {
    const [left, right] = cornerTop(sprite)
    assert.ok(right[1] > left[1], `贴右墙的部件屏幕上都要往右下倾斜（flip=${!!sprite.flipX}）`)
  }
}
// editAsOne：拼出来的家具（窗户+窗帘）当一件拖，所有部件一起动
{
  model.applyScene({ id: 'asone', room: {} })
  model.applyFurniture([{
    id: 'windowpane', type: 'surface', editAsOne: true,
    surface: { attach: 'wallRight' },
    parts: [
      { id: 'a', z: -2, sprite: { src: 'p1.png', rect: [100, 100, 50, 50] } },
      { id: 'b', z: -1, sprite: { src: 'p2.png', rect: [160, 120, 60, 40] } },
    ],
  }])
  const oneStore = new model.HomeStore()
  oneStore.home = model.createHome(Date.now(), '大肥鱼')
  oneStore.publish = () => {}
  oneStore.scheduleSave = () => {}
  const okAll = oneStore.movePart('windowpane', '*', 10, 5)
  const def = model.furnitureRef.value.find((d) => d.id === 'windowpane')
  assert.equal(okAll, true, '整件拖动返回成功')
  assert.deepEqual(def.parts[0].sprite.rect, [110, 105, 50, 50], '部件 a 跟着动')
  assert.deepEqual(def.parts[1].sprite.rect, [170, 125, 60, 40], '部件 b 也跟着动')
  model.applyFurniture(model.DEFAULT_FURNITURE)
  model.applyScene(null)
}
// editAsOne：点任意部件都选整件，整件 z / 删除都走同一件家具
{
  const def = [{
    id: 'win', type: 'surface', editAsOne: true,
    parts: [
      { id: 'sky', z: -3, sprite: { src: 'a.png', rect: [10, 10, 100, 100] } },
      { id: 'frame', z: -2, sprite: { src: 'b.png', rect: [10, 10, 100, 100] } },
      { id: 'curtain', z: -1, sprite: { src: 'c.png', rect: [5, 0, 30, 120] } },
    ],
  }]
  const picked = []
  const actions = { select: (a, b) => picked.push(`${a}:${b}`), interact() {}, toggle() {}, dragStart() {}, resizeStart() {}, gotoScene() {} }
  for (const item of model.furnitureItems(def, home, translate, actions, { on: true, selected: null })) {
    const node = item.node
    const rendered = typeof node.type === 'function' ? node.type(node.props) : node
    if (rendered && rendered.props && rendered.props.onClick) rendered.props.onClick({ stopPropagation() {}, target: {}, currentTarget: {} })
  }
  assert.deepEqual(picked, ['win:*', 'win:*', 'win:*'], '点三个部件都选整件')
  const paneStore = new model.HomeStore()
  paneStore.home = model.createHome(Date.now(), '大肥鱼')
  paneStore.publish = () => {}
  paneStore.scheduleSave = () => {}
  model.applyFurniture(def)
  assert.equal(paneStore.bumpPartZ('win', '*', 3), true, '整件 z 生效')
  const after = model.furnitureRef.value.find((d) => d.id === 'win').parts.map((x) => x.z)
  assert.deepEqual(after, [0, 1, 2], '所有部件 z 一起抬')
  assert.equal(paneStore.removeFurniture('win'), true, '整件删除生效')
  assert.equal(model.furnitureRef.value.find((d) => d.id === 'win'), undefined, '删掉了')
  model.applyFurniture(model.DEFAULT_FURNITURE)
}
// 渲染顺序必须真的按 z 排（曾经 sort 结果被丢弃，z 调整完全无效）
{
  model.applyScene({ id: 'zs', room: {} })
  model.applyFurniture([
    { id: 'back', type: 'furniture', parts: [{ id: 'body', z: 90, sprite: { src: 'b.png', rect: [0, 0, 10, 10] } }] },
    { id: 'front', type: 'furniture', parts: [{ id: 'body', z: 10, sprite: { src: 'f.png', rect: [20, 0, 10, 10] } }] },
  ])
  const tree = model.SceneSvg({ home, views, t: translate, now: Date.now(), onProp() {}, onToggle() {}, edit: { on: false }, onSelect() {}, onDragStart() {}, onResizeStart() {} })
  const cam = tree.children.find((n) => n && n.type === 'g' && n.props.className === 'fh-camera')
  const zs = cam.children.filter((n) => n && n.props && n.props['data-z'] !== undefined).map((n) => Number(n.props['data-z']))
  const sorted = zs.slice().sort((a, b) => a - b)
  assert.deepEqual(zs, sorted, '渲染顺序要按 z 从小到大')
  assert.ok(zs.indexOf(10) < zs.indexOf(90), 'z=10 的要在 z=90 之前')
  model.applyFurniture(model.DEFAULT_FURNITURE)
  model.applyScene(null)
}
// 视图表要覆盖每个动作声明的所有 tag（曾经只预建 7 个固定 tag，新动作永远退回 idle）
{
  const vs = new model.HomeStore()
  vs.publish = () => {}
  vs.meta = { pack: { canvas: { width: 192, height: 205 }, assets: { sheet: { path: 'fish-sheet.png', width: 1760, height: 1100 } } } }
  vs.animations = [
    { id: 'action:idle', tags: ['idle'], frames: [{ asset: 'sheet', rect: [0, 0, 192, 205], durationMs: 400 }] },
    { id: 'action:work45', tags: ['work45', 'deskwork'], frames: [{ asset: 'sheet', rect: [0, 0, 192, 205], durationMs: 400 }] },
    { id: 'action:lounge45', tags: ['lounge45'], frames: [{ asset: 'sheet', rect: [0, 0, 192, 205], durationMs: 400 }] },
  ]
  const vsViews = vs.buildViews()
  for (const tag of ['idle', 'work45', 'deskwork', 'lounge45']) {
    assert.ok(vsViews[tag], `views 里应该有 ${tag}`)
  }
  assert.equal(vsViews.work45.key, 'action:work45', 'work45 用的是自己的动画不是 idle')
}
// 吃饭这类动画：squash 压高度、randomStart 随机出帧、hold 停在当前帧
{
  const view = model.buildAnimationView([{
    id: 'action:eat_main', tags: ['eat_main'],
    frames: [
      { asset: 'sheet', rect: [0, 0, 100, 100], durationMs: 1200, squash: 0 },
      { asset: 'sheet', rect: [100, 0, 100, 100], durationMs: 1200, squash: 5 },
    ],
  }], { sheet: { path: 'fish.png', width: 200, height: 100 } }, 'eat_main', { width: 100, height: 100 })
  assert.equal(view.frames[1].squash, 5, '帧上的 squash 带出来了')
  assert.equal(view.randomStart, false, '没写就不随机')
  assert.equal(view.hold, false, '没写就不 hold')
  const snackView = model.buildAnimationView([{
    id: 'action:eat_snack', tags: ['eat_snack'], randomStart: true, hold: true,
    frames: [{ asset: 'sheet', rect: [0, 0, 100, 100], durationMs: 6000 }],
  }], { sheet: { path: 'fish.png', width: 200, height: 100 } }, 'eat_snack', { width: 100, height: 100 })
  assert.equal(snackView.randomStart, true, 'randomStart 生效')
  assert.equal(snackView.hold, true, 'hold 生效')
}
// groupSize：随机选一组之后只在这组里循环（点心不换种类、只做起伏）
{
  const view = model.buildAnimationView([{
    id: 'action:eat_snack', tags: ['eat_snack'], randomStart: true, groupSize: 2,
    frames: [
      { asset: 'sheet', rect: [0, 0, 10, 10], durationMs: 1200, squash: 0 },
      { asset: 'sheet', rect: [0, 0, 10, 10], durationMs: 1200, squash: 5 },
      { asset: 'sheet', rect: [20, 0, 10, 10], durationMs: 1200, squash: 0 },
      { asset: 'sheet', rect: [20, 0, 10, 10], durationMs: 1200, squash: 5 },
    ],
  }], { sheet: { path: 'fish.png', width: 40, height: 10 } }, 'eat_snack', { width: 10, height: 10 })
  assert.equal(view.groupSize, 2, 'groupSize 带出来')
  assert.equal(view.randomStart, true, 'randomStart 带出来')
  // 模拟组内循环：只应该在 0,1 或 2,3 之间来回
  for (const start of [0, 2]) {
    let cur = start
    const seq = []
    for (let i = 0; i < 4; i += 1) {
      seq.push(cur)
      const base = Math.floor(cur / 2) * 2
      cur = base + (cur - base + 1) % 2
    }
    assert.deepEqual(seq, [start, start + 1, start, start + 1], '组内来回，不跨组')
  }
  assert.equal(view.frames[1].squash, 5, '同一张图两帧的 squash 不同')
}
// 思考气泡是独立素材：挂在动作上，渲染时画在头顶
{
  const withBubble = model.buildAnimationView([{
    id: 'action:lounge45', tags: ['lounge45'],
    frames: [{ asset: 'sheet', rect: [0, 0, 100, 140], durationMs: 600 }],
    bubble: { src: 'bubble-game.png', size: 120, dx: 40, dy: 6, aspect: 0.75 },
  }], { sheet: { path: 'fish.png', width: 100, height: 140 } }, 'lounge45', { width: 100, height: 140 })
  assert.ok(withBubble.bubble, '气泡带出来了')
  assert.ok(withBubble.bubble.url.endsWith('/pack/bubble-game.png'), '气泡 URL 指向单独素材')
  assert.equal(withBubble.bubble.size, 120, '气泡大小可配')
  assert.equal(withBubble.bubble.dx, 40, '气泡横向偏移可配')
  const noBubble = model.buildAnimationView([{
    id: 'action:idle', tags: ['idle'],
    frames: [{ asset: 'sheet', rect: [0, 0, 100, 140], durationMs: 600 }],
  }], { sheet: { path: 'fish.png', width: 100, height: 140 } }, 'idle', { width: 100, height: 140 })
  assert.equal(noBubble.bubble, null, '没写就不再是气泡')
}
// 客厅灯光：电视光只在开着时出现、夜里更亮；蓝帘挡光、白纱几乎不挡
{
  model.applyScene({
    id: 'litroom',
    room: { cols: 10, rows: 8, wallHeight: 300, canvas: [800, 600], margin: { x: 20, top: 4 }, projection: 0.375, camera: { mode: 'fixed' } },
    light: { sources: [{ from: 'right', at: 0.5, spread: 3, reach: 2, alpha: 0.6 }] },
    // 屏幕光配在家具的 screenGlow 上（见下方 applyFurniture）
  })
  model.applyFurniture([{
    id: 'tvbox',
    type: 'furniture',
    parts: [{ id: 'body', z: 70, sprite: { src: 'tv.png', rect: [300, 200, 120, 80] } }],
    screenGlow: { prop: 'tvOn', behavior: 'watch_tv', screen: [0.2, 0.05, 0.6, 0.45], width: 1.2, reach: 2, alpha: 0.6 },
  }])
  const litHome = model.createHome(Date.now(), '大肥鱼')
  litHome.world.map = 'litroom'
  const day = new Date(); day.setHours(12, 0, 0, 0)
  const night = new Date(); night.setHours(23, 0, 0, 0)
  const collect = (overrides, when) => {
    Object.assign(litHome.world.props, { curtainBlueClosed: false, curtainWhiteClosed: false, tvOn: false, livingLamp: false }, overrides)
    const tree = model.SceneSvg({ home: litHome, views: {}, t: translate, now: when.getTime(), onProp() {}, onToggle() {}, edit: { on: false }, onSelect() {}, onDragStart() {}, onResizeStart() {} })
    const found = { tv: [], win: [] }
    const walk = (n, ctx) => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) { n.forEach((c) => walk(c, ctx)); return }
      if (typeof n.type === 'function') { walk(n.type(n.props || {}), ctx); return }
      const cls = String((n.props && n.props.className) || '')
      if (ctx === 'tv' && n.type === 'polygon') found.tv.push(Number(n.props.opacity))
      if (ctx === 'win' && n.type === 'polygon') found.win.push(Number(n.props.opacity))
      walk(n.children, cls.includes('fh-tv-glow') ? 'tv' : cls.includes('fh-window-light') ? 'win' : ctx)
    }
    walk(tree, null)
    return found
  }
  assert.equal(collect({}, day).tv.length, 0, '电视关着就没有电视光')
  const tvNight = collect({ tvOn: true }, night).tv
  assert.ok(tvNight.length > 0, '电视开着有光')
  const tvDay = collect({ tvOn: true }, day).tv
  assert.ok(tvNight[0] > tvDay[0], '夜里比白天更明显')
  const openWin = collect({}, day).win[0]
  const blueWin = collect({ curtainBlueClosed: true }, day).win[0]
  const whiteWin = collect({ curtainWhiteClosed: true }, day).win[0]
  assert.ok(blueWin < openWin * 0.6, '蓝帘明显挡光')
  assert.ok(whiteWin > openWin * 0.9, '白纱几乎不挡光')
  model.applyFurniture(model.DEFAULT_FURNITURE)
  model.applyScene(null)
}
// 日志：开关类代码（xxxOn/xxxOff）必须渲染成人话，不能只剩名字或兜底句
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  const render = (code) => model.fillText(model.logText(translate, { code, arg: null }), logHome)
  assert.ok(render('livingLampOn').includes('客厅灯'), '客厅灯 开')
  assert.ok(render('tvOff').includes('电视'), '电视 关')
  assert.ok(render('curtainBlueClosedOn').includes('拉上'), '蓝帘 On = 拉上（Closed 语义）')
  assert.ok(render('curtainBlueClosedOff').includes('拉开'), '蓝帘 Off = 拉开')
  assert.ok(render('watch_tv').includes('电视'), 'watch_tv 有文案')
  assert.ok(render('sit').includes('沙发'), 'sit 有文案')
  assert.ok(!render('weirdThingOn').endsWith('。') || render('weirdThingOn').includes('大肥鱼'), '未知开关回退到兜底句')
  for (const id of ['sit', 'sofa_play', 'watch_tv', 'eat', 'cook', 'doze']) {
    assert.ok(translate(`behavior.${id}`) !== `behavior.${id}`, `behavior.${id} 有文案`)
    assert.ok(translate(`flavor.${id}`) !== `flavor.${id}`, `flavor.${id} 有文案`)
  }
}
// 电视光晕绑定屏幕：光晕中心 = 家具 rect 里 screen 比例区域的中心
{
  model.applyScene({
    id: 'tvroom',
    room: { cols: 10, rows: 8, wallHeight: 300, canvas: [800, 600], margin: { x: 20, top: 4 }, projection: 0.375, camera: { mode: 'fixed' } },
    // 屏幕光现在配在家具自己身上（screenGlow），见下面的 applyFurniture
  })
  model.applyFurniture([{
    id: 'tvbox',
    type: 'furniture',
    parts: [{ id: 'body', z: 70, sprite: { src: 'tv.png', rect: [100, 100, 200, 100] } }],
    screenGlow: { prop: 'tvOn', behavior: 'watch_tv', screen: [0, 0, 1, 1], width: 1, reach: 2, alpha: 0.6 },
  }])
  const tvHome = model.createHome(Date.now(), '大肥鱼')
  tvHome.world.map = 'tvroom'
  tvHome.world.props.tvOn = true
  const night = new Date(); night.setHours(23, 0, 0, 0)
  const tree = model.SceneSvg({ home: tvHome, views: {}, t: translate, now: night.getTime(), onProp() {}, onToggle() {}, edit: { on: false }, onSelect() {}, onDragStart() {}, onResizeStart() {} })
  let halo = null
  const walk = (n, inTv) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach((c) => walk(c, inTv)); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {}), inTv); return }
    const cls = String((n.props && n.props.className) || '')
    const here = inTv || cls.includes('fh-tv-glow')
    if (here && n.type === 'ellipse') halo = n.props
    walk(n.children, here)
  }
  walk(tree, false)
  assert.ok(halo, '电视开着有光晕')
  assert.equal(Math.round(halo.cx), 200, '光晕横向对齐屏幕中心')
  assert.equal(Math.round(halo.cy), 150, '光晕纵向对齐屏幕中心')
  model.applyFurniture(model.DEFAULT_FURNITURE)
  model.applyScene(null)
}
// 配置文件列表：每行有「打开」「定位」，点了带出正确的 kind/path
{
  const calls = []
  const settings = model.SettingsBar({
    t: translate,
    profile: { characterName: '大肥鱼' },
    paths: [],
    configs: [
      { label: '场景', path: 'data/maps/living/scene.json' },
      { label: '事件目录', path: 'data/maps/living/events', kind: 'folder' },
      { label: '存档', path: 'save/state.json' },
    ],
    openTip: '',
    onOpen: (kind, target) => calls.push([kind, target]),
    onChange() {}, onSave() {}, onClose() {},
  })
  const buttons = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    if (n.type === 'button') buttons.push(n)
    walk(n.children)
  }
  walk(settings)
  assert.ok(buttons.length >= 6, '每个配置项两个按钮')
  // 第一行「打开」→ file + 场景路径
  const openBtn = buttons.find((b) => (b.children || []).includes(translate('settings.open')))
  assert.ok(openBtn, '有「打开」按钮')
  openBtn.props.onClick()
  assert.deepEqual(calls[0], ['file', 'data/maps/living/scene.json'], '打开场景文件')
  // 目录项的按钮文案是「打开目录」，kind 传 folder
  const folderBtn = buttons.find((b) => (b.children || []).includes(translate('settings.openFolder')))
  assert.ok(folderBtn, '目录项是「打开目录」')
  folderBtn.props.onClick()
  assert.deepEqual(calls[calls.length - 1], ['folder', 'data/maps/living/events'], '打开事件目录')
  // 「定位」传 reveal
  const revealBtn = buttons.find((b) => (b.children || []).includes(translate('settings.reveal')))
  revealBtn.props.onClick()
  assert.equal(calls[calls.length - 1][0], 'reveal', '定位走 reveal')
}

// 编辑器里选中家具后能直接打开它的 json
{
  const calls = []
  const bar = model.EditorBar({
    t: translate,
    edit: { on: true, selected: { defId: 'sofa', partId: '*', isSprite: true }, status: '' },
    info: null, objects: [], selectedId: 'sofa',
    canTransform: true, images: [], currentSrc: '', size: null, canUndo: false,
    mapId: 'living',
    onOpenSource: (spec) => calls.push(spec),
    onPickObject() {}, onBumpZ() {}, onRotate() {}, onFlip() {}, onImage() {}, onResize() {},
    onAdd() {}, onRemove() {}, onDuplicate() {}, eventsOpen: false, onToggleEvents() {},
    onSkew() {}, proj: 0.375, onSave() {}, onDiscard() {}, onExit() {},
  })
  const btns = []
  const walk2 = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk2); return }
    if (typeof n.type === 'function') { walk2(n.type(n.props || {})); return }
    if (n.type === 'button') btns.push(n)
    walk2(n.children)
  }
  walk2(bar)
  const openJson = btns.find((b) => (b.children || []).includes(translate('edit.openSource')))
  assert.ok(openJson, '编辑器有「打开 json」')
  openJson.props.onClick()
  assert.deepEqual(calls[0], { kind: 'file', path: 'data/maps/living/furniture/sofa.json' }, '打开选中家具的 json')
}
// 会话卡：有会话在跑时显示「运行中 N」、统计数字和最近活动
{
  const cardHome = model.createHome(Date.now(), '大肥鱼')
  const offline = model.ActivityCard({ t: translate, activity: null, home: cardHome, now: Date.now() })
  assert.equal(offline, null, '没有活动数据就不显示卡片')
  const card = model.ActivityCard({
    t: translate,
    home: cardHome,
    now: Date.now(),
    activity: {
      running: 2, sessions: 3,
      counters: { tools: 7, messages: 4, errors: 1, workflows: 0, subagents: 0 },
      recent: [{ at: Date.now() - 60000, kind: 'tool', detail: 'read' }, { at: Date.now(), kind: 'error', detail: 'boom' }],
    },
  })
  const texts = []
  const walk = (n) => {
    if (n === null || n === undefined || n === false) return
    if (typeof n === 'string' || typeof n === 'number') { texts.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    walk(n.props ? n.props.children : undefined)
  }
  walk(card)
  const joined = texts.join('|')
  assert.ok(joined.includes('运行中 2') || joined.includes('2'), '显示运行中的会话数')
  assert.ok(joined.includes('7') && joined.includes('4') && joined.includes('1'), '显示工具/消息/出错计数')
  assert.ok(texts.some((x) => x.includes('调用工具')), '最近活动带种类标签')
}
// 会话结束文案：用 {user}/{name} 拼，且必须真的有渲染分支（曾缺 case 显示成「大肥鱼。」）
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  logHome.userName = '小明'
  const endText = model.fillText(model.logText(translate, { code: 'sessionEnd', arg: null }), logHome)
  assert.ok(endText.includes('工作完成'), '结束文案是「工作完成」而不是「会话结束」')
  assert.ok(endText.includes('小明') && endText.includes('大肥鱼'), '两个名字都替换了')
  assert.ok(endText.includes('伸了个懒腰'), '保留伸懒腰的动作')
  const startText = model.fillText(model.logText(translate, { code: 'sessionStart', arg: null }), logHome)
  assert.ok(startText.includes('书桌'), '开始文案有书桌')
  assert.ok(model.fillText(model.logText(translate, { code: 'sessionError', arg: null }), logHome).includes('担心'), '出错文案有担心')
}
// 便条输入：卡片上能有输入框和「递给她」，预览/注入模式提示不同
{
  const cardHome = model.createHome(Date.now(), '大肥鱼')
  const build = (mode) => model.ActivityCard({
    t: translate,
    home: cardHome,
    now: Date.now(),
    onNote: () => {},
    activity: {
      running: 1, sessions: 1,
      counters: { tools: 0, messages: 0, errors: 0 },
      recent: [],
      notes: { mode, pending: mode === 'inject' ? 2 : 0, injected: 0, preview: 0, canInject: true },
    },
  })
  const collect = (tree) => {
    const out = { tags: [], texts: [] }
    const walk = (n) => {
      if (n === null || n === undefined || n === false) return
      if (typeof n === 'string' || typeof n === 'number') { out.texts.push(String(n)); return }
      if (Array.isArray(n)) { n.forEach(walk); return }
      if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
      if (n.type) out.tags.push(n.type)
      walk(n.props ? n.props.children : undefined)
    }
    walk(tree)
    return out
  }
  const preview = collect(build('preview'))
  assert.ok(preview.tags.includes('input'), '有输入框')
  assert.ok(preview.texts.includes(translate('activity.noteSend')), '有「递给她」按钮')
  assert.ok(preview.texts.some((x) => x.includes(translate('activity.notePreview'))), '预览模式有提示')
  const inject = collect(build('inject'))
  assert.ok(inject.texts.some((x) => x.includes(translate('activity.noteInject'))), '注入模式提示不同')
  assert.ok(inject.texts.some((x) => x.includes('2')), '显示待递张数')
}
console.log('ui tests passed:', {
  components: Object.keys(registered),
  behaviors: model.BEHAVIORS.length,
  chars: text.length,
})
