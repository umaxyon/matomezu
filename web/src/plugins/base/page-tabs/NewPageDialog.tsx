// ページを作るダイアログ: タイプ args.type のページの名前と紙（紙・向き・伸びるか。PaperControls.tsx）を決めて、作る先（useNewPage.tsx。ステージのブックか、書庫のフォルダ）に作る。
// まとまるタイプのページは、入れるバインダが決まっていれば、そのバインダに足す。決まっていなければ、名前を聞いて新しいバインダ（そのページ 1 枚入り）を作る

import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { NewPageDialogArgs } from "."
import { usePaperControls } from "./PaperControls"
import { type NewPage, useNewPage } from "./useNewPage"

export function NewPageDialog({ args, onClose }: DialogProps<NewPageDialogArgs>) {
  const t = useMessages(kit)
  const to = useNewPage(args)
  const type = useCatalog().core.pageTypes.get(args.type)
  if (!to.lineup || !type) return null
  return (
    <Dialog title={t("New {type}", { type: t(type.title) })} onClose={onClose}>
      <NewPageForm to={to} type={args.type} onDone={onClose} />
    </Dialog>
  )
}

function NewPageForm({ to, type, onDone }: { to: NewPage; type: string; onDone: () => void }) {
  const t = useMessages(kit)
  const { place, titles } = to
  // 新しいバインダを作るか（まとまるタイプで、入れるバインダが決まっていない）
  const newBinder = place === "new-binder"
  const [title, setTitle] = useState(newBinder ? titles.binder : titles.page)
  const paper = usePaperControls(to.lineup ?? undefined, type, place)
  const into = newBinder ? { into: { newBinder: title } } : place === "lineup" ? {} : { into: place }
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        const named = newBinder ? { title: titles.page } : { title }
        if (to.add({ type, ...named, ...paper.patch, ...into })) onDone()
      }}
    >
      <Field label={t(newBinder ? "Name" : "Page name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      {paper.controls}
    </Form>
  )
}
