/**
 * 大肥鱼的家园 · Host 半。
 *
 * Host 只做三件事，不参与任何生活模拟：
 *   1. 把存档读写固定在磁盘上（原子写入，形状校验，大小上限）；
 *   2. 把角色包目录当作静态资源发布出去，让 Client 直接用 <img>/fetch 取用；
 *   3. 把 data/ 下的场景定义（scene.json / background.json / 家具 / 事件）以只读方式发布。
 *
 * 世界状态、行为调度、离线结算全部在 Client 半完成（见 client.js），
 * Host 不持有第二份真相，所以重装插件不会丢档。
 */
import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 路由前缀。刻意避开 /api 与 SPA 回退路径。 */
const ROUTE = '/fishhome'
const DEFAULT_PACK_DIR = path.join(HERE, 'packs', 'bigfish-adult')
/** 场景定义目录（maps/…、characters/…）。 */
const DATA_DIR = path.join(HERE, 'data')
const MAX_BODY_BYTES = 512 * 1024
const MAX_PACK_FILE_BYTES = 8 * 1024 * 1024
const PACK_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** 允许「一层子目录/文件」：角色包里的 actions/ 用得上 */
const PACK_NESTED_PATTERN = /^[a-z][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/** 与 patch 里的默认值保持同一份语义。 */
function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {}
  const characterName =
    typeof config.characterName === 'string' && config.characterName.trim() !== ''
      ? config.characterName.trim()
      : '大肥鱼'
  const tickSeconds = clampNumber(config.tickSeconds, 5, 600, 15)
  const packDir =
    typeof config.packDir === 'string' && config.packDir.trim() !== ''
      ? path.resolve(config.packDir.trim())
      : DEFAULT_PACK_DIR
  const saveDir =
    typeof config.saveDir === 'string' && config.saveDir.trim() !== ''
      ? path.resolve(config.saveDir.trim())
      : path.join(dshHome(), 'fishhome', 'saves')
  const map =
    typeof config.map === 'string' && /^[A-Za-z0-9._-]+$/.test(config.map.trim())
      ? config.map.trim()
      : 'bedroom'
  return { characterName, tickSeconds, packDir, saveDir, map }
}

function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temp, JSON.stringify(value), 'utf8')
  await fsp.rename(temp, file)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 只接受本插件自己写出的形状；其余一律拒绝，避免把任意 JSON 落盘。 */
function isSaveShape(value) {
  return (
    isPlainObject(value) &&
    value.kind === 'fishhome-state' &&
    typeof value.version === 'number' &&
    isPlainObject(value.world) &&
    isPlainObject(value.character) &&
    Array.isArray(value.log)
  )
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function sendText(res, status, text) {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error('body too large')
      error.code = 'E_TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function describePack(packDir) {
  const pet = await readJsonFile(path.join(packDir, 'pet.json'))
  if (!isPlainObject(pet)) return null
  return {
    id: typeof pet.id === 'string' ? pet.id : 'pack',
    name: typeof pet.name === 'string' ? pet.name : '',
    version: typeof pet.version === 'string' ? pet.version : '',
    canvas: isPlainObject(pet.canvas) ? pet.canvas : null,
    assets: isPlainObject(pet.assets) ? pet.assets : {},
    animations: typeof pet.animations === 'string' ? pet.animations : 'animations.json',
    fallbacks: isPlainObject(pet.fallbacks) ? pet.fallbacks : {},
  }
}

async function statOrNull(file) {
  try {
    return await fsp.stat(file)
  } catch {
    return null
  }
}

/** 角色包目录下可用的图片（编辑器换图时当选项） */
const IMAGE_EXT = /\.(png|webp|jpe?g|gif)$/i

/** data/maps 下所有含 scene.json 的场景 */
async function listMaps() {
  const root = path.join(DATA_DIR, 'maps')
  let entries = []
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const maps = []
  for (const name of entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    try {
      await fsp.stat(path.join(root, name, 'scene.json'))
      maps.push(name)
    } catch {
      /* 没有 scene.json 的目录跳过 */
    }
  }
  return maps
}

async function listPackImages(packDir) {
  try {
    const names = await fsp.readdir(packDir)
    return names.filter((name) => IMAGE_EXT.test(name)).sort()
  } catch {
    return []
  }
}

function createHandler(settings) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (!url.pathname.startsWith(`${ROUTE}/`) && url.pathname !== ROUTE) {
        sendText(res, 404, 'not found')
        return
      }
      const rest = url.pathname.slice(ROUTE.length)

      if (rest === '/api/meta' && (req.method === 'GET' || req.method === 'HEAD')) {
        await sendMeta(res, settings)
        return
      }
      if (rest === '/api/maps' && (req.method === 'GET' || req.method === 'HEAD')) {
        sendJson(res, 200, { ok: true, maps: await listMaps() })
        return
      }
      if (rest === '/api/pack-files' && (req.method === 'GET' || req.method === 'HEAD')) {
        sendJson(res, 200, { ok: true, files: await listPackImages(settings.config().packDir) })
        return
      }
      if (rest === '/api/state') {
        await handleState(req, res, settings)
        return
      }
      if (rest === '/api/open') {
        await handleOpen(req, res, settings)
        return
      }
      if (rest.startsWith('/pack/')) {
        await serveStatic(req, res, settings.config().packDir, decodeURIComponent(rest.slice('/pack/'.length)), 'pack')
        return
      }
      if (rest.startsWith('/data/')) {
        await serveData(req, res, decodeURIComponent(rest.slice('/data/'.length)))
        return
      }
      sendText(res, 404, 'not found')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (res.headersSent) {
        res.end()
        return
      }
      sendJson(res, 500, { ok: false, error: message })
    }
  }
}

