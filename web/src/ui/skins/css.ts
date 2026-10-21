// スキンを CSS にする。根の要素の data-skin でスキンを選び、付いていなければ自動のスキン（OS の明暗に合わせて、明と暗の組から選ぶ）
import { SKIN_TOKENS, type SkinDef } from "../../core/def/skin"
import type { AutoSkin } from "../../core/skin"

const rules = (skin: SkinDef) =>
  [`color-scheme: ${skin.scheme};`, ...SKIN_TOKENS.map(k => `--skin-${k}: ${skin.tokens[k]};`)].join(" ")

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
