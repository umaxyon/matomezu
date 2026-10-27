// ツリーのページを作るダイアログ: ページ名・伸びる向き・根のキャプションを決めて、そのステージのブックに足し（base のアクション page-add。
// 伸びる向きはページの設定の項目、根はページのフィールド root）、そのページを開く。伸びる向きの初めの値はブックで効いている向き。紙と紙の向きはブックのタイプの既定
import { useState } from "react"
import { pagedOf } from "../../../plugin-api"
import { type DialogProps, useActions, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { settingValue } from "../../base"
import { Choices, controlClass, Dialog, Field, Form } from "../../base/ui"
import { useGrowOptions } from "./GrowSetting"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"

export function NewTreePageDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  const book = pagedOf(useBook(stage))
  const perform = usePerform(stage)
  const { openPage } = useActions()
  const options = useGrowOptions()
  const catalog = useCoreCatalog()
  const [title, setTitle] = useState(() => t("Page {n}", { n: (book?.pages.length ?? 0) + 1 }))
  const [grow, setGrow] = useState<Grow>(() => (book ? (settingValue(catalog, book, null, GROW.id) as Grow) : "down"))
  const [caption, setCaption] = useState("")
  if (!book) return null
  const create = () => {
    const done = perform("@matomezu/base:page-add", {
      title,
      settings: { [GROW.id]: grow },
      fields: { root: { caption } },
    })
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
        <Field label={t("Grow direction")}>
          {() => <Choices label={t("Grow direction")} value={grow} options={options} onChange={setGrow} />}
        </Field>
        <Field label={t("Root caption")}>
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
