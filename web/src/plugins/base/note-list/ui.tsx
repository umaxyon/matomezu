// 伝言一覧のウィジェット（左ドロワーのタブ）
import { kit } from "../kit"
import { defineLeftDrawerTab } from "../left-drawer/ui"
import { NoteList } from "./NoteList"

export const NOTE_LIST = defineLeftDrawerTab({
  id: kit.name("note-list"),
  title: kit.message("Note list"),
  view: NoteList,
})
