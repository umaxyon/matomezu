// 形（箱やリストなど）の画面が共に使うもの: ダイアログのフック（開いているブック・ブックのテーマ・色の見本・寄せの選択肢）と寄せのアイコン、
// 形に当てたテーマの値を CSS 変数にするフック
import { useMemo } from "react"
import { PALETTE } from "../../../core/color"
import type { TokenDecl } from "../../../core/def/theme"
import type { MessageKey } from "../../../core/i18n/i18n"
import { splitId } from "../../../core/names"
import { resolveTokens } from "../../../core/theme"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { bookTheme } from "../book-look/look"
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

// 開いたステージで開いているブックの id
export const useBookOf = (stage: string) =>
  useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)

// ブックのテーマの id
export function useBookTheme(book: string | undefined) {
  const catalog = useCatalog().core
  return useMatomezuState(s => {
    const b = book ? s.books[book] : undefined
    return b ? bookTheme(catalog, b) : undefined
  })
}

// 色の見本: テーマ looks の代表色と、「なし」の色（形の塗りの欄 fill の値）。表に無いテーマなら null
export function useSwatches(looks: string | undefined, fill: TokenDecl) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  return useMemo(() => {
    if (!looks || !catalog.themes.has(looks)) return null
    const tokens = resolveTokens(catalog, looks, [fill])
    // 役割の名前は出さない（意味を利用者に押し付けない）
    const palette = PALETTE.map((name, i) => ({
      name,
      hex: tokens[`palette.${name}`]?.light ?? "#ffffff",
      label: t("Theme color {n}", { n: i + 1 }),
    }))
    return { palette, none: tokens[fill.id]?.light ?? "#ffffff" }
  }, [catalog, looks, fill, t])
}

// 形に当てたテーマ theme の、欄 decls の値の CSS 変数（当てていないか、表に無いテーマなら undefined。ブックのテーマのまま描く）
export function useThemeVars(theme: string | undefined, decls: readonly TokenDecl[]) {
  const catalog = useCatalog().core
  return useMemo(() => {
    if (!theme || !catalog.themes.has(theme)) return undefined
    const owners = new Set(decls.map(d => splitId(d.id).owner))
    const [owner] = owners // 欄の持ち主（アイテムのプラグイン）は 1 つ
    return themeVars(resolveTokens(catalog, theme, decls), owners.size === 1 && owner ? owner : undefined)
  }, [catalog, theme, decls])
}
