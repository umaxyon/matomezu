// スクリーンアレンジメント「1 枚ずつ」（index.ts の ONE_SCREEN）のビュー: 開いているスクリーンを全部重ねて描き、カレントスクリーンの 1 枚を出す。
// ブックスクリーン（ステージを並べるスクリーン）は動かさず、いちばん最近カレントにした 1 枚を下に敷く。ステージを並べないスクリーンは、その上に右から滑り込み、
// ブックスクリーンへ戻すときは右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。後ろに退いた物は消さずに隠し（中のステージ・倍率・選択などは残る）、操作も読み上げも受けない（inert）。
// ステージを並べないスクリーンどうしは、カレントにした順に重ねる（あとからカレントにした物が上）。あとから開いたスクリーンは右から滑り込み、閉じると右へ滑り出る（滑り出る間は描き続ける）。
// ステージを並べないスクリーンが出ている間の下の行は、スロット control-center-footer に置いたウィジェットを並べる（止まり木のボタンは UI マッピングが置く）
import { useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { frontOf, type OpenedScreen, recentBookScreen, recentPlainScreen } from "../../../core/window"
import { ScreenView } from "../../../ui/ScreenView"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState } from "../../../ui/store-context"
import footerRow from "../utils/FooterRow.module.css"
import styles from "./OneScreenView.module.css"
import { SLIDE_MS } from "./slide"
import { CONTROL_CENTER_FOOTER } from "./slots"

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export function OneScreenView() {
  const front = useMatomezuState(s => frontOf(s.window))
  // 見せるブックスクリーン（いちばん最近カレントにした 1 枚）と、見せるステージを並べないスクリーン（同じく。無ければ none）
  const book = useMatomezuState(s => recentBookScreen(s.window).id)
  const top = useMatomezuState(s => recentPlainScreen(s.window))
  const stageScreens = useMatomezuState(useShallow(s => s.window.screens.filter(x => x.stages).map(x => x.id)))
  // ステージを並べないスクリーンを、カレントにした順に（下から上へ）
  const plainScreens = useMatomezuState(
    useShallow(s => s.window.order.filter(id => s.window.screens.some(x => x.id === id && !x.stages))),
  )
  // 最初に描いたときから開いていたスクリーンは、滑り込ませない
  const first = useRef<readonly string[] | null>(null)
  if (first.current === null) first.current = plainScreens
  // いちばん上のスクリーンが閉じられたら、滑り出る間だけ描き続ける
  const last = useRef<OpenedScreen | undefined>(undefined)
  const [leaving, setLeaving] = useState<OpenedScreen | null>(null)
  const was = last.current
  if (was && was.id !== top?.id && !plainScreens.includes(was.id) && leaving?.id !== was.id) setLeaving(was)
  last.current = top
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), reduced() ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [leaving])
  return (
    <>
      {stageScreens.map(id => (
        <div
          key={id}
          className={styles.bookScreen}
          data-front={front}
          data-shown={id === book}
          inert={front !== "book-screen" || id !== book}
        >
          <ScreenView screen={id} />
        </div>
      ))}
      <section className={styles.center} data-front={front} inert={front !== "control-center"}>
        <div className={styles.body}>
          {plainScreens.map(id => (
            <PlainScreen key={id} screen={id} top={id === top?.id} slides={!first.current?.includes(id)} />
          ))}
          {leaving && <PlainScreen key={leaving.id} screen={leaving.id} closed={leaving} top={false} slides />}
        </div>
        <footer className={`${footerRow.row} ${styles.footer}`}>
          <Slot name={CONTROL_CENTER_FOOTER} props={{}} />
        </footer>
      </section>
    </>
  )
}

// ステージを並べないスクリーン 1 枚。slides なら、描いた次のコマで右から滑り込ませる。closed を渡すと、閉じたスクリーンを右へ滑り出しながら描く
function PlainScreen({
  screen,
  top,
  slides,
  closed,
}: {
  screen: string
  top: boolean
  slides: boolean
  closed?: OpenedScreen
}) {
  const [entered, setEntered] = useState(!slides)
  useEffect(() => {
    if (entered) return
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [entered])
  return (
    <div className={styles.plain} data-in={closed ? false : entered} data-top={top} inert={!top}>
      <ScreenView screen={screen} {...(closed ? { closed } : {})} />
    </div>
  )
}
