// 伝言のコマンド: 右クリックで押した物（アンカーの付いた物）に、伝言を新しく書き始める（右サイドパネルを伝言の中身で開く）。UI マッピングの anchorMenu に置く
import { workspaceOf } from "../../../store/commands/def"
import { anchorsFor } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { openedRestore, RIGHT_SIDE_PANEL_RESTORE_STATE, RIGHT_SIDE_PANEL_STATE } from "../right-side-panel/state"
import { NOTE_ADD } from "."
import { NEW_NOTE, NOTE_PANEL_ID } from "./panel-id"

// 押した物 anchor から書き始める: 付ける先は、押した物が選んでいる物のうちなら選んでいる物の全部（押した物を最後に）、でなければ押した物だけ。
// 伝言の中身は選択に従うので、開くと右サイドパネルが選択を付ける先にする（カレントは押した物）
export const NOTE_NEW = kit.defineCommand({
  id: "note-new",
  title: "Note to AI",
  performs: [NOTE_ADD.id],
  run: (ctx, a, anchor: string) => {
    const now = workspaceOf(ctx).stages.find(s => s.id === ctx.stage.id)
    const opened = now?.opened
    if (!now || !opened) return
    const anchors = anchorsFor(anchor, ctx.stage.selection)
    const panel = {
      widget: NOTE_PANEL_ID,
      subject: NEW_NOTE,
      anchors,
      current: anchor,
      book: opened.book,
      page: opened.page,
    }
    a.updatePluginState(RIGHT_SIDE_PANEL_STATE, () => panel)
    a.updatePluginState(RIGHT_SIDE_PANEL_RESTORE_STATE, kept => openedRestore(kept, panel, now))
  },
  when: ctx => ctx.book !== null,
})
