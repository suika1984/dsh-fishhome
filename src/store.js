    /* ======================================================================
     * 4. 存档适配：Host 文件优先，localStorage 兜底
     * ==================================================================== */

    async function fetchJson(url, init) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller ? controller.signal : undefined,
          headers: { accept: 'application/json', ...(init && init.headers ? init.headers : {}) },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    async function readSave() {
      try {
        const payload = await fetchJson(`${ROUTE}/api/state`)
        if (payload && payload.state) return payload.state
        if (payload && payload.corrupt) return readLocalSave()
      } catch {
        return readLocalSave()
      }
      return readLocalSave()
    }

    function readLocalSave() {
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && parsed.kind === 'fishhome-state' ? parsed : null
      } catch {
        return null
      }
    }

    function writeLocalSave(home) {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(home))
      } catch {
        /* 存不进去就只留内存状态 */
      }
    }

    /**
 * 角色动作：优先读角色包里的 actions/ 目录（一个动作一个文件 + index.json），
 * 没有就退回整张 animations.json（老格式）。
 */
async function loadCharacterActions(pack) {
  // 素材会被同名覆盖，用角色包版本号做缓存戳，换图后不用清浏览器缓存
  const stamp = pack && typeof pack.version === 'string' && pack.version !== '' ? `?v=${encodeURIComponent(pack.version)}` : ''
  try {
    const index = await fetchJson(`${ROUTE}/pack/actions/index.json${stamp}`)
    const names = Array.isArray(index && index.actions) ? index.actions : []
    const list = []
    for (const name of names) {
      if (typeof name !== 'string' || name === '') continue
      try {
        const action = await fetchJson(`${ROUTE}/pack/actions/${encodeURIComponent(name)}.json${stamp}`)
        if (!action || !Array.isArray(action.frames) || action.frames.length === 0) continue
        list.push({
          id: `action:${action.id || name}`,
          name: action.name || action.id || name,
          tags: Array.isArray(action.tags) ? action.tags : [action.id || name],
          // 动作可以自带显示格（图纸格子比例不同时用），必须带下去
          cell: Array.isArray(action.cell) && action.cell.length >= 2 ? action.cell : undefined,
          version: stamp ? stamp.slice(3) : undefined,
          scale: Number(action.scale) > 0 ? Number(action.scale) : undefined,
          randomStart: action.randomStart === true ? true : undefined,
          hold: action.hold === true ? true : undefined,
          groupSize: Number(action.groupSize) > 1 ? Number(action.groupSize) : undefined,
          bubble: action.bubble && typeof action.bubble === 'object' ? action.bubble : undefined,
          frames: action.frames.map((frame) => ({
            asset: frame.asset || action.asset || 'sheet',
            rect: frame.rect,
            durationMs: frame.durationMs,
            squash: Number(frame.squash) > 0 ? Number(frame.squash) : 0,
          })),
        })
      } catch {
        /* 单个动作坏了跳过 */
      }
    }
    if (list.length > 0) return list
  } catch {
    /* 没有 actions 目录，走老格式 */
  }
  try {
    const animationsFile = encodeURIComponent((pack && pack.animations) || 'animations.json')
    const animations = await fetchJson(`${ROUTE}/pack/${animationsFile}${stamp}`)
    return Array.isArray(animations) ? animations : []
  } catch {
    return []
  }
}

