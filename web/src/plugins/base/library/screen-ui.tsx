// 書庫のスクリーンを描くウィジェット。書庫のスクリーンの定義（screen.ts の LIBRARY_SCREEN）の id と同じ名前のスロットに置く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { LibraryScreen } from "./LibraryScreen"
import { LIBRARY_SCREEN } from "./screen"

export const LIBRARY_SCREEN_VIEW = defineWidget({
  id: kit.name("library-screen-view"),
  slots: [LIBRARY_SCREEN.id],
  view: LibraryScreen,
})
