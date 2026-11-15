/**
 * 面板渲染：标题、房间名、家具是否真的画出来、缺图/未知 preset 占位、错误态与加载态、卸载清理
 * 拆分自 test/ui.test.js，顺序与原文件一致（由 test/ui.test.js 依次 import）。
 */
import { assert, model, home, views, store, render, translate, pet, Panel, registered, components, disposers, fakeCtx, slotsStub } from '../ui-harness.js'

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

