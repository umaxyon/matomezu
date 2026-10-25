// 星のビュー・ダイアログ、方眼の部品、ミントにするボタン
import { Dialog, type DialogProps, type ItemViewProps, type SettingControlProps, useCommand, useT } from "matomezu/ui"
import type { z } from "zod"
import type { STAR } from "./board"

type StarProps = z.output<(typeof STAR)["props"]>

const starPoints = (n: number, w: number, h: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 0.5 : 0.22
    const a = (Math.PI * i) / n - Math.PI / 2
    return `${w / 2 + Math.cos(a) * r * w},${h / 2 + Math.sin(a) * r * h}`
  }).join(" ")

export function StarView({ props, size }: ItemViewProps<StarProps>) {
  return (
    <svg width={size.w} height={size.h} role="img" aria-label={props.caption} data-fuga-star={props.points}>
      <polygon points={starPoints(props.points, size.w, size.h)} fill="var(--theme-fuga-star-fill)" />
      <text x={size.w / 2} y={size.h / 2} textAnchor="middle" dominantBaseline="middle">
        {props.caption}
      </text>
    </svg>
  )
}

export const STAR_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polygon points={starPoints(5, 24, 24)} />
  </svg>
)

export function AddStarDialog({ onClose }: DialogProps<{ page: string; at: { x: number; y: number } }>) {
  const t = useT()
  return (
    <Dialog title={t("Add fuga star")} onClose={onClose}>
      {null}
    </Dialog>
  )
}

export function EditStarDialog({ onClose }: DialogProps<{ page: string; item: string }>) {
  const t = useT()
  return (
    <Dialog title={t("Edit fuga star")} onClose={onClose}>
      {null}
    </Dialog>
  )
}

export function GridSetting({ label, value, inherited, onChange }: SettingControlProps<boolean>) {
  return (
    <label>
      <input type="checkbox" checked={value ?? inherited} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function MintButton({ stage }: { stage: string }) {
  const mint = useCommand(stage, "fuga/mint")
  const t = useT()
  if (!mint.shown) return null
  return (
    <button type="button" onClick={() => mint.run()}>
      {t(mint.title)}
    </button>
  )
}
