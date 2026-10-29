// 本文の装飾を見たまま編集する入力Form（contenteditable）。記号は見せず、太字・文字の色の区切りを span で描き、書き換えるたびに本文の文字列（rich.ts の記号の形）に戻して onChange に渡す。
// 字の並びと装飾は edit.ts で扱い、位置は平文の位置。value が外から変わったときだけ描き直す（打っている間の字の並びは入力Form のものを正とする）。
// ブラウザに任せない所: 改行（multiline のときだけ「\n」を足し、1 行なら足さない）、貼り付け（文字だけ。1 行なら改行を空白に）、落とす、ブラウザの太字などの装飾、元に戻す・やり直し（自前の履歴）。
// 日本語の変換中は描き直さず、変換を終えてから読む。maxLength は記号の形の字数で数え、超える書き換えは取り消す。
// 範囲を選ばずに装飾のボックスを押すと、その所から次に書く字にその装飾を付ける
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react"
import {
  charsOf,
  type Decoration,
  insertChars,
  restyle,
  type Style,
  type StyledChar,
  styleAt,
  styled,
  textOf,
} from "./edit"
import { textColorVarName, textColorVars } from "./text-colors"
import { useTextColors } from "./use-text-colors"

// 装飾のボックス（RichBar）が入力Form に頼む口
export interface RichInputHandle {
  decorate(d: Decoration): void
}

interface Selection {
  start: number
  end: number
}

const HISTORY_MAX = 200