async function sendMeta(res, settings) {
  const { packDir, saveDir, characterName, tickSeconds, map } = settings.config()
  const pack = await describePack(packDir)
  const saveFile = path.join(saveDir, 'state.json')
  const stat = await statOrNull(saveFile)
  sendJson(res, 200, {
    ok: true,
    route: ROUTE,
    packDir,
    dataDir: DATA_DIR,
    saveDir,
    saveFile,
    pack,
    characterName,
    tickSeconds,
    map,
    mapPath: `maps/${map}/scene.json`,
    savedAt: stat ? stat.mtimeMs : 0,
    packReady: pack !== null,
  })
}

/**
 * 打开配置文件 / 在资源管理器里定位。
 *
 * 只允许三类前缀，其它一律拒绝：
 *   data/…        场景与家具定义（DATA_DIR）
 *   pack/…        角色包（packDir）
 *   save/…        存档（saveDir）
 *
 * 环境变量 DSH_FISHHOME_NO_SPAWN=1 时只校验不真的打开（测试用）。
 */
async function handleOpen(req, res, settings) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch (error) {
    const tooLarge = error && error.code === 'E_TOO_LARGE'
    sendJson(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? '请求体过大' : '请求体不是合法 JSON' })
    return
  }
  const kind = payload && typeof payload.kind === 'string' ? payload.kind : 'file'
  if (!['file', 'folder', 'reveal'].includes(kind)) {
    sendJson(res, 400, { ok: false, error: `不支持的打开方式：${kind}` })
    return
  }
  const relative = payload && typeof payload.path === 'string' ? payload.path.trim().replace(/\\/g, '/') : ''
  const target = resolveOpenTarget(relative, settings.config())
  if (target === null) {
    sendJson(res, 400, { ok: false, error: `不认识这个路径：${relative}` })
    return
  }
  const stat = await statOrNull(target)
  if (stat === null) {
    sendJson(res, 404, { ok: false, error: `文件不存在：${relative}` })
    return
  }
  const dryRun = process.env.DSH_FISHHOME_NO_SPAWN === '1'
  if (!dryRun) {
    try {
      launchWithOs(kind, target)
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
  }
  sendJson(res, 200, { ok: true, kind, path: relative, absolute: target, dryRun })
}

/** data/… pack/… save/… → 绝对路径；不认识的返回 null */
function resolveOpenTarget(relative, config) {
  if (typeof relative !== 'string' || relative === '' || relative.includes('\0')) return null
  const segments = relative.split('/')
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) return null
  const roots = {
    data: path.resolve(DATA_DIR),
    pack: path.resolve(config.packDir),
    save: path.resolve(config.saveDir),
  }
  const [head, ...tail] = segments
  const root = roots[head]
  if (!root) return null
  const rest = tail.join('/')
  const target = rest === '' ? root : path.resolve(root, rest)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null
  return target
}

/** 交给操作系统：文件用默认程序打开，目录用资源管理器，reveal 则是定位 */
function launchWithOs(kind, target) {
  const platform = process.platform
  const run = (command, args) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
  }
  if (kind === 'reveal') {
    if (platform === 'win32') run('explorer.exe', [`/select,${target}`])
    else if (platform === 'darwin') run('open', ['-R', target])
    else run('xdg-open', [path.dirname(target)])
    return
  }
  if (kind === 'folder') {
    if (platform === 'win32') run('explorer.exe', [target])
    else if (platform === 'darwin') run('open', [target])
    else run('xdg-open', [target])
    return
  }
  if (platform === 'win32') run('cmd.exe', ['/c', 'start', '', target])
  else if (platform === 'darwin') run('open', [target])
  else run('xdg-open', [target])
}

async function handleState(req, res, settings) {
  const { saveDir } = settings.config()
  const saveFile = path.join(saveDir, 'state.json')

  if (req.method === 'GET' || req.method === 'HEAD') {
    const state = await readJsonFile(saveFile)
    const valid = isSaveShape(state)
    sendJson(res, 200, {
      ok: true,
      state: valid ? state : null,
      corrupt: state !== null && !valid,
    })
    return
  }

  if (req.method === 'POST') {
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (error) {
      const tooLarge = error && error.code === 'E_TOO_LARGE'
      sendJson(res, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? '存档过大' : '请求体不是合法 JSON',
      })
      return
    }
    if (!isSaveShape(payload)) {
      sendJson(res, 400, { ok: false, error: '存档形状不合法' })
      return
    }
    await writeJsonAtomic(saveFile, payload)
    sendJson(res, 200, { ok: true, savedAt: Date.now() })
    return
  }

  if (req.method === 'DELETE') {
    try {
      await fsp.rm(saveFile, { force: true })
    } catch {
      /* 删不掉也当没档处理 */
    }
    sendJson(res, 200, { ok: true })
    return
  }

  res.setHeader('allow', 'GET, POST, DELETE, HEAD')
  sendJson(res, 405, { ok: false, error: 'method not allowed' })
}

