// ページを作るダイアログ: 名前と紙（紙・向き・伸びるか。PaperControls.tsx）を決めて、そのステージのブックに足し（アクション page-add）、そのページを開く
import { useState } from "react"
import { hasPages, type PagedBook } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog, useInstance, useMatomezuState } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { addPageIn } from "./add-page"
import { usePaperControls } from "./PaperControls"
import { nextPageTitle } from "./pages"

export function NewPageDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  const book = useBook(stage) ?? undefined
  if (!book || !hasPages(book)) return null
  return (
    <Dialog title={t("New page")} onClose={onClose}>
      <NewPageForm stage={stage} book={book} onDone={onClose} />
    </Dialog>
  )
}

function NewPageForm({ stage, book, onDone }: { stage: string; book: PagedBook; onDone: () => void }) {
  const instance = useInstance()
  const lang = useMatomezuState(s => s.lang)
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const [title, setTitle] = useState(() => nextPageTitle(catalog, book, lang))
  const paper = usePaperControls(book, null)
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        if (addPageIn(instance, stage, { title, ...paper.patch })) onDone()
      }}
    >
      <Field label={t("Page name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      {paper.controls}
    </Form>
  )
}
