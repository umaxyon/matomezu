// プラグイン API の入口 matomezu/ui: プラグイン API の見た目の側（plugin-api/ui）の名前と、base の見た目の部品（ダイアログの枠と入力・色・テーマの欄・画面の骨組み）を外に出す

export * from "../plugin-api/ui"
export {
  ActionButton,
  ALIGN_ICONS,
  Choices,
  ColorPicker,
  Confirm,
  controlClass,
  Dialog,
  defineWorkspace,
  dividerClass,
  Field,
  Form,
  inlineClass,
  Problem,
  pairClass,
  rowClass,
  Section,
  SelectButton,
  STAGE_BASE_SLOTS,
  type StageSlotProps,
  type Swatch,
  Switch,
  SwitchPanel,
  useAligns,
  useBookOf,
  useBookTheme,
  useSwatches,
  useThemeVars,
} from "../plugins/base/ui"

// ビルトインプラグインの見た目が機能台帳の型の側に書き足した物（右クリックのメニューなど）も、いつも型に含める
import type {} from "../plugins/ui"
