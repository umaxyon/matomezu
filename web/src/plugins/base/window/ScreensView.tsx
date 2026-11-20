// スクリーンアレンジメント「1 枚ずつ」（index.ts の ONE_SCREEN）と「上下に分ける」（split.ts の SPLIT_ROWS）のビュー。2 つのスロットに同じウィジェットを置くので、
// 見せ方を替えても描き直さない（中のスクリーンの状態は残る）。開いているスクリーンを全部重ねて描き、見えているスクリーンを出す。
// ブックスクリーン（ステージを並べるスクリーン）は動かさず、いちばん最近カレントにした 1 枚を下に敷く。ステージを並べないスクリーンは、その上に右から滑り込み、
// ブックスクリーンへ戻すときは右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。後ろに退いた物は消さずに隠し（中のステージ・倍率・選択などは残る）、操作も読み上げも受けない（inert）。
// ステージを並べないスクリーンどうしは、カレントにした順に重ねる（あとからカレントにした物が上）。あとから開いたスクリーンは右から滑り込み、閉じると右へ滑り出る（滑り出る間は描き続ける）。
// 上下に分けている間は、分けた並びのスクリーンを上から等分の高さで並べる。分け始めは、上の物が縮んでから、新しい物が下に滑り込む。押したスクリーンをカレントスクリーンにする。
// 窓が低く（SPLIT_MIN_HEIGHT 未満）なったら、カレントスクリーンだけを残して 1 枚ずつに戻す（ほかの並びの物は閉じる。利用者の操作でないので、ブラウザの履歴に積まない）。
// ブックスクリーンを入れた並び（「画面を分割」で下に書庫のスクリーンを出した物）は畳まず、低い間はカレントスクリーンだけを窓いっぱいに見せる。
// 並びに入れたブックスクリーンは上の行に描き、押せばカレントスクリーンにする。その間、並びに入っていないステージを並べないスクリーンは見せない。
// ステージを並べないスクリーンが出ている間の下の行は、スロット screen-footer に置いたウィジェットを並べる（置いた物が無ければ、下の行を描かない）
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { bookScreenCurrent, type OpenedScreen, recentBookScreen, recentPlainScreen } from "../../../core/window"
import { ScreenView } from "../../../ui/ScreenView"
import { Slot } from "../../../ui/Slot"
import { useLayout, useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { usePluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import footerRow from "../utils/FooterRow.module.css"
import styles from "./ScreensView.module.css"
import { SLIDE_MS } from "./slide"
import { SCREEN_FOOTER } from "./slots"
import { planExpand, SCREEN_FLASH, SPLIT_ROWS } from "./split"
import { applySplit, splitIn, useTallEnough } from "./useScreenSplit"

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const NO_ROWS: readonly string[] = []

// 上下に分けた並びの中の位置（上から何番目・何枚のうち）
interface Row {
  index: number
  of: number
}

export function ScreensView() {
  // カレントスクリーンがブックスクリーンか（CSS が data-current で、どちらを見せるかを決める）
  const currentKind = useMatomezuState(s => bookScreenCurrent(s.window)) ? "book-screen" : "control-center"
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
  // 窓が低い間は、その並びを畳まずに（書庫のスクリーンから開く先が、置かれた所で決まるように）、カレントスクリーンだけを窓いっぱいに見せる
  const tall = useTallEnough()
  const lowMixed = !tall && arranged.some(id => stageScreens.includes(id))
  const split = lowMixed ? NO_ROWS : arranged
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
  useCollapseWhenLow(lowMixed ? NO_ROWS : arranged, current)
  useMarkFits(arranged.length > 0 && arranged.some(id => stageScreens.includes(id)), lowMixed)
  const { makeScreenCurrent } = useStoreActions()
  // 下の行に置いたウィジェットがあるか（無ければ、下の行を描かない）
  const footer = (useLayout().slots[SCREEN_FOOTER]?.length ?? 0) > 0
  // 枠を一瞬光らせる頼み（useScreenSplit の showOf）
  const flash = usePluginState(kit, SCREEN_FLASH)
  // 最初に描いたときから開いていたスクリーンは、滑り込ませない
  const first = useRef<readonly string[] | null>(null)
  if (first.current === null) first.current = plainScreens
  // 閉じられたスクリーンは、滑り出る間だけ、閉じたときの位置で描き続ける
  const last = useRef<{ screens: readonly OpenedScreen[]; rows: ReadonlyMap<string, Row | null> }>({
    screens: [],
    rows: new Map(),
  })
  const opened = useMatomezuState(useShallow(s => s.window.screens.filter(x => !x.stages)))
  const [leaving, setLeaving] = useState<readonly { screen: OpenedScreen; row: Row | null }[]>([])
  const gone = last.current.screens.filter(
    s => !s.stages && !opened.some(x => x.id === s.id) && !leaving.some(l => l.screen.id === s.id),
  )
  if (gone.length > 0)
    setLeaving([...leaving, ...gone.map(screen => ({ screen, row: last.current.rows.get(screen.id) ?? null }))])
  last.current = { screens: opened, rows: new Map(plainScreens.map(id => [id, rowOf(id)])) }
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
          <div
            key={id}
            className={styles.bookScreen}
            data-current={mixed ? "book-screen" : currentKind}
            data-shown={id === book}
            data-row={row !== null}
            data-footer={footer}
            style={row ? ({ "--row-index": row.index, "--row-of": row.of } as CSSProperties) : undefined}
            inert={mixed ? id !== splitBook : currentKind !== "book-screen" || id !== book}
            onPointerDownCapture={() => {
              if (row !== null && id !== current) makeScreenCurrent(id)
            }}
          >
            <ScreenView screen={id} />
          </div>
        )
      })}
      <section
        className={styles.center}
        data-current={mixed ? "control-center" : currentKind}
        data-mixed={mixed}
        inert={!mixed && currentKind !== "control-center"}
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
                flash={flash?.screen === id ? flash.n : 0}
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

