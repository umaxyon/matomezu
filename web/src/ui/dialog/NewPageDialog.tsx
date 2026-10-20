// ページを作るダイアログ: 名前と紙を決めて、そのステージのブックに足し（アクション page.add）、そのページを開く。
// 選べる紙はブックのタイプの規定で決まる（1 つしか無ければ選べない）
import { useState } from "react"
import { defaultPaper, nextPageTitle, type PagedBook, paperChoices } from "../../core/book"
import { PAPERS, type PaperName } from "../../core/paper"
import { useT } from "../i18n"
import { useActions, useApp } from "../store-context"
import { Dialog } from "./Dialog"
import { controlClass, Field, Form } from "./FormParts"

export function NewPageDialog({
  stage,
  book,
  open,
  onClose,
}: {
  stage: string
  book: PagedBook
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} title={t("新しいページ")} onClose={onClose}>
      <NewPageForm stage={stage} book={book} onDone={onClose} />
    </Dialog>
  )
}

function NewPageForm({ stage, book, onDone }: { stage: string; book: PagedBook; onDone: () => void }) {
  const { addPage } = useActions()
  const lang = useApp(s => s.settings.lang)
  const t = useT()
  const choices = paperChoices(book)
  const [title, setTitle] = useState(() => nextPageTitle(book, lang))
  const [paper, setPaper] = useState<PaperName>(() => defaultPaper(book))
  return (
    <Form
      submit={t("作成")}
      ready={title.trim() !== ""}
      onSubmit={() => {
        if (addPage(stage, { title, paper })) onDone()
      }}
    >
      <Field label={t("ページの名前")}>
        {id => (
          // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の欄
          <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
        )}
      </Field>
      <Field label={t("紙のサイズ")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={paper}
            disabled={choices.length < 2}
            onChange={e => setPaper(e.target.value as PaperName)}
          >
            {choices.map(p => (
              <option key={p} value={p}>
                {t(PAPERS[p].title)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Form>
  )
}
