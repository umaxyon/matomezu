// 星のビュー・ダイアログ、方眼のコンポーネント、ミントにするボタン
import type { z } from "matomezu"
import {
  Dialog,
  type DialogProps,
  type ItemViewProps,
  type SettingControlProps,
  useCommand,
  useMessages,
} from "matomezu/ui"
import type { STAR } from "./board"
import { kit } from "./kit"

type StarProps = z.output<(typeof STAR)["props"]>

const starPoints = (n: number, w: number, h: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 0.5 : 0.22
    const a = (Math.PI * i) / n - Math.PI / 2
    return `${w / 2 + Math.cos(a) * r * w},${h / 2 + Math.sin(a) * r * h}`
  }).join(" ")

export function StarView({ props, size }: ItemViewProps<StarProps>) {
  return (
    <svg width={size.w} height={size.h} role="img" aria-label={props.caption} data-ex3-star={props.points}>
      <polygon points={starPoints(props.points, size.w, size.h)} fill={"var(--star-fill)"} />
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
  const t = useMessages(kit)
  return (
    <Dialog title={t("addStar")} onClose={onClose}>
      {null}
    </Dialog>
  )
}

export function EditStarDialog({ onClose }: DialogProps<{ page: string; item: string }>) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("editStar")} onClose={onClose}>
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

// ステージの下の行に置くボタン。紙のあるブックを開いていなければ出ない
export function MintButton({ stage }: { stage: string }) {
  const mint = useCommand(stage, "ex3:mint")
  const t = useMessages(kit)
  if (!mint.shown) return null
  return (
    <button type="button" onClick={() => mint.run()}>
      {t(mint.title)}
    </button>
  )
}
