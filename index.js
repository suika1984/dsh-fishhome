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
import { promises as fsp, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** Host 版本号：本文件的短哈希。改了 index.js 必须重启，重启后这个值才会变 */
const HOST_REV = (() => {
  try {
    return createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 8)
  } catch {
    return 'unknown'
  }
})()
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
  // 小屋便条：preview = 只在她嘴里说，inject = 真把消息送进当前会话
  const noteMode = config.noteMode === 'inject' ? 'inject' : 'preview'
  return { characterName, tickSeconds, packDir, saveDir, map, noteMode }
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
      if (rest === '/api/note') {
        await handleNote(req, res, settings)
        return
      }
      if (rest === '/api/note-target') {
        await handleNoteTarget(req, res, settings)
        return
      }
      if (rest === '/api/activity' && (req.method === 'GET' || req.method === 'HEAD')) {
        const activity = settings.activity ? settings.activity() : null
        if (!activity) {
          sendJson(res, 200, { ok: true, running: 0, sessions: 0, counters: {}, recent: [] })
          return
        }
        const noteMode = settings.config().noteMode
        sendJson(res, 200, activitySnapshot(activity, settings.notes ? settings.notes() : null, noteMode))
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
    hostRev: HOST_REV,
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
  let openedWith = 'dry-run'
  if (!dryRun) {
    try {
      // 等子进程真的起来了再回 200：以前是 spawn 后立刻返回，
      // explorer 起不来（路径/权限/环境）时前端仍然显示「已打开」，完全看不出问题。
      openedWith = await launchWithOs(kind, target)
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
  }
  sendJson(res, 200, { ok: true, kind, path: relative, absolute: target, dryRun, openedWith })
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

/** 交给操作系统：文件用默认程序打开，目录用资源管理器，reveal 则是定位。返回 Promise，spawn 失败会 reject */
async function launchWithOs(kind, target) {
  const platform = process.platform
  // 优先用 Electron 的 shell：Desktop 里插件跑在 Electron 进程内，
  // 直接 spawn explorer.exe 有时会被静默拦住（什么都不发生）。
  try {
    const electron = await import('electron')
    const shell = (electron && electron.shell) || (electron && electron.default && electron.default.shell)
    if (shell) {
      if (kind === 'reveal' && typeof shell.showItemInFolder === 'function') {
        shell.showItemInFolder(target)
        return 'electron'
      }
      if (typeof shell.openPath === 'function') {
        const failure = await shell.openPath(target)
        if (!failure) return 'electron'
        throw new Error(failure)
      }
    }
  } catch {
    /* 没有 electron（web 版/测试环境），回退到 spawn */
  }
  const run = (command, args) => new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    } catch (error) {
      reject(error)
      return
    }
    child.once('error', (error) => reject(error))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
  if (kind === 'reveal') {
    if (platform === 'win32') return run('explorer.exe', [`/select,${target}`]).catch(() => run('cmd.exe', ['/c', 'start', '', path.dirname(target)]))
    if (platform === 'darwin') return run('open', ['-R', target])
    return run('xdg-open', [path.dirname(target)])
  }
  if (kind === 'folder') {
    // Windows 上直接 spawn explorer.exe 有时静默什么都不发生（尤其是从 Electron 子进程里），
    // 走 cmd 的 start 会经过 ShellExecute，稳一些。
    if (platform === 'win32') return run('cmd.exe', ['/c', 'start', '', target])
    if (platform === 'darwin') return run('open', [target])
    return run('xdg-open', [target])
  }
  if (platform === 'win32') return run('cmd.exe', ['/c', 'start', '', target])
  if (platform === 'darwin') return run('open', [target])
  return run('xdg-open', [target])
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
 *
 * 另外订阅 DSH 的会话事件，聚合成一份「活动快照」给面板用（仅内存，不落盘）。
 */
export function apply(ctx, rawConfig) {
  const current = normalizeConfig(rawConfig)
  const activity = createActivity()
  const notes = createNotes()
  const settings = { config: () => current, activity: () => activity, notes: () => notes }

  // 记下一条真实的用户消息当模板（构造便条消息时要照它的形状来）
  try {
    ctx.effect(() => ctx.on('agent/inbox/inserted', (payload) => {
      rememberUserShape(notes, payload && payload.message)
    }), 'dsh-fishhome: remember user message shape')
  } catch {
    /* 没有这个事件 */
  }
  // 小屋便条：在「进入下一步」的水位处把消息追加进去（必须先 next() 保留原流程）
  try {
    ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      try {
        return injectNote(notes, current, payload, decision)
      } catch {
        return decision
      }
    }), 'dsh-fishhome: inject note at step boundary')
  } catch {
    /* 没有这个事件 */
  }
  // DSH 会话活动 → 聚合（事件在别的部署里可能不存在，缺了就当没有）
  for (const [event, handler] of activityListeners(activity, notes)) {
    try {
      ctx.effect(() => ctx.on(event, handler), `dsh-fishhome: listen ${event}`)
    } catch {
      /* 没有这个事件就跳过 */
    }
  }

  ctx.inject(['webServer'], (inner) => {
    const dispose = inner.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: createHandler(settings),
    })
    inner.effect(() => dispose, 'dsh-fishhome: http routes')
  })
}


