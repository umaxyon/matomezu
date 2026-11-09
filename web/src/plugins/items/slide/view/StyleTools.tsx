// バーに並ぶ、選んだアイテムの見た目の道具: 文字枠=文字色、線=色・太さ・点線（直線だけ矢印）、楕円=塗り・枠の色・枠の太さ。
// アイテムの種類に合う物だけを出し、変えるのはコマンド slide-set（行えなければ押せない）。色は「なし」（テーマの文字の色。塗りは塗らない）か、テーマの代表色か、好きな色
import { useState } from "react"
import { useCommand, useMessages } from "../../../../plugin-api/ui"
import { ColorPicker, useBookOf, useBookTheme, useSwatches } from "../../../base/ui"
import { SLIDE_SET } from "../commands"
import { kit } from "../kit"
import {
  DEFAULT_STROKE_WIDTH,
  ELLIPSE,
  FREE_LINE,
  MAX_STROKE_WIDTH,
  SLIDE_INK,
  STRAIGHT_LINE,
  TEXT_FRAME,
} from "../slide"
import styles from "./Selection.module.css"

// 選んだアイテム: item は種類の id、props は項目
export interface StyleSubject {
  id: string
  stage: string
  item: string
  props: Readonly<Record<string, unknown>>
}

// 種類ごとに並べる道具（出し分けの表。単体テストが見る）
export type StyleTool = "text-color" | "color" | "width" | "dashed" | "arrow" | "fill" | "outline" | "outline-width"

export function toolsOf(item: string): readonly StyleTool[] {
  if (item === TEXT_FRAME.id) return ["text-color"]
  if (item === FREE_LINE.id) return ["color", "width", "dashed"]
  if (item === STRAIGHT_LINE.id) return ["color", "width", "dashed", "arrow"]
  if (item === ELLIPSE.id) return ["fill", "outline", "outline-width"]
  return []
}

// 選んだ物の全部に効く道具（種類が混ざれば、どの種類にもある物だけ）
export function commonTools(items: readonly string[]): readonly StyleTool[] {
  const [first, ...rest] = items
  if (first === undefined) return []
  return toolsOf(first).filter(tool => rest.every(item => toolsOf(item).includes(tool)))
}

// 複数を選んだときにバーを出すか（全部に効く道具があるときだけ。無ければ、中身の空のバーは出さない）
export const showsGroupBar = (items: readonly string[]): boolean => commonTools(items).length > 0

// 選んだアイテムの道具。複数なら、全部に一度に効かせる（今の値は最初の物のもの）
export function StyleTools({ subjects }: { subjects: readonly StyleSubject[] }) {
  const subject = subjects[0]
  const tools = commonTools(subjects.map(s => s.item))
  const t = useMessages(kit)
  const set = useCommand(subject?.stage ?? "", SLIDE_SET.id)
  const swatches = useSwatches(useBookTheme(useBookOf(subject?.stage ?? "")), SLIDE_INK)
  if (!subject) return null
  const change = (props: Record<string, unknown>) => set.run({ items: subjects.map(s => s.id), props })
  const str = (key: string) => (typeof subject.props[key] === "string" ? (subject.props[key] as string) : undefined)
  const num = (key: string) => (typeof subject.props[key] === "number" ? (subject.props[key] as number) : undefined)
  const colorField = (tool: StyleTool, key: string, label: string) =>
    swatches && (
      <span key={tool} className={styles.tool}>
        {label}
        <ColorPicker
          label={label}
          value={str(key)}
          palette={swatches.palette}
          none={swatches.none}
          disabled={!set.enabled}
          onChange={v => change({ [key]: v ?? null })}
        />
      </span>
    )
  if (tools.length === 0) return null
  return (
    <>
      <span className={styles.divider} aria-hidden="true" />
      {tools.map(tool => {
        switch (tool) {
          case "text-color":
            return colorField(tool, "color", t("Text color"))
          case "color":
            return colorField(tool, "color", t("Color"))
          case "fill":
            return colorField(tool, "fill", t("Fill"))
          case "outline":
            return colorField(tool, "stroke", t("Outline color"))
          case "width":
            return (
              <WidthField
                key={tool}
                label={t("Width")}
                value={num("width") ?? DEFAULT_STROKE_WIDTH}
                zero={false}
                disabled={!set.enabled}
                onCommit={n => change({ width: n })}
              />
            )
          case "outline-width":
            return (
              <WidthField
                key={tool}
                label={t("Width")}
                value={num("width") ?? DEFAULT_STROKE_WIDTH}
                zero
                disabled={!set.enabled}
                onCommit={n => change({ width: n })}
              />
            )
          case "dashed":
            return (
              <button
                key={tool}
                type="button"
                className={styles.button}
                aria-pressed={str("dash") === "dashed"}
                disabled={!set.enabled}
                onClick={() => change({ dash: str("dash") === "dashed" ? null : "dashed" })}
              >
                {t("Dashed")}
              </button>
            )
          case "arrow":
            return (
              <button
                key={tool}
                type="button"
                className={styles.button}
                aria-pressed={str("endHead") === "arrow"}
                disabled={!set.enabled}
                onClick={() => change({ endHead: str("endHead") === "arrow" ? null : "arrow" })}
              >
                {t("Arrow")}
              </button>
            )
          default:
            return null
        }
      })}
    </>
  )
}

// 太さの数字の入力。決める（Enter か外へ出る）と変える。数字でない・範囲の外なら元に戻す
function WidthField({
  label,
  value,
  zero,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  zero: boolean // 0 を入れてよい（楕円の枠なし）。線は 0 より大きい数だけ（項目の決まり）
  disabled: boolean
  onCommit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = Number(text)
    if (text.trim() === "" || !Number.isFinite(n) || (zero ? n < 0 : n <= 0) || n > MAX_STROKE_WIDTH) {
      setText(String(value))
      return
    }
    if (n !== value) onCommit(n)
  }
  return (
    <label className={styles.numberField}>
      {label}
      <input
        type="number"
        min={zero ? 0 : undefined}
        max={MAX_STROKE_WIDTH}
        step={1}
        value={text}
        disabled={disabled}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
      />
    </label>
  )
}
