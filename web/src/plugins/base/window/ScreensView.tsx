// スクリーンアレンジメント「1 枚ずつ」（index.ts の ONE_SCREEN）と「上下に分ける」（split.ts の SPLIT_ROWS）のビュー。2 つのスロットに同じウィジェットを置くので、
// 見せ方を替えても描き直さない（中のスクリーンの状態は残る）。開いているスクリーンを全部重ねて描き、見えているスクリーンを出す。
// ブックスクリーン（ステージを並べるスクリーン）は動かさず、いちばん最近カレントにした 1 枚を下に敷く（閉じたときは、右へ滑り出て、後ろの物を出す）。ステージを並べないスクリーンは、その上に右から滑り込み、
// ブックスクリーンへ戻すときは右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。後ろに退いた物は消さずに隠し（中のステージ・倍率・選択などは残る）、操作も読み上げも受けない（inert）。
// ステージを並べないスクリーンどうしは、カレントにした順に重ねる（あとからカレントにした物が上）。あとから開いたスクリーンは右から滑り込み、閉じると右へ滑り出る（滑り出る間は描き続ける）。
// 上下に分けている間は、分けた並びのスクリーンを上から等分の高さで並べる。分け始めは、上の物が縮んでから、新しい物が下に滑り込む。押したスクリーンをカレントスクリーンにする。
// 窓が低く（SPLIT_MIN_HEIGHT 未満）なったら、カレントスクリーンだけを残して 1 枚ずつに戻す（ほかの並びの物は閉じる。利用者の操作でないので、ブラウザの履歴に積まない）。
// ブックスクリーンを入れた並び（「画面を分割」で下に書庫のスクリーンを出した物）は畳まず、低い間はカレントスクリーンだけを窓いっぱいに見せる。
// 並びに入れたブックスクリーンは上の行に描き、押せばカレントスクリーンにする。その間、並びに入っていないステージを並べないスクリーンは見せない。
// ステージを並べないスクリーンが出ている間の下の行は、スロット screen-footer に置いたウィジェットを並べる（置いた物が無ければ、下の行を描かない）

