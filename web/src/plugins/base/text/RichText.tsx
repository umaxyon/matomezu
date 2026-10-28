// 装飾した本文の 1 行（rich.ts の区切りの並び）を描く: 太字は太さ 700、色は文字の色の CSS 変数（ステージがブックの要素に置く。無い色なら文字の色のまま）
import type { RichLine } from "./rich"
import { textColorVarName } from "./text-colors"

export function RichText({ line }: { line: RichLine }) {
  return line.map((r, i) =>
    !r.bold && r.color === null ? (
      r.text
    ) : (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: 区切りは本文の順の並びで、並べ替えない
        key={i}
        style={{
          fontWeight: r.bold ? 700 : undefined,
          color: r.color === null ? undefined : `var(${textColorVarName(r.color)}, inherit)`,
        }}
      >
        {r.text}
      </span>
    ),
  )
}
