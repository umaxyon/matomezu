// 窓の根のビュー（ウィジェット window）: ブックスクリーン（スロット book-screen）とコントロールセンター（スロット control-center-screen と、下のフッター）を重ねて描く。
// 前に出ている物（窓の front）は全面に出し、後ろに退いた物は消さずに隠す（中のステージ・倍率・選択などは残る）。隠れている物は操作も読み上げも受けない（inert）。
// コントロールセンターは、前に出すときに右から滑り込み、戻すときに右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。
// コントロールセンターの下の行は、スロット control-center-footer に置いたウィジェットを並べる（止まり木のボタンは UI マッピングが置く）。
// 左に左サイドパネル（left-side-panel/）を置く。開けば、右の画面を押し縮める（前に出している物は替えない）
import type { CSSProperties } from "react"
import { frontOf } from "../../../core/window"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState } from "../../../ui/store-context"
import { LeftSidePanel } from "../left-side-panel/LeftSidePanel"
import footerRow from "../utils/FooterRow.module.css"
import { SLIDE_MS } from "./slide"
import { BOOK_SCREEN, CONTROL_CENTER_FOOTER, CONTROL_CENTER_SCREEN } from "./slots"
import styles from "./WindowView.module.css"

export function WindowView() {
  const front = useMatomezuState(s => frontOf(s.window))
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
        <div className={styles.bookScreen} data-front={front} inert={front !== "book-screen"}>
          <Slot name={BOOK_SCREEN} props={{}} />
        </div>
        <section className={styles.center} data-front={front} inert={front !== "control-center"}>
          <div className={styles.body}>
            <Slot name={CONTROL_CENTER_SCREEN} props={{}} />
          </div>
          <footer className={`${footerRow.row} ${styles.footer}`}>
            <Slot name={CONTROL_CENTER_FOOTER} props={{}} />
          </footer>
        </section>
      </div>
    </div>
  )
}