export function RichInput({
  ref,
  stage,
  value,
  onChange,
  multiline,
  maxLength = Number.POSITIVE_INFINITY,
  id,
  label,
  className,
  style,
  autoFocus,
  onKeyDown,
  onFocus,
  onBlur,
  onPointerDown,
  data,
}: {
  ref?: Ref<RichInputHandle>
  stage: string // 文字の色を決めるブックを開いているステージ（ステージの外のダイアログでも、その色で描く）
  value: string
  onChange: (text: string) => void
  multiline: boolean
  maxLength?: number
  id?: string
  label: string
  className?: string
  style?: CSSProperties
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  data?: Readonly<Record<`data-${string}`, string>> // 見た目を分ける data- の属性
}) {
  const el = useRef<HTMLDivElement>(null)
  const colors = useTextColors(stage)
  const emitted = useRef<string | null>(null) // 最後に描いた・渡した本文
  const chars = useRef<StyledChar[]>([])
  const before = useRef<Selection>({ start: 0, end: 0 }) // 書き換える前の範囲（超えて取り消すときに戻す）
  const composing = useRef(false) // 日本語の変換中
  const pending = useRef<{ at: number; style: Style } | null>(null) // 範囲を選ばずに付けた、次に書く字の装飾
  const steps = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] })
  const change = useRef(onChange)
  change.current = onChange

  // 字の並びを描き、範囲を選び直す
  const draw = (next: StyledChar[], sel: Selection | null) => {
    const root = el.current
    if (!root) return
    chars.current = next
    paint(root, next)
    if (sel && document.activeElement === root) select(root, sel)
  }

  // 字の並びを決めて、本文が変わっていれば渡す（履歴に積む）
  const commit = (next: StyledChar[], sel: Selection, before: Selection) => {
    const text = textOf(next)
    if (text.length > maxLength) {
      draw(chars.current, before)
      return
    }
    const prev = emitted.current ?? ""
    const prevChars = chars.current
    draw(next, sel)
    if (text === prev) return
    const h = steps.current
    h.past = [...h.past.slice(-HISTORY_MAX + 1), { chars: prevChars, sel: before }]
    h.future = []
    emitted.current = text
    change.current(text)
  }

  const restore = (from: "past" | "future") => {
    const h = steps.current
    const snap = h[from].at(-1)
    if (!snap) return
    const other = from === "past" ? "future" : "past"
    h[from] = h[from].slice(0, -1)
    h[other] = [...h[other], { chars: chars.current, sel: selectionOf(el.current) ?? snap.sel }]
    draw(snap.chars, snap.sel)
    emitted.current = textOf(snap.chars)
    change.current(emitted.current)
  }

  // 外から value が変わったら描き直す（自分が渡した値なら描き直さない）
  useLayoutEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    steps.current = { past: [], future: [] }
    pending.current = null
    draw(charsOf(value), null)
  })

  useEffect(() => {
    if (!autoFocus || !el.current) return
    el.current.focus()
    select(el.current, { start: chars.current.length, end: chars.current.length })
  }, [autoFocus])

  // 入力Form の字を読み、範囲を選ばずに付けた装飾があれば、その所から書いた字に付ける
  const sync = (before: Selection) => {
    const root = el.current
    if (!root) return
    let next = readChars(root, multiline)
    const sel = selectionOf(root) ?? { start: next.length, end: next.length }
    const p = pending.current
    if (p && sel.start === sel.end && sel.start > p.at) {
      next = next.map((c, i) => (i >= p.at && i < sel.start && c.ch !== "\n" ? { ...c, ...p.style } : c))
      pending.current = null
    }
    commit(next, sel, before)
  }

  // 選んでいる範囲を字 text に置き換える（範囲を選ばずに付けた装飾があればその装飾で、無ければ前の字の装飾を継ぐ）
  const replace = (text: string) => {
    const sel = selectionOf(el.current)
    if (!sel) return
    const p = pending.current
    const s = p && p.at === sel.start && sel.start === sel.end ? p.style : styleAt(chars.current, sel.start)
    pending.current = null
    const at = sel.start + [...text].length
    commit(insertChars(chars.current, sel.start, sel.end, text, s), { start: at, end: at }, sel)
  }

  useImperativeHandle(ref, () => ({
    decorate(d) {
      const sel = selectionOf(el.current)
      if (!sel) return
      if (sel.start === sel.end) {
        const base = pending.current?.at === sel.start ? pending.current.style : styleAt(chars.current, sel.start)
        pending.current = { at: sel.start, style: styled(base, d) }
        return
      }
      commit(restyle(chars.current, sel.start, sel.end, d), sel, sel)
    },
  }))

  useEffect(() => {
    const root = el.current
    if (!root) return
    const onBeforeInput = (e: InputEvent) => {
      const sel = selectionOf(root)
      if (sel) before.current = sel
      if (pending.current && sel && pending.current.at !== sel.start) pending.current = null
      const type = e.inputType
      if (type === "insertParagraph" || type === "insertLineBreak") {
        e.preventDefault()
        if (multiline) replace("\n")
      } else if (type === "historyUndo" || type === "historyRedo") {
        e.preventDefault()
        restore(type === "historyUndo" ? "past" : "future")
      } else if (type.startsWith("format") || type === "insertFromDrop" || type === "insertFromPaste") {
        e.preventDefault()
      } else if (type === "insertText" && !e.isComposing && pending.current && e.data) {
        e.preventDefault()
        replace(e.data)
      }
    }
    const onInput = (e: Event) => {
      if (composing.current || (e as InputEvent).isComposing) return
      sync(before.current)
    }
    const onCompositionStart = () => {
      const sel = selectionOf(root)
      if (sel) before.current = sel
      if (pending.current && sel && pending.current.at !== sel.start) pending.current = null
      composing.current = true
    }
    const onCompositionEnd = () => {
      composing.current = false
      sync(before.current)
    }
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n")
      replace(multiline ? text : text.replace(/\n/g, " "))
    }
    root.addEventListener("beforeinput", onBeforeInput)
    root.addEventListener("input", onInput)
    root.addEventListener("compositionstart", onCompositionStart)
    root.addEventListener("compositionend", onCompositionEnd)
    root.addEventListener("paste", onPaste)
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput)
      root.removeEventListener("input", onInput)
      root.removeEventListener("compositionstart", onCompositionStart)
      root.removeEventListener("compositionend", onCompositionEnd)
      root.removeEventListener("paste", onPaste)
    }
  })

  return (
    // biome-ignore lint/a11y/useSemanticElements: 装飾を見たまま書くので、input・textarea ではなく contenteditable の textbox
    <div
      ref={el}
      id={id}
      role="textbox"
      tabIndex={0}
      aria-label={label}
      aria-multiline={multiline}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={className}
      style={{ whiteSpace: multiline ? "pre-wrap" : "pre", ...(colors ? textColorVars(colors) : {}), ...style }}
      onKeyDown={e => {
        // 元に戻す・やり直しは自前の履歴で（描き直した字の並びはブラウザの履歴に無い）
        const z = e.key.toLowerCase() === "z"
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (z || e.key.toLowerCase() === "y")) {
          e.preventDefault()
          restore(z && !e.shiftKey ? "past" : "future")
          return
        }
        onKeyDown?.(e)
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      {...data}
    />
  )
}

