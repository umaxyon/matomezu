// 伝言一覧のウィジェット（左ドロワーのタブ）
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { LEFT_DRAWER } from "../left-drawer/slots"
import { NoteList } from "./NoteList"

export const NOTE_LIST = defineWidget({
  id: kit.name("note-list"),
  slots: [LEFT_DRAWER],
  leftDrawer: { title: kit.message("Note list") },
  view: NoteList,
})