async function writeSave(home) {
      writeLocalSave(home)
      try {
        const response = await fetch(`${ROUTE}/api/state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(home),
        })
        return response.ok
      } catch {
        return false
      }
    }

    /* ======================================================================
     * 5. HomeStore：把模型、存档和订阅串起来
     * ==================================================================== */

    /** 素材图 rect 的指纹：同尺寸的多个 part（不同状态）视为一组 */
    function spriteRectSignature(sprite) {
      return Array.isArray(sprite && sprite.rect) ? sprite.rect.map(Number).join(",") : ""
    }

    /** 事件表的默认清单（scene.json 没写 events 时用） */
    const EVENT_IDS = ['idle', 'read', 'work', 'window', 'play', 'stretch', 'snack', 'nap', 'sleep']

    /** 深拷贝（场景数据都是纯 JSON，没有函数/循环引用） */
    function cloneJson(value) {
      return value === undefined ? value : JSON.parse(JSON.stringify(value))
    }

    class HomeStore {
      constructor() {
        this.home = null
        this.meta = null
        this.animations = null
        this.packViews = null
        this.phase = 'loading'
        this.error = null
        this.sceneWarning = null
        this.saveState = 'idle'
        this.mapPath = null
        this.furnitureSource = null
        this.sceneDoc = null
        this.sceneSource = null
        this.sceneDirty = false
        this.removedFurniture = []
      this.history = []
      this.historyKey = ''
      this.historyAt = 0
        this.listeners = new Set()
        this.timer = null
        this.saveTimer = null
        this.saving = false
        this.pendingSave = false
        this.snapshot = {
          phase: 'loading',
          error: null,
          home: null,
          now: Date.now(),
          meta: null,
          views: null,
          saveState: 'idle',
          lastSavedAt: 0,
        }
      }

      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }

      getSnapshot() {
        return this.snapshot
      }

      publish() {
        this.snapshot = {
          phase: this.phase,
          error: this.error,
          home: this.home,
          now: Date.now(),
          meta: this.meta,
          views: this.packViews,
          saveState: this.saveState,
          lastSavedAt: this.lastSavedAt || 0,
        }
        for (const listener of this.listeners) listener(this.snapshot)
      }

      start() {
        if (this.timer !== null) return
        this.timer = setInterval(() => this.tick(), TICK_MS)
        void this.boot()
      }

      stop() {
        if (this.timer !== null) clearInterval(this.timer)
        if (this.saveTimer !== null) clearTimeout(this.saveTimer)
        this.timer = null
        this.saveTimer = null
        if (this.home) void writeSave(this.home)
      }

      async boot() {
        this.phase = 'loading'
        this.error = null
        this.publish()
        try {
          const meta = await fetchJson(`${ROUTE}/api/meta`)
          if (!meta || !meta.ok) throw new Error('家园服务没有响应')
          this.meta = meta
          // 先读存档：优先打开「她所在的场景」，其次才是上次看的场景
          const savedEarly = await readSave()
          const herMap = savedEarly && savedEarly.world && typeof savedEarly.world.map === 'string' ? savedEarly.world.map : ''
          const remembered = this.currentMap()
          meta.map = herMap || remembered || meta.map
          // mapPath 也要跟着改，否则 Host 给的还是配置里的默认场景
          meta.mapPath = `maps/${meta.map}/scene.json`
          await this.loadScene(meta)
          // 角色包缺失不拦启动：角色会画成占位块，方便先调房间和逻辑
          if (meta.pack) {
            this.animations = await loadCharacterActions(meta.pack)
            this.packWarning = null
          } else {
            this.animations = []
            this.packWarning = '角色包没有就绪：角色先用占位块'
          }
          this.packViews = this.buildViews()
          const saved = savedEarly
          const now = Date.now()
          this.home = normalizeHome(saved, now, meta.characterName)
          // 老存档没有 world.map：就认为她一直在当前场景
          if (!this.home.world.map) this.home.world.map = meta.map || 'bedroom'
          settleOffline(this.home, now)
          this.lastSavedAt = meta.savedAt || 0
          this.phase = 'ready'
          this.publish()
          this.scheduleSave()
        } catch (error) {
          this.phase = 'error'
          this.error = error instanceof Error ? error.message : String(error)
          this.publish()
        }
      }

      /**
       * 读场景定义（scene.json + background.json）。
       * 读不到就退回内置默认房间，不让整块面板挂掉。
       */
      /** 点门出门：切到另一个场景（她自己留不留下由 bringPetHere 决定） */
      async gotoScene(mapId) {
        if (typeof mapId !== 'string' || mapId === '') return false
        await this.setMap(mapId)
        return true
      }

      /** 当前场景 id（localStorage 记住，下次打开还是它） */
      currentMap() {
        try {
          const saved = window.localStorage.getItem(`${LS_KEY}:map`)
          if (typeof saved === 'string' && saved !== '') return saved
        } catch {
          /* 隐私模式忽略 */
        }
        return ''
      }

      /** 切场景：重新拉 scene/background/furniture/events */
      async setMap(mapId) {
        if (typeof mapId !== 'string' || mapId === '') return false
        try {
          window.localStorage.setItem(`${LS_KEY}:map`, mapId)
        } catch {
          /* 忽略 */
        }
        // 注意：这里只换「你在看哪」，不改变 home.world.map——她留在原地
        this.history = []
        await this.loadScene({ map: mapId })
        // meta 也更新一份，面板上的场景下拉才会跟着变
        this.meta = { ...(this.meta || {}), map: mapId, mapPath: `maps/${mapId}/scene.json` }
        this.publish()
        return true
      }

      /** data/maps 下有哪些场景（Host 提供；老版本 Host 没有这个接口就只会返回当前场景） */
      async loadMaps() {
        try {
          const data = await fetchJson(`${ROUTE}/api/maps`)
          if (Array.isArray(data && data.maps) && data.maps.length > 0) return data.maps
        } catch {
          /* 老 Host 没有这个接口 */
        }
        // 退回数据文件：data/maps/index.json（不用重启 Host 也能切场景）
        try {
          const fallback = await fetchJson(`${ROUTE}/data/maps/index.json`)
          if (Array.isArray(fallback && fallback.maps) && fallback.maps.length > 0) return fallback.maps
        } catch {
          /* 也没有就只显示当前场景 */
        }
        return []
      }

      async loadScene(meta) {
        const mapPath = typeof meta.mapPath === 'string' && meta.mapPath !== ''
          ? meta.mapPath
          : `maps/${typeof meta.map === 'string' && meta.map !== '' ? meta.map : 'bedroom'}/scene.json`
        this.mapPath = mapPath
        try {
          const scene = await fetchJson(`${ROUTE}/data/${mapPath}`)
          applyScene(scene)
          // 如果加载的正好是她所在的场景，记住名字（切到别的房间时用来提示）
          if (this.home && this.home.world && scene && scene.id === this.home.world.map) {
            this.home.world.mapName = (scene.name && (scene.name.zh || scene.name.en)) || scene.id
          }
          const bgFile = scene && typeof scene.background === 'string' && scene.background !== ''
            ? scene.background
            : 'background.json'
          const bgPath = resolveDataPath(mapPath, bgFile)
          const bg = await fetchJson(`${ROUTE}/data/${bgPath}`)
          applyBackground(bg)
          // 家具：一件一个文件，坏了一件就跳过，不影响其它
          const list = scene && Array.isArray(scene.furniture) ? scene.furniture : []
          const defs = await Promise.all(list.map(async (id) => {
            if (typeof id !== 'string' || id === '') return null
            try {
              return await fetchJson(`${ROUTE}/data/${resolveDataPath(mapPath, `furniture/${id}.json`)}`)
            } catch {
              return null
            }
          }))
          const loaded = defs.filter(Boolean)
          applyFurniture(loaded)
          this.furnitureSource = cloneJson(loaded)
          // 记住 scene.json 原文：增删家具要同步它的 furniture 清单
          this.sceneDoc = cloneJson(scene) || null
          this.sceneSource = cloneJson(scene) || null
          this.sceneDirty = false
          this.removedFurniture = []
          // 事件：同样一件一个文件；全读不到就用内置事件表
          const eventList = scene && Array.isArray(scene.events) && scene.events.length > 0
            ? scene.events
            : EVENT_IDS
          const eventDefs = await Promise.all(eventList.map(async (id) => {
            if (typeof id !== 'string' || id === '') return null
            try {
              return await fetchJson(`${ROUTE}/data/${resolveDataPath(mapPath, `events/${id}.json`)}`)
            } catch {
              return null
            }
          }))
          const loadedEvents = eventDefs.filter(Boolean)
          applyEvents(loadedEvents)
          this.eventsSource = cloneJson(loadedEvents)
          this.sceneWarning = null
        } catch (error) {
          applyScene(null)
          applyBackground(null)
          this.sceneWarning = error instanceof Error ? error.message : String(error)
        }
      }

      /* ---- 编辑器：改的是内存里的家具定义，保存才写盘 ---- */

      furnitureUrl(id) {
        return `${ROUTE}/data/${resolveDataPath(this.mapPath || 'maps/bedroom/scene.json', `furniture/${id}.json`)}`
      }

      /** 选中件的 part 拿一份深拷贝改完再整体替换，保证 React 能看出变化 */
      updatePart(defId, partId, mutate) {
        const defs = cloneJson(furnitureRef.value)
        const def = defs.find((item) => item.id === defId)
        if (!def) return false
        const part = def.parts.find((item) => (item.id || 'part') === partId)
        if (!part) return false
        mutate(part)
        applyFurniture(defs)
        this.publish()
        return true
      }

      /**
       * 同一件家具里的「状态变体」（比如书桌的关灯/开灯两张）在改位置、尺寸、角度、层级时
       * 要整组一起改，否则切换状态会跳。
       *
       * 分组规则（按优先级）：
       *   1. 显式写了 `sprite.group: "body"` → 同名 group 一起改（推荐，位置漂了也不会分家）
       *   2. 没写 group → 退回到「rect 完全一样」的旧判定
       *
       * build(target) 返回 { sprite?, part? }：按目标算出要写的值，
       * 整组都写同一份，所以即使某个变体之前漂了，改一次就对回一起。
       */
      applyToVariantGroup(defId, partId, build) {
        const defs = cloneJson(furnitureRef.value)
        const def = defs.find((item) => item.id === defId)
        if (!def) return false
        // partId === '*'：整件家具一起改（拼出来的窗户/窗帘就是这么当一件拖的）
        if (partId === '*') {
          this.pushHistory(`${defId}:*`)
          for (const part of def.parts) {
            const change = build(part)
            if (!change) continue
            if (change.part) Object.assign(part, change.part)
            if (change.sprite && part.sprite) Object.assign(part.sprite, change.sprite)
          }
          applyFurniture(defs)
          this.publish()
          return true
        }
        const target = def.parts.find((item) => (item.id || 'part') === partId)
        if (!target) return false
        const targetSprite = target.sprite
        const group = targetSprite && typeof targetSprite.group === 'string' ? targetSprite.group : ''
        const signature = targetSprite ? spriteRectSignature(targetSprite) : null
        const change = build(target)
        if (!change) return false
        this.pushHistory(`${defId}:${partId}`)
        const sameGroup = (part) => {
          if (part === target) return true
          if (!targetSprite || !part.sprite) return false
          const partGroup = typeof part.sprite.group === 'string' ? part.sprite.group : ''
          if (group !== '' && partGroup === group) return true
          if (group === '' && partGroup === '' && signature !== '' &&
            spriteRectSignature(part.sprite) === signature) return true
          return false
        }
        for (const part of def.parts) {
          if (!sameGroup(part)) continue
          if (change.part) Object.assign(part, change.part)
          if (change.sprite) {
            if (!part.sprite) continue
            Object.assign(part.sprite, change.sprite)
          }
        }
        applyFurniture(defs)
        this.publish()
        return true
      }

      /** 屏幕像素位移 → 素材图直接改 rect；preset 换算成地板 offset */
      movePart(defId, partId, dxPx, dyPx) {
        if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return false
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (part.sprite && Array.isArray(part.sprite.rect)) {
            const rect = part.sprite.rect.map(Number)
            return { sprite: { rect: [rect[0] + dxPx, rect[1] + dyPx, rect[2], rect[3]] } }
          }
          const fx = (dxPx / geom.kx + dyPx / geom.ky) / 2
          const fy = (dyPx / geom.ky - dxPx / geom.kx) / 2
          const offset = part.offset || { fx: 0, fy: 0 }
          return {
            part: {
              offset: {
                fx: Math.round(((Number(offset.fx) || 0) + fx) * 100) / 100,
                fy: Math.round(((Number(offset.fy) || 0) + fy) * 100) / 100,
              },
            },
          }
        })
      }

      movePartByGrid(defId, partId, dfx, dfy) {
        if (!Number.isFinite(dfx) || !Number.isFinite(dfy)) return false
        return this.updatePart(defId, partId, (part) => {
          const offset = part.offset || { fx: 0, fy: 0 }
          part.offset = {
            fx: Math.round(((Number(offset.fx) || 0) + dfx) * 100) / 100,
            fy: Math.round(((Number(offset.fy) || 0) + dfy) * 100) / 100,
          }
        })
      }

      bumpPartZ(defId, partId, delta) {
        return this.applyToVariantGroup(defId, partId, (part) => ({
          part: { z: (Number(part.z) || 0) + delta },
        }))
      }

      /* ---- 撤销 ---- */

      /** 改之前先拍一张快照；同一个物件 600ms 内的连续改动合并成一步（拖拽/长按方向键不会塞满历史） */
      pushHistory(key = '') {
        const now = Date.now()
        if (key && key === this.historyKey && now - this.historyAt < 600) {
          this.historyAt = now
          return
        }
        this.history.push({
          furniture: cloneJson(furnitureRef.value),
          removed: this.removedFurniture.slice(),
        })
        if (this.history.length > 60) this.history.shift()
        this.historyKey = key
        this.historyAt = now
      }

      canUndo() {
        return this.history.length > 0
      }

      /**
       * 用系统默认程序打开配置文件，或在资源管理器里定位。
       * target 形如 data/maps/living/scene.json、pack/pet.json、save/state.json
       */
      async openPath(kind, target) {
        const mode = kind === 'folder' || kind === 'reveal' ? kind : 'file'
        try {
          const payload = await fetchJson(`${ROUTE}/api/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: mode, path: target }),
          })
          return { ok: !!(payload && payload.ok), error: payload && payload.error ? String(payload.error) : '' }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }

      /** 回退一步：家具表、删除清单、scene 清单一起回滚 */
      undo() {        const snapshot = this.history.pop()
        if (!snapshot) return false
        this.historyKey = ''
        this.historyAt = 0
        this.removedFurniture = (snapshot.removed || []).slice()
        applyFurniture(snapshot.furniture)
        this.syncSceneFurniture(snapshot.furniture.map((def) => def.id))
        this.publish()
        return true
      }

      /* ---- 增删家具 ---- */

      /** scene.json 的 furniture 清单跟着内存里的家具表走 */
      syncSceneFurniture(ids) {
        if (!this.sceneDoc) return
        this.sceneDoc.furniture = ids.slice()
        this.sceneDirty = true
      }

      /** 新建一件家具：先给个占位块（没有图），选中后可以用「换图」换成素材 */
      addFurniture() {
        this.pushHistory('add')
        const defs = cloneJson(furnitureRef.value)
        let index = 1
        let id = `item-${index}`
        while (defs.some((def) => def.id === id)) {
          index += 1
          id = `item-${index}`
        }
        defs.push({
          id,
          name: { zh: '新家具', en: 'New item' },
          type: 'furniture',
          parts: [
            {
              id: 'body',
              z: 90,
              sprite: { rect: [430, 250, 160, 160] },
            },
          ],
        })
        this.removedFurniture = this.removedFurniture.filter((gone) => gone !== id)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return id
      }

      /** 复制一件家具：新 id 自动避让，精灵图往右前挪一格 */
      duplicateFurniture(defId) {
        const defs = cloneJson(furnitureRef.value)
        const source = defs.find((def) => def.id === defId)
        if (!source) return null
        this.pushHistory('duplicate')
        let index = 1
        let id = `${defId}-copy`
        while (defs.some((def) => def.id === id)) {
          index += 1
          id = `${defId}-copy${index}`
        }
        const copy = cloneJson(source)
        copy.id = id
        for (const part of copy.parts || []) {
          if (part.sprite && Array.isArray(part.sprite.rect)) {
            const rect = part.sprite.rect.map(Number)
            part.sprite.rect = [rect[0] + geom.kx, rect[1] + geom.ky, rect[2], rect[3]]
          } else {
            const offset = part.offset || { fx: 0, fy: 0 }
            part.offset = { fx: Math.round(((Number(offset.fx) || 0) + 1) * 100) / 100, fy: offset.fy || 0 }
          }
        }
        defs.push(copy)
        this.removedFurniture = this.removedFurniture.filter((gone) => gone !== id)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return id
      }

      /** 删除一件家具：先从内存里拿掉，保存时才真正删文件 */
      removeFurniture(defId) {
        this.pushHistory('remove')
        const defs = cloneJson(furnitureRef.value)
        const index = defs.findIndex((def) => def.id === defId)
        if (index < 0) return false
        defs.splice(index, 1)
        if (!this.removedFurniture.includes(defId)) this.removedFurniture.push(defId)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return true
      }

      /** 把当前家具定义逐件写回 data/（每件一个文件），并同步 scene.json / 删掉被移除的文件 */
      async saveFurniture() {
        const defs = furnitureRef.value
        let saved = 0
        for (const def of defs) {
          if (!def || typeof def.id !== 'string') continue
          const response = await fetch(this.furnitureUrl(def.id), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(def),
          })
          if (!response.ok) {
            throw new Error(`保存 ${def.id} 失败：HTTP ${response.status}`)
          }
          saved += 1
        }
        if (this.sceneDirty && this.sceneDoc) {
          const response = await fetch(`${ROUTE}/data/${this.mapPath || 'maps/bedroom/scene.json'}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(this.sceneDoc),
          })
          if (!response.ok) throw new Error(`保存 scene.json 失败：HTTP ${response.status}`)
          this.sceneSource = cloneJson(this.sceneDoc)
          this.sceneDirty = false
        }
        for (const gone of this.removedFurniture.splice(0)) {
          const response = await fetch(this.furnitureUrl(gone), { method: 'DELETE' })
          if (!response.ok && response.status !== 404) {
            throw new Error(`删除 ${gone} 失败：HTTP ${response.status}`)
          }
        }
        this.furnitureSource = cloneJson(defs)
        return saved
      }

      /** 放弃未保存的改动，回到上次读到的状态 */
      discardFurniture() {
        applyFurniture(cloneJson(this.furnitureSource || DEFAULT_FURNITURE))
        this.sceneDoc = cloneJson(this.sceneSource)
        this.sceneDirty = false
        this.removedFurniture = []
        this.publish()
      }

      /** 只对素材图有意义：绕支点转 deg 度 */
      rotatePart(defId, partId, deg) {
        if (!Number.isFinite(deg)) return false
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          const next = (Number(part.sprite.rotate) || 0) + deg
          return { sprite: { rotate: Math.round(next * 10) / 10 } }
        })
      }

      /** 平行四边形畸变：sprite.skew 存斜率（tan），0 = 正对镜头，0.375 = 跟墙/地平行 */
      setPartSkew(defId, partId, value) {
        const num = Number(value)
        if (!Number.isFinite(num)) return false
        const clamped = Math.max(-0.8, Math.min(0.8, num))
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { skew: Math.round(clamped * 1000) / 1000 } }
        })
      }

      /** 左右镜像 */
      flipPart(defId, partId) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { flipX: part.sprite.flipX !== true } }
        })
      }

      /** 改素材图的显示尺寸（底边保持不动） */
      resizePart(defId, partId, width, height) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite || !Array.isArray(part.sprite.rect)) return null
          const rect = part.sprite.rect.map(Number)
          const w = Math.max(8, Math.round(Number(width) || rect[2]))
          const hh = Math.max(8, Math.round(Number(height) || rect[3]))
          return { sprite: { rect: [rect[0], rect[1] + (rect[3] - hh), w, hh] } }
        })
      }

      /**
       * 换图：只换源、不动尺寸（尺寸自己用「尺寸」两个数字框调），
       * 这样换状态图不会把调好的大小重置掉。
       */
      setPartImage(defId, partId, src) {
        if (typeof src !== 'string' || src === '') return false
        return this.updatePart(defId, partId, (part) => {
          if (!part.sprite) return
          part.sprite.src = src
          if (!Array.isArray(part.sprite.rect)) part.sprite.rect = [320, 220, 200, 200]
        })
      }

      /** 角色包目录里能用哪些图（换图下拉框） */
      async loadPackFiles() {
        if (Array.isArray(this.packFiles)) return this.packFiles
        try {
          const data = await fetchJson(`${ROUTE}/api/pack-files`)
          this.packFiles = Array.isArray(data.files) ? data.files : []
        } catch {
          this.packFiles = []
        }
        return this.packFiles
      }

      /** 改称呼 / 自称 / 房间名：纯显示字段，立刻存档 */
      updateProfile(patch) {
        if (!this.home || !patch || typeof patch !== 'object') return false
        const clean = (value, fallback, max) => {
          if (typeof value !== 'string') return fallback
          const trimmed = value.trim().slice(0, max)
          return trimmed === '' ? fallback : trimmed
        }
        this.home.characterName = clean(patch.characterName, this.home.characterName, 12)
        this.home.selfName = clean(patch.selfName, this.home.selfName, 8)
        this.home.roomName = clean(patch.roomName, this.home.roomName, 16)
        this.home.userName = clean(patch.userName, this.home.userName, 8)
        this.publish()
        this.scheduleSave(600)
        return true
      }

      /** 改一个事件定义（内存里，保存才写盘） */
      updateEvent(id, raw) {
        if (!raw || typeof raw !== 'object') return false
        const list = cloneJson(BEHAVIORS)
        const index = list.findIndex((event) => event.id === id)
        if (index < 0) return false
        list[index] = { ...raw, id }
        applyEvents(list)
        this.publish()
        return true
      }

      /** 把事件表逐件写回 data/maps/<map>/events/*.json */
      async saveEvents() {
        let saved = 0
        for (const event of BEHAVIORS) {
          const response = await fetch(`${ROUTE}/data/${resolveDataPath(this.mapPath || 'maps/bedroom/scene.json', `events/${event.id}.json`)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
          })
          if (!response.ok) throw new Error(`保存事件 ${event.id} 失败：HTTP ${response.status}`)
          saved += 1
        }
        this.eventsSource = cloneJson(BEHAVIORS)
        return saved
      }

      buildViews() {
        const assets = (this.meta && this.meta.pack && this.meta.pack.assets) || {}
        const cell = this.meta && this.meta.pack ? this.meta.pack.canvas : null
        const animations = this.animations || []
        const views = {}
        // 先把每个动画声明的所有 tag 都构一遍（work45 / doze45 / lounge45 这类新动作就是这么进视图表的），
        // 否则 views[tag] 查不到就永远退回 idle
        for (const anim of animations) {
          const tags = Array.isArray(anim.tags) && anim.tags.length > 0 ? anim.tags : [anim.id]
          for (const tag of tags) {
            if (typeof tag !== 'string' || views[tag]) continue
            const view = buildAnimationView(animations, assets, tag, cell)
            if (view) views[tag] = view
          }
        }
        for (const tag of ['idle', 'walk', 'read', 'work', 'play', 'stretch', 'sleep']) {
          if (views[tag]) continue
          const view = buildAnimationView(animations, assets, tag, cell)
          if (view) views[tag] = view
        }
        if (!views.idle) {
          const fallback = buildAnimationView(animations, assets, 'idle', cell)
          if (fallback) views.idle = fallback
        }
        return views
      }

      tick() {
        if (this.phase !== 'ready' || !this.home) return
        const now = Date.now()
        const gap = now - this.home.updatedAt
        if (gap > OFFLINE_MIN_GAP_MS) {
          settleOffline(this.home, now)
        } else {
          stepHome(this.home, now)
          // 睡眠时也保持“当前行为”的可读性：行为本身在 stepHome 里切换
        }
        this.publish()
        this.scheduleSave()
      }

      scheduleSave(delayMs) {
        if (!this.home) return
        if (this.saveTimer !== null) return
        this.saveState = 'dirty'
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null
          void this.flushSave()
        }, delayMs === undefined ? SAVE_DEBOUNCE_MS : delayMs)
      }

      async flushSave() {
        if (!this.home) return
        if (this.saving) {
          this.pendingSave = true
          return
        }
        this.saving = true
        this.saveState = 'saving'
        this.publish()
        const ok = await writeSave(this.home)
        this.saving = false
        this.saveState = ok ? 'saved' : 'offline'
        if (ok) this.lastSavedAt = Date.now()
        if (this.pendingSave) {
          this.pendingSave = false
          this.scheduleSave(1200)
        }
        this.publish()
      }

      async reload() {
        if (this.phase === 'error') {
          void this.boot()
          return
        }
        try {
          const saved = await readSave()
          if (!saved) return
          const now = Date.now()
          this.home = normalizeHome(saved, now, this.meta ? this.meta.characterName : undefined)
          settleOffline(this.home, now)
          this.publish()
        } catch {
          /* 读不到就保持现状 */
        }
      }

      /* ---- 交互 ---- */

      toggleProp(key) {
        if (!this.home || !(key in DEFAULT_PROPS)) return
        const props = this.home.world.props
        props[key] = !props[key]
        const code = `${key}${props[key] ? 'On' : 'Off'}`
        pushLog(this.home, Date.now(), code, null)
        if (key === 'curtainOpen') {
          this.home.log[0].code = props[key] ? 'curtainOpen' : 'curtainClose'
        }
        this.publish()
        this.scheduleSave(1500)
      }

      /** 某个互动物在画面上的 x（用来决定往哪边偏头）。interact 的 target 和数据的 click 不是一套名字，这里做映射 */
      targetScreenX(target) {
        const aliases = {
          desk: ['work', 'desk'],
          work: ['work', 'desk'],
          bookshelf: ['read', 'shelf'],
          read: ['read', 'shelf'],
          window: ['window', 'curtainOpen'],
          curtain: ['curtainOpen', 'window'],
          bed: ['bed'],
          deskLamp: ['deskLamp', 'lamp'],
          bedLamp: ['bedLamp'],
          whale: ['play', 'whale'],
          play: ['play', 'whale'],
        }[target] || [target]
        for (const def of furnitureRef.value) {
          const click = def.click || {}
          const keys = [def.id, click.id, click.key].filter(Boolean)
          if (!keys.some((key) => aliases.includes(key))) continue
          const part = (def.parts || []).find((item) => item.sprite && Array.isArray(item.sprite.rect))
          if (part) return Number(part.sprite.rect[0]) + Number(part.sprite.rect[2]) / 2
        }
        return null
      }

      /** 角色当前站在画面的 x */
      characterScreenX() {
        const behavior = BEHAVIOR_BY_ID[this.home.character.behaviorId] || BEHAVIOR_BY_ID.idle
        const spot = SPOTS[behavior.spot] || SPOTS.center
        return project(spot.fx, spot.fy)[0]
      }

      /** 往 target 偏一下头（dir = 1 右 / -1 左） */
      leanToward(target) {
        const targetX = typeof target === 'number' ? target : this.targetScreenX(target)
        const selfX = this.characterScreenX()
        if (!Number.isFinite(targetX)) return
        const dir = targetX < selfX ? -1 : 1
        this.home.character.lean = { dir, until: Date.now() + 1200 }
        this.home.character.face = dir
      }

      /** 她当前所在的场景 id（存档里那个） */
      petScene() {
        return this.home && this.home.world ? this.home.world.map || '' : ''
      }

      /** 你正在看的场景 id */
      viewScene() {
        const sceneId = sceneRef.value && typeof sceneRef.value.id === 'string' ? sceneRef.value.id : ''
        return sceneId || (this.meta && this.meta.map) || ''
      }

      /**
       * 让大肥鱼到「你现在看的这个房间」来。
       * 手动切场景不会调用它（你只是去别的房间看了一眼）；互动或点名才会。
       */
      bringPetHere() {
        const view = this.viewScene()
        if (!view || !this.home || !this.home.world) return false
        if (this.home.world.map === view) return false
        this.home.world.map = view
        const name = sceneRef.value && sceneRef.value.name
        this.home.world.mapName = (name && (name.zh || name.en)) || view
        // 2 分钟内只记一次「她过来了」，避免连点几下刷屏
        const last = this.home.log && this.home.log[0]
        if (!last || last.code !== 'move' || Date.now() - last.at > 2 * 60 * 1000) {
          pushLog(this.home, Date.now(), 'move', null)
        }
        return true
      }

      interact(target, furnitureId) {
        if (!this.home) return
        // 你在这个房间点了东西 → 她过来（手动切场景不会触发）
        const moved = this.bringPetHere()
        const now = Date.now()
        if (target && target !== 'reset') this.leanToward(target)
        // 家具声明了多个互动动画时：每点一次按顺序切到下一个
        const def = typeof furnitureId === 'string'
          ? furnitureRef.value.find((item) => item && item.id === furnitureId)
          : null
        const cycle = def && Array.isArray(def.animations)
          ? def.animations.filter((item) => item && typeof item.event === 'string')
          : []
        if (cycle.length > 0) {
          const key = def.id
          const index = Number(this.cycleIndex && this.cycleIndex[key]) || 0
          const next = cycle[index % cycle.length]
          this.cycleIndex = this.cycleIndex || {}
          this.cycleIndex[key] = (index + 1) % cycle.length
          return this.forceBehavior(next.event)
        }
        const props = this.home.world.props
        if (target === 'desk' || target === 'work') return this.forceBehavior('work')
        if (target === 'bed') {
          const sleepy = this.home.character.energy < 42
          return this.forceBehavior(sleepy ? 'sleep' : 'nap')
        }
        if (target === 'window') return this.forceBehavior('window')
        if (target === 'bookshelf' || target === 'read') return this.forceBehavior('read')
        if (target === 'whale' || target === 'play') return this.forceBehavior('play')
        if (target === 'deskLamp') return this.toggleProp('deskLamp')
        if (target === 'bedLamp') return this.toggleProp('bedLamp')
        if (target === 'curtain') return this.toggleProp('curtainOpen')
        if (target === 'pat') {
          this.home.character.mood = Math.min(100, this.home.character.mood + 6)
          this.home.character.patCount += 1
          this.home.character.emote = { tag: 'stretch', until: now + 4200 }
          const quietPat = now - (Number(this.home.character.lastSaidAt) || 0)
          if (quietPat > 90 * 1000 || Math.random() < 0.45) {
            const n = 1 + Math.floor(Math.random() * 3)
            this.home.character.say = { code: `pat${n}`, text: null, until: now + 2600 }
            this.home.character.lastSaidAt = now
          }
          pushLog(this.home, now, 'pat', null)
          this.publish()
          this.scheduleSave(1500)
          return
        }
        // 任意事件 id 都能直接点（客厅的 watch_tv / cook / eat 走这里）
        if (typeof target === 'string' && BEHAVIOR_BY_ID[target]) {
          return this.forceBehavior(target)
        }
        // 任意开关（沙发旁的落地灯之类）：键名在 DEFAULT_PROPS 里就直接切换
        if (typeof target === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_PROPS, target)) {
          return this.toggleProp(target)
        }
        if (target === 'reset') {
          this.forceBehavior('idle')
        }
      }

      /** 用户请求：可能被拒绝。拒绝了就冒个气泡（动作沿用当前，除非事件里指定了 refuse.anim） */
      forceBehavior(id) {
        if (!this.home || !BEHAVIOR_BY_ID[id]) return false
        const behavior = BEHAVIOR_BY_ID[id]
        const now = Date.now()
        const clock = timeSnapshot(new Date(now), localeRef.value)
        const character = this.home.character
        if (!requestAccepted(behavior, character, clock, this.home.world.props)) {
          const request = behavior.request || {}
          const refuse = request.refuse || {}
          const text = refusalText(behavior, localeRef.value)
          if (text) character.say = { text, until: now + 3200 }
          if (refuse.anim && BEHAVIOR_BY_ID[refuse.anim]) {
            character.emote = { tag: refuse.anim, until: now + 3000 }
          }
          if (Number.isFinite(refuse.mood) && refuse.mood !== 0) {
            character.mood = Math.max(0, Math.min(100, Number(character.mood || 0) + refuse.mood))
          }
          this.publish()
          this.scheduleSave(1200)
          return false
        }
        enterBehavior(this.home, behavior, now)
        // 台词：上一次说话隔了 90 秒以上就一定会说，否则按配置的概率（避免连点刷屏）
        const quietFor = now - (Number(character.lastSaidAt) || 0)
        const shouldSay = behavior.say && (quietFor > 90 * 1000 || Math.random() < behavior.say.chance)
        if (shouldSay) {
          const text = pickSay(behavior, localeRef.value)
          if (text) {
            character.say = { text, until: now + 3200 }
            character.lastSaidAt = now
          }
        }
        this.publish()
        this.scheduleSave(1500)
        return true
      }
    }

