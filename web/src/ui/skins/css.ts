// スキンを CSS にする。根の要素の data-skin でスキンを選び、付いていなければ自動のスキン（OS の明暗に合わせて、明と暗の組から選ぶ）。
// スキンキーは --skin-<スキンキー>。外観枠の代表色は --skin-palette-<役割>（その上に置く字は --skin-palette-<役割>-ink）、ブックの外で描くコードの色は --skin-code-<種類>
import { CODE_COLORS, PALETTE } from "../../core/color"
import { SKIN_TOKENS, type SkinDef } from "../../core/def/skin"
import { type AutoSkin, paletteInk, SKIN_CODE_COLORS, skinPalette } from "../../core/skin"

const rules = (skin: SkinDef) => {
  const palette = skinPalette(skin)
  return [
    `color-scheme: ${skin.scheme};`,
    ...SKIN_TOKENS.map(k => `--skin-${k}: ${skin.tokens[k]};`),
    ...PALETTE.flatMap(role => [
      `--skin-palette-${role}: ${palette[role]};`,
      `--skin-palette-${role}-ink: ${paletteInk(palette[role])};`,
    ]),
    ...CODE_COLORS.map(kind => `--skin-code-${kind}: ${SKIN_CODE_COLORS[skin.scheme][kind]};`),
  ].join(" ")
}

export function skinCss(skins: ReadonlyMap<string, SkinDef>, auto: AutoSkin | null): string {
  const byScheme = (id: string) => rules(skins.get(id) as SkinDef)
  return [
    ...[...skins.values()].map(s => `:root[data-skin="${s.id}"] { ${rules(s)} }`),
    ...(auto
      ? [
          `:root:not([data-skin]) { ${byScheme(auto.dark)} }`,
          `@media (prefers-color-scheme: light) { :root:not([data-skin]) { ${byScheme(auto.light)} } }`,
        ]
      : []),
  ].join("\n")
}
