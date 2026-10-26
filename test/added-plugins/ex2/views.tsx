// 判断のひし形のビュー・追加と編集のダイアログ・流れの向きのコンポーネント
import type { z } from "matomezu"
import {
  Dialog,
  type DialogProps,
  type ItemViewProps,
  type SettingControlProps,
  useCommand,
  useMessages,
} from "matomezu/ui"
import { useState } from "react"
import type { DIAMOND } from "./flow"
import { kit } from "./kit"

type DiamondProps = z.output<(typeof DIAMOND)["props"]>

export function DiamondView({ props, size }: ItemViewProps<DiamondProps>) {
  return (
    <svg width={size.w} height={size.h} role="img" aria-label={props.caption} data-ex2-diamond={props.answer ?? ""}>
      <polygon
        points={`${size.w / 2},0 ${size.w},${size.h / 2} ${size.w / 2},${size.h} 0,${size.h / 2}`}
        fill={"var(--diamond-fill)"}
      />
      <text x={size.w / 2} y={size.h / 2} textAnchor="middle" dominantBaseline="middle">
        {props.caption}
      </text>
    </svg>
  )
}

export const DIAMOND_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="12,4 20,12 12,20 4,12" />
  </svg>
)

export function AddDiamondDialog({
  stage,
  args,
  onClose,
}: DialogProps<{ page: string; at: { x: number; y: number } }>) {
  const t = useMessages(kit)
  const add = useCommand(stage, "ex2:add")
  const [caption, setCaption] = useState("")
  return (
    <Dialog title={t("addDecision")} onClose={onClose}>
      <label>
        {t("caption")}
        <input value={caption} onChange={e => setCaption(e.target.value)} />
      </label>
      <button type="button" onClick={() => add.run({ ...args, caption })}>
        {t("add")}
      </button>
    </Dialog>
  )
}

export function EditDiamondDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const t = useMessages(kit)
  const answer = useCommand(stage, "ex2:answer")
  return (
    <Dialog title={t("editDecision")} onClose={onClose}>
      <button type="button" onClick={() => answer.run({ ...args, answer: "yes" })}>
        {t("yes")}
      </button>
      <button type="button" onClick={() => answer.run({ ...args, answer: "no" })}>
        {t("no")}
      </button>
    </Dialog>
  )
}

export function DirectionSetting({ label, value, inherited, onChange }: SettingControlProps<"down" | "right">) {
  const t = useMessages(kit)
  return (
    <label>
      {label}
      <select value={value ?? inherited} onChange={e => onChange(e.target.value as "down" | "right")}>
        <option value="down">{t("down")}</option>
        <option value="right">{t("right")}</option>
      </select>
    </label>
  )
}
