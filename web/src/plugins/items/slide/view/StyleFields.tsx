// バーに並ぶ、選んだアイテムの見た目の入力Form: 文字枠=文字色、線=色・太さ・点線（直線だけ矢印）、楕円=塗り・枠の色・枠の太さ。
// アイテムの種類に合う物だけを出し、変えるのはコマンド slide-set（行えなければ押せない）。色は「なし」（塗りは塗らない。枠の色は枠なし）か、テーマの代表色か、好きな色
import { useRef, useState } from "react"
import { useActions, useCommand, useMessages } from "../../../../plugin-api/ui"
import { ColorPicker, useBookOf, usePageTheme, useSwatches } from "../../../base/ui"
import { SLIDE_SET } from "../commands"
import { kit } from "../kit"
import {
  DEFAULT_STROKE_WIDTH,
  ELLIPSE,
  FREE_LINE,
  MAX_STROKE_WIDTH,
  NO_OUTLINE,
  SLIDE_INK,
  STRAIGHT_LINE,
  TEXT_FRAME,
} from "../slide"
import styles from "./Selection.module.css"

// 選んだアイテム: item は種類の id、props は項目
export interface StyleSubject {
  id: string
  item: string
  props: Readonly<Record<string, unknown>>
}

// 種類ごとに並べる入力Form（出し分けの表。単体テストが見る）
export type StyleField = "text-color" | "color" | "width" | "dashed" | "arrow" | "fill" | "outline" | "outline-width"

export function fieldsOf(item: string): readonly StyleField[] {
  if (item === TEXT_FRAME.id) return ["text-color"]
  if (item === FREE_LINE.id) return ["color", "width", "dashed"]
  if (item === STRAIGHT_LINE.id) return ["color", "width", "dashed", "arrow"]
  if (item === ELLIPSE.id) return ["fill", "outline", "outline-width"]
  return []
}

// 選んだ物の全部に効く入力Form（種類が混ざれば、どの種類にもある物だけ）
export function commonFields(items: readonly string[]): readonly StyleField[] {
  const [first, ...rest] = items
  if (first === undefined) return []
  return fieldsOf(first).filter(field => rest.every(item => fieldsOf(item).includes(field)))
}

// 複数を選んだときにバーを出すか（全部に効く入力Formがあるときだけ。無ければ、中身の空のバーは出さない）
export const showsGroupBar = (items: readonly string[]): boolean => commonFields(items).length > 0

// 選んだアイテムの入力Form。複数なら、全部に一度に効かせる（今の値は最初の物のもの）
export function StyleFields({ subjects }: { subjects: readonly StyleSubject[] }) {
  const subject = subjects[0]
  const fields = commonFields(subjects.map(s => s.item))
  const t = useMessages(kit)
  const set = useCommand(SLIDE_SET.id)
  const book = useBookOf()
  const { continueStep } = useActions()
  const swatches = useSwatches(usePageTheme(), SLIDE_INK)
  if (!subject) return null
  const change = (props: Record<string, unknown>, continues = false) => {
    if (continues && book) continueStep(book) // 入力の途中の変更は、最初の変更の元に戻す 1 段に続ける
    set.run({ items: subjects.map(s => s.id), props })
  }
  const str = (key: string) => (typeof subject.props[key] === "string" ? (subject.props[key] as string) : undefined)
  const num = (key: string) => (typeof subject.props[key] === "number" ? (subject.props[key] as number) : undefined)
  // outline: 枠の色。「なし」は枠なし（NO_OUTLINE）で、未設定（テーマの文字の色の枠）とは別
  const colorField = (field: StyleField, key: string, label: string, outline = false) =>
    swatches && (
      <span key={field} className={styles.field}>
        {label}
        <ColorPicker
          label={label}
          value={outline ? (str(key) === NO_OUTLINE ? undefined : (str(key) ?? swatches.none)) : str(key)}
          palette={swatches.palette}
          none={swatches.none}
          disabled={!set.enabled}
          onChange={v => change({ [key]: v ?? (outline ? NO_OUTLINE : null) })}
        />
      </span>
    )
  if (fields.length === 0) return null
  return (
    <>
      <span className={styles.divider} aria-hidden="true" />
      {fields.map(field => {
        switch (field) {
          case "text-color":
            return colorField(field, "color", t("Text color"))
          case "color":
            return colorField(field, "color", t("Color"))
          case "fill":
            return colorField(field, "fill", t("Fill"))
          case "outline":
            return colorField(field, "stroke", t("Outline color"), true)
          case "width":
            return (
              <WidthField
                key={field}
                label={t("Width")}
                value={num("width") ?? DEFAULT_STROKE_WIDTH}
                zero={false}
                disabled={!set.enabled}
                onCommit={(n, continues) => change({ width: n }, continues)}
              />
            )
          case "outline-width":
            return (
              <WidthField
                key={field}
                label={t("Width")}
                value={num("width") ?? DEFAULT_STROKE_WIDTH}
                zero
                disabled={!set.enabled}
                onCommit={(n, continues) => change({ width: n }, continues)}
              />
            )
          case "dashed":
            return (
              <button
                key={field}
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
                key={field}
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
  onCommit: (n: number, continues: boolean) => void // continues: 同じ入力の中の 2 回目以降（元に戻す 1 段に続ける）
}) {
  const [text, setText] = useState(String(value))
  const started = useRef(false) // この入力で、もう 1 回変えたか
  const valid = (s: string): number | null => {
    const n = Number(s)
    return s.trim() === "" || !Number.isFinite(n) || (zero ? n < 0 : n <= 0) || n > MAX_STROKE_WIDTH ? null : n
  }
  const apply = (n: number) => {
    if (n === value) return
    onCommit(n, started.current)
    started.current = true
  }
  const commit = () => {
    started.current = false
    const n = valid(text)
    if (n === null) setText(String(value))
    else apply(n)
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
        onChange={e => {
          setText(e.target.value)
          const n = valid(e.target.value)
          if (n !== null) apply(n) // 入力の途中でも、数として読めれば見た目に反映する
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
      />
    </label>
  )
}
