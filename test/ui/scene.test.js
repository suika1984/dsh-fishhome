/**
 * 场景合成：repeat 拼接、attach 斜率、底部按钮、共享切变、editAsOne、z 排序、动画视图/帧参数
 * 拆分自 test/ui.test.js，顺序与原文件一致（由 test/ui.test.js 依次 import）。
 */
import path from 'node:path'
import { assert, model, home, views, render, translate, here } from '../ui-harness.js'

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
