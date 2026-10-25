// ひし形のビュー・ダイアログと、流れの向きの部品

import { Dialog, type DialogProps, type ItemViewProps, type SettingControlProps, useT } from "matomezu/ui"
import type { z } from "zod"
import type { DIAMOND } from "./flow"

type DiamondProps = z.output<(typeof DIAMOND)["props"]>

export function DiamondView({ props, size }: ItemViewProps<DiamondProps>) {
  return (
    <svg width={size.w} height={size.h} role="img" aria-label={props.caption} data-hoge-diamond>
      <polygon
        points={`${size.w / 2},0 ${size.w},${size.h / 2} ${size.w / 2},${size.h} 0,${size.h / 2}`}
        fill="var(--theme-hoge-flow-diamond-fill)"
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

export function AddDiamondDialog({ onClose }: DialogProps<{ page: string; at: { x: number; y: number } }>) {
  const t = useT()
  return (
    <Dialog title={t("Add hoge diamond")} onClose={onClose}>
      {null}
    </Dialog>
  )
}

export function EditDiamondDialog({ onClose }: DialogProps<{ page: string; item: string }>) {
  const t = useT()
  return (
    <Dialog title={t("Edit hoge diamond")} onClose={onClose}>
      {null}
    </Dialog>
  )
}

export function DirectionSetting({ label, value, inherited, onChange }: SettingControlProps<"down" | "right">) {
  const t = useT()
  return (
    <label>
      {label}
      <select value={value ?? inherited} onChange={e => onChange(e.target.value as "down" | "right")}>
        <option value="down">{t("Down")}</option>
        <option value="right">{t("Right")}</option>
      </select>
    </label>
  )
}
