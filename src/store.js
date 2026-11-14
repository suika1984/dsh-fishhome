    /* ======================================================================
     * 4. HomeStore 核心：状态、订阅、启动、时钟
     *    其余能力按职责挂在 store-scene / store-edit / store-view（见下）
     * ==================================================================== */


    class HomeStore {
      constructor() {
        this.home = null
        // DSH 会话活动（运行时，不存档）
        this.activity = null
        // 便条回复表（data/replies.json）
        this.replies = { rules: [], fallback: [] }
        // 客户端 sessions 服务（有它就能像聊天框一样把话发进会话）
        this.clientSessions = null
        this.activityBusy = false
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
          activity: this.activity,
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
        this.replies = await loadReplies()
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
    }
