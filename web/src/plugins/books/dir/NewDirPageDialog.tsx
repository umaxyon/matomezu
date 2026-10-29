// ディレクトリ構成図のページを作るダイアログ: ページ名と根のフォルダの名前を決めて、そのステージのブックに足し（base のアクション page-add。根はページのフィールド root）、
// そのページを開く。根のフォルダの名前の初めの値はページ名と同じ。紙と紙の向きはブックのタイプの既定
import { useState } from "react"
import { pagedOf } from "../../../plugin-api"
import { type DialogProps, useActions, useBook, useMessages, usePerform } from "../../../plugin-api/ui"
import { controlClass, Dialog, Field, Form } from "../../base/ui"
import { kit } from "./kit"

export function NewDirPageDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  const book = pagedOf(useBook(stage))
  const perform = usePerform(stage)
  const { openPage } = useActions()
  const [title, setTitle] = useState(() => t("Page {n}", { n: (book?.pages.length ?? 0) + 1 }))
  const [name, setName] = useState<string | null>(null) // null はページ名と同じ
  if (!book) return null
  const create = () => {
    const done = perform("@matomezu/base:page-add", { title, fields: { root: { name: name ?? title } } })
    if (!done.ok) return
    openPage(stage, done.result.page)
    onClose()
  }
  return (
    <Dialog title={t("New page")} onClose={onClose}>
      <Form submit={t("Create")} ready={title.trim() !== ""} onSubmit={create}>
        <Field label={t("Page name")}>
          {id => (
            <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t("Root folder name")}>
          {id => (
            <input id={id} className={controlClass} value={name ?? title} onChange={e => setName(e.target.value)} />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
