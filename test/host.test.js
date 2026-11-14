/**
 * Host 半自测：用假 ctx 注册路由，再用假 req/res 打一遍。
 * 运行： node test/host.test.js
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_FISHHOME_NO_SPAWN = '1'
import { apply } from '../index.js'

const saveDir = await mkdtemp(path.join(os.tmpdir(), 'fishhome-test-'))

const routes = []
const fakeInner = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  effect(fn) {
    return fn()
  },
}
const ctx = {
  inject(deps, callback) {
    assert.deepEqual(deps, ['webServer'])
    callback(fakeInner)
  },
  effect(fn) {
    return fn()
  },
}

apply(ctx, { saveDir, characterName: '测试鱼', tickSeconds: 7 })
assert.equal(routes.length, 1)
const route = routes[0]
assert.equal(route.kind, 'prefix')
assert.equal(route.path, '/fishhome')

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body === undefined ? '' : String(body)
      this.headersSent = true
    },
  }
  return res
}

function makeReq(url, method = 'GET', body = '') {
  const chunks = body === '' ? [] : [Buffer.from(body)]
  return {
    url,
    method,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

async function call(url, method = 'GET', body = '') {
  const res = makeRes()
  await route.handler(makeReq(url, method, body), res)
  return res
}

// 打开配置文件：只认 data/ pack/ save/ 三类前缀，其它一律拒绝
{
  const openScene = await call('/fishhome/api/open', 'POST', JSON.stringify({ kind: 'file', path: 'data/maps/living/scene.json' }))
  assert.equal(openScene.statusCode, 200, '可以打开场景文件')
  assert.equal(JSON.parse(openScene.body).dryRun, true, '测试模式不真的打开')

  const openPack = await call('/fishhome/api/open', 'POST', JSON.stringify({ kind: 'folder', path: 'pack' }))
  assert.equal(openPack.statusCode, 200, '可以打开目录')

  const revealSave = await call('/fishhome/api/open', 'POST', JSON.stringify({ kind: 'reveal', path: 'save' }))
  assert.equal(revealSave.statusCode, 200, '存档目录可以定位')

  for (const bad of ['../index.js', '/etc/passwd', 'data/../../index.js', 'nope/x.json', '']) {
    const res = await call('/fishhome/api/open', 'POST', JSON.stringify({ kind: 'file', path: bad }))
    assert.ok(res.statusCode === 400 || res.statusCode === 404, `非法路径被拒绝：${bad}`)
  }
  const badKind = await call('/fishhome/api/open', 'POST', JSON.stringify({ kind: 'delete-all', path: 'data' }))
  assert.equal(badKind.statusCode, 400, '不认识的打开方式被拒绝')
  const wrongMethod = await call('/fishhome/api/open', 'GET')
  assert.equal(wrongMethod.statusCode, 405, '只允许 POST')
}

const meta = await call('/fishhome/api/meta')
assert.equal(meta.statusCode, 200)
const metaJson = JSON.parse(meta.body)
assert.equal(metaJson.ok, true)
assert.equal(typeof metaJson.pack.id, 'string')
assert.ok(metaJson.pack.id.length > 0)
assert.equal(metaJson.characterName, '测试鱼')
assert.equal(metaJson.tickSeconds, 7)
assert.equal(metaJson.saveDir, saveDir)

const pet = await call('/fishhome/pack/pet.json')
assert.equal(pet.statusCode, 200)
assert.equal(JSON.parse(pet.body).id, metaJson.pack.id)

const png = await call('/fishhome/pack/chibi.png')
assert.equal(png.statusCode, 200)
assert.equal(png.headers['content-type'], 'image/png')

const traversal = await call('/fishhome/pack/..%2Findex.js')
assert.equal(traversal.statusCode, 404)

const missing = await call('/fishhome/pack/nope.png')
assert.equal(missing.statusCode, 404)

// 场景定义：允许子目录，仍然挡穿越与非白名单扩展名
const sceneFile = await call('/fishhome/data/maps/bedroom/scene.json')
assert.equal(sceneFile.statusCode, 200)
assert.equal(JSON.parse(sceneFile.body).id, 'bedroom')
assert.equal(sceneFile.headers['cache-control'], 'no-store')

const bgFile = await call('/fishhome/data/maps/bedroom/background.json')
assert.equal(bgFile.statusCode, 200)
assert.equal(JSON.parse(bgFile.body).layers.length, 3)

// 家具定义：一件一个文件
const sceneJson = JSON.parse(sceneFile.body)
assert.ok(Array.isArray(sceneJson.furniture) && sceneJson.furniture.length > 0)
for (const id of sceneJson.furniture) {
  const def = await call(`/fishhome/data/maps/bedroom/furniture/${id}.json`)
  assert.equal(def.statusCode, 200, `missing furniture file: ${id}`)
  const parsed = JSON.parse(def.body)
  assert.ok(Array.isArray(parsed.parts) && parsed.parts.length > 0, `furniture ${id} has no parts`)
  for (const part of parsed.parts) assert.equal(typeof part.z, 'number', `furniture ${id} part without z`)
}

const bedDef = await call('/fishhome/data/maps/bedroom/furniture/bed.json')
const bedParts = JSON.parse(bedDef.body).parts
assert.ok(bedParts.length >= 2, '床应该有「铺好 / 睡着」两种状态')
assert.ok(bedParts.every((part) => typeof part.sprite.src === 'string'))

// 一件家具可以有多个互动动画（沙发：坐着 / 躺着）
const sofaDef = JSON.parse((await call('/fishhome/data/maps/living/furniture/sofa.json')).body)
assert.ok(Array.isArray(sofaDef.animations) && sofaDef.animations.length >= 2, 'sofa 应该能坐也能躺')
const sofaIds = sofaDef.animations.map((a) => a.id)
assert.ok(sofaIds.includes('sit') && sofaIds.includes('lie'), `sofa 动画应有 sit / lie，实际 ${JSON.stringify(sofaIds)}`)
assert.ok(sofaDef.animations.every((a) => Array.isArray(a.pivot)), '每个动画都要带 pivot（没写用 0 也行，但要显式）')

// 门（click.type === "scene"）必须指向一个存在的场景
const indexRes = await call('/fishhome/data/maps/index.json')
const knownMaps = JSON.parse(indexRes.body).maps
const livingSceneData = JSON.parse((await call('/fishhome/data/maps/living/scene.json')).body)
const livingDefs = await Promise.all(livingSceneData.furniture.map(async (id) => JSON.parse((await call(`/fishhome/data/maps/living/furniture/${id}.json`)).body)))
const doors = livingDefs.filter((def) => def.click && def.click.type === 'scene')
for (const door of doors) {
  assert.ok(knownMaps.includes(door.click.id), `门 ${door.id} 指向的场景 ${door.click.id} 不在 index.json 里`)
}

// 窗户由多个部件拼成：天空（按时段）+ 框 + 杆 + 窗帘（按开关）
const winDef = JSON.parse((await call('/fishhome/data/maps/living/furniture/living_window.json')).body)
const winParts = winDef.parts || []
assert.ok(winParts.some((x) => x.id === 'frame'), '窗户要有框')
// 窗帘自带的杆子压在窗框上沿，所以不再单独画 rod
assert.ok(!winParts.some((x) => x.id === 'rod'), '不再单独画窗帘杆（帘子自带）')
const skies = winParts.filter((x) => x.id.startsWith('sky-'))
assert.ok(skies.length >= 2, '天空至少两个时段变体')
for (const sky of skies) assert.ok(sky.visibleWhen && Array.isArray(sky.visibleWhen.period), '天空要按时段切换')
const curtains = winParts.filter((x) => x.id.startsWith('curtain'))
assert.ok(curtains.some((x) => x.visibleWhen && x.visibleWhen.state && x.visibleWhen.state.curtainBlueClosed === false), '蓝帘拉开状态')
assert.ok(curtains.some((x) => x.visibleWhen && x.visibleWhen.state && x.visibleWhen.state.curtainBlueClosed === true), '蓝帘拉上状态')
assert.ok(curtains.some((x) => x.visibleWhen && x.visibleWhen.state && x.visibleWhen.state.curtainWhiteClosed === false), '白纱拉开状态')
assert.ok(curtains.some((x) => x.visibleWhen && x.visibleWhen.state && x.visibleWhen.state.curtainWhiteClosed === true), '白纱拉上状态')
// 不管哪种状态，蓝帘都必须在白纱上面
const blueZ = curtains.filter((x) => /blue/.test(x.id)).map((x) => Number(x.z) || 0)
const whiteZ = curtains.filter((x) => /white/.test(x.id)).map((x) => Number(x.z) || 0)
assert.ok(Math.min(...blueZ) > Math.max(...whiteZ), '蓝帘始终压在白纱上面（蓝在最上层）')
assert.ok(blueZ.every((z) => z > Number(winParts.find((x) => x.id === 'frame').z)), '窗帘在窗框之上')
assert.ok(winDef.surface && winDef.surface.attach === 'wallRight', '整扇窗贴在右墙（surface）')
// 贴面由 surface 统一声明，部件本身不再各写 attach，保证「先排位置再整体切变」
assert.ok(winParts.every((x) => !x.sprite || x.sprite.attach === undefined), '部件不单独写 attach')

// 墙纸按面设置：每面墙自己带 tile.art，两面可以不一样
const livingBg = JSON.parse((await call('/fishhome/data/maps/living/background.json')).body)
const wallLayers = (livingBg.layers || []).filter((x) => x.kind === 'wall')
assert.equal(wallLayers.length, 2, '客厅有两面墙')
for (const wall of wallLayers) {
  assert.ok(wall.tile && typeof wall.tile.art === 'string', `${wall.id} 要有自己的墙纸`)
  assert.notEqual(wall.tile.art, 'wall-whale.png', `${wall.id} 换成了新墙纸`)
}
assert.notEqual(wallLayers[0].tile.art, wallLayers[1].tile.art, '两面墙用的是不同墙纸')

// 家具动画/点击里引用的事件必须真的存在（曾经写了 sofa_doze 这种幽灵事件）
for (const map of ['bedroom', 'living', 'garden']) {
  const sceneData = JSON.parse((await call(`/fishhome/data/maps/${map}/scene.json`)).body)
  const ids = new Set()
  for (const evId of sceneData.events || []) {
    const ev = JSON.parse((await call(`/fishhome/data/maps/${map}/events/${evId}.json`)).body)
    ids.add(ev.id)
  }
  for (const defId of sceneData.furniture || []) {
    const def = JSON.parse((await call(`/fishhome/data/maps/${map}/furniture/${defId}.json`)).body)
    if (def.click && def.click.type === 'event') {
      assert.ok(ids.has(def.click.id), `${map}/${defId} 点击引用的事件 ${def.click.id} 不存在`)
    }
    for (const anim of def.animations || []) {
      if (typeof anim.event !== 'string') continue
      assert.ok(ids.has(anim.event), `${map}/${defId} 动画 ${anim.id} 引用的事件 ${anim.event} 不存在`)
    }
  }
}

// 场景清单：至少要能看到 bedroom
const mapsRes = await call('/fishhome/api/maps')
assert.equal(mapsRes.statusCode, 200, 'api/maps should respond')
const mapList = JSON.parse(mapsRes.body).maps
assert.ok(Array.isArray(mapList) && mapList.includes('bedroom'), `maps should include bedroom, got ${JSON.stringify(mapList)}`)

// 第二个场景（客厅）：scene.json 能读到，家具都带 click（否者点不动）
const livingScene = await call('/fishhome/data/maps/living/scene.json')
assert.equal(livingScene.statusCode, 200, 'living scene should be served')
const living = JSON.parse(livingScene.body)
assert.ok(living.room.camera && living.room.camera.mode === 'follow', 'living should scroll its camera')
for (const id of living.furniture) {
  const def = JSON.parse((await call(`/fishhome/data/maps/living/furniture/${id}.json`)).body)
  assert.ok(def.click && (def.click.id || def.click.key), `living furniture ${id} 需要 click 才能点`)
}

// 角色动作目录（一层子目录）：index.json 和单个动作都能读到
const actionIndex = await call('/fishhome/pack/actions/index.json')
assert.equal(actionIndex.statusCode, 200, 'actions/index.json should be served')
const actionNames = JSON.parse(actionIndex.body).actions
assert.ok(actionNames.includes('idle'), `actions should include idle, got ${JSON.stringify(actionNames)}`)
const oneAction = await call(`/fishhome/pack/actions/${actionNames[0]}.json`)
assert.equal(oneAction.statusCode, 200, '单个动作文件要能取到')
assert.ok(Array.isArray(JSON.parse(oneAction.body).frames), '动作文件要有 frames')
const traversalPack = await call('/fishhome/pack/actions/..%2Fpet.json')
assert.equal(traversalPack.statusCode, 404, 'actions 目录不允许 .. 穿越')

// 角色包里的图片清单（编辑器换图用）
const packFiles = await call('/fishhome/api/pack-files')
assert.equal(packFiles.statusCode, 200)
const packList = JSON.parse(packFiles.body).files
assert.ok(packList.includes(bedParts[0].sprite.src), 'pack file list should contain the bed sprite')
// 家具引用的每一张图都必须真的在包里
for (const id of sceneJson.furniture) {
  const def = JSON.parse((await call(`/fishhome/data/maps/bedroom/furniture/${id}.json`)).body)
  for (const part of def.parts || []) {
    if (part.sprite && typeof part.sprite.src === 'string') {
      assert.ok(packList.includes(part.sprite.src), `${id} 引用了包里没有的图：${part.sprite.src}`)
    }
  }
}
assert.ok(packList.every((name) => /\.(png|webp|jpe?g|gif)$/i.test(name)), 'only images should be listed')

// 事件表：一件一个文件
for (const id of ['idle', 'sleep', 'nap']) {
  const ev = await call(`/fishhome/data/maps/bedroom/events/${id}.json`)
  assert.equal(ev.statusCode, 200)
  assert.equal(JSON.parse(ev.body).id, id)
}

const dataTraversal = await call('/fishhome/data/%2e%2e/index.js')
assert.equal(dataTraversal.statusCode, 404)
const dataScript = await call('/fishhome/data/maps/bedroom/scene.js')
assert.equal(dataScript.statusCode, 404)
const dataMissing = await call('/fishhome/data/maps/nope/scene.json')
assert.equal(dataMissing.statusCode, 404)

// 编辑器写回：POST .json 落盘，非 .json 与非法 JSON 拒绝
const writePath = '/fishhome/data/maps/bedroom/furniture/_write_test.json'
const wrote = await call(writePath, 'POST', JSON.stringify({ id: '_write_test', parts: [{ id: 'p', z: 7 }] }))
assert.equal(wrote.statusCode, 200)
const readBack = await call(writePath)
assert.equal(JSON.parse(readBack.body).parts[0].z, 7)
const badJson = await call(writePath, 'POST', '{oops')
assert.equal(badJson.statusCode, 400)
const writePng = await call('/fishhome/data/maps/bedroom/furniture/_x.png', 'POST', '{}')
assert.equal(writePng.statusCode, 400)

// 删除：DELETE .json 真的删掉，再读 404；删不存在的也是 404
const deleted = await call(writePath, 'DELETE')
assert.equal(deleted.statusCode, 200)
const afterDelete = await call(writePath)
assert.equal(afterDelete.statusCode, 404)
const deleteMissing = await call('/fishhome/data/maps/bedroom/furniture/_nope.json', 'DELETE')
assert.equal(deleteMissing.statusCode, 404)
const deletePng = await call('/fishhome/data/maps/bedroom/furniture/_x.png', 'DELETE')
assert.equal(deletePng.statusCode, 400)

const empty = await call('/fishhome/api/state')
assert.equal(empty.statusCode, 200)
assert.equal(JSON.parse(empty.body).state, null)

const goodState = {
  kind: 'fishhome-state',
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  characterName: '测试鱼',
  world: { props: {} },
  character: { energy: 50 },
  log: [],
}
const saved = await call('/fishhome/api/state', 'POST', JSON.stringify(goodState))
assert.equal(saved.statusCode, 200)
assert.equal(JSON.parse(saved.body).ok, true)

const onDisk = JSON.parse(await readFile(path.join(saveDir, 'state.json'), 'utf8'))
assert.equal(onDisk.kind, 'fishhome-state')

const loaded = await call('/fishhome/api/state')
assert.equal(JSON.parse(loaded.body).state.character.energy, 50)

const bad = await call('/fishhome/api/state', 'POST', JSON.stringify({ hello: 1 }))
assert.equal(bad.statusCode, 400)

const notJson = await call('/fishhome/api/state', 'POST', '{oops')
assert.equal(notJson.statusCode, 400)

const wrongMethod = await call('/fishhome/api/meta', 'PUT')
assert.equal(wrongMethod.statusCode, 404)

const outside = await call('/elsewhere')
assert.equal(outside.statusCode, 404)

await rm(saveDir, { recursive: true, force: true })
console.log('host tests passed:', { routes: routes.length, pack: metaJson.pack.id })
