/**
 * 代理渲染（布局级）：不开面板、不用浏览器，直接按数据把房间算成一张「绘制清单」。
 *
 *   node tools/preview.mjs                 # 全部房间，出报告 + 绘制清单
 *   node tools/preview.mjs bedroom         # 只算一个房间
 *   node tools/preview.mjs --check         # CI 模式：有硬错误就退出码 1
 *   node tools/preview.mjs --data <dir>    # 指定数据目录（默认仓库 data/）
 *
 * 输出：
 *   test/shots/render-<map>.json   绘制清单（坐标全部来自客户端真实几何代码）
 *   stdout                         体检报告：缺图 / 越界 / 遮挡 / 同层重叠
 *
 * 画成 PNG 由 tools/preview.py 负责（它只消费这份清单，所以不会出现两套几何）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2)
const checkMode = argv.includes('--check')
const dataFlag = argv.indexOf('--data')
const dataArg = dataFlag >= 0 ? argv[dataFlag + 1] : ''
const behaviorFlag = argv.indexOf('--behavior')
const behaviorArg = behaviorFlag >= 0 ? argv[behaviorFlag + 1] : ''
const args = argv.filter((item, index) => !item.startsWith('--') && !(dataFlag >= 0 && index === dataFlag + 1) && !(behaviorFlag >= 0 && index === behaviorFlag + 1))
const dataDir = dataArg ? path.resolve(dataArg) : path.join(root, 'data')
const packDir = path.join(root, 'packs', 'bigfish-adult')
const outDir = path.join(root, 'test', 'shots')

/** 遮挡告警阈值：被上层盖住的面积占比 */
const COVER_WARN = 0.6
/** 硬错误阈值：超过这个就算「看不见了」，CI 直接失败 */
const COVER_FAIL = 0.85
/** 允许超出画布多少像素（避免半像素误差） */
const BOUNDS_SLACK = 2

/* ---------------- 载入客户端几何代码 ---------------- */
const source = readFileSync(path.join(root, 'client.js'), 'utf8')
let captured = null
new Function('window', source)({
  __ModuleLoader__: {
    load(entry) {
      captured = entry
    },
  },
})
if (!captured) throw new Error('client.js 没有注册模块')
const model = captured.factory(() => ({
  createElement() {},
  useState() {},
  useEffect() {},
  useRef() {},
  useMemo() {},
})).__internals

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const readIfExists = (file) => (existsSync(file) ? readJson(file) : null)

const mapsIndex = readIfExists(path.join(dataDir, 'maps', 'index.json'))
const mapList = mapsIndex && Array.isArray(mapsIndex.maps) ? mapsIndex.maps : mapsIndex && Array.isArray(mapsIndex) ? mapsIndex : ['bedroom']
let targets = args.filter((item) => !item.startsWith('--'))
if (targets.length === 0) targets = mapList

/* ---------------- 固定状态（保证可对比） ---------------- */
const FIXED_NOW = new Date(2026, 10, 19, 14, 0, 0).getTime()

function makeHome() {
  const home = model.createHome(FIXED_NOW, '大肥鱼')
  home.character.behaviorId = behaviorArg || 'idle'
  home.character.energy = 80
  home.character.satiety = 70
  home.character.mood = 70
  home.character.say = null
  home.character.emote = null
  home.character.lean = null
  home.world.map = 'bedroom'
  return home
}