/* ---------------------------------------------------------------------------
 * 小屋便条（L3）：面板里跟我说一句话
 *
 * preview 模式只在屋子里说 + 记日志；inject 模式会额外把这句话作为一条
 * 用户消息送进「当前正在跑的会话」——通过文档化的 agent/pre-step 水位实现：
 * 先 next() 拿到决策，只往 messages 里追加，绝不改写原有内容。
 * ------------------------------------------------------------------------- */

const NOTE_MAX_CHARS = 200
const NOTE_QUEUE_MAX = 5

function createNotes() {
  return {
    queue: [],
    injected: 0,
    preview: 0,
    shape: null,
    // 便条要送进哪个会话：最近一次「开始运行 / 有新消息」的那个
    target: null,
    targetAt: 0,
    // 用户在设置里手动指定的会话（空字符串 = 自动）
    pinned: '',
    // 见过的活会话：id → { id, running, lastAt, label }
    sessions: new Map(),
    // 便条发出去之后，等着会话回话的 id
    awaiting: new Set(),
    // 最近一条「对便条的回复」：{ at, sessionId, text }
    lastReply: null,
    // 活会话的 Session 对象：拿不到实时事件时，用 deriveMessages() 补标题
    sessionRefs: new Map(),
  }
}

/** 记一个活会话（供设置里的下拉框选） */
function rememberSession(notes, sessionId, patch) {
  if (typeof sessionId !== 'string' || sessionId === '') return
  const current = notes.sessions.get(sessionId) || { id: sessionId, running: false, lastAt: 0, label: '', titled: false }
  const next = { ...current, ...patch }
  // 还没有标题时先用短 id 占位
  if (!next.label) next.label = prettySessionId(sessionId)
  notes.sessions.set(sessionId, next)
}

/** 用会话里第一条用户消息当标题（只写一次，之后不被覆盖） */
function setSessionTitle(notes, sessionId, title, authoritative) {
  if (typeof sessionId !== 'string' || sessionId === '' || title === '') return
  const current = notes.sessions.get(sessionId)
  if (current && current.titled && !authoritative) return
  rememberSession(notes, sessionId, { label: title, titled: true, authoritative: authoritative === true })
}

/** 压缩/续写时注入的「假用户消息」，不该拿来当标题 */
const SYNTHETIC_USER_HINTS = [
  'this is an automatically generated checkpoint',
  'this is an automatically generated',
  'compacting an earlier span',
  'conversation summary',
]

