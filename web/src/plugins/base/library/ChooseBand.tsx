// 選んでいる間の帯: 書庫の画面の上に、何を選んでいるか（「B に置く参照を選ぶ」か「X の参照を置くブックを選ぶ」）と［取消］を出す（参照エントリを置くために選んでいる間だけ。書庫のスクリーンは、その間は自分の帯を出さない）

import { titleOf } from "../../../core/entries"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useNameOf, useReadNaming } from "./hooks"
import styles from "./LibraryView.module.css"
import { type Choosing, NO_TITLE } from "./outline"
import { LIBRARY_CHOOSE_CANCEL } from "./screen"

export function ChooseBand({ choosing }: { choosing: Choosing }) {
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const naming = useReadNaming()
  const cancel = useCommand(LIBRARY_CHOOSE_CANCEL.id)
  const id = choosing.choose === "referred" ? choosing.book : choosing.of.id
  const kind = choosing.choose === "book" && choosing.of.kind === "page" ? "page" : "folder"
  const title = useMatomezuState(s => titleOf(s, kind, id, naming()) ?? NO_TITLE)
  const name = nameOf({ id, title })
  return (
    <div className={styles.chooseBand} role="status">
      <span className={styles.chooseWhat}>
        {choosing.choose === "referred"
          ? t("Choose a reference to place in {book}", { book: name })
          : t("Choose a book to place a reference to {name} in", { name })}
      </span>
      <ActionButton raised onClick={() => cancel.run()}>
        {t("Cancel choosing")}
      </ActionButton>
    </div>
  )
}