// 窓が低くなったら、上下に分けるのをやめる: カレントスクリーンだけを残し、並びのほかの物を閉じる（ブラウザの履歴に積まない）。
// ブックスクリーンを入れた並びは畳まない（見せ方だけを 1 枚にする）
function useCollapseWhenLow(split: readonly string[], current: string | undefined) {
  const tall = useTallEnough()
  const actions = useStoreActions()
  const read = useReadState()
  const low = !tall && split.length > 0
  useEffect(() => {
    if (!low || current === undefined) return
    actions.replaceHistory()
    applySplit(actions, read, planExpand(split, current))
  }, [low, split, current, actions, read])
}

// ブックスクリーンを入れた並びの値に、低くてカレントスクリーンだけを見せているか（fits）を書く（スクリーンアレンジメントが答える見えているスクリーンを、描いている物に合わせる。
// 利用者の操作でないので、ブラウザの履歴に積まない）
function useMarkFits(mixed: boolean, low: boolean) {
  const actions = useStoreActions()
  const read = useReadState()
  useEffect(() => {
    if (!mixed) return
    const win = read().window
    const value = win.arrangementValue as { fits?: string } | undefined
    const fits = low ? "current" : "split"
    if ((value?.fits ?? "split") === fits) return
    actions.replaceHistory()
    actions.setScreenArrangement(SPLIT_ROWS.id, { ...(win.arrangementValue as object), fits })
  }, [mixed, low, actions, read])
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
  const goal = !closed
  const [entered, setEntered] = useState(closed ? true : !slides)
  // 縮むのを待つのは、滑り込む 1 回だけ（入ったあとの位置の変わりは待たない）
  const [waits, setWaits] = useState(late && slides)
  useEffect(() => {
    if (entered === goal) return
    const frame = requestAnimationFrame(() => setEntered(goal))
    return () => cancelAnimationFrame(frame)
  }, [entered, goal])
  useEffect(() => {
    if (!waits || !entered) return
    const timer = setTimeout(() => setWaits(false), reduced() ? 0 : SLIDE_MS * 2)
    return () => clearTimeout(timer)
  }, [waits, entered])
  const place = {
    zIndex: layer,
    ...(row ? { "--row-top": `${(row.index * 100) / row.of}%`, "--row-height": `${100 / row.of}%` } : {}),
  } as CSSProperties
  return (
    <div
      className={styles.plain}
      data-in={entered}
      data-top={top}
      data-row={row !== null}
      data-late={waits}
      style={place}
      inert={!shown}
      onPointerDownCapture={onPress}
    >
      <ScreenView screen={screen} {...(closed ? { closed } : {})} />
      {flash > 0 ? <span key={flash} className={styles.flash} aria-hidden="true" /> : null}
    </div>
  )
}
