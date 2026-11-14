    /* ======================================================================
     * 动画视图、时钟推进、行为调度与互动
     * ==================================================================== */

    const VIEW_METHODS = {
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
      },
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
        // 顺带问一下 DSH 会话在干什么（异步，不阻塞时钟）
        void this.refreshActivity()
        this.publish()
        this.scheduleSave()
      },
      /**
       * 取一次 DSH 会话活动，并按「开始/结束/出错」做一次性反应。
       * Host 没有 webserver 或没有会话服务时，这里只会拿到空快照，静默降级。
       */
      async refreshActivity() {
        if (this.activityBusy) return this.activity
        this.activityBusy = true
        try {
          const payload = await fetchJson(`${ROUTE}/api/activity`)
          const next = normalizeActivity(payload)
          if (next) this.applyActivity(next)
        } catch {
          /* 拿不到就保持上一次 */
        } finally {
          this.activityBusy = false
        }
        return this.activity
      },
      /** 活动变化 → 她的反应（只在「状态跳变」时触发，避免每 5 秒刷屏） */
      applyActivity(next) {
        const previous = this.activity
        this.activity = next
        setActivity(next)
        if (!this.home || !this.home.character) return
        const now = Date.now()
        const character = this.home.character
        const wasRunning = previous ? previous.running : 0
        const nowRunning = next.running
        // 你开始干活 → 她也坐到书桌前（只在她闲着/发呆/躺着的时候打断）
        if (nowRunning > 0 && wasRunning === 0) {
          pushLog(this.home, now, 'sessionStart', null)
          const passive = ['idle', 'sleep', 'nap', 'read', 'stretch', 'window']
          if (passive.includes(character.behaviorId)) this.forceBehavior('work')
        }
        // 会话跑完 → 她收工：心情好一点，从「工作」里松下来
        if (nowRunning === 0 && wasRunning > 0) {
          pushLog(this.home, now, 'sessionEnd', null)
          character.mood = clampNumber(character.mood + 4, 0, 100, character.mood)
          if (character.behaviorId === 'work') this.forceBehavior('stretch')
        }
        // 出错了 → 她有点担心
        const previousErrors = previous ? previous.counters.errors : 0
        if (next.counters.errors > previousErrors) {
          pushLog(this.home, now, 'sessionError', null)
          character.mood = clampNumber(character.mood - 5, 0, 100, character.mood)
        }
      },
      /** 给面板用的活动快照（没有就是 null） */
      activityView() {
        return this.activity || null
      },
      scheduleSave(delayMs) {
        if (!this.home) return
        if (this.saveTimer !== null) return
        this.saveState = 'dirty'
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null
          void this.flushSave()
        }, delayMs === undefined ? SAVE_DEBOUNCE_MS : delayMs)
      },
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
      },
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
      },
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
      },
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
      },
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
      },
    }

    Object.assign(HomeStore.prototype, VIEW_METHODS)
