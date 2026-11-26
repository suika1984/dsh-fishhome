    /* ======================================================================
     * 存档适配 + 角色包载入（Host 文件优先，localStorage 兜底）
     * ==================================================================== */

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

    /** 载入小屋便条的回复表（data/replies.json）；拿不到就用空表 */
    async function loadReplies() {
      try {
        const payload = await fetchJson(`${ROUTE}/data/replies.json`)
        return normalizeReplies(payload)
      } catch {
        return { rules: [], fallback: [] }
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
  // 版本号做缓存戳，再叠一个时间戳：改完 actions/*.json 刷新面板就能生效，不必再 bump 版本
  const stamp = `${pack && typeof pack.version === 'string' && pack.version !== '' ? `?v=${encodeURIComponent(pack.version)}` : '?'}${pack && pack.version ? '&' : ''}t=${Math.floor(Date.now() / 60000)}`
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
            // 秋千用：这一帧对应哪个相位（front/center/back），别在映射时丢掉
            phase: typeof frame.phase === 'string' && frame.phase !== '' ? frame.phase : undefined,
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

    /**
     * 去掉以 __ 开头的运行时字段（applyFurniture 会给家具打 __scene 标记）。
     * 写盘前必须剥掉，否则下次同步会把「只是被打过标记」的文件当成用户改过、永不覆盖。
     */
    function stripRuntimeKeys(value) {
      if (Array.isArray(value)) return value.map(stripRuntimeKeys)
      if (value && typeof value === 'object') {
        const out = {}
        for (const key of Object.keys(value)) {
          if (key.startsWith('__')) continue
          out[key] = stripRuntimeKeys(value[key])
        }
        return out
      }
      return value
    }
