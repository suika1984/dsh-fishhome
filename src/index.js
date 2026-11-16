    /* ======================================================================
     * 10. 插件入口
     * ==================================================================== */

    const store = new HomeStore()

    function readLocale(ctx) {
      try {
        const snapshot = ctx.locale.getLocale()
        return readLocaleId(snapshot)
      } catch {
        return 'zh'
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        localeRef.value = readLocale(ctx)
        const translate = makeTranslate(localeRef.value)
        const localeSubscribe = (listener) => {
          try {
            return ctx.locale.subscribe(() => {
              localeRef.value = readLocale(ctx)
              listener()
            })
          } catch {
            return () => {}
          }
        }
        const t = (key, params) => makeTranslate(localeRef.value)(key, params)
        // 可选：客户端 sessions 服务。有它就能像聊天框一样把便条发进会话（会出现在对话里、LLM 也会回）。
        // apply 时服务可能还没挂载，所以统一用 ctx.inject 等它挂载后再取。
        const injectService = (name, use) => {
          try {
            if (typeof ctx.inject === 'function') ctx.inject([name], (inner) => use(inner))
            else use(ctx)
          } catch {
            /* 没有这个服务就跳过 */
          }
        }
        injectService('sessions', (inner) => {
          try {
            store.clientSessions = inner.sessions || (typeof inner.get === 'function' ? inner.get('sessions') : null) || store.clientSessions
          } catch {
            /* 服务不可用就当没有 */
          }
        })
        // DSH 自己的「用系统程序打开 / 在文件夹中显示」：走 remote 调 Host 的 sessionController，
        // 由它用原生方式打开（实测在本环境里自己 spawn explorer.exe 起不来）。
        injectService('remote', (inner) => {
          try {
            const api = inner.remote && inner.remote.session
            if (!api || typeof api.openWorkspacePath !== 'function') return
            store.openRemote = async (absolutePath, reveal) => {
              try {
                const result = await api.openWorkspacePath(reveal
                  ? { path: absolutePath, action: 'reveal' }
                  : { path: absolutePath })
                if (result && result.ok) return 'ok'
                return (result && (result.error || result.message)) || 'failed'
              } catch (error) {
                return error instanceof Error ? error.message : String(error)
              }
            }
          } catch {
            /* 拿不到 remote 就退回 Host 自己的打开方式 */
          }
        })
        try {
          ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'dsh-fishhome: zh dictionary')
          ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'dsh-fishhome: en dictionary')
        } catch {
          /* locale 服务不可用时用内联字典 */
        }

        ctx.effect(() => {
          store.start()
          return () => store.stop()
        }, 'dsh-fishhome: life loop')

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          const onHide = () => {
            if (document.visibilityState === 'hidden') void store.flushSave()
          }
          window.addEventListener('pagehide', onHide)
          ctx.effect(() => () => window.removeEventListener('pagehide', onHide), 'dsh-fishhome: pagehide')
        }

        // 诊断用：控制台里跑 __fhDebug() 能看到「当前场景 / 家具列表 / 她所在房间」
        // 排查「切房间后旧房间的家具还在」这类问题时，先看这三个数字对不对得上。
        if (typeof window !== 'undefined') {
          try {
            window.__fhDebug = () => ({
              scene: sceneRef.value && sceneRef.value.id ? sceneRef.value.id : null,
              furniture: (furnitureRef.value || []).map((def) => (def && def.id) || '?'),
              herMap: store.home && store.home.world ? store.home.world.map : null,
              viewedMap: store.meta ? store.meta.map : null,
              mapPath: store.mapPath || null,
              token: store.sceneToken || 0,
              build: typeof BUILD_REV === 'string' ? BUILD_REV : null,
              // 原生打开通道有没有接上（false = 只能复制路径）
              remoteWired: typeof store.openRemote === 'function',
              // 画面上真实出现的精灵：href + 它挂在哪个 fh-prop-* 下面
              drawn: (() => {
                try {
                  if (typeof document === 'undefined') return null
                  return [...document.querySelectorAll('svg.fh-scene image')].map((img) => {
                    const host = img.closest('[class*="fh-prop"]')
                    return {
                      href: String(img.getAttribute('href') || '').split('/').pop(),
                      prop: host ? host.getAttribute('class') : null,
                    }
                  })
                } catch {
                  return null
                }
              })(),
            })
          } catch {
            /* 只读调试钩子，失败无所谓 */
          }
        }

        ctx.slots.inject('main', () => ctx.slots.inject('sidebar.panellist', () => {
          const stopMain = ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({ store, translate: t, localeSubscribe }),
          }, FishHomePanel)
          let stopIcon
          try {
            stopIcon = ctx.slots.register({
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 40,
              label: () => makeTranslate(localeRef.value)('panel.title'),
              locale: NS,
            }, SidebarIcon)
          } catch (error) {
            stopMain()
            throw error
          }
          return () => {
            stopIcon()
            stopMain()
          }
        }))
      },
      __internals: {
        createHome,
        normalizeHome,
        logText,
        normalizeActivity,
        normalizeReplies,
        matchReply,
        loadReplies,
        setActivity,
        activityWeightMul,
        furnitureItems,
        normalizeControls,
        localizeText,
        fillText,
        stepHome,
        settleOffline,
        BEHAVIORS,
        BEHAVIOR_BY_ID,
        applyEvents,
        normalizeEvent,
        behaviorWeight,
        pushLog,
        pickBehavior,
        enterBehavior,
        timeSnapshot,
        buildAnimationView,
        formatSpan: (minutes) => formatSpan(makeTranslate('zh'), minutes),
        makeTranslate,
        HomeStore,
        loadCharacterActions,
        FishHomePanelView,
        EventForm,
        SettingsBar,
        ActivityCard,
        wrapBubbleText,
        EditorBar,
        WEIGHT_VOCAB,
        requestAccepted,
        pickSay,
        refusalText,
        applyScene,
        applyBackground,
        applyFurniture,
        furnitureRef,
        DEFAULT_FURNITURE,
        partVisible,
        partOffsetTransform,
        spriteTransform,
        SelectedBox,
        SceneSvg,
        resolveAnchor,
        normalizeAnchor,
        roomLightOn,
        resolveDataPath,
        project,
        geom,
        bgRef,
        sceneRef,
      },
    }
