/**
 * 零依赖自检（工具链里没有 npm / eslint，所以自己写一个）。
 *
 *     node tools/check.mjs
 *
 * 检查五件事：
 *   1. 构建新鲜度：client.js 是否和 src/ 拼出来的内容一致（防止忘记 build）
 *   2. 片段完整性：src/ 下的每个 .js 是否都在 build.mjs 的 ORDER 里
 *   3. 多语言：代码里用到的 t('key') 是否都有中文文案；中英文字典键是否一一对应
 *   4. 死代码：顶层函数定义了却没人调用
 *   5. 数据完整性：场景 / 事件 / 家具 / 素材之间的引用是否都能对上
 *
 * 任何一项失败都会打印明细并以非 0 退出，方便挂了钩子再跑。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC = path.join(ROOT, 'src')
const DATA = path.join(ROOT, 'data')

const problems = []
const notes = []

// 测试/工具里禁止写死盘符绝对路径（CI 在 Linux 上跑，写了只在 CI 挂）
// 只认「盘符 + 目录 + 斜杠」这种真路径；注释里的省略写法不算
const drivePath = /[A-Za-z]:[\\/][A-Za-z0-9._-]+[\\/]/
for (const dir of ['test', 'tools', 'src']) {
  for (const name of readdirSync(path.join(ROOT, dir), { recursive: true })) {
    const rel = path.join(dir, String(name)).replace(/\\/g, '/')
    if (!/\.(m?js)$/.test(rel)) continue
    const body = readFileSync(path.join(ROOT, rel), 'utf8').split('\n')
    body.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
      const hit = line.match(drivePath)
      if (hit) problems.push(`[绝对路径] ${rel}:${index + 1} 写死了盘符路径：${hit[0]}（CI 在 Linux 上读不到）`)
    })
  }
}

const fail = (group, message) => problems.push(`[${group}] ${message}`)

/* ---------------------------------------------------------------- 构建新鲜度 */