interface Snapshot {
  chars: StyledChar[]
  sel: Selection
}

// 字の並びを、装飾の続きごとの span にして描く（太字は data-bold、色は data-color。改行は字のまま、終わりの改行の後ろには br を置いて行を見せる）
function paint(root: HTMLElement, chars: readonly StyledChar[]) {
  root.replaceChildren()
  let span: HTMLSpanElement | null = null
  let last: Style | null = null
  for (const c of chars) {
    if (!span || !last || last.bold !== c.bold || last.color !== c.color) {
      span = document.createElement("span")
      if (c.bold) {
        span.dataset.bold = "true"
        span.style.fontWeight = "700"
      }
      if (c.color !== null) {
        span.dataset.color = c.color
        span.style.color = `var(${textColorVarName(c.color)}, inherit)`
      }
      root.append(span)
      last = { bold: c.bold, color: c.color }
    }
    span.append(c.ch)
  }
  for (const s of root.querySelectorAll("span")) s.normalize()
  if (chars.at(-1)?.ch === "\n") root.append(document.createElement("br"))
}

// 入力Form の字を読む（字の装飾は、囲む span の data-bold・data-color）。描き直す前にブラウザが入れた br と div・p も、複数行なら改行として読む。
// 全体を読むなら（tail）、終わりの br はブラウザが行を見せるために置くものなので読まない
function readChars(root: Node, multiline: boolean, tail = true): StyledChar[] {
  const out: StyledChar[] = []
  const newline = () => out.push({ ch: "\n", bold: false, color: null })
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let last: Node | null = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    last = n
    if (n instanceof HTMLElement) {
      if (!multiline) continue
      if (n.tagName === "BR") newline()
      else if ((n.tagName === "DIV" || n.tagName === "P") && out.length > 0 && out.at(-1)?.ch !== "\n") newline()
      continue
    }
    const span = (n as Text).parentElement?.closest("span")
    const inside = span && root.contains(span) ? span : null
    const style: Style = { bold: inside?.dataset.bold === "true", color: inside?.dataset.color ?? null }
    for (const ch of (n as Text).data) out.push({ ch, ...(ch === "\n" ? { bold: false, color: null } : style) })
  }
  if (tail && multiline && last instanceof HTMLElement && last.tagName === "BR") out.pop()
  return out
}

function textNodes(root: Node): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

// DOM の所（ノードとその中の位置）を、平文の位置（その所より前の字の数。readChars と同じ読み方）にする
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange()
  r.setStart(root, 0)
  r.setEnd(node, offset)
  return readChars(r.cloneContents(), root.getAttribute("aria-multiline") === "true", false).length
}

function selectionOf(root: HTMLElement | null): Selection | null {
  const s = root ? document.getSelection() : null
  if (!root || !s || s.rangeCount === 0) return null
  const r = s.getRangeAt(0)
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
  const start = offsetOf(root, r.startContainer, r.startOffset)
  const end = offsetOf(root, r.endContainer, r.endOffset)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

// 平文の位置を DOM の所にする（区切りの境目では前の区切りの終わり。前の装飾で書き続けられるように）
function pointOf(root: HTMLElement, at: number): { node: Node; offset: number } {
  let left = at
  for (const t of textNodes(root)) {
    const cps = [...t.data]
    if (left <= cps.length) return { node: t, offset: cps.slice(0, left).join("").length }
    left -= cps.length
  }
  return { node: root, offset: root.childNodes.length }
}

function select(root: HTMLElement, sel: Selection) {
  const s = document.getSelection()
  if (!s) return
  const a = pointOf(root, sel.start)
  const b = pointOf(root, sel.end)
  const r = document.createRange()
  r.setStart(a.node, a.offset)
  r.setEnd(b.node, b.offset)
  s.removeAllRanges()
  s.addRange(r)
}
