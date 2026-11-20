// 窓の根のビュー（ウィジェット window）: 左に左サイドパネル（left-side-panel/）、右に今のスクリーンアレンジメント（定義の id と同じ名前のスロットに置いたウィジェットが、開いているスクリーンを並べる）。
// 左サイドパネルを開けば、右を押し縮める。どのスクリーンを・どこに・どの大きさで出すか、下の行を出すかは、スクリーンアレンジメントが決める（窓の根は決めない）
import type { CSSProperties } from "react"
import type { ScreenArrangementId } from "../../../core/catalog"
import { ArrangedProvider } from "../../../ui/arranged-context"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState } from "../../../ui/store-context"
import { LeftSidePanel } from "../left-side-panel/LeftSidePanel"
import { SLIDE_MS } from "./slide"
import styles from "./WindowView.module.css"

export function WindowView() {
  const arrangement = useMatomezuState(s => s.window.arrangement)
  return (
    <div
      className={styles.window}
      style={
        {
          ["--screen-slide" as string]: `${SLIDE_MS}ms`,
          ["--side-panel-slide" as string]: `${SLIDE_MS}ms`,
        } as CSSProperties
      }
    >
      <LeftSidePanel />
      <div className={styles.screens}>
        <ArrangedProvider arranged>
          <Slot name={arrangement as ScreenArrangementId} props={{}} />
        </ArrangedProvider>
      </div>
    </div>
  )
}
