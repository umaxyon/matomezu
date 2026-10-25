// ページを作るダイアログ: 名前と紙を決めて、そのステージのブックに足し（アクション page.add）、そのページを開く。
// 選べる紙と向きはブックのタイプの規定で決まる（1 つしか無ければ選べない）
import { useState } from "react"
import { defaultPaper, hasPages, nextPageTitle, type PagedBook, paperChoices } from "../../../core/book"
import { ORIENTATION_TITLES, type Orientation } from "../../../core/def/paper"
import type { PaperChoice } from "../../../core/paper"
import { useT } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useApp, useCatalog } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form } from "../dialog-host/FormParts"

export function NewPageDialog({ stage, onClose }: DialogProps) {
  const t = useT()
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  if (!book || !hasPages(book)) return null
  return (
    <Dialog title={t("New page")} onClose={onClose}>
      <NewPageForm stage={stage} book={book} onDone={onClose} />
    </Dialog>
  )
}

function NewPageForm({ stage, book, onDone }: { stage: string; book: PagedBook; onDone: () => void }) {
  const { addPage } = useActions()
  const lang = useApp(s => s.settings.lang)
  const t = useT()
  const catalog = useCatalog().core
  const { papers, orientations } = paperChoices(catalog, book)
  const [title, setTitle] = useState(() => nextPageTitle(catalog, book, lang))
  const [choice, setChoice] = useState<PaperChoice>(() => defaultPaper(catalog, book))
  return (
    <Form
      submit={t("Create")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        if (addPage(stage, { title, ...choice })) onDone()
      }}
    >
      <Field label={t("Page name")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の欄
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      <Field label={t("Paper size")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={choice.paper}
            disabled={papers.length < 2}
            onChange={e => setChoice({ ...choice, paper: e.target.value })}
          >
            {papers.map(p => {
              const def = catalog.papers.get(p)
              return (
                <option key={p} value={p}>
                  {def ? t(def.title) : t("Unknown paper")}
                </option>
              )
            })}
          </select>
        )}
      </Field>
      <Field label={t("Orientation")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={choice.orientation}
            disabled={orientations.length < 2}
            onChange={e => setChoice({ ...choice, orientation: e.target.value as Orientation })}
          >
            {orientations.map(o => (
              <option key={o} value={o}>
                {t(ORIENTATION_TITLES[o])}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Form>
  )
}
