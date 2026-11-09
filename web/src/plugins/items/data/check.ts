// データのテーマキーの値の確かめ（台帳アセンブルのとき）: テーマが印の動き方のテーマキーに決まった言葉でない値を書いたら、
// 棒の先の丸みに px の長さでない値を書いたら W015（そのテーマのその値だけ効かず、動かさない・既定の丸みで描く）。warning は書いた者（テーマの上書きはテーマのプラグイン、宣言のテーマごとの値はデータのプラグイン）のもの
import { type CatalogCheckDef, warning, writtenValues } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import { MOTION_TOKENS, pxOf } from "./motion"

const RULES = [
  ...MOTION_TOKENS.map(m => ({ token: m.token, ok: (v: string) => m.words.includes(v), expected: m.words.join(", ") })),
  { token: "data-bar-radius", ok: (v: string) => pxOf(v) !== null, expected: "a length in px" },
]

export const DATA_TOKENS_CHECK: CatalogCheckDef = catalog => {
  const declared = [
    ...[...catalog.bookTypes.values(), ...catalog.items.values()].flatMap(d => d.tokens),
    ...catalog.tokens.values(),
  ]
  return [...catalog.themes.values()].flatMap(t =>
    RULES.flatMap(rule => {
      const def = declared.find(d => d.id === kit.name(rule.token))
      const written = def ? writtenValues(t, def) : []
      return written
        .flatMap(({ value: set, by }) =>
          (typeof set === "string" ? [set] : Object.values(set)).map(value => ({ value, by })),
        )
        .filter((w): w is { value: string; by: string } => typeof w.value === "string" && !rule.ok(w.value.trim()))
        .map(({ value, by }) =>
          warning("W015", by, { theme: t.id, token: kit.name(rule.token), value, expected: rule.expected }),
        )
    }),
  )
}
