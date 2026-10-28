// 節の大きさの選び方のコンポーネント（設定の項目 node-size のビュー）: 伸びる・N 字で折り返す・N 字で固定から選ぶ。
// ブックの設定では既定を選べば値を消し、ページの設定では先頭の「ブックを継承」を選べば値を消す（継承の名前に、今のブックの選び方を添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { controlClass, rowClass } from "../../base/ui"
import { kit } from "./kit"
import { DEFAULT_NODE_SIZE, NODE_SIZES, type NodeSize, sizeRule } from "./size"

// 選び方の名前を引く関数
export function useSizeName() {
  const t = useMessages(kit)
  return (size: NodeSize) => {
    const { mode, chars } = sizeRule(size)
    return mode === "grow" ? t("Grows") : t(mode === "wrap" ? "Wraps at {n}" : "Fixed at {n}", { n: chars ?? 0 })
  }
}

const INHERIT = ""

// 選び方の選択（inherit を渡せば、先頭に「ブックを継承（その選び方）」か「ページを継承（その選び方）」を置き、それを選ぶと undefined）
export function NodeSizeSelect({
  label,
  value,
  inherit,
  onChange,
}: {
  label: string
  value: NodeSize | undefined
  inherit?: { size: NodeSize; from: "book" | "page" }
  onChange: (value: NodeSize | undefined) => void
}) {
  const t = useMessages(kit)
  const name = useSizeName()
  return (
    <select
      aria-label={label}
      className={controlClass}
      value={value ?? INHERIT}
      onChange={e => {
        const picked = NODE_SIZES.find(s => s === e.target.value)
        onChange(picked)
      }}
    >
      {inherit && (
        <option value={INHERIT}>
          {t(inherit.from === "book" ? "Inherit from book ({size})" : "Inherit from page ({size})", {
            size: name(inherit.size),
          })}
        </option>
      )}
      {NODE_SIZES.map(s => (
        <option key={s} value={s}>
          {name(s)}
        </option>
      ))}
    </select>
  )
}

export function NodeSizeSetting({ of, label, value, inherited: given, onChange }: SettingControlProps<NodeSize>) {
  const inherited = given ?? DEFAULT_NODE_SIZE
  return (
    <div className={rowClass}>
      <span>{label}</span>
      {of === "book" ? (
        <NodeSizeSelect
          label={label}
          value={value ?? inherited}
          onChange={v => onChange(v === inherited ? undefined : v)}
        />
      ) : (
        <NodeSizeSelect label={label} value={value} inherit={{ size: inherited, from: "book" }} onChange={onChange} />
      )}
    </div>
  )
}
