
    const PANEL_ID = 'fishhome'
    const NS = 'fishhome'
    const ROUTE = '/fishhome'
    const MODEL_VERSION = 1
    const LS_KEY = 'dsh-fishhome:state'
    const TICK_MS = 5000
    const SAVE_DEBOUNCE_MS = 9000
    const OFFLINE_MIN_GAP_MS = 15 * 60 * 1000
    const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000
    const OFFLINE_STEP_MS = 5 * 60 * 1000
    const MAX_LOG = 40
/** 有床的房间：睡觉一律回这里（床只在卧室） */
const SLEEP_ROOM = 'bedroom'
/** 会话「一轮一停」的抖动窗口：这段时间内的起停只算一次，避免日志出现两条一样的 */
const SESSION_FLAP_MS = 5 * 60 * 1000
/** 有会话在跑时，把她推回书桌的最小间隔（防止每 5 秒轮询反复推） */
const WORK_NUDGE_MS = 3 * 60 * 1000
/** 你刚手动点过东西时，这段时间内不打断你（用户优先） */
const USER_PRIORITY_MS = 10 * 60 * 1000
/** 便条发进会话时带的前缀：提示模型这是小屋来的小便条，简短回应即可 */
const NOTE_MARK = '【家园】'

