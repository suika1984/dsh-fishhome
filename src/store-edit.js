    /* ======================================================================
     * 布局编辑：改部件、撤销、增删家具、写回 data/
     * ==================================================================== */

    const EDIT_METHODS = {
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
      },
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
      },
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
      },
      movePartByGrid(defId, partId, dfx, dfy) {
        if (!Number.isFinite(dfx) || !Number.isFinite(dfy)) return false
        return this.updatePart(defId, partId, (part) => {
          const offset = part.offset || { fx: 0, fy: 0 }
          part.offset = {
            fx: Math.round(((Number(offset.fx) || 0) + dfx) * 100) / 100,
            fy: Math.round(((Number(offset.fy) || 0) + dfy) * 100) / 100,
          }
        })
      },
      bumpPartZ(defId, partId, delta) {
        return this.applyToVariantGroup(defId, partId, (part) => ({
          part: { z: (Number(part.z) || 0) + delta },
        }))
      },
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
      },
      canUndo() {
        return this.history.length > 0
      },
      /**
       * 用系统默认程序打开配置文件，或在资源管理器里定位。
       * target 形如 data/maps/living/scene.json、pack/pet.json、save/state.json
       */
      /** data/… pack/… save/… → 绝对路径（DSH 的原生打开要绝对路径） */
      absolutePathFor(target) {
        const meta = this.meta || {}
        const match = /^(data|pack|save)\/(.+)$/.exec(String(target || ''))
        if (!match) return ''
        const root = match[1] === 'data' ? meta.dataDir : match[1] === 'pack' ? meta.packDir : meta.saveDir
        if (typeof root !== 'string' || root === '') return ''
        const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
        return `${base}/${match[2]}`
      },
      async openPath(kind, target) {
        const mode = kind === 'folder' || kind === 'reveal' ? kind : 'file'
        const absolute = this.absolutePathFor(target)
        // 先交给 DSH 自己（Host 的 sessionController 用原生方式打开）
        if (absolute !== '' && typeof this.openRemote === 'function') {
          const remote = await this.openRemote(absolute, mode === 'reveal' || mode === 'folder')
          if (remote === 'ok') return { ok: true, error: '', openedWith: 'dsh', absolute }
          this.lastOpenRemoteError = remote
        }
        try {
          const payload = await fetchJson(`${ROUTE}/api/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: mode, path: target }),
          })
          return {
            ok: !!(payload && payload.ok),
            error: payload && payload.error ? String(payload.error) : '',
            // electron / spawn / dry-run：看出到底走的哪条路（排查「提示成功但没窗口」）
            openedWith: payload && payload.openedWith ? String(payload.openedWith) : '',
            absolute: payload && payload.absolute ? String(payload.absolute) : '',
          }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
      /** 回退一步：家具表、删除清单、scene 清单一起回滚 */
      undo() {
        const snapshot = this.history.pop()
        if (!snapshot) return false
        this.historyKey = ''
        this.historyAt = 0
        this.removedFurniture = (snapshot.removed || []).slice()
        applyFurniture(snapshot.furniture)
        this.syncSceneFurniture(snapshot.furniture.map((def) => def.id))
        this.publish()
        return true
      },
      /** scene.json 的 furniture 清单跟着内存里的家具表走 */
      syncSceneFurniture(ids) {
        if (!this.sceneDoc) return
        this.sceneDoc.furniture = ids.slice()
        this.sceneDirty = true
      },
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
      },
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
      },
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
      },
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
      },
      /** 放弃未保存的改动，回到上次读到的状态 */
      discardFurniture() {
        applyFurniture(cloneJson(this.furnitureSource || DEFAULT_FURNITURE))
        this.sceneDoc = cloneJson(this.sceneSource)
        this.sceneDirty = false
        this.removedFurniture = []
        this.publish()
      },
      /** 只对素材图有意义：绕支点转 deg 度 */
      rotatePart(defId, partId, deg) {
        if (!Number.isFinite(deg)) return false
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          const next = (Number(part.sprite.rotate) || 0) + deg
          return { sprite: { rotate: Math.round(next * 10) / 10 } }
        })
      },
      /** 平行四边形畸变：sprite.skew 存斜率（tan），0 = 正对镜头，0.375 = 跟墙/地平行 */
      setPartSkew(defId, partId, value) {
        const num = Number(value)
        if (!Number.isFinite(num)) return false
        const clamped = Math.max(-0.8, Math.min(0.8, num))
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { skew: Math.round(clamped * 1000) / 1000 } }
        })
      },
      /** 左右镜像 */
      flipPart(defId, partId) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { flipX: part.sprite.flipX !== true } }
        })
      },
      /** 改素材图的显示尺寸（底边保持不动） */
      resizePart(defId, partId, width, height) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite || !Array.isArray(part.sprite.rect)) return null
          const rect = part.sprite.rect.map(Number)
          const w = Math.max(8, Math.round(Number(width) || rect[2]))
          const hh = Math.max(8, Math.round(Number(height) || rect[3]))
          return { sprite: { rect: [rect[0], rect[1] + (rect[3] - hh), w, hh] } }
        })
      },
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
      },
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
      },
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
      },
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
      },
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
      },
    }

    Object.assign(HomeStore.prototype, EDIT_METHODS)
