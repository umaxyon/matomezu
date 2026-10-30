// データのテーマキーの値の確かめ（組み立てのとき）: テーマが印の動き方のテーマキーに決まった言葉でない値を書いたら、
// 棒の先の丸みに px の長さでない値を書いたら W015（そのテーマのその値だけ効かず、動かさない・既定の丸みで描く）。warning はテーマのプラグインのもの
import { type CatalogCheck, warning } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import { MOTION_TOKENS, pxOf } from "./motion"

const RULES = [
  ...MOTION_TOKENS.map(m => ({ token: m.token, ok: (v: string) => m.words.includes(v), expected: m.words.join(", ") })),
  { token: "data-bar-radius", ok: (v: string) => pxOf(v) !== null, expected: "a length in px" },
]

export const DATA_TOKENS_CHECK: CatalogCheck = catalog =>
  [...catalog.themes.values()].flatMap(t =>
    RULES.flatMap(rule => {
      const set = t.tokens?.[kit.name(rule.token)]
      const values = set === undefined ? [] : typeof set === "string" ? [set] : Object.values(set)
      return values
        .filter((v): v is string => typeof v === "string" && !rule.ok(v.trim()))
        .map(value =>
          warning("W015", t.id.split(":")[0] ?? "", {
            theme: t.id,
            token: kit.name(rule.token),
            value,
            expected: rule.expected,
          }),
        )
    }),
  )