/** 从一条用户消息里抽「标题」：第一段文字，压平空白后截断 */
function titleFromMessage(message) {
  if (!message || typeof message !== 'object' || message.role !== 'user') return ''
  const blocks = Array.isArray(message.content) ? message.content : []
  for (const block of blocks) {
    if (!block || block.type !== 'text' || typeof block.text !== 'string') continue
    const text = block.text.replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const lower = text.toLowerCase()
    if (SYNTHETIC_USER_HINTS.some((hint) => lower.startsWith(hint) || lower.includes(hint))) continue
    return text.length > 24 ? `${text.slice(0, 24)}…` : text
  }
  return ''
}

/** 会话自己的 durable 标题（DSH 把改名/自动标题记在会话事件里，形状是 { title } ） */
function titleFromSessionEvents(session) {
  if (!session || typeof session !== 'object' || typeof session.snapshotEvents !== 'function') return ''
  let events = []
  try {
    events = session.snapshotEvents() || []
  } catch {
    return ''
  }
  let found = ''
  for (const event of events) {
    const data = event && event.data
    if (!data || typeof data !== 'object') continue
    if (typeof data.title === 'string' && data.title.trim() !== '') found = data.title.trim()
  }
  return found
}

/** 从助手消息里抽文本（回话要显示在屋里，截 200 字） */
function textFromAssistant(message) {
  if (!message || typeof message !== 'object' || message.role !== 'assistant') return ''
  const blocks = Array.isArray(message.content) ? message.content : []
  const parts = []
  for (const block of blocks) {
    if (!block || block.type !== 'text' || typeof block.text !== 'string') continue
    const text = block.text.replace(/\s+/g, ' ').trim()
    if (text !== '') parts.push(text)
  }
  const joined = parts.join(' ')
  if (joined === '') return ''
  return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined
}

/** 会话 id 太长的部分去掉，留一段有区分度的（session-1a2b3c… → 1a2b3c…） */
function prettySessionId(sessionId) {
  const text = typeof sessionId === 'string' ? sessionId : ''
  const bare = text.replace(/^session[-_]/i, '')
  if (bare !== text) return bare.slice(0, 8)
  return text.length > 8 ? text.slice(0, 8) : text
}

/** 用 Session 的历史消息补标题（事件没赶上时用） */
function backfillTitle(notes, sessionId) {
  const current = notes.sessions.get(sessionId)
  if (current && current.titled && current.authoritative) return
  const session = notes.sessionRefs.get(sessionId)
  if (!session) return
  const durable = titleFromSessionEvents(session)
  if (durable) {
    setSessionTitle(notes, sessionId, durable, true)
    return
  }
  if (current && current.titled) return
  if (typeof session.deriveMessages !== 'function') return
  let messages = []
  try {
    messages = session.deriveMessages() || []
  } catch {
    return
  }
  for (const message of messages) {
    const title = titleFromMessage(message)
    if (title) {
      setSessionTitle(notes, sessionId, title)
      return
    }
  }
}

/** 便条最终送去哪个会话：手动指定的优先，其次最近活跃的 */
function resolveNoteTarget(notes) {
  if (typeof notes.pinned === 'string' && notes.pinned !== '') {
    return notes.sessions.has(notes.pinned) ? notes.pinned : ''
  }
  return noteTargetFresh(notes) ? notes.target : ''
}

/** 记下「当前会话」：谁最近开始跑，便条就归谁 */
function noteTarget(notes, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return
  notes.target = sessionId
  notes.targetAt = Date.now()
  rememberSession(notes, sessionId, { lastAt: Date.now() })
}

/** 便条目标是否还新鲜（会话可能早结束了，别把话送进不相干的步骤） */
const NOTE_TARGET_TTL_MS = 10 * 60 * 1000
function noteTargetFresh(notes, now = Date.now()) {
  return typeof notes.target === 'string' && notes.target !== '' && now - notes.targetAt <= NOTE_TARGET_TTL_MS
}

