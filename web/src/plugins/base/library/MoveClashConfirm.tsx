// ドラッグで落とした先に同じ名前の物が在るときの確かめ: 番号を付けて動かすか・上書きして動かすか・やめるか
import { titleOf } from "../../../core/entries"
import { useCommand } from "../../../ui/commands"
import { useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { LIBRARY_ENTRY_MOVE } from "./commands"
import { replaceBlockedOf } from "./entries"
import { ENTRY_MOVE_OVER } from "./entry-move"
import { useNameOf, useReadNaming } from "./hooks"
import { NO_TITLE } from "./outline"
import { TitleClashConfirm } from "./TitleClashConfirm"
import type { AskingMove } from "./useLibraryDrag"

export function MoveClashConfirm({ asking, onDone }: { asking: AskingMove; onDone(): void }) {
  const { entry, into, index, clash } = asking
  const read = useReadState()
  const nameOf = useNameOf()
  const naming = useReadNaming()
  const move = useCommand(LIBRARY_ENTRY_MOVE.id).run
  const over = { entry, into, index: clash.indexOver, replaces: clash.replaces }
  const allowed = useAllowedOn(ENTRY_MOVE_OVER.id, over)
  const { kind, id } = clash.carried
  return (
    <TitleClashConfirm
      folder={nameOf({ id: into, title: titleOf(read(), "folder", into, naming()) ?? NO_TITLE })}
      name={nameOf({ id, title: titleOf(read(), kind, id, naming()) ?? NO_TITLE })}
      numbered={clash.numbered}
      blocked={replaceBlockedOf(clash, allowed)}
      onNumber={() => {
        onDone()
        move({ entry, to: { to: "folder", into, index }, how: "number" })
      }}
      onReplace={() => {
        onDone()
        move({ entry, to: { to: "folder", into, index: over.index }, how: { replaces: over.replaces } })
      }}
      onCancel={onDone}
    />
  )
}