/** 背景：用等距几何算地板/两墙的多边形 + 近似底色 */
function backgroundShapes(scene, geom, background) {
  const { cols, rows, wall } = geom
  const project = model.project
  const shapes = []
  const floorLayer = (background?.layers || []).find((layer) => layer && layer.kind === 'floor')
  const wallLayers = (background?.layers || []).filter((layer) => layer && layer.kind === 'wall')
  const colorOf = (layer, fallback) => {
    const stops = layer && layer.fill && Array.isArray(layer.fill.stops) ? layer.fill.stops : []
    if (stops.length === 0) return fallback
    return stops[Math.floor(stops.length / 2)].color || fallback
  }
  const [a, b, c, d] = [
    project(0, 0),
    project(cols, 0),
    project(cols, rows),
    project(0, rows),
  ]
  shapes.push({ kind: 'floor', points: [a, b, c, d], color: colorOf(floorLayer, '#e8dcc8') })
  // 左墙：fy=0 那一面（x 从 0..cols），向上抬 wall
  const wallFx0 = wallLayers.find((layer) => layer.side === 'fx0')
  shapes.push({
    kind: 'wall',
    points: [a, b, [b[0], b[1] - wall], [a[0], a[1] - wall]],
    color: colorOf(wallFx0, '#f3ece0'),
  })
  // 右墙：fx=0 那一面（y 从 0..rows）
  const wallFy0 = wallLayers.find((layer) => layer.side === 'fy0')
  shapes.push({
    kind: 'wall',
    points: [a, d, [d[0], d[1] - wall], [a[0], a[1] - wall]],
    color: colorOf(wallFy0, '#eee5d6'),
  })
  return shapes
}

/** 角色：用 idle 动作的格子比例算屏幕框，落点取行为的 spot */
function characterShape(scene, geom, home, pet, actions) {
  const behavior = model.BEHAVIOR_BY_ID[home.character.behaviorId] || model.BEHAVIOR_BY_ID.idle
  let x
  let y
  let z = 100
  let anchorInfo = null
  // 事件带锚点（坐床头、趴桌、躺床…）时按家具锚点落位，和页面里看到的一致
  const anchor = behavior.anchor ? model.resolveAnchor(behavior.anchor) : null
  if (anchor) {
    x = anchor.x
    y = anchor.y
    z = anchor.z
    anchorInfo = behavior.anchor
  } else {
    const spot = (scene.spots && scene.spots[behavior.spot]) || (scene.spots && scene.spots.center) || { fx: 5, fy: 7 }
    ;[x, y] = model.project(Number(spot.fx) || 0, Number(spot.fy) || 0)
  }
  const idle = actions.find((action) => action.id === 'idle') || actions[0]
  const cell = idle && Array.isArray(idle.cell) ? idle.cell : [pet?.canvas?.[0] || 293, pet?.canvas?.[1] || 225]
  const height = (geom.wall || 280) * 0.62
  const width = height * (cell[0] / cell[1])
  return {
    kind: 'character',
    behavior: home.character.behaviorId,
    z,
    anchor: anchorInfo,
    anchorPoint: [Math.round(x), Math.round(y)],
    rect: [Math.round(x - width / 2), Math.round(y - height), Math.round(width), Math.round(height)],
    cell,
  }
}

function partRect(part, geom, pivotX) {
  const sprite = part && part.sprite ? part.sprite : {}
  const rect = Array.isArray(sprite.rect) ? sprite.rect.map(Number) : [0, 0, 100, 100]
  // 地板偏移 → 屏幕位移（和客户端 partOffsetTransform 同一个公式）
  const offset = part && part.offset && typeof part.offset === 'object' ? part.offset : null
  const fx = offset ? Number(offset.fx) || 0 : 0
  const fy = offset ? Number(offset.fy) || 0 : 0
  const dx = (fx - fy) * geom.kx
  const dy = (fx + fy) * geom.ky
  const x = rect[0] + dx
  const y = rect[1] + dy
  // 直接用客户端的 spriteTransform：镜像 / 切变（attach 面）/ 旋转 都在里面算好
  let transform = ''
  try {
    const geo = model.spriteTransform({ ...sprite, rect: [x, y, rect[2], rect[3]] }, pivotX)
    transform = geo && typeof geo.transform === 'string' ? geo.transform : ''
  } catch {
    transform = ''
  }
  return {
    x,
    y,
    w: rect[2],
    h: rect[3],
    flipX: sprite.flipX === true,
    rotate: Number(sprite.rotate) || 0,
    skew: Number(sprite.skew) || 0,
    transform,
    src: typeof sprite.src === 'string' ? sprite.src : '',
  }
}

