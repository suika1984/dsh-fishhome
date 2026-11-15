    /* ======================================================================
     * 9. 样式
     * ==================================================================== */

    const CSS = `
.fh-panel {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.fh-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 22px 26px 34px;
  box-sizing: border-box;
}
.fh-inner {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.fh-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.fh-title {
  margin: 0;
  font-size: 21px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.fh-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.fh-head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.fh-head-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-chip {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  white-space: nowrap;
}
.fh-ghost-button {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.fh-ghost-button:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.fh-ghost-button:active {
  transform: scale(0.96);
}
.fh-ghost-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.fh-primary-button {
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  background: var(--dsw-alias-brand-primary);
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: transform 140ms ease, opacity 140ms ease;
}
.fh-primary-button:active {
  transform: scale(0.96);
}
.fh-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.95fr);
  gap: 18px;
  align-items: start;
}
@container (max-width: 900px) {
  .fh-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 900px) {
  .fh-grid {
    grid-template-columns: 1fr;
  }
}
.fh-room-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.fh-stage {
  contain: paint;
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  background: #191325;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 42px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.14);
  isolation: isolate;
}
.fh-scene {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  isolation: isolate;
}

/* ---- 全局氛围光线 ----
 * 颜色按时间段写在 CSS 里，浓度由时钟算出来的 --fh-ambient-alpha 控制；
 * 想换色调只改这几行，不用碰渲染代码。
 * 夜里用暖棕压暗（不是发蓝），墙面才会像被灯光照着。
 */
.fh-stage[data-period="morning"],
.fh-stage[data-period="noon"],
.fh-stage[data-period="afternoon"] { --fh-ambient-tint: #3a3050; }
.fh-stage[data-period="dawn"],
.fh-stage[data-period="evening"] { --fh-ambient-tint: #4d3040; }
.fh-stage[data-period="night"] { --fh-ambient-tint: #2c1f2b; }
.fh-stage[data-period="deepNight"] { --fh-ambient-tint: #1d1522; }
/* 开着房间灯时整体更暖（浓度已经在 JS 里调低了） */
.fh-stage[data-room-light="on"][data-period="night"],
.fh-stage[data-room-light="on"][data-period="deepNight"] {
  --fh-ambient-tint: #6a4a3e;
}
.fh-ambient {
  fill: var(--fh-ambient-tint, #2c1f2b);
  opacity: var(--fh-ambient-alpha, 0);
  mix-blend-mode: multiply;
  pointer-events: none;
  transition: opacity 2s linear;
}
/* 暗角：中间透、四周压暗，跟环境光同浓，白天几乎看不见 */
.fh-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(
    ellipse at 50% 44%,
    rgba(20, 12, 22, 0) 52%,
    rgba(20, 12, 22, calc(var(--fh-ambient-alpha, 0) * 0.9)) 100%
  );
}
/* 光源层：叠加发光，夜里不会被环境光压暗 */
.fh-lights {
  mix-blend-mode: screen;
  pointer-events: none;
}
.fh-character {
  /* 锚点之间是「淡出 → 换位置 → 淡入」：只过渡透明度，位置是瞬切 */
  transition: opacity 420ms ease-in;
  pointer-events: none;
}
.fh-character[data-fade="in"] {
  transition: opacity 520ms ease-out;
}
/* 淡出时只「缩」，不下压——原点在脚底，所以是原地变矮，没有位移 */
.fh-character-body {
  transition: transform 460ms cubic-bezier(0.4, 0, 0.6, 1);
  transform-origin: 50% 100%;
}
.fh-character[data-fade="out"] .fh-character-body {
  transform: scale(0.9);
}
.fh-stage[data-room-light="off"] .fh-character[data-period="night"],
.fh-stage[data-room-light="off"] .fh-character[data-period="deepNight"] {
  filter: brightness(0.86) saturate(0.95);
}
/* 点互动物时朝那边偏一下头 */
.fh-character-peek[data-dir="1"] {
  animation: fh-peek-right 1.15s ease;
  transform-origin: 50% 100%;
}
.fh-character-peek[data-dir="-1"] {
  animation: fh-peek-left 1.15s ease;
  transform-origin: 50% 100%;
}
@keyframes fh-peek-right {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(7px) rotate(3deg); }
  55% { transform: translateX(3px) rotate(1.2deg); }
}
@keyframes fh-peek-left {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-7px) rotate(-3deg); }
  55% { transform: translateX(-3px) rotate(-1.2deg); }
}

/* 选中框右下角的缩放手柄。
   注意：SVG 元素的 transform-origin 默认是整个画布的 (0,0)，不是元素中心，
   所以 hover 时做 scale 会把方块「甩」到别处 → 指针离开元素 → hover 失效 → 回来，
   造成手型和箭头疯狂闪烁。这里只改颜色，不改几何。 */
.fh-resize-handle {
  pointer-events: all;
}
.fh-resize-handle:hover {
  fill: #ffa254;
  stroke: #fff7ef;
}

/* 编辑模式下所有家具都能抓取拖动 */
.fh-stage[data-edit="on"] .fh-prop {
  cursor: grab;
}
.fh-stage[data-edit="on"] .fh-prop:active {
  cursor: grabbing;
}
.fh-sprite-breathe {
  animation: fh-breathe 5.6s ease-in-out infinite;
}
@keyframes fh-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1.5px); }
}
@media (prefers-reduced-motion: reduce) {
  .fh-sprite-breathe { animation: none; }
  .fh-character { transition: none; }
}
.fh-character-moving .fh-sprite-breathe {
  animation: none;
}
.fh-lamp-img {
  transition: opacity 200ms ease;
}
.fh-prop {
  cursor: pointer;
}
.fh-prop .fh-prop-hit {
  display: none;
}
.fh-prop:focus-visible {
  outline: none;
}
.fh-prop:focus-visible > *:last-child,
.fh-prop:focus-visible polygon,
.fh-prop:focus-visible rect {
  stroke: #ffd9a3 !important;
  stroke-width: 2.5 !important;
}
.fh-prop:hover polygon,
.fh-prop:hover ellipse {
  filter: brightness(1.08);
}
.fh-zzz {
  opacity: 0.85;
  animation: fh-float 3.2s ease-in-out infinite;
}
@keyframes fh-float {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-6px); opacity: 0.95; }
}
.fh-room-badge {
  position: absolute;
  z-index: 2;
  top: 14px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 252, 245, 0.94);
  border: 1px solid rgba(120, 92, 62, 0.16);
  pointer-events: none;
  max-width: 55%;
}
.fh-room-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #3f3428;
  letter-spacing: 0.01em;
}
.fh-room-meta {
  font-size: 11.5px;
  color: rgba(63, 52, 40, 0.66);
  font-variant-numeric: tabular-nums;
}
.fh-room-actions {
  position: absolute;
  z-index: 2;
  top: 14px;
  right: 14px;
  display: flex;
  gap: 6px;
}
.fh-room-action {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 92, 62, 0.18);
  background: rgba(255, 252, 245, 0.94);
  color: #4a3b2c;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease;
}
.fh-room-action:hover {
  background: rgba(255, 255, 252, 0.95);
}
.fh-room-action:active {
  transform: scale(0.96);
}
.fh-room-action:focus-visible {
  outline: 2px solid #ffd9a3;
  outline-offset: 2px;
}
.fh-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.fh-toggle {
  height: 30px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
  font-variant-numeric: tabular-nums;
}
.fh-toggle:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-toggle.is-on {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.fh-toggle:active {
  transform: scale(0.96);
}
.fh-toggle:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.fh-hint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-toggle:disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.fh-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.fh-editor-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.fh-editor-title {
  font-size: 12.5px;
  font-weight: 600;
}
.fh-editor-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-editor-select {
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-text {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-code {
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.fh-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 12px;
}
.fh-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.fh-field-label {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-field-body {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-field-sep {
  opacity: 0.6;
  font-size: 12px;
}
.fh-field-unit {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-input {
  width: 74px;
  font: inherit;
  font-size: 12px;
  padding: 4px 7px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-input-text {
  width: 110px;
}
.fh-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-mods {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.fh-mod-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-editor-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.fh-editor-status {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-brand-primary);
}
.fh-ghost-button.is-on {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.fh-prop-selected {
  filter: brightness(1.06);
}
.fh-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.fh-card {
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fh-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.fh-muted {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.fh-nowline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.fh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  flex: none;
}
.fh-dot-sleep {
  background: var(--dsw-alias-state-idle-primary);
  box-shadow: none;
}
.fh-flavor {
  margin: 0;
  font-size: 12.5px;
  line-height: 19px;
  color: var(--dsw-alias-label-secondary);
}
.fh-progress {
  height: 3px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.fh-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  opacity: 0.55;
  transition: width 900ms ease;
}
.fh-meter {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.fh-meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-meter-value {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.fh-meter-track {
  height: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.fh-meter-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  transition: width 700ms ease;
}
.fh-meter-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.fh-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 216px;
  overflow: auto;
}
.fh-log-row {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  line-height: 19px;
  align-items: baseline;
}
.fh-log-time {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  opacity: 0.8;
}
.fh-log-text {
  color: var(--dsw-alias-label-primary);
}
.fh-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-foot {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.8;
}
.fh-centered {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fh-loading-card,
.fh-error-card {
  width: min(360px, 100%);
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.fh-loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  animation: fh-pulse 1.6s ease-in-out infinite;
}
@keyframes fh-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
.fh-loading-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.fh-loading-hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 19px;
  color: var(--dsw-alias-label-secondary);
  word-break: break-word;
}
.fh-error-box {
  margin: 24px;
  padding: 18px 20px;
  border-radius: 14px;
  background: #fff6ec;
  border: 1px solid #e8c9a8;
  color: #6b4b32;
}
.fh-error-box p {
  margin: 8px 0 14px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.fh-paths {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.fh-path {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid #e2cdb4;
  background: #fffaf3;
  color: #6b4b32;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.fh-path:hover {
  background: #fff;
  border-color: #d9b98f;
}
.fh-path-label {
  flex: 0 0 auto;
  font-size: 12px;
  opacity: 0.75;
}
.fh-path code {
  flex: 1 1 auto;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.fh-chip-action {
  cursor: pointer;
  border: 1px dashed #d9b98f;
  background: #fff6ec;
  color: #7a5636;
  font: inherit;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
}
.fh-chip-action:hover {
  background: #fff;
  border-style: solid;
}

.fh-mini {
  padding: 2px 7px;
  border-radius: 8px;
  border: 1px solid #e2cdb4;
  background: #fffaf3;
  color: #6b4b32;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.fh-mini:hover {
  background: #fff;
  border-color: #d9b98f;
}

/* 配置文件列表：名字 + 路径 + 打开/定位 */
.fh-open-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fh-open-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03));
}
.fh-open-name {
  font-size: 12px;
  color: var(--dsw-alias-text-secondary);
  white-space: nowrap;
}
.fh-open-path {
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fh-open-row .fh-toggle {
  padding: 2px 10px;
  font-size: 11.5px;
}

/* 会话卡：DSH 真实会话的活动 */
.fh-activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-border-l1, #d8d2c6);
  margin-left: auto;
}
.fh-activity-dot.is-on {
  background: #57c07a;
  box-shadow: 0 0 0 3px rgba(87, 192, 122, 0.18);
  animation: fh-pulse 1.8s ease-in-out infinite;
}
.fh-activity-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--dsw-alias-text-secondary);
}
.fh-activity-stats b {
  margin-left: 5px;
  font-weight: 600;
  color: var(--dsw-alias-text-primary, #2b2b2b);
}
.fh-activity-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--dsw-alias-text-secondary);
}
.fh-activity-list li {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.fh-activity-time {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
}

/* 便条输入：跟她说一句话 */
.fh-note {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.fh-note-input {
  flex: 1;
  min-width: 0;
}
.fh-note-send {
  flex: none;
}
.fh-note-hint {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
}

/* 设置底部的版本信息：判断 Host 重启了没、界面刷新了没 */
.fh-build-info {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #9a9a9a);
  font-variant-numeric: tabular-nums;
}

/* 会话卡里合并后的次数（调用工具 ×3） */
.fh-activity-count {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(150, 150, 150, 0.16);
  font-size: 11px;
  color: var(--dsw-alias-text-secondary, #7a7a7a);
  font-variant-numeric: tabular-nums;
}

/* 门：可点击的出门入口 */
.fh-prop-door { cursor: pointer; }
.fh-prop-door .fh-door-leaf { transition: filter 160ms ease; }
.fh-prop-door:hover .fh-door-leaf { filter: brightness(1.12); }
.fh-prop-door:hover .fh-door-shadow { opacity: 0.22; }
`