const buildSource = readFileSync(path.join(ROOT, 'build.mjs'), 'utf8')
const orderMatch = buildSource.match(/const ORDER = \[([\s\S]*?)\]/)
if (!orderMatch) {
  fail('构建', 'build.mjs 里找不到 ORDER 数组')
}
const ORDER = orderMatch
  ? [...orderMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : []
const PROLOGUE = (buildSource.match(/const PROLOGUE = ("(?:[^"\\]|\\.)*")/) || [])[1]
const CLOSING = (buildSource.match(/const CLOSING = ('(?:[^'\\]|\\.)*')/) || [])[1]

function assemble() {
  const normalizeEol = (text) => text.replace(/\r\n?/g, '\n')
  const body = ORDER.map((file) => normalizeEol(readFileSync(path.join(ROOT, file), 'utf8')).replace(/\n$/, '')).join('\n')
  // PROLOGUE / CLOSING 在源码里是 JS 字符串字面量，直接用 JSON/eval 还原
  const prologue = PROLOGUE ? JSON.parse(PROLOGUE) : ''
  const closing = CLOSING ? JSON.parse(CLOSING.replace(/^'/, '"').replace(/'$/, '"')) : ''
  return `${prologue}\n${body}\n${closing}`
}

let bundle = ''
try {
  bundle = assemble()
} catch (error) {
  fail('构建', `拼装 src/ 失败：${error.message}`)
}
if (bundle !== '') {
  const onDiskRawRaw = existsSync(path.join(ROOT, 'client.js')) ? readFileSync(path.join(ROOT, 'client.js'), 'utf8') : ''
  const onDiskRaw = onDiskRawRaw.replace(/\r\n?/g, '\n')
  // build.mjs 会注入一行 BUILD_REV（src 的哈希），这里剥掉再比，否则永远不一致
  const onDisk = onDiskRaw.replace(/^ {4}const BUILD_REV = '[0-9a-f]{8}'\n/m, '')
  if (onDisk !== bundle) fail('构建', 'client.js 与 src/ 不一致，跑一下 node build.mjs')
  else notes.push('client.js 与 src/ 一致 ✓')
}

/* ---------------------------------------------------------------- 片段完整性 */

const outOfOrder = readdirSync(SRC)
  .filter((name) => name.endsWith('.js'))
  .map((name) => `src/${name}`)
  .filter((file) => !ORDER.includes(file))
for (const file of outOfOrder) fail('片段', `${file} 没有被 build.mjs 的 ORDER 收录，构建时会被静默丢掉`)
for (const file of ORDER) {
  if (!existsSync(path.join(ROOT, file))) fail('片段', `ORDER 里的 ${file} 不存在`)
}

/* ---------------------------------------------------------------- 多语言 */

const localeSource = existsSync(path.join(SRC, 'locale.js')) ? readFileSync(path.join(SRC, 'locale.js'), 'utf8') : ''
function dictKeys(name) {
  const start = localeSource.indexOf(`const ${name} = {`)
  if (start < 0) return new Set()
  const end = localeSource.indexOf('\n    }', start)
  const block = localeSource.slice(start, end)
  return new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]))
}
const ZH = dictKeys('ZH')
const EN = dictKeys('EN')
if (ZH.size === 0) fail('多语言', 'src/locale.js 里找不到 ZH 字典')

for (const key of EN) {
  if (!ZH.has(key)) fail('多语言', `英文有、中文没有的键：${key}`)
}
for (const key of ZH) {
  if (!EN.has(key)) fail('多语言', `中文有、英文没有的键：${key}`)
}

// 代码里 t('...') 字面量用到的键必须存在；动态拼接的跳过
const usedKeys = new Map()
for (const file of ORDER) {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
    const key = m[1]
    if (!usedKeys.has(key)) usedKeys.set(key, new Set())
    usedKeys.get(key).add(file)
  }
}
for (const [key, files] of usedKeys) {
  // 允许「前缀式」字典：behavior.* / flavor.* / needs.*Hint.* 这类成组键不在检查范围
  if (ZH.has(key)) continue
  const groupPrefix = `${key}.`
  if ([...ZH].some((k) => k.startsWith(groupPrefix))) continue
  fail('多语言', `代码用到但没有文案：${key}（${[...files].join(', ')}）`)
}

const MAPS = ['bedroom', 'living', 'garden']

/* ---------------------------------------------------------------- 死代码 */

if (bundle !== '') {
  const internals = (bundle.match(/__internals\s*:\s*\{([\s\S]*?)\n\s{4}\}/) || [])[1] || ''
  const names = [...bundle.matchAll(/^\s{0,4}function (\w+)\(/gm)].map((m) => m[1])
  for (const name of new Set(names)) {
    const hits = (bundle.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length
    const exported = new RegExp(`\\b${name}\\b`).test(internals)
    if (hits <= 1 && !exported) fail('死代码', `顶层函数 ${name}() 没有被任何地方调用`)
  }
}

/* ---------------------------------------------------------------- 数据完整性 */

const PACK_DIR = path.join(ROOT, 'packs', 'bigfish-adult')
const PRESETS = new Set(['desk', 'desk_glow', 'shelf', 'rug', 'plant', 'night_lamp', 'night_lamp_glow', 'lamp_glow'])
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const hasFile = (file) => existsSync(file)

const packAssets = hasFile(path.join(PACK_DIR, 'pet.json')) ? readJson(path.join(PACK_DIR, 'pet.json')).assets || {} : {}
const actionTags = new Set()
const packFiles = new Set()
if (hasFile(path.join(PACK_DIR, 'actions'))) {
  for (const name of readdirSync(path.join(PACK_DIR, 'actions'))) {
    if (!name.endsWith('.json')) continue
    const action = readJson(path.join(PACK_DIR, 'actions', name))
    for (const tag of action.tags || []) actionTags.add(tag)
    if (typeof action.id === 'string') actionTags.add(action.id)
    if (action.asset && packAssets[action.asset]) packFiles.add(packAssets[action.asset].path)
    if (action.bubble && typeof action.bubble.src === 'string') packFiles.add(action.bubble.src)
  }
}
for (const asset of Object.values(packAssets)) {
  if (!asset || typeof asset.path !== 'string') continue
  packFiles.add(asset.path)
  if (!hasFile(path.join(PACK_DIR, asset.path))) fail('数据', `pet.json 声明的素材不存在：${asset.path}`)
}

function checkSpriteSrc(src, where) {
  if (typeof src !== 'string' || src === '') return
  if (!hasFile(path.join(PACK_DIR, src))) fail('数据', `${where} 引用的图片不存在：${src}`)
}

for (const map of MAPS) {
  const dir = path.join(DATA, 'maps', map)
  if (!hasFile(path.join(dir, 'scene.json'))) {
    fail('数据', `场景缺少 scene.json：${map}`)
    continue
  }
  const scene = readJson(path.join(dir, 'scene.json'))
  const eventIds = new Set()
  for (const id of scene.events || []) {
    const file = path.join(dir, 'events', `${id}.json`)
    if (!hasFile(file)) {
      fail('数据', `${map}/scene.json 引用的事件文件不存在：events/${id}.json`)
      continue
    }
    const event = readJson(file)
    eventIds.add(event.id || id)
    if (typeof event.anim === 'string' && event.anim !== '' && !actionTags.has(event.anim)) {
      fail('数据', `${map}/events/${id}.json 的 anim "${event.anim}" 不在角色包动作标签里`)
    }
  }
  const furnitureIds = new Set()
  for (const id of scene.furniture || []) {
    const file = path.join(dir, 'furniture', `${id}.json`)
    if (!hasFile(file)) {
      fail('数据', `${map}/scene.json 引用的家具文件不存在：furniture/${id}.json`)
      continue
    }
    const def = readJson(file)
    furnitureIds.add(def.id || id)
    for (const part of def.parts || []) {
      if (part.preset && !PRESETS.has(part.preset)) fail('数据', `${map}/furniture/${id}.json 的 preset "${part.preset}" 不认识`)
      if (part.sprite && typeof part.sprite.src === 'string') checkSpriteSrc(part.sprite.src, `${map}/furniture/${id}.json`)
      if (part.sprite && !Array.isArray(part.sprite.rect)) fail('数据', `${map}/furniture/${id}.json 的 ${part.id || 'part'} 缺少 sprite.rect`)
    }
    if (def.click && def.click.type === 'event' && !eventIds.has(def.click.id)) {
      fail('数据', `${map}/furniture/${id}.json 点击引用的事件不存在：${def.click.id}`)
    }
    if (def.click && def.click.type === 'scene' && !MAPS.includes(def.click.id)) {
      fail('数据', `${map}/furniture/${id}.json 点击引用的场景不存在：${def.click.id}`)
    }
    for (const animation of def.animations || []) {
      if (typeof animation.event === 'string' && !eventIds.has(animation.event)) {
        fail('数据', `${map}/furniture/${id}.json 动画 ${animation.id} 引用的事件不存在：${animation.event}`)
      }
      if (typeof animation.animation === 'string' && !actionTags.has(animation.animation)) {
        fail('数据', `${map}/furniture/${id}.json 动画 ${animation.id} 用的动作不存在：${animation.animation}`)
      }
    }
  }
  // 反向：有文件但没进场景
  const dirFurniture = path.join(dir, 'furniture')
  if (hasFile(dirFurniture)) {
    for (const name of readdirSync(dirFurniture)) {
      if (!name.endsWith('.json')) continue
      const id = name.replace(/\.json$/, '')
      if (!furnitureIds.has(id)) fail('数据', `${map}/furniture/${name} 没有被 scene.json 引用`)
    }
  }
  // 事件锚点：事件用 "def:anchor" 引用家具锚点
  for (const id of eventIds) {
    const event = readJson(path.join(dir, 'events', `${id}.json`))
    if (typeof event.anchor !== 'string' || !event.anchor.includes(':')) continue
    const [defId, anchorId] = event.anchor.split(':')
    const file = path.join(dir, 'furniture', `${defId}.json`)
    if (!hasFile(file)) {
      fail('数据', `${map}/events/${id}.json 的 anchor "${event.anchor}" 指向不存在的家具 ${defId}`)
      continue
    }
    const def = readJson(file)
    // 锚点就是家具 animations 列表里的条目（老格式 interactionAnchors 也认）
    const list = Array.isArray(def.animations) ? def.animations : (Array.isArray(def.interactionAnchors) ? def.interactionAnchors : [])
    if (list.length === 0) {
      fail('数据', `${map}/events/${id}.json 的 anchor "${event.anchor}" 指向的家具没有任何锚点`)
      continue
    }
    const anchorIds = list.map((item) => (item && item.id) || 'default')
    if (!anchorIds.includes(anchorId)) fail('数据', `${map}/events/${id}.json 的 anchor "${event.anchor}" 在这件家具上找不到（有：${anchorIds.join(', ')}）`)
  }
}

/* ---------------------------------------------------------------- 日志码 */

// 日志码必须两边都齐全：字典里有 log.<code>，ui.js 的 logText 里有 case '<code>'
const uiSource = readFileSync(path.join(SRC, 'ui.js'), 'utf8')
const logTextCases = new Set([...uiSource.matchAll(/case '([a-zA-Z0-9_.-]+)':/g)].map((m) => m[1]))
const pushedCodes = new Set()
for (const file of ORDER) {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  for (const m of text.matchAll(/pushLog\(\s*[^,]+,\s*[^,]+,\s*'([a-zA-Z0-9_.-]+)'/g)) pushedCodes.add(m[1])
}
// 事件数据里自定义的日志码
for (const map of MAPS) {
  const dir = path.join(DATA, 'maps', map, 'events')
  if (!hasFile(dir)) continue
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const event = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
    if (typeof event.log === 'string' && event.log !== '') pushedCodes.add(event.log)
  }
}
for (const code of pushedCodes) {
  if (!ZH.has(`log.${code}`)) fail('日志码', `日志码 "${code}" 没有对应文案 log.${code}`)
  if (!logTextCases.has(code)) fail('日志码', `日志码 "${code}" 没有渲染分支：src/ui.js 的 logText 里缺 case '${code}'`)
}

/* ---------------------------------------------------------------- 输出 */

if (notes.length > 0) {
  for (const note of notes) console.log(`  ✓ ${note}`)
}
if (problems.length === 0) {
  console.log(`\n自检通过：${ORDER.length} 个片段、${ZH.size} 条文案、${MAPS.length} 个场景`)
  process.exit(0)
}
console.log(`\n发现 ${problems.length} 个问题：`)
for (const problem of problems) console.log(`  ${problem}`)
process.exit(1)