/** 记一条真实用户消息的形状，构造便条时照抄（缺了就不注入，只预览） */
function rememberUserShape(notes, message) {
  if (!message || typeof message !== 'object' || message.role !== 'user') return
  if (!Array.isArray(message.content)) return
  notes.shape = message
}

function notesSnapshot(notes, mode) {
  const target = resolveNoteTarget(notes)
  return {
    mode: mode === 'inject' ? 'inject' : 'preview',
    pending: notes.queue.length,
    injected: notes.injected,
    preview: notes.preview,
    canInject: notes.shape !== null,
    // 便条会送进哪个会话（给面板显示用：优先标题）
    target: target
      ? (() => {
        const row = notes.sessions.get(target)
        return row && row.label ? row.label : prettySessionId(target)
      })()
      : '',
    targetFull: target,
    targetFresh: target !== '',
    pinned: notes.pinned,
    // 会话里对便条的回复（面板要把它显示成她的气泡）
    lastReply: notes.lastReply ? { at: notes.lastReply.at, text: notes.lastReply.text } : null,
    lastSend: notes.lastSend || null,
    // 设置里的下拉框用：见过的活会话
    sessions: [...notes.sessions.values()]
      .map((item) => {
        backfillTitle(notes, item.id)
        return notes.sessions.get(item.id) || item
      })
      .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.lastAt - a.lastAt)
      .slice(0, 12)
      .map((item) => ({ id: item.id, label: item.label, titled: item.titled === true, running: item.running, lastAt: item.lastAt })),
  }
}

/** 面板来的一条便条 */
function queueNote(notes, text) {
  const clean = typeof text === 'string' ? text.trim() : ''
  if (clean === '' || clean.length > NOTE_MAX_CHARS) return { ok: false, error: `便条要 1~${NOTE_MAX_CHARS} 个字` }
  if (notes.queue.length >= NOTE_QUEUE_MAX) return { ok: false, error: '便条太多了，等她先看完' }
  notes.queue.push({ text: clean, at: Date.now() })
  return { ok: true, pending: notes.queue.length }
}

