// スクリーンアレンジメント「1 枚ずつ」（index.ts の ONE_SCREEN）のビュー: 開いているスクリーンを全部重ねて描き、カレントスクリーンの 1 枚を出す。
// ブックスクリーン（ステージを並べるスクリーン）は動かさず、いちばん最近カレントにした 1 枚を下に敷く。ステージを並べないスクリーンは、その上に右から滑り込み、
// ブックスクリーンへ戻すときは右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。後ろに退いた物は消さずに隠し（中のステージ・倍率・選択などは残る）、操作も読み上げも受けない（inert）。
// ステージを並べないスクリーンが出ている間の下の行は、スロット control-center-footer に置いたウィジェットを並べる（止まり木のボタンは UI マッピングが置く）
import { useShallow } from "zustand/react/shallow"
import { frontOf, recentBookScreen, recentPlainScreen } from "../../../core/window"
import { ScreenView } from "../../../ui/ScreenView"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState } from "../../../ui/store-context"
import footerRow from "../utils/FooterRow.module.css"
import styles from "./OneScreenView.module.css"
import { CONTROL_CENTER_FOOTER } from "./slots"

export function OneScreenView() {
  const front = useMatomezuState(s => frontOf(s.window))
  // 見せるブックスクリーン（いちばん最近カレントにした 1 枚）と、見せるステージを並べないスクリーン（同じく。無ければ none）
  const book = useMatomezuState(s => recentBookScreen(s.window).id)
  const plain = useMatomezuState(s => recentPlainScreen(s.window)?.id ?? "none")
  const stageScreens = useMatomezuState(useShallow(s => s.window.screens.filter(x => x.stages).map(x => x.id)))
  const plainScreens = useMatomezuState(useShallow(s => s.window.screens.filter(x => !x.stages).map(x => x.id)))
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
            <div key={id} className={styles.plain} data-shown={id === plain} inert={id !== plain}>
              <ScreenView screen={id} />
            </div>
          ))}
        </div>
        <footer className={`${footerRow.row} ${styles.footer}`}>
          <Slot name={CONTROL_CENTER_FOOTER} props={{}} />
        </footer>
      </section>
    </>
  )
}
