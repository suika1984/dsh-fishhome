    /* ======================================================================
     * 场景切换：地图列表 / 载入 / 她人在哪个房间
     * ==================================================================== */

    const SCENE_METHODS = {
      /**
       * 读场景定义（scene.json + background.json）。
       * 读不到就退回内置默认房间，不让整块面板挂掉。
       */
      /** 点门出门：切到另一个场景（她自己留不留下由 bringPetHere 决定） */
      async gotoScene(mapId) {
        if (typeof mapId !== 'string' || mapId === '') return false
        const now = Date.now()
        if (this.home) {
          // 点门 = 你要去别的屋：她抬头看一眼，记一条日志
          pushLog(this.home, now, 'roomOut', { map: mapId })
          if (this.home.character) {
            this.home.character.emote = { tag: 'walk', until: now + 1400 }
            const translate = makeTranslate(localeRef.value)
            this.home.character.say = { text: fillText(translate('door.leave'), this.home), until: now + 2600 }
          }
          this.publish()
        }
        await this.setMap(mapId)
        return true
      },
      /** 当前场景 id（localStorage 记住，下次打开还是它） */
      currentMap() {
        try {
          const saved = window.localStorage.getItem(`${LS_KEY}:map`)
          if (typeof saved === 'string' && saved !== '') return saved
        } catch {
          /* 隐私模式忽略 */
        }
        return ''
      },
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
        const loaded = await this.loadScene({ map: mapId })
        // 被后一次切换顶掉（晚到的响应）就别改面板上的场景下拉了
        if (loaded !== true) return false
        // meta 也更新一份，面板上的场景下拉才会跟着变
        this.meta = { ...(this.meta || {}), map: mapId, mapPath: `maps/${mapId}/scene.json` }
        this.publish()
        return true
      },
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
      },
      async loadScene(meta) {
        // 竞态保护：连续切房间时只认最后一次加载。
        // 而且「先全部读完、最后一次性落地」，避免半新半旧——否则会出现「卧室的场景 + 客厅的落地窗」。
        const token = (this.sceneToken || 0) + 1
        this.sceneToken = token
        const alive = () => this.sceneToken === token
        const mapPath = typeof meta.mapPath === 'string' && meta.mapPath !== ''
          ? meta.mapPath
          : `maps/${typeof meta.map === 'string' && meta.map !== '' ? meta.map : 'bedroom'}/scene.json`
        this.mapPath = mapPath
        try {
          const scene = await fetchJson(`${ROUTE}/data/${mapPath}`)
          if (!alive()) return false
          const bgFile = scene && typeof scene.background === 'string' && scene.background !== ''
            ? scene.background
            : 'background.json'
          const bgPath = resolveDataPath(mapPath, bgFile)
          const bg = await fetchJson(`${ROUTE}/data/${bgPath}`)
          if (!alive()) return false
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
          if (!alive()) return false
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
          if (!alive()) return false
          // ---- 到这里才开始落地：场景 / 背景 / 家具 / 事件一起换 ----
          const loaded = defs.filter(Boolean)
          const loadedEvents = eventDefs.filter(Boolean)
          applyScene(scene)
          applyBackground(bg)
          applyFurniture(loaded)
          applyEvents(loadedEvents)
          // 如果加载的正好是她所在的场景，记住名字（切到别的房间时用来提示）
          if (this.home && this.home.world && scene && scene.id === this.home.world.map) {
            this.home.world.mapName = (scene.name && (scene.name.zh || scene.name.en)) || scene.id
          }
          this.furnitureSource = cloneJson(loaded)
          // 记住 scene.json 原文：增删家具要同步它的 furniture 清单
          this.sceneDoc = cloneJson(scene) || null
          this.sceneSource = cloneJson(scene) || null
          this.sceneDirty = false
          this.removedFurniture = []
          this.eventsSource = cloneJson(loadedEvents)
          this.sceneWarning = null
          return true
        } catch (error) {
          if (!alive()) return false
          applyScene(null)
          applyBackground(null)
          this.sceneWarning = error instanceof Error ? error.message : String(error)
          return false
        }
      },
      furnitureUrl(id) {
        return `${ROUTE}/data/${resolveDataPath(this.mapPath || 'maps/bedroom/scene.json', `furniture/${id}.json`)}`
      },
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
      },
      /** 角色当前站在画面的 x */
      characterScreenX() {
        const behavior = BEHAVIOR_BY_ID[this.home.character.behaviorId] || BEHAVIOR_BY_ID.idle
        const spot = SPOTS[behavior.spot] || SPOTS.center
        return project(spot.fx, spot.fy)[0]
      },
      /** 往 target 偏一下头（dir = 1 右 / -1 左） */
      leanToward(target) {
        const targetX = typeof target === 'number' ? target : this.targetScreenX(target)
        const selfX = this.characterScreenX()
        if (!Number.isFinite(targetX)) return
        const dir = targetX < selfX ? -1 : 1
        this.home.character.lean = { dir, until: Date.now() + 1200 }
        this.home.character.face = dir
      },
      /** 她当前所在的场景 id（存档里那个） */
      petScene() {
        return this.home && this.home.world ? this.home.world.map || '' : ''
      },
      /** 你正在看的场景 id */
      viewScene() {
        const sceneId = sceneRef.value && typeof sceneRef.value.id === 'string' ? sceneRef.value.id : ''
        return sceneId || (this.meta && this.meta.map) || ''
      },
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
      },
    }

    Object.assign(HomeStore.prototype, SCENE_METHODS)