/** 把队首便条追加成一条用户消息（只在 inject 模式 + 有形状模板时） */
function injectNote(notes, config, payload, decision) {
  if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  const mode = config && config.noteMode === 'inject' ? 'inject' : 'preview'
  if (mode !== 'inject' || !notes.shape) return decision
  const wanted = resolveNoteTarget(notes)
  if (!wanted) return decision
  const agentId = payload && payload.agent && typeof payload.agent.id === 'string' ? payload.agent.id : ''
  // 只在「便条的目标会话」进入下一步时注入；别的 agent 一律不碰（便条留着）
  if (agentId !== wanted) return decision
  const note = notes.queue.shift()
  if (!note) return decision
  const template = notes.shape
  const message = {
    ...template,
    id: `fishhome-note-${note.at}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    content: [{ type: 'text', text: note.text }],
  }
  decision.messages.push(message)
  notes.injected += 1
  return decision
}

/** 设置里选「便条送进哪个会话」：{ sessionId }（空字符串 = 自动挑最活跃的） */
async function handleNoteTarget(req, res, settings) {
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
  const notes = settings.notes()
  const wanted = typeof (payload && payload.sessionId) === 'string' ? payload.sessionId.trim() : ''
  if (wanted !== '' && !notes.sessions.has(wanted)) {
    sendJson(res, 404, { ok: false, error: '这个会话已经不在了' })
    return
  }
  notes.pinned = wanted
  const { noteMode } = settings.config()
  sendJson(res, 200, { ok: true, ...notesSnapshot(notes, noteMode) })
}

async function handleNote(req, res, settings) {
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
  const notes = settings.notes()
  const { noteMode } = settings.config()
  const text = typeof (payload && payload.text) === 'string' ? payload.text.trim() : ''
  const delivered = payload && payload.delivered === true
  const sessionId = typeof (payload && payload.sessionId) === 'string' ? payload.sessionId : ''
  // 记下这次投递的诊断信息（面板拿不到 sessions 服务时一眼能看出来）
  notes.lastSend = {
    at: Date.now(),
    delivered,
    clientSessions: payload && payload.clientSessions === true,
    sessionId,
    text: text.slice(0, 40),
  }
  // 客户端已经用 session.prompt 发进会话了：只登记「等它的回话」，不进队列
  if (delivered) {
    if (sessionId !== '') notes.awaiting.add(sessionId)
    sendJson(res, 200, { ok: true, delivered: true, ...notesSnapshot(notes, noteMode) })
    return
  }
  if (text === '' || text.length > NOTE_MAX_CHARS) {
    sendJson(res, 400, { ok: false, error: `便条要 1~${NOTE_MAX_CHARS} 个字` })
    return
  }
  if (noteMode !== 'inject') {
    // 预览：只在屋子里说，不进队列
    notes.preview += 1
    sendJson(res, 200, { ok: true, pending: notes.queue.length, mode: 'preview', ...notesSnapshot(notes, noteMode) })
    return
  }
  const result = queueNote(notes, text)
  if (!result.ok) {
    sendJson(res, 400, result)
    return
  }
  sendJson(res, 200, { ok: true, pending: result.pending, ...notesSnapshot(notes, noteMode) })
}

/* ---------------------------------------------------------------------------
 * DSH 会话活动聚合
 *
 * 目标：让家园「看见」真实的 DSH 会话——有几个在跑、今天调了多少工具、有没有出错。
 * 只存内存：这是「活动」不是「存档」，重启清零才符合语义。
 * ------------------------------------------------------------------------- */

const ACTIVITY_RECENT_MAX = 24

function createActivity() {
  return {
    startedAt: Date.now(),
    lastAt: 0,
    sessions: new Set(),
    running: new Set(),
    counters: { messages: 0, tools: 0, errors: 0, workflows: 0, subagents: 0 },
    recent: [],
  }
}

function noteActivity(activity, kind, detail) {
  const now = Date.now()
  activity.lastAt = now
  activity.recent.push({ at: now, kind, detail: typeof detail === 'string' ? detail.slice(0, 120) : '' })
  if (activity.recent.length > ACTIVITY_RECENT_MAX) activity.recent.splice(0, activity.recent.length - ACTIVITY_RECENT_MAX)
}

function sessionIdOf(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    for (const key of ['sessionId', 'id', 'session']) {
      if (typeof value[key] === 'string' && value[key] !== '') return value[key]
    }
  }
  return ''
}

/** 事件名 → 更新聚合状态。全部用 emit 模式事件，不做 waterfall 干预。 */
function activityListeners(activity, notes) {
  const entries = [
    ['api-session/added', (summary) => {
      const id = sessionIdOf(summary)
      if (id) {
        activity.sessions.add(id)
        const title = summary && typeof summary === 'object' && typeof summary.title === 'string' ? summary.title : ''
        rememberSession(notes, id, { label: title, lastAt: Date.now() })
        noteTarget(notes, id)
      }
      noteActivity(activity, 'session-start', '')
    }],
    ['api-session/removed', (sessionId) => {
      const id = sessionIdOf(sessionId)
      if (id) {
        activity.sessions.delete(id)
        activity.running.delete(id)
        notes.sessions.delete(id)
        notes.sessionRefs.delete(id)
        // 目标会话被关掉了，便条不再有去处；手动指定的也一并清掉
        if (notes.target === id) notes.target = null
        if (notes.pinned === id) notes.pinned = ''
        notes.awaiting.delete(id)
        if (notes.lastReply && notes.lastReply.sessionId === id) notes.lastReply = null
      }
      noteActivity(activity, 'session-end', '')
    }],
    ['api-session/status', (sessionId, running) => {
      const id = sessionIdOf(sessionId)
      if (!id) return
      if (running) {
        activity.running.add(id)
        noteTarget(notes, id)
      } else {
        activity.running.delete(id)
      }
      rememberSession(notes, id, { running: !!running })
      noteActivity(activity, running ? 'running' : 'idle', '')
    }],
    ['api-session/error', (sessionId, message) => {
      activity.counters.errors += 1
      noteActivity(activity, 'error', message)
    }],
    ['api-session/activity', (sessionId) => {
      activity.counters.messages += 1
      // 用户在某个会话里发了消息 → 那个会话就是「当前会话」
      noteTarget(notes, sessionIdOf(sessionId))
      noteActivity(activity, 'message', '')
    }],
    ['agent/status', (payload) => {
      const id = sessionIdOf(payload && payload.agent)
      if (id) rememberSession(notes, id, { running: (payload && payload.status) === 'running' })
      const status = payload && payload.status
      if (id && (status === 'running' || status === 'idle')) {
        if (status === 'running') {
          activity.running.add(id)
          noteTarget(notes, id)
        } else {
          activity.running.delete(id)
        }
      }
    }],
    ['agent/inbox/inserted', (payload) => {
      activity.counters.messages += 1
      const id = sessionIdOf(payload && payload.agent)
      const title = titleFromMessage(payload && payload.message)
      if (id && title) setSessionTitle(notes, id, title)
      noteActivity(activity, 'message', '')
    }],
    ['session/created', (session) => {
      const id = sessionIdOf(session)
      if (!id) return
      rememberSession(notes, id, {})
      // 存一份引用：之后可以用 deriveMessages() 把历史第一条用户消息挖出来
      if (session && typeof session === 'object') notes.sessionRefs.set(id, session)
    }],
    ['session/event', (session, event) => {
      const id = sessionIdOf(session)
      if (!id || !event || !event.data) return
      // 1) 会话自己记的标题最权威（改名 / 自动标题都会落成带 title 的事件）
      if (typeof event.data.title === 'string' && event.data.title.trim() !== '') {
        setSessionTitle(notes, id, event.data.title.trim(), true)
        return
      }
      // 2) 助手回复：如果这个会话正在等便条的回话，就把这句话捞出来给屋里显示
      if (event.type === 'assistant/message') {
        const raw = event.data
        const message = raw && typeof raw === 'object' && raw.message ? raw.message : raw
        const text = textFromAssistant(message)
        if (text && notes.awaiting.has(id)) {
          notes.awaiting.delete(id)
          notes.lastReply = { at: Date.now(), sessionId: id, text }
        }
        return
      }
      // 3) 退而求其次：第一条「像人写的」用户消息
      if (event.type !== 'user/message') return
      const title = titleFromMessage(event.data)
      if (title) setSessionTitle(notes, id, title)
    }],
    ['agent/error', (payload) => {
      activity.counters.errors += 1
      const error = payload && payload.error
      noteActivity(activity, 'error', error && error.message ? error.message : '')
    }],
    ['tools/result', (exec) => {
      activity.counters.tools += 1
      const name = exec && exec.name ? String(exec.name) : ''
      noteActivity(activity, 'tool', name)
    }],
    ['subagent/start', () => {
      activity.counters.subagents += 1
      noteActivity(activity, 'subagent', '')
    }],
    ['workflow/start', () => {
      activity.counters.workflows += 1
      noteActivity(activity, 'workflow', '')
    }],
  ]
  return entries
}

/** 给面板的快照：只暴露计数，不暴露会话内容 */
function activitySnapshot(activity, notes, mode) {
  const now = Date.now()
  return {
    ok: true,
    now,
    running: activity.running.size,
    sessions: activity.sessions.size,
    counters: { ...activity.counters },
    recent: activity.recent.slice(-8),
    startedAt: activity.startedAt,
    lastAt: activity.lastAt,
    // 已经静默多久（前端判断"还在忙吗"）
    idleMs: activity.lastAt > 0 ? now - activity.lastAt : -1,
    notes: notes ? notesSnapshot(notes, mode) : undefined,
  }
}
