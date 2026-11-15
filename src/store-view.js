    /* ======================================================================
     * 动画视图、时钟推进、行为调度与互动
     * ==================================================================== */

    /**
     * 活动快照的指纹：只有它变了才需要重渲染 / 重算权重。
     * （之前漏了函数体，applyActivity 每 5 秒抛 ReferenceError，导致会话权重从来没生效过）
     */
    function activitySignature(snapshot) {
      if (!snapshot) return ''
      const counters = snapshot.counters || {}
      const recent = Array.isArray(snapshot.recent) ? snapshot.recent[snapshot.recent.length - 1] : null
      const notes = snapshot.notes || {}
      return [
        snapshot.running,
        counters.messages,
        counters.tools,
        counters.errors,
        counters.workflows,
        counters.subagents,
        recent ? `${recent.at}:${recent.kind}` : '',
        notes.mode,
        notes.pending,
        notes.injected,
        notes.preview,
        notes.pinned,
        notes.targetFull,
        notes.lastReply ? notes.lastReply.at : '',
        Array.isArray(notes.sessions) ? notes.sessions.length : 0,
      ].join('|')
    }

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
        this.syncSleepRoom(now)
        // 顺带问一下 DSH 会话在干什么（异步，不阻塞时钟）
        void this.refreshActivity()
        this.publish()
        this.scheduleSave()
      },
      /**
       * 睡觉回卧室：床只在卧室，所以在别的房间睡着时把她送回卧室（她不在客厅/花园里"站着睡"）；
       * 醒来后再回到你正在看的房间，免得早上看不见人。
       */
      syncSleepRoom(now) {
        const home = this.home
        if (!home || !home.character || !home.world) return
        const sleeping = home.character.behaviorId === 'sleep' || home.character.behaviorId === 'nap'
        const current = typeof home.world.map === 'string' && home.world.map !== '' ? home.world.map : SLEEP_ROOM
        if (sleeping) {
          if (current !== SLEEP_ROOM) {
            home.world.map = SLEEP_ROOM
            pushLog(home, now, 'goBedroom', null)
            this.lastSleeping = true
          }
          return
        }
        // 刚醒：回到你正在看的房间（她"下楼找你"）
        if (this.lastSleeping) {
          this.lastSleeping = false
          const viewed = this.currentMap()
          if (viewed && viewed !== home.world.map) {
            home.world.map = viewed
            pushLog(home, now, 'backHere', null)
          }
        }
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
      /** 会话里对便条的回复 → 让她在屋里说出来（气泡 + 日志） */
      surfaceReply(reply) {
        if (!reply || typeof reply.text !== 'string' || reply.text === '') return
        if (this.lastReplyAt === reply.at) return
        this.lastReplyAt = reply.at
        const now = Date.now()
        if (this.home && this.home.character) {
          this.home.character.say = { text: reply.text, until: now + 9000 }
          pushLog(this.home, now, 'agentReply', { text: reply.text })
          this.publish()
        }
      },
      /** 活动变化 → 她的反应（只在「状态跳变」时触发，避免每 5 秒刷屏） */
      applyActivity(next) {
        if (next.notes && next.notes.lastReply) this.surfaceReply(next.notes.lastReply)
        // 快照没变（每 5 秒轮询一次）就不要重复 setActivity/publish，否则整块面板白重渲染
        const signature = activitySignature(next)
        const unchanged = signature === this.activitySignature
        this.activitySignature = signature
        const previous = this.activity
        if (unchanged && previous) return
        this.activity = next
        setActivity(next)
        if (!this.home || !this.home.character) return
        const now = Date.now()
        const character = this.home.character
        const wasRunning = previous ? previous.running : 0
        const nowRunning = next.running
        // 你开始干活 → 她也坐到书桌前（只在她闲着/发呆/躺着的时候打断）
        // 会话是「一轮一停」的，一轮结束马上又开下一轮会让 running 反复抖；
        // 起停的日志与收工反应都用 SESSION_FLAP_MS 兜一层，抖动只算一次。
        const passive = ['idle', 'sleep', 'nap', 'read', 'stretch', 'window']
        if (nowRunning > 0 && wasRunning === 0) {
          const flapping = now - (Number(this.lastSessionStartAt) || 0) < SESSION_FLAP_MS
          if (!flapping) {
            this.lastSessionStartAt = now
            pushLog(this.home, now, 'sessionStart', null)
          } else {
            // 抖动：上一轮刚记的「收工」其实是同一次连续工作，撤掉它
            const stale = this.home.log.findIndex((entry) => entry.code === 'sessionEnd')
            if (stale >= 0 && now - this.home.log[stale].at < SESSION_FLAP_MS) this.home.log.splice(stale, 1)
          }
          if (passive.includes(character.behaviorId)) {
            this.lastWorkNudgeAt = now
            this.forceBehavior('work')
          }
        }
        // 会话「一直在跑」时也盯着：连续第二次工作时，中间的空档可能短到被 5 秒轮询漏掉，
        // 只看 0→1 的跳变会漏。所以只要会话在跑、她又闲下来了，就再推一次（有间隔和用户优先保护）。
        if (nowRunning > 0 && passive.includes(character.behaviorId)) {
          const sinceNudge = now - (Number(this.lastWorkNudgeAt) || 0)
          const sinceUserAction = now - (Number(this.lastUserActionAt) || 0)
          if (sinceNudge > WORK_NUDGE_MS && sinceUserAction > USER_PRIORITY_MS) {
            this.lastWorkNudgeAt = now
            this.forceBehavior('work')
          }
        }
        // 会话跑完 → 她收工：心情好一点，从「工作」里松下来
        // （一轮一停的抖动不重复触发：会话可能几秒后又开下一轮）
        if (nowRunning === 0 && wasRunning > 0) {
          const flapping = now - (Number(this.lastSessionEndAt) || 0) < SESSION_FLAP_MS
          if (!flapping) {
            this.lastSessionEndAt = now
            pushLog(this.home, now, 'sessionEnd', null)
            character.mood = clampNumber(character.mood + 4, 0, 100, character.mood)
            if (character.behaviorId === 'work') this.forceBehavior('stretch')
          }
        }
        // 出错了 → 她有点担心
        const previousErrors = previous ? previous.counters.errors : 0
        if (next.counters.errors > previousErrors) {
          pushLog(this.home, now, 'sessionError', null)
          character.mood = clampNumber(character.mood - 5, 0, 100, character.mood)
        }
      },
      /**
       * 小屋便条：跟她说一句话（L3）。
       * 先在屋子里说出来（气泡 + 日志），再交给 Host 决定要不要送进当前会话。
       */
      async sendNote(text) {
        const clean = typeof text === 'string' ? text.trim() : ''
        if (clean === '') return { ok: false, error: '空便条' }
        if (!this.home) return { ok: false, error: '还没准备好' }
        const now = Date.now()
        // 1) 先进屋回一句（跟会话是否可达无关）
        this.replyLocally(clean, now)
        // 2) 有客户端 sessions 服务时，像聊天框一样把话发进目标会话：
        //    它会出现在对话里，并让那个会话真的跑一轮（LLM 会回）
        const targetId =
          (this.activity && this.activity.notes && this.activity.notes.targetId) ||
          (this.home && typeof this.home.noteTarget === 'string' ? this.home.noteTarget : '')
        if (this.clientSessions && targetId) {
          // 带个标记：模型看到就知道这是「家园小便条」，回一句就够，别展开、别调工具
          const delivered = await this.promptSession(targetId, `${NOTE_MARK}${clean}`)
          if (delivered) {
            // 告诉 Host「这个会话在等回话」，好把她的回复捞回来显示在屋里
            void fetchJson(`${ROUTE}/api/note`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: clean, delivered: true, sessionId: targetId, clientSessions: true }),
            }).catch(() => {})
            pushLog(this.home, now, 'noteDelivered', null)
            this.publish()
            return { ok: true, delivered: true, target: targetId }
          }
        }
        // 3) 否则退回 Host 的便条队列（preview / inject）
        try {
          const payload = await fetchJson(`${ROUTE}/api/note`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: clean, clientSessions: !!this.clientSessions, sessionId: targetId }),
          })
          this.publish()
          void this.refreshActivity()
          return { ok: true, mode: payload && payload.mode ? payload.mode : 'preview', pending: payload && payload.pending ? payload.pending : 0 }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, error: message }
        }
      },
      /** 在小屋里回一句（气泡 + 日志 + 可能的动作），不依赖会话 */
      replyLocally(text, now) {
        const character = this.home && this.home.character
        if (!character) return
        const reply = matchReply(this.replies, text, localeRef.value)
        pushLog(this.home, now, 'noteQueued', null)
        if (reply.text) pushLog(this.home, now, 'noteReply', { text: reply.text })
        // 顺序：先切行为再写气泡，否则切换被拒时的提示会盖掉她的回复
        const passive = ['idle', 'read', 'stretch', 'window']
        if (reply.behavior && passive.includes(character.behaviorId)) {
          this.forceBehavior(reply.behavior)
        }
        character.say = { text: reply.text || text, until: now + 6000 }
      },
      /** 用客户端 sessions 服务把一句话发进会话（等同在聊天框里发消息） */
      async promptSession(sessionId, text) {
        try {
          let delivered = false
          await this.clientSessions.using(sessionId, { source: 'gateway' }, async (reference) => {
            const session = reference && reference.binding && reference.binding.session
            if (!session || typeof session.prompt !== 'function') return
            const result = await session.prompt([{ type: 'text', text }], 'queue')
            delivered = !!(result && result.ok)
          })
          return delivered
        } catch {
          return false
        }
      },
      /** 设置里的下拉框：指定便条送进哪个会话（空 = 自动） */
      async setNoteTarget(sessionId) {
        const wanted = typeof sessionId === 'string' ? sessionId : ''
        try {
          const payload = await fetchJson(`${ROUTE}/api/note-target`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: wanted }),
          })
          // 立刻用返回的便条状态刷新（不等 5 秒轮询，否则下拉框看起来像"没选上"）
          const nextNotes = normalizeActivity({ notes: payload }) 
          if (nextNotes && nextNotes.notes) {
            this.activity = { ...(this.activity || normalizeActivity({})), notes: nextNotes.notes }
            this.publish()
          }
          // 记住这个人选的会话（跟着存档走）
          if (this.home) {
            this.home.noteTarget = wanted
            this.publish()
            this.scheduleSave(400)
          }
          return { ok: true }
        } catch (error) {
          // 会话已经不在了：清掉存档里的记录，避免每次启动都白试一次
          if (this.home && this.home.noteTarget === wanted) {
            this.home.noteTarget = ''
            this.publish()
            this.scheduleSave(400)
          }
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
      /** 启动时把存档里记住的目标会话重新登记给 Host */
      async restoreNoteTarget() {
        const saved = this.home && typeof this.home.noteTarget === 'string' ? this.home.noteTarget : ''
        if (saved === '') return
        await this.setNoteTarget(saved)
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
        // 记一笔：你刚手动指挥过她，短时间内别被会话活动拽走（用户优先）
        this.lastUserActionAt = now
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
