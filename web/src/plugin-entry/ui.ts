// プラグイン API の入口 matomezu/ui: プラグイン API の見た目の側（plugin-api/ui）の名前と、base の見た目の部品（ダイアログの枠と入力・色・テーマキー・画面の骨組み）を外に出す

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
  InheritChoices,
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
// プラグインに公開する共通の処理のうち見た目の物（base の utils/ui に書き出した物は、そのまま出る）
export * from "../plugins/base/utils/ui"

// ビルトインプラグインの見た目が core/catalog.ts に書き足した物（右クリックのメニューなど）も、いつも型に含める
import type {} from "../plugins/ui"
