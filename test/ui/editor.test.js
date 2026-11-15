/**
 * 编辑器：事件表单、改尺寸/换图/移动、增删家具、复制、撤销、畸变、选中框
 * 拆分自 test/ui.test.js，顺序与原文件一致（由 test/ui.test.js 依次 import）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assert, model, home, store, render, translate, Panel, here } from '../ui-harness.js'

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

