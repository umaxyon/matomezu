// 窓の根のビュー（ウィジェット window）: 開いているスクリーンを全部重ねて描き、前の 1 枚を出す。スクリーンを描くのは、その定義の id と同じ名前のスロットに置いたウィジェット。
// ブックスクリーン（ステージを並べるスクリーン）は動かさず、いちばん最近前に出した 1 枚を下に敷く。ステージを並べないスクリーンは、その上に右から滑り込み、
// ブックスクリーンへ戻すときは右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。後ろに退いた物は消さずに隠し（中のステージ・倍率・選択などは残る）、操作も読み上げも受けない（inert）。
// ステージを並べないスクリーンの下の行は、スロット control-center-footer に置いたウィジェットを並べる（止まり木のボタンは UI マッピングが置く）。
// 左に左サイドパネル（left-side-panel/）を置く。開けば、右の画面を押し縮める（前に出している物は替えない）
import type { CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"
import type { SlotId } from "../../../core/catalog"
import { currentScreen, frontOf, recentBookScreen, recentPlainScreen } from "../../../core/window"
import { Slot } from "../../../ui/Slot"
import { ScreenProvider } from "../../../ui/screen-context"
import { useMatomezuState } from "../../../ui/store-context"
import { LeftSidePanel } from "../left-side-panel/LeftSidePanel"
import footerRow from "../utils/FooterRow.module.css"
import { SLIDE_MS } from "./slide"
import { CONTROL_CENTER_FOOTER } from "./slots"
import styles from "./WindowView.module.css"

export function WindowView() {
  const front = useMatomezuState(s => frontOf(s.window))
  const currentId = useMatomezuState(s => currentScreen(s.window).id)
  const screens = useMatomezuState(s => s.window.screens)
  // 見せるブックスクリーン（いちばん最近前に出した 1 枚）と、見せるステージを並べないスクリーン（同じく。無ければ none）
  const book = useMatomezuState(s => recentBookScreen(s.window).id)
  const plain = useMatomezuState(s => recentPlainScreen(s.window)?.id ?? "none")
  const ids = useMatomezuState(useShallow(s => s.window.screens.map(x => x.id)))
  const drawn = (id: string) => {
    const s = screens.find(x => x.id === id)
    if (!s) return null
    return (
      <ScreenProvider
        screen={{ id: s.id, def: s.def, props: s.props, shown: s.id === currentId, current: s.id === currentId }}
      >
        <Slot name={s.def as SlotId} props={{} as never} />
      </ScreenProvider>
    )
  }
  const stageScreens = ids.filter(id => screens.find(x => x.id === id)?.stages !== undefined)
  const plainScreens = ids.filter(id => screens.find(x => x.id === id)?.stages === undefined)
  return (
    <div
      className={styles.window}
      style={
        {
          ["--front-slide" as string]: `${SLIDE_MS}ms`,
          ["--side-panel-slide" as string]: `${SLIDE_MS}ms`,
        } as CSSProperties
      }
    >
      <LeftSidePanel />
      <div className={styles.screens}>
        {stageScreens.map(id => (
          <div
            key={id}
            className={styles.bookScreen}
            data-front={front}
            data-shown={id === book}
            inert={front !== "book-screen" || id !== book}
          >
            {drawn(id)}
          </div>
        ))}
        <section className={styles.center} data-front={front} inert={front !== "control-center"}>
          <div className={styles.body}>
            {plainScreens.map(id => (
              <div key={id} className={styles.plain} data-shown={id === plain} inert={id !== plain}>
                {drawn(id)}
              </div>
            ))}
          </div>
          <footer className={`${footerRow.row} ${styles.footer}`}>
            <Slot name={CONTROL_CENTER_FOOTER} props={{}} />
          </footer>
        </section>
      </div>
    </div>
  )
}
