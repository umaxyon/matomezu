// 節の大きさの選び方のコンポーネント（設定の項目 node-size のビュー）: 伸びる・N 字で折り返す・N 字で固定から選ぶ。
// 既定を選べば値を消す
import { settingOr } from "../../../core/def/setting"
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

// 選び方の選択（inherit を渡せば、先頭に「ページを継承（その選び方）」を置き、それを選ぶと undefined）
export function NodeSizeSelect({
  label,
  value,
  inherit,
  onChange,
}: {
  label: string
  value: NodeSize | undefined
  inherit?: { size: NodeSize }
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
      {inherit && <option value={INHERIT}>{t("Inherit from page ({size})", { size: name(inherit.size) })}</option>}
      {NODE_SIZES.map(s => (
        <option key={s} value={s}>
          {name(s)}
        </option>
      ))}
    </select>
  )
}

export function NodeSizeSetting({ label, value, inherited: given, onChange, onReset }: SettingControlProps<NodeSize>) {
  const inherited = settingOr(given, DEFAULT_NODE_SIZE)
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <NodeSizeSelect
        label={label}
        value={settingOr(value, inherited)}
        onChange={v => (v === undefined || v === inherited ? onReset() : onChange(v))}
      />
    </div>
  )
}
