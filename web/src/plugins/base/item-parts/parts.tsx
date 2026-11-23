// 形（箱やリストなど）の画面が共に使うもの: ダイアログのフック（描いているページのブック・ページのテーマ・使えるテーマ・色の見本・寄せの選択肢）と寄せのアイコン、
// 形に当てたテーマの値を CSS 変数にするフック

import { type CSSProperties, useMemo } from "react"
import { PALETTE } from "../../../core/color"
import type { ThemeDef, TokenDef } from "../../../core/def/theme"
import { NO_OUTERMOST } from "../../../core/folders-tree"
import type { MessageKey } from "../../../core/i18n/i18n"
import { splitId } from "../../../core/names"
import { NO_PAGE } from "../../../core/stage"
import type { Shades } from "../../../core/theme"
import { useMessages } from "../../../ui/i18n"
import { openedOf, pageTypeOf, useScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { usePage, useShownPage } from "../../../ui/view-hooks"
import { pageTheme } from "../book-look/look"
import { themeFits, themesFor } from "../book-look/theme-types"
import { resolveTokens } from "../book-look/tokens"
import { shadeOf, useDarkScheme } from "../book-look/use-dark-scheme"
import { kit } from "../kit"
import type { Align } from "../text/text-fields"

// 寄せのアイコン（左・中央・右に寄せた横線）
const lines = (x1: number, x2: number) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={`M4 6h16M${x1} 12h${x2 - x1}M4 18h16`} />
  </svg>
)
export const ALIGN_ICONS = { left: lines(4, 14), center: lines(7, 17), right: lines(10, 20) }

const ALIGNS = [
  { value: "left", label: kit.message("Align left") },
  { value: "center", label: kit.message("Align center") },
  { value: "right", label: kit.message("Align right") },
] as const satisfies readonly { value: Align; label: MessageKey }[]

// 寄せの選択肢（左・中央・右のアイコンのボタン）
export function useAligns() {
  const t = useMessages(kit)
  return ALIGNS.map(a => ({ value: a.value, label: t(a.label), icon: ALIGN_ICONS[a.value] }))
}

// 描くページのステージエントリの id（描いている場所。ui/scope.tsx。描く所がステージエントリを開いていなければ NO_OUTERMOST）
export function useOutermostOf(): string {
  const scope = useScope()
  return useMatomezuState(s => openedOf(s, scope)?.outermost ?? NO_OUTERMOST)
}

// 描いているページのタイプが、ページと中の形に使えるテーマ（book-look/theme-types.ts。ページを描いていなければ空）
export function usePageThemes(): ThemeDef[] {
  const catalog = useCatalog().core
  const page = usePage()
  const type = page === NO_PAGE ? undefined : page.type
  return useMemo(() => (type === undefined ? [] : themesFor(catalog, type)), [catalog, type])
}

// テーマが無いときの値（ページを描いていない）
export const NO_THEME = "none"

// 描いているページのテーマの id（設定のダイアログの下書きを重ねたページで決める。ページを描いていなければ NO_THEME）
export function usePageTheme(): string {
  const catalog = useCatalog().core
  const page = useShownPage()
  return useMemo(() => (page === NO_PAGE ? NO_THEME : pageTheme(catalog, page)), [catalog, page])
}

// 色の見本: テーマの代表色と、「なし」の色
export interface Swatches {
  palette: readonly { name: (typeof PALETTE)[number]; hex: string; label: string }[]
  none: string
}

// 色の見本が無いときの値（useSwatches）
export const NO_SWATCHES = "none"

// テーマ looks の色の見本（「なし」の色は形の塗りのテーマキー fill の値）。表に無いテーマ（NO_THEME も）なら NO_SWATCHES
export function useSwatches(looks: string, fill: TokenDef): Swatches | typeof NO_SWATCHES {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const dark = useDarkScheme()
  return useMemo(() => {
    if (!catalog.themes.has(looks)) return NO_SWATCHES
    const tokens = resolveTokens(catalog, looks, [fill])
    const shown = (shades: Shades | undefined) => (shades ? shadeOf(shades, dark) : "#ffffff")
    // 役割の名前は出さない（意味を利用者に押し付けない）
    const palette = PALETTE.map((name, i) => ({
      name,
      hex: shown(tokens[`palette.${name}`]),
      label: t("Theme color {n}", { n: i + 1 }),
    }))
    return { palette, none: shown(tokens[fill.id]) }
  }, [catalog, looks, fill, t, dark])
}

// 当てるテーマの CSS 変数が無いときの値（空の style）
const NO_VARS: CSSProperties = {}

// 描くページの中の形に当てたテーマ theme の、テーマキー defs の値の CSS 変数
// （当てていない NO_THEME か、ページのタイプが使えないテーマなら空。ページのテーマのまま描く。book-look/theme-types.ts）
export function useThemeVars(theme: string | typeof NO_THEME, defs: readonly TokenDef[]): CSSProperties {
  const catalog = useCatalog().core
  const scope = useScope()
  const type = useMatomezuState(s => pageTypeOf(s, scope))
  return useMemo(() => {
    if (theme === NO_THEME || type === undefined || !themeFits(catalog, type, theme)) return NO_VARS
    const owners = new Set(defs.map(d => splitId(d.id).owner))
    const [owner] = owners // テーマキーの持ち主（アイテムのプラグイン）は 1 つ
    return themeVars(resolveTokens(catalog, theme, defs), owners.size === 1 && owner ? owner : undefined)
  }, [catalog, type, theme, defs])
}
