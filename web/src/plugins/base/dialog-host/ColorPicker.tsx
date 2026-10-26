// 色を選ぶ欄: 今の色の丸いボタン（「なし」のときは、テーマに任せている印に縁を点線にする）。押すと下に色を選ぶポップアップを出す（Figma の形）:
//   上: 見本（代表色など、使う側が渡す）と「なし」。押すとその色になる
//   中: 四角（横が濃さ、縦が明るさ）と、色合いのスライダー、灰色のスライダー（どの色合いでも灰色を選べる）
//   下: 値の欄（#rrggbb。Enter か欄を離れたら決める。読めない値なら元に戻す）
// 四角とスライダーは、動かすそばから onChange に渡す。外を押すか Esc で閉じる（Esc はダイアログには渡さない）。
// ダイアログの中でスクロールしても切れないように、画面の座標で置く
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { type Hsv, hexToHsv, hsvToHex, parseHex } from "../../../core/color"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./ColorPicker.module.css"

export interface Swatch {
  name: string // 選んだときの値（代表色の名前か #rrggbb）
  hex: string // 見本の色（#rrggbb）
  label: string // 見本の名前
}

export function ColorPicker({
  id,
  label,
  value,
  palette,
  none,
  onChange,
}: {
  id?: string
  label: string // ボタンの名前
  value: string | undefined // 代表色の名前か #rrggbb。undefined は「なし」
  palette: readonly Swatch[]
  none: string // 「なし」のときの見た目の色（#rrggbb）
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const hexOf = (v: string | undefined) => (v === undefined ? none : (palette.find(p => p.name === v)?.hex ?? v))
  const shown = hexOf(value)
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={styles.button}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-none={value === undefined}
        style={{ "--color": shown } as CSSProperties}
        onClick={() => setOpen(o => !o)}
      />
      {open && button.current && (
        <Popup
          anchor={button.current}
          value={value}
          start={shown}
          palette={palette}
          onChange={onChange}
          onClose={() => {
            setOpen(false)
            button.current?.focus()
          }}
        />
      )}
    </>
  )
}

function Popup({
  anchor,
  value,
  start,
  palette,
  onChange,
  onClose,
}: {
  anchor: HTMLElement
  value: string | undefined
  start: string
  palette: readonly Swatch[]
  onChange: (value: string | undefined) => void
  onClose: () => void
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(start))
  const [text, setText] = useState(value && !palette.some(p => p.name === value) ? value : hsvToHex(hexToHsv(start)))
  const [at, setAt] = useState({ left: 0, top: 0 })

  // ボタンの下に出す（下に入らなければ上に）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const h = el.offsetHeight
    const top = a.bottom + 4 + h > window.innerHeight ? Math.max(4, a.top - 4 - h) : a.bottom + 4
    setAt({ left: Math.min(a.left, window.innerWidth - el.offsetWidth - 4), top })
    el.focus()
  }, [anchor])

  // 外を押したら閉じる（開いたボタンを押したときは、ボタンの側で閉じる）
  useEffect(() => {
    const down = (e: globalThis.PointerEvent) => {
      if (e.target instanceof Node && (ref.current?.contains(e.target) || anchor.contains(e.target))) return
      onClose()
    }
    document.addEventListener("pointerdown", down, true)
    return () => document.removeEventListener("pointerdown", down, true)
  }, [anchor, onClose])

  const pick = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    setText(hex)
    onChange(hex)
  }
  const chooseSwatch = (s: Swatch) => {
    setHsv(hexToHsv(s.hex))
    setText(s.hex)
    onChange(s.name)
  }
  const commitText = () => {
    const hex = parseHex(text)
    if (!hex) return setText(hsvToHex(hsv))
    setHsv(hexToHsv(hex))
    setText(hex)
    onChange(hex)
  }

  const onSquare = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = e.currentTarget.getBoundingClientRect()
    const clamp = (n: number) => Math.min(1, Math.max(0, n))
    pick({ h: hsv.h, s: clamp((e.clientX - r.left) / r.width), v: 1 - clamp((e.clientY - r.top) / r.height) })
  }

  // Esc は閉じ、値の欄の Enter は値を決める。どちらもダイアログのキー（閉じる・決める）には渡さない（ボタンの Enter は押す動きのまま）
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" && e.key !== "Enter") return
    e.stopPropagation()
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.target instanceof HTMLInputElement && e.target.type === "text") {
      e.preventDefault()
      commitText()
    }
  }

  const gray = hsv.s === 0
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("Choose a color")}
      tabIndex={-1}
      className={styles.popup}
      style={at}
      onKeyDown={onKey}
    >
      <div className={styles.swatches}>
        {palette.map(s => (
          <button
            key={s.name}
            type="button"
            className={styles.swatch}
            style={{ background: s.hex }}
            aria-label={s.label}
            aria-pressed={value === s.name}
            onClick={() => chooseSwatch(s)}
          />
        ))}
        <button
          type="button"
          className={styles.none}
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          {t("None")}
        </button>
      </div>
      <div
        className={styles.square}
        role="presentation"
        aria-label={t("Saturation and brightness")}
        style={{ background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
        onPointerDown={onSquare}
        onPointerMove={onSquare}
      >
        <div className={styles.knob} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div className={styles.row}>
        <span className={styles.current} style={{ background: hsvToHex(hsv) }} />
        <div className={styles.sliders}>
          <input
            type="range"
            className={`${styles.range} ${styles.hue}`}
            min={0}
            max={360}
            aria-label={t("Hue")}
            value={Math.round(hsv.h)}
            onChange={e => pick({ h: Number(e.target.value), s: gray ? 1 : hsv.s, v: hsv.v })}
          />
          <input
            type="range"
            className={`${styles.range} ${styles.gray}`}
            data-off={!gray}
            min={0}
            max={100}
            aria-label={t("Gray")}
            value={gray ? Math.round(hsv.v * 100) : 50}
            onChange={e => pick({ h: hsv.h, s: 0, v: Number(e.target.value) / 100 })}
          />
        </div>
      </div>
      <input
        type="text"
        className={styles.value}
        aria-label={t("Color value (#rrggbb)")}
        spellCheck={false}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commitText}
      />
    </div>
  )
}