const intersectArea = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return x * y
}

const report = []

for (const map of targets) {
  const scene = readIfExists(path.join(dataDir, 'maps', map, 'scene.json'))
  if (!scene) {
    console.log(`\n[${map}] 跳过：没有 scene.json`)
    continue
  }
  const background = readIfExists(path.join(dataDir, 'maps', map, 'background.json'))
  const defs = []
  for (const id of scene.furniture || []) {
    const def = readIfExists(path.join(dataDir, 'maps', map, 'furniture', `${id}.json`))
    if (!def) {
      report.push({ map, level: 'error', code: 'missing-def', text: `家具定义缺失：${id}.json` })
      continue
    }
    defs.push(def)
  }
  // 事件也要加载：行为的锚点（bed:read 之类）写在事件里
  const eventDefs = []
  for (const id of scene.events || []) {
    const def = readIfExists(path.join(dataDir, 'maps', map, 'events', `${id}.json`))
    if (def) eventDefs.push(def)
    else report.push({ map, level: 'error', code: 'missing-event', text: `事件定义缺失：${id}.json` })
  }
  const home = makeHome()
  model.applyScene(scene)
  model.applyEvents(eventDefs)
  if (background) model.applyBackground(background)
  model.applyFurniture(defs)
  const geom = model.geom

  const pet = readIfExists(path.join(packDir, 'pet.json'))
  const actionsDir = path.join(packDir, 'actions')
  const actions = existsSync(actionsDir)
    ? readdirSync(actionsDir)
      .filter((file) => file.endsWith('.json') && file !== 'index.json')
      .map((file) => {
        try {
          const action = readJson(path.join(actionsDir, file))
          return action && Array.isArray(action.frames) ? action : null
        } catch {
          return null
        }
      })
      .filter(Boolean)
    : []

  const parts = []
  const presets = []
  for (const def of defs) {
    // surface：整件家具贴一个面，所有部件共用同一个切变原点
    const surf = def.surface && typeof def.surface === 'object' ? def.surface : null
    let surfacePivot
    if (surf) {
      const xs = (def.parts || [])
        .map((item) => (item && item.sprite && Array.isArray(item.sprite.rect) ? Number(item.sprite.rect[0]) : NaN))
        .filter((value) => Number.isFinite(value))
      if (xs.length > 0) surfacePivot = Math.min(...xs)
    }
    for (const part of def.parts || []) {
      if (!part || !model.partVisible(part, home)) continue
      const label = `${def.id}:${part.id || 'part'}`
      // preset 件由代码画（台灯、书架、地毯…），没有 rect，跳过几何检查
      if (part.preset) {
        presets.push(label)
        continue
      }
      const spriteForRender = surf && part.sprite && !part.sprite.attach && typeof surf.attach === 'string'
        ? { ...part.sprite, attach: surf.attach }
        : part.sprite
      const geomRect = partRect({ ...part, sprite: spriteForRender }, geom, surfacePivot)
      const skewSlack = Math.abs(Math.tan((Number(spriteForRender && spriteForRender.skew) || 0) * Math.PI / 180)) * geomRect.w
      if (skewSlack > 0) {
        geomRect.y -= Math.abs(skewSlack) * 0.5
        geomRect.h += Math.abs(skewSlack) * 0.5
      }
      const isLight = part.layer === 'light'
      // 没写 src = 还没做素材的占位件（花园里那些），不算错
      const missing = geomRect.src !== '' && !existsSync(path.join(packDir, geomRect.src))
      parts.push({ ...geomRect, z: Number(part.z) || 0, label, defId: def.id, missing, isLight })
    }
  }
  parts.sort((a, b) => (a.z === b.z ? 0 : a.z - b.z))

  const canvas = [geom.canvasW, geom.canvasH]

  // 缺图
  for (const part of parts) {
    if (part.missing) {
      report.push({ map, level: 'error', code: 'missing-asset', text: `缺图：${part.label} → ${part.src || '（没写 src）'}` })
    }
  }
  // 越界
  for (const part of parts) {
    const out = []
    if (part.x < -BOUNDS_SLACK) out.push(`左 ${Math.round(-part.x)}px`)
    if (part.y < -BOUNDS_SLACK) out.push(`上 ${Math.round(-part.y)}px`)
    if (part.x + part.w > canvas[0] + BOUNDS_SLACK) out.push(`右 ${Math.round(part.x + part.w - canvas[0])}px`)
    if (part.y + part.h > canvas[1] + BOUNDS_SLACK) out.push(`下 ${Math.round(part.y + part.h - canvas[1])}px`)
    const worst = Math.max(
      Math.abs(Math.min(0, part.x)),
      Math.abs(Math.min(0, part.y)),
      Math.max(0, part.x + part.w - canvas[0]),
      Math.max(0, part.y + part.h - canvas[1]),
    )
    const tolerable = Math.max(8, Math.min(part.w, part.h) * 0.2)
    if (out.length > 0 && worst > tolerable) {
      report.push({ map, level: 'warn', code: 'out-of-bounds', text: `越界：${part.label} 超出画布（${out.join('、')}）` })
    }
  }
  // 遮挡：只判「不同家具 + 都在前景（z>=0）+ 不是光源层」——
  // 同一件家具内部的叠层（窗帘、窗框、被子）、墙上挂画（z<0）、光源光晕都是故意叠的
  const occludable = parts.filter((part) => part.z >= 0 && !part.isLight)
  for (let i = 0; i < occludable.length; i += 1) {
    for (let j = i + 1; j < occludable.length; j += 1) {
      const lower = occludable[i]
      const upper = occludable[j]
      if (lower.defId === upper.defId) continue
      if (lower.z === upper.z) continue
      const area = lower.w * lower.h
      if (area <= 0) continue
      const cover = intersectArea(lower, upper) / area
      if (cover < COVER_WARN) continue
      const level = cover >= COVER_FAIL ? 'error' : 'warn'
      report.push({
        map,
        level,
        code: 'occluded',
        text: `遮挡：${lower.label}(z=${lower.z}) 被 ${upper.label}(z=${upper.z}) 盖住 ${Math.round(cover * 100)}%`,
      })
    }
  }
  if (presets.length > 0) console.log(`  代码绘制的 preset 件 ${presets.length} 个（不参与几何检查）：${presets.join('、')}`)

  const draw = {
    map,
    canvas,
    background: backgroundShapes(scene, geom, background),
    character: characterShape(scene, geom, home, pet, actions),
    parts: parts.map((part) => ({
      label: part.label,
      src: part.src,
      z: part.z,
      x: Math.round(part.x * 100) / 100,
      y: Math.round(part.y * 100) / 100,
      w: part.w,
      h: part.h,
      flipX: part.flipX,
      rotate: part.rotate,
      skew: part.skew,
      transform: part.transform,
      missing: part.missing,
    })),
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, `render-${map}.json`), `${JSON.stringify(draw, null, 2)}\n`)

  const errors = report.filter((item) => item.map === map && item.level === 'error')
  const warns = report.filter((item) => item.map === map && item.level === 'warn')
  console.log(`\n[${map}] 画布 ${canvas[0]}×${canvas[1]} · 部件 ${parts.length} 个 · 错误 ${errors.length} · 警告 ${warns.length}`)
  for (const item of [...errors, ...warns]) {
    console.log(`  ${item.level === 'error' ? '✗' : '⚠'} ${item.text}`)
  }
  if (errors.length === 0 && warns.length === 0) console.log('  ✓ 没有发现问题')
}

const counts = {
  error: report.filter((item) => item.level === 'error').length,
  warn: report.filter((item) => item.level === 'warn').length,
}
console.log(`\n合计：错误 ${counts.error} · 警告 ${counts.warn}`)
if (checkMode && counts.error > 0) {
  console.log('\n代理渲染检查失败（硬错误见上）。画成图看：python tools/preview.py')
  process.exit(1)
}