async function serveStatic(req, res, directory, relative, label) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  // 平铺文件，或允许一层子目录（actions/…）；绝对路径、.. 一律拒绝
  const nested = PACK_NESTED_PATTERN.test(relative)
  if (relative === '' || (!nested && !PACK_FILE_PATTERN.test(relative))) {
    sendText(res, 404, 'not found')
    return
  }
  const ext = path.extname(relative).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (mime === undefined) {
    sendText(res, 404, 'not found')
    return
  }
  const root = path.resolve(directory)
  const target = path.resolve(root, relative)
  const parent = path.dirname(target)
  if (parent !== root && path.dirname(parent) !== root) {
    sendText(res, 404, 'not found')
    return
  }
  const stat = await statOrNull(target)
  if (stat === null || !stat.isFile() || stat.size > MAX_PACK_FILE_BYTES) {
    sendText(res, 404, `not found: ${label}`)
    return
  }
  // 素材经常被同名覆盖：用「大小 + 修改时间」当 ETag，浏览器重新验证时回 304，不重传整份
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  res.setHeader('etag', etag)
  res.setHeader('cache-control', 'no-cache, must-revalidate')
  const inm = req.headers ? req.headers['if-none-match'] : undefined
  if (typeof inm === 'string' && inm.split(',').map((v) => v.trim()).includes(etag)) {
    res.statusCode = 304
    res.end()
    return
  }
  const bytes = await fsp.readFile(target)
  res.statusCode = 200
  res.setHeader('content-type', mime)
  res.setHeader('content-length', String(bytes.length))
  res.end(req.method === 'HEAD' ? undefined : bytes)
}

/**
 * 场景定义（data/ 下）：GET 发布，POST 原子写回，DELETE 删除（编辑器用）。
 * 允许子目录（maps/bedroom/scene.json），禁止绝对路径与 `..`；
 * 只放行 .json / 图片，写回和删除只允许 .json。
 */
async function serveData(req, res, relative) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('allow', 'GET, HEAD, POST, DELETE')
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  const clean = relative.replace(/\\/g, '/')
  const segments = clean.split('/')
  if (
    clean === '' ||
    clean.startsWith('/') ||
    segments.some((seg) => seg === '' || seg === '.' || seg === '..') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(clean)
  ) {
    sendText(res, 404, 'not found')
    return
  }
  const ext = path.extname(clean).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (mime === undefined) {
    sendText(res, 404, 'not found')
    return
  }
  const target = path.resolve(DATA_DIR, clean)
  if (!target.startsWith(`${path.resolve(DATA_DIR)}${path.sep}`)) {
    sendText(res, 404, 'not found')
    return
  }

  if (req.method === 'POST') {
    if (ext !== '.json') {
      sendJson(res, 400, { ok: false, error: '只能写 .json' })
      return
    }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (error) {
      const tooLarge = error && error.code === 'E_TOO_LARGE'
      sendJson(res, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? '文件过大' : '请求体不是合法 JSON',
      })
      return
    }
    await writeJsonAtomic(target, payload)
    sendJson(res, 200, { ok: true, path: clean, savedAt: Date.now() })
    return
  }

  if (req.method === 'DELETE') {
    if (ext !== '.json') {
      sendJson(res, 400, { ok: false, error: '只能删 .json' })
      return
    }
    const stat = await statOrNull(target)
    if (stat === null || !stat.isFile()) {
      sendText(res, 404, `not found: ${clean}`)
      return
    }
    await fsp.unlink(target)
    sendJson(res, 200, { ok: true, deleted: clean })
    return
  }

  const stat = await statOrNull(target)
  if (stat === null || !stat.isFile() || stat.size > MAX_PACK_FILE_BYTES) {
    sendText(res, 404, `not found: ${clean}`)
    return
  }
  const bytes = await fsp.readFile(target)
  res.statusCode = 200
  res.setHeader('content-type', mime)
  res.setHeader('content-length', String(bytes.length))
  // 定义文件会边改边看，别让浏览器缓存住
  res.setHeader('cache-control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : bytes)
}

/**
 * Host 插件入口。webServer 是可选依赖：没有它插件保持静默，
 * 但不会让整个 profile 激活失败。
 */
export function apply(ctx, rawConfig) {
  const current = normalizeConfig(rawConfig)
  const settings = { config: () => current }

  ctx.inject(['webServer'], (inner) => {
    const dispose = inner.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: createHandler(settings),
    })
    inner.effect(() => dispose, 'dsh-fishhome: http routes')
  })
}
