// 伝言のコマンド: 右クリックで押した物（アンカーの付いた物）に、伝言を新しく書き始める（右サイドパネルを伝言の中身で開く）。配置の anchorMenu に置く
import { workspaceOf } from "../../../store/commands/def"
import { anchorsFor } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { withOpened } from "../right-side-panel/state"
import { NOTE_ADD } from "."
import { NEW_NOTE, NOTE_PANEL_ID } from "./panel-id"

// 押した物 anchor から書き始める: 付ける先は、押した物が選んでいる物のうちなら選んでいる物の全部（押した物を最後に）、でなければ押した物だけ。
// 伝言の中身は選択に従うので、先に選択を付ける先にしてから開く（カレントは押した物）
export const NOTE_NEW = kit.defineCommand({
  id: "note-new",
  title: "Note to AI",
  performs: [NOTE_ADD.id],
  run: (ctx, a, anchor: string) => {
    const now = workspaceOf(ctx).stages.find(s => s.id === ctx.stage.id)
    const opened = now?.opened
    if (!now || !opened) return
    const anchors = anchorsFor(anchor, ctx.stage.selection)
    a.select(ctx.stage.id, anchors)
    a.updateStageState(state =>
      withOpened(
        state,
        { widget: NOTE_PANEL_ID, subject: NEW_NOTE, anchors, current: anchor, book: opened.book, page: opened.page },
        now,
      ),
    )
  },
  when: ctx => ctx.book !== null,
})
