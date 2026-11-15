// 形（箱やリストなど）の画面が共に使うもの: ダイアログのフック（開いているブック・ブックのテーマ・使えるテーマ・色の見本・寄せの選択肢）と寄せのアイコン、
// 形に当てたテーマの値を CSS 変数にするフック
import { type CSSProperties, useMemo } from "react"
import { PALETTE } from "../../../core/color"
import type { ThemeDef, TokenDef } from "../../../core/def/theme"
import type { MessageKey } from "../../../core/i18n/i18n"
import { splitId } from "../../../core/names"
import { resolveTokens, type Shades } from "../../../core/theme"
import { useMessages } from "../../../ui/i18n"
import { bookTypeOf, checkLegacy, openedOf, useScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { bookTheme } from "../book-look/look"
import { themeFits, themesFor } from "../book-look/theme-types"
import { shadeOf, useDarkScheme } from "../book-look/use-dark-scheme"
import { kit } from "../kit"
import type { Align } from "../text/fields"

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

// 描くページのブックの id（描いている場所。ui/scope.tsx）
export function useBookOf(legacy?: string): string | undefined {
  const scope = useScope()
  checkLegacy(scope, legacy, "useBookOf")
  return useMatomezuState(s => openedOf(s, scope)?.book)
}

// ブック book（id）のタイプが、ブックと中の形に使えるテーマ（book-look/theme-types.ts。ブックが無ければ空）
export function useBookThemes(book: string | undefined): ThemeDef[] {
  const catalog = useCatalog().core
  const type = useMatomezuState(s => (book ? s.books[book]?.type : undefined))
  return useMemo(() => (type === undefined ? [] : themesFor(catalog, type)), [catalog, type])
}

// ブックのテーマの id
export function useBookTheme(book: string | undefined) {
  const catalog = useCatalog().core
  return useMatomezuState(s => {
    const b = book ? s.books[book] : undefined
    return b ? bookTheme(catalog, b) : undefined
  })
}

// 色の見本: テーマ looks の代表色と、「なし」の色（形の塗りのテーマキー fill の値）。表に無いテーマなら null
export function useSwatches(looks: string | undefined, fill: TokenDef) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const dark = useDarkScheme()
  return useMemo(() => {
    if (!looks || !catalog.themes.has(looks)) return null
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

// 描くページのブックの中の形に当てたテーマ theme の、テーマキー defs の値の CSS 変数
// （当てていないか、ブックのタイプが使えないテーマなら undefined。ブックのテーマのまま描く。book-look/theme-types.ts）
export function useThemeVars(theme: string | undefined, defs: readonly TokenDef[]): CSSProperties | undefined
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useThemeVars(
  legacy: string,
  theme: string | undefined,
  defs: readonly TokenDef[],
): CSSProperties | undefined
export function useThemeVars(...given: readonly unknown[]): CSSProperties | undefined {
  const old = given.length === 3
  const theme = (old ? given[1] : given[0]) as string | undefined
  const defs = (old ? given[2] : given[1]) as readonly TokenDef[]
  const catalog = useCatalog().core
  const scope = useScope()
  checkLegacy(scope, old ? (given[0] as string) : undefined, "useThemeVars")
  const type = useMatomezuState(s => bookTypeOf(s, scope))
  return useMemo(() => {
    if (!theme || type === undefined || !themeFits(catalog, type, theme)) return undefined
    const owners = new Set(defs.map(d => splitId(d.id).owner))
    const [owner] = owners // テーマキーの持ち主（アイテムのプラグイン）は 1 つ
    return themeVars(resolveTokens(catalog, theme, defs), owners.size === 1 && owner ? owner : undefined)
  }, [catalog, type, theme, defs])
}
