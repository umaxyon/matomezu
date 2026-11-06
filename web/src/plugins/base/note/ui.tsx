// 伝言の見た目のウィジェット: ブックのレイヤーに置き、開いているブックの伝言をスタンドで出す。右サイドパネルには伝言の文を出す
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineAnnotationIcon } from "../outbox/ui"
import { RIGHT_SIDE_PANEL } from "../right-side-panel/slots"
import { BOOK_LAYERS } from "../workspace/slots"
import { NOTE } from "."
import { NoteIcon, NoteLayer } from "./NoteLayer"
import styles from "./NoteLayer.module.css"
import { NotePanel } from "./NotePanel"
import { NOTE_PANEL_ID } from "./panel-id"
import { ReadNotice } from "./ReadNotice"

// 伝言が AI に読まれたら知らせる（根に置き、何も描かない）
export const NOTE_READ_NOTICE = defineWidget({ id: kit.name("note-read-notice"), slots: ["root"], view: ReadNotice })

export const NOTE_LAYER = defineWidget({ id: kit.name("note-layer"), slots: [BOOK_LAYERS], view: NoteLayer })

// 伝言の右サイドパネルの中身（幅は 320px で固定）。ステージの選択に従い、選んだ物が付ける先になる
export const NOTE_PANEL = defineWidget({
  id: NOTE_PANEL_ID,
  slots: [RIGHT_SIDE_PANEL],
  rightSidePanel: { width: 320, followsSelection: true },
  view: NotePanel,
})

// 送信トレイの行の絵（伝言の絵）
export const NOTE_ICON = defineAnnotationIcon({
  id: kit.name("note-icon"),
  annotation: NOTE.id,
  view: () => (
    <span className={styles.listed}>
      <NoteIcon />
    </span>
  ),
})