import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { NO_STATE } from "../../../core/def/plugin-state"
import { bookScreenCurrent, type OpenedScreen, recentBookScreen, recentPlainScreen } from "../../../core/window"
import { usePluginState } from "../../../ui/plugin-state-hooks"
import { ScreenView } from "../../../ui/ScreenView"
import { Slot } from "../../../ui/Slot"
import { useLayout, useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import footerRow from "../utils/FooterRow.module.css"
import styles from "./ScreensView.module.css"
import { SLIDE_MS } from "./slide"
import { SCREEN_FOOTER } from "./slots"
import { SCREEN_FLASH, SPLIT_ROWS } from "./split"
import { splitIn, useTallEnough, wideIn } from "./useScreenSplit"

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const NO_ROWS: readonly string[] = []

// 上下に分けた並びの中の位置（上から何番目・何枚のうち）
interface Row {
  index: number
  of: number
}

export function ScreensView() {
  // カレントスクリーンがブックスクリーンか（CSS が data-current で、どちらを見せるかを決める）
  const currentKind = useMatomezuState(s => bookScreenCurrent(s.window)) ? "book-screen" : "plain-screen"
  // 見せるブックスクリーン（いちばん最近カレントにした 1 枚）と、見せるステージを並べないスクリーン（同じく。無ければ none）
  const recentBook = useMatomezuState(s => recentBookScreen(s.window)?.id)
  const top = useMatomezuState(s => recentPlainScreen(s.window))
  const current = useMatomezuState(s => s.window.order[s.window.order.length - 1])
  const stageScreens = useMatomezuState(useShallow(s => s.window.screens.filter(x => x.stages).map(x => x.id)))
  // ステージを並べないスクリーン（描く順は開いた順のまま動かさない。押した物をカレントにして要素を動かすと、その押しが届かなくなる）と、
  // カレントにした順（重なり。あとからカレントにした物が上）
  const plainScreens = useMatomezuState(useShallow(s => s.window.screens.filter(x => !x.stages).map(x => x.id)))
  const layers = useMatomezuState(useShallow(s => s.window.order.filter(id => plainScreens.includes(id))))
  // 上下に分けた並び（分けていなければ空）。カレントスクリーンが並びに無い間は、分けて見せない
  const arranged = useMatomezuState(useShallow(s => splitIn(s.window)))
  // 並びに入れたブックスクリーン（ステージを分けて、下に書庫のスクリーンを出しているときなど）。居れば、それを上の行に描き、コントロールセンターの側は並びの行だけを出す。
  // 窓が低い間は、どの並びも畳まずに（下の行から開く先が、置かれた所で決まるように）、カレントスクリーンだけを窓いっぱいに見せる
  const tall = useTallEnough()
  const low = !tall && arranged.length > 0
  const split = low ? NO_ROWS : arranged
  const splitting = split.length > 0
  const splitBook = split.find(id => stageScreens.includes(id))
  const mixed = splitBook !== undefined
  const book = splitBook ?? recentBook
  const rowOf = (id: string): Row | null =>
    splitting && split.includes(id) ? { index: split.indexOf(id), of: split.length } : null
  // 分け始めか（前に描いたときは分けていなかった。新しく入る物は、上の物が縮むのを待ってから滑り込む）
  const wasSplitting = useRef(splitting)
  const starting = splitting && !wasSplitting.current
  useEffect(() => {
    wasSplitting.current = splitting
  })
  useMarkFits(arranged.length > 0, low)
  const { makeScreenCurrent } = useStoreActions()
  // 下の行に置いたウィジェットがあるか（無ければ、下の行を描かない）
  const footer = (useLayout().slots[SCREEN_FOOTER]?.length ?? 0) > 0
  // 枠を一瞬光らせる頼み（useScreenSplit の showOf）
  const flash = usePluginState(kit, SCREEN_FLASH)
  // 最初に描いたときから開いていたスクリーンは、滑り込ませない
  const first = useRef<readonly string[] | null>(null)
  if (first.current === null) first.current = [...plainScreens, ...stageScreens]
  // ブックスクリーンを閉じたら、その間はコントロールセンターの側を滑らせずに出す（閉じた物が、上から右へ出ていく）
  const lastBooks = useRef(stageScreens)
  const [instant, setInstant] = useState(false)
  const bookClosed = lastBooks.current.some(id => !stageScreens.includes(id))
  if (bookClosed && !instant) setInstant(true)
  // 新しく開いたブックスクリーン（並びのブックスクリーンを閉じて、別のブックを窓いっぱいに開いたときも、閉じた物の上を滑り込む）
  const newBooks = stageScreens.filter(id => !lastBooks.current.includes(id))
  lastBooks.current = stageScreens
  useEffect(() => {
    if (!instant) return
    const timer = setTimeout(() => setInstant(false), reduced() ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [instant])
  // 閉じられたスクリーンは、滑り出る間だけ、閉じたときの位置で描き続ける
  // （見えていなかった物は写さない。窓の上限で、見えていない物が閉じる）
  const last = useRef<{
    screens: readonly OpenedScreen[]
    rows: ReadonlyMap<string, Row | null>
    shown: ReadonlySet<string>
  }>({
    screens: [],
    rows: new Map(),
    shown: new Set(),
  })
  const opened = useMatomezuState(useShallow(s => s.window.screens.filter(x => !x.stages)))
  const [leaving, setLeaving] = useState<readonly { screen: OpenedScreen; row: Row | null }[]>([])
  const gone = last.current.screens.filter(
    s =>
      !s.stages &&
      last.current.shown.has(s.id) &&
      !opened.some(x => x.id === s.id) &&
      !leaving.some(l => l.screen.id === s.id),
  )
  if (gone.length > 0)
    setLeaving([...leaving, ...gone.map(screen => ({ screen, row: last.current.rows.get(screen.id) ?? null }))])
  last.current = {
    screens: opened,
    rows: new Map(plainScreens.map(id => [id, rowOf(id)])),
    shown: new Set(plainScreens.filter(id => rowOf(id) !== null || (!splitting && id === top?.id))),
  }
  // 窓いっぱいに見せるブックスクリーンが替わったら、新しく見せる物を、ほかのスクリーンの上に出す（over。その間、コントロールセンターの側は動かさずに残す）。
  // 並びの外から来た物は右から滑り込み、並びの中にいた物（下の行の □ で広げた）はその場から伸びる。閉じたスクリーンの後ろから出てきたときは、動かさない
  // （閉じたのと一緒に新しく開いた物は、閉じた物の上を滑り込む）。
  // 窓いっぱいだった物が並びに戻るとき（もう一度 □）と、もう開いていた物と上下に分かれたとき（最初から窓いっぱいの物の □）も、ほかの物の上で、その場から縮む
  const wholeBook = !mixed && currentKind === "book-screen" ? book : undefined
  const lastWhole = useRef(wholeBook)
  const lastSplit = useRef(split)
  // 並びのうち、窓いっぱいに広げている物（下の行の □）。戻すのは、前に描いたときに広げていた物だけ（「画面を分割」で並びに入った物は戻すのでない）
  const wide = useMatomezuState(s => wideIn(s.window))
  const lastWide = useRef(wide)
  // 前に描いたときのステージを並べないスクリーン（窓いっぱいだった物が、もう開いていた物と上下に分かれたら、その場から縮む）
  const lastPlain = useRef(plainScreens)
  const [over, setOver] = useState<{ id: string; slides: boolean } | undefined>(undefined)
  if (wholeBook !== lastWhole.current) {
    const was = lastWhole.current
    lastWhole.current = wholeBook
    if (
      wholeBook !== undefined &&
      (!bookClosed || newBooks.includes(wholeBook)) &&
      gone.length === 0 &&
      over?.id !== wholeBook
    )
      setOver({ id: wholeBook, slides: !lastSplit.current.includes(wholeBook) })
    else if (
      wholeBook === undefined &&
      was !== undefined &&
      (was === lastWide.current ||
        (!lastSplit.current.includes(was) && split.every(id => id === was || lastPlain.current.includes(id)))) &&
      split.includes(was) &&
      over?.id !== was
    ) {
      setOver({ id: was, slides: false })
      setInstant(true)
    }
  }
  lastSplit.current = split
  lastWide.current = wide
  lastPlain.current = plainScreens
  useEffect(() => {
    if (over === undefined) return
    // 滑り込み終えたら、残したコントロールセンターの側を、動かさずに消す
    const timer = setTimeout(
      () => {
        setOver(undefined)
        setInstant(true)
      },
      reduced() ? 0 : SLIDE_MS,
    )
    return () => clearTimeout(timer)
  }, [over])
  useEffect(() => {
    if (leaving.length === 0) return
    const timer = setTimeout(() => setLeaving([]), reduced() ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [leaving])
  return (
    <>
      {stageScreens.map(id => {
        const row = rowOf(id)
        return (
          <BookScreen
            key={id}
            screen={id}
            current={mixed ? "book-screen" : currentKind}
            shown={id === book || (mixed && row !== null)}
            row={row}
            footer={footer}
            currentInRow={row !== null && id === current}
            fresh={!first.current?.includes(id)}
            closing={instant && over === undefined}
            over={over?.id === id}
            slidesOver={over?.id === id && over.slides}
            inert={mixed ? row === null : currentKind !== "book-screen" || id !== book}
            onPress={() => {
              if (row !== null && id !== current) makeScreenCurrent(id)
            }}
          />
        )
      })}
      <section
        className={styles.center}
        data-current={mixed ? "plain-screen" : currentKind}
        data-mixed={mixed}
        data-instant={instant}
        data-held={over !== undefined}
        inert={!mixed && currentKind !== "plain-screen"}
      >
        <div className={styles.body}>
          {plainScreens.map(id => {
            const row = rowOf(id)
            const shown = row !== null || (!splitting && id === top?.id)
            return (
              <PlainScreen
                key={id}
                screen={id}
                top={id === top?.id}
                shown={shown}
                row={row}
                slides={!first.current?.includes(id)}
                layer={layers.indexOf(id) + (row === null ? 0 : layers.length)}
                flash={flash !== NO_STATE && flash.screen === id ? flash.n : 0}
                late={starting && row !== null && id === current}
                onPress={() => {
                  if (row !== null && id !== current) makeScreenCurrent(id)
                }}
              />
            )
          })}
          {leaving.map(l => (
            <PlainScreen
              key={l.screen.id}
              screen={l.screen.id}
              closed={l.screen}
              top={false}
              shown={false}
              row={l.row}
              layer={layers.length * 2}
              flash={0}
              slides
              late={false}
            />
          ))}
        </div>
        {footer && (
          <footer className={`${footerRow.row} ${styles.footer}`}>
            <Slot name={SCREEN_FOOTER} props={{}} />
          </footer>
        )}
      </section>
    </>
  )
}

// 上下に分けた並びの値に、低くてカレントスクリーンだけを見せているか（fits）を書く（スクリーンアレンジメントが答える見えているスクリーンを、描いている物に合わせる。
// 利用者の操作でないので、ブラウザの履歴に積まない）
function useMarkFits(split: boolean, low: boolean) {
  const actions = useStoreActions()
  const read = useReadState()
  useEffect(() => {
    if (!split) return
    const win = read().window
    const value = win.arrangementValue as { fits?: string } | undefined
    const fits = low ? "current" : "split"
    if ((value?.fits ?? "split") === fits) return
    actions.replaceHistory()
    actions.setScreenArrangement(SPLIT_ROWS.id, { ...(win.arrangementValue as object), fits })
  }, [split, low, actions, read])
}

// 滑る物の位置 entered を、描いた次のコマで goal に合わせる（CSS の transition が動く）。waits（上の物が縮むのを待っている）は、入ってから縮む分と滑る分の間で解く
function useSlideFrames(
  entered: boolean,
  goal: boolean,
  setEntered: (now: boolean) => void,
  waits: boolean,
  setWaits: (now: boolean) => void,
) {
  useEffect(() => {
    if (entered === goal) return
    const frame = requestAnimationFrame(() => setEntered(goal))
    return () => cancelAnimationFrame(frame)
  }, [entered, goal, setEntered])
  useEffect(() => {
    if (!waits || !entered) return
    const timer = setTimeout(() => setWaits(false), reduced() ? 0 : SLIDE_MS * 2)
    return () => clearTimeout(timer)
  }, [waits, entered, setWaits])
}

// ブックスクリーン 1 枚。上下に分けた並びに新しく入る物（並びに入っていなかった物か新しく開いた物 fresh が、カレントスクリーンとして入る。currentInRow で入った瞬間を見分ける）は、
// 並びのほかの物が縮み終えてから、右から滑り込む。並びの中で位置が替わるだけのときと、並びの外の物は滑らない。閉じると、右へ滑り出る
function BookScreen({
  screen,
  current,
  shown,
  row,
  footer,
  currentInRow,
  fresh,
  over,
  slidesOver,
  closing,
  inert,
  onPress,
}: {
  screen: string
  current: string
  shown: boolean
  row: Row | null
  footer: boolean
  currentInRow: boolean
  fresh: boolean
  over: boolean
  slidesOver: boolean
  closing: boolean
  inert: boolean
  onPress: () => void
}) {
  const inRow = row !== null
  // 新しく開いた物は、並びの外から入ったと見る
  const wasInRow = useRef(fresh ? false : inRow)
  // 並びに入った瞬間に、右の外から始める（並びのほかの物が縮み終えてから滑り込む）
  const [entered, setEntered] = useState(true)
  const [waits, setWaits] = useState(false)
  if (inRow && !wasInRow.current && currentInRow && entered && !over) {
    setEntered(false)
    setWaits(true)
  }
  // 窓いっぱいに見せ始めた物は、ほかのスクリーンの上を右から滑り込む（slidesOver。並びの中から広げた物は、その場から伸びる）
  const wasOver = useRef(false)
  if (slidesOver && !wasOver.current && entered) setEntered(false)
  // ほかのブックスクリーンを閉じて（closing）並びの位置が替わった物は、閉じた物が右へ出ていき終えてから、ほかの物の上を新しい位置へ動く
  const lastIndex = useRef(row?.index)
  const [moves, setMoves] = useState(false)
  if (closing && row !== null && lastIndex.current !== undefined && row.index !== lastIndex.current && !moves)
    setMoves(true)
  lastIndex.current = row?.index
  useEffect(() => {
    if (!moves) return
    const timer = setTimeout(() => setMoves(false), reduced() ? 0 : SLIDE_MS * 2)
    return () => clearTimeout(timer)
  }, [moves])
  const box = useRef<HTMLDivElement>(null)
  const read = useReadState()
  useSlideOutWhenClosed(box, screen, read)
  useEffect(() => {
    wasInRow.current = inRow
    wasOver.current = slidesOver
  })
  useSlideFrames(entered, true, setEntered, waits, setWaits)
  return (
    <div
      className={styles.bookScreen}
      data-current={current}
      data-shown={shown}
      data-row={inRow}
      data-in={entered}
      data-late={waits}
      data-over={over}
      data-moves={moves}
      data-footer={footer}
      ref={box}
      style={row ? ({ "--row-index": row.index, "--row-of": row.of } as CSSProperties) : undefined}
      inert={inert}
      onPointerDownCapture={onPress}
    >
      <ScreenView screen={screen} />
    </div>
  )
}

// 閉じたブックスクリーン screen を、閉じたときの見た目のまま右へ滑り出させる（中のステージはもう読めないので、描いた物の写しを動かし、動き終えたら消す）。
// 写しはコントロールセンターの側より上に置く。描き直しで外れただけ（スクリーンがまだ開いている）なら写さない
function useSlideOutWhenClosed(
  box: { current: HTMLDivElement | null },
  screen: string,
  read: ReturnType<typeof useReadState>,
) {
  useLayoutEffect(() => {
    const node = box.current
    const parent = node?.parentElement
    return () => {
      if (!node || !parent || reduced()) return
      if (read().window.screens.some(s => s.id === screen)) return
      const copy = node.cloneNode(true) as HTMLDivElement
      copy.removeAttribute("data-current")
      copy.setAttribute("data-leaving", "")
      copy.setAttribute("aria-hidden", "true")
      copy.inert = true
      parent.appendChild(copy)
      setTimeout(() => copy.remove(), SLIDE_MS)
    }
  }, [box, screen, read])
}

// ステージを並べないスクリーン 1 枚。slides なら、描いた次のコマで右から滑り込ませる（late なら、上の物が縮むのを待ってから）。
// closed を渡すと、閉じたスクリーンを、位置を戻した形で描いた次のコマに右へ滑り出させる（最初から右に描くと、動かずに消える）。
// row があれば、上下に分けた並びの位置と高さで描く（無ければ、窓いっぱい）。重なりは layer。見えていない物は、操作も読み上げも受けない。
// flash が増えると、枠を一瞬光らせて消す
function PlainScreen({
  screen,
  top,
  shown,
  row,
  layer,
  flash,
  slides,
  late,
  closed,
  onPress,
}: {
  screen: string
  top: boolean
  shown: boolean
  row: Row | null
  layer: number // 重なりの順（大きい物が上。分けた並びの物は、ほかの物より上）
  flash: number // 枠を光らせた回数（0 なら光らせない。増えるたびに光り直す）
  slides: boolean
  late: boolean
  closed?: OpenedScreen
  onPress?: () => void
}) {
  // 並びから外れて見えなくなった物（閉じずに開いたまま）は、閉じる物と同じく右へ滑り出て、また見せるときに右から滑り込む
  // （滑り出る間は、外れた行の位置のまま。out は外れた行）
  const [out, setOut] = useState<Row | null>(null)
  // 前に描いたときの行（行は描くたびに作り直すので、位置で比べる）
  const [lastRow, setLastRow] = useState(row)
  if ((lastRow && `${lastRow.index}/${lastRow.of}`) !== (row && `${row.index}/${row.of}`)) {
    setLastRow(row)
    if (lastRow !== null && row === null && !shown) setOut(lastRow)
  }
  if (out !== null && shown) setOut(null)
  const at = row ?? out
  const goal = !closed && out === null
  const [entered, setEntered] = useState(closed ? true : !slides)
  // 縮むのを待つのは、滑り込む 1 回だけ（入ったあとの位置の変わりは待たない）
  const [waits, setWaits] = useState(late && slides)
  useSlideFrames(entered, goal, setEntered, waits, setWaits)
  const place = {
    zIndex: layer,
    ...(at ? { "--row-top": `${(at.index * 100) / at.of}%`, "--row-height": `${100 / at.of}%` } : {}),
  } as CSSProperties
  return (
    <div
      className={styles.plain}
      data-in={entered}
      data-top={top}
      data-row={at !== null}
      data-late={waits}
      data-out={out !== null}
      style={place}
      inert={!shown}
      onPointerDownCapture={onPress}
    >
      <ScreenView screen={screen} {...(closed ? { closed } : {})} />
      {flash > 0 ? <span key={flash} className={styles.flash} aria-hidden="true" /> : null}
    </div>
  )
}
