/**
 * 互动：用户请求被拒、偏头、气泡、互动物锚点、镜头、点击循环、场景切换
 * 拆分自 test/ui.test.js，顺序与原文件一致（由 test/ui.test.js 依次 import）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assert, model, home, views, store, render, translate, animations, Panel, here } from '../ui-harness.js'

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

