// スキンの表。足すときは、定義のファイルを作ってここに 1 行足す。
// 設定が "auto" なら、OS の明暗に合わせて AUTO の組から選ぶ
import { DARK } from "./dark"
import type { SkinDef } from "./def"
import { LIGHT } from "./light"

export const SKINS = [DARK, LIGHT] as const satisfies readonly SkinDef[]
export type SkinId = (typeof SKINS)[number]["id"]
export const AUTO: { light: SkinId; dark: SkinId } = { light: "light", dark: "dark" }

const rules = (skin: SkinDef) =>
  [`color-scheme: ${skin.scheme};`, ...Object.entries(skin.tokens).map(([k, v]) => `--skin-${k}: ${v};`)].join(" ")

// 表のスキンを CSS にする。根の要素の data-skin で選び、無ければ OS の明暗に合わせる
export function skinCss(): string {
  const byId = new Map<string, SkinDef>(SKINS.map(s => [s.id, s]))
  const auto = (id: SkinId) => rules(byId.get(id) as SkinDef)
  return [
    ...SKINS.map(s => `:root[data-skin="${s.id}"] { ${rules(s)} }`),
    `:root:not([data-skin]) { ${auto(AUTO.dark)} }`,
    `@media (prefers-color-scheme: light) { :root:not([data-skin]) { ${auto(AUTO.light)} } }`,
  ].join("\n")
}
