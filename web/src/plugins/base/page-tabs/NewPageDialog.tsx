// ページを作るダイアログ: タイプ args.type のページの名前と紙（紙・向き・伸びるか。PaperControls.tsx）を決めて、そのステージのブックに足し（アクション page-add）、そのページを開く。
// まとまるタイプのページは、args.binder のバインダに足す。binder が無ければ、名前を聞いて新しいバインダ（そのページ 1 枚入り）を作る

import { useState } from "react"
import { lineupOf, pagesIn } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { freeTitle } from "../utils/titles"
import type { NewPageDialogArgs } from "."
import { usePaperControls } from "./PaperControls"
import { nextPageTitle } from "./pages"
import { useAddPage } from "./useAddPage"

export function NewPageDialog({ args, onClose }: DialogProps<NewPageDialogArgs>) {
  const t = useMessages(kit)
  const book = useBook() ?? undefined
  const catalog = useCatalog().core
  const type = catalog.pageTypes.get(args.type)
  if (!book || !type) return null
  return (
    <Dialog title={t("New {type}", { type: t(type.title) })} onClose={onClose}>
      <NewPageForm book={book} args={args} onDone={onClose} />
    </Dialog>
  )
}

function NewPageForm({ book, args, onDone }: { book: Book; args: NewPageDialogArgs; onDone: () => void }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const addPage = useAddPage()
  const type = pageType(catalog, args.type)
  // 新しいバインダを作るか（まとまるタイプで、入れるバインダを渡されていない）
  const newBinder = type.grouping === "binder" && args.binder === undefined
  const [title, setTitle] = useState(() =>
    newBinder
      ? freeTitle(
          t(type.title),
          lineupOf(book).map(e => e.title),
        )
      : nextPageTitle(book, t, args.binder === undefined ? undefined : pagesIn(book, args.binder).map(p => p.title)),
  )
  const paper = usePaperControls(
    book,
    null,
    args.type,
    newBinder ? "new-binder" : args.binder === undefined ? "lineup" : { binder: args.binder },
  )
  const into = newBinder
    ? { into: { newBinder: title } }
    : args.binder === undefined
      ? {}
      : { into: { binder: args.binder } }
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        const named = newBinder ? { title: nextPageTitle(book, t, []) } : { title }
        if (addPage({ type: args.type, ...named, ...paper.patch, ...into })) onDone()
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
