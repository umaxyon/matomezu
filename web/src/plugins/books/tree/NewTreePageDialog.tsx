// ツリーのページを作るダイアログ: ページ名（初めは base の nextPageTitle）・伸びる向き・根のキャプションを決めて、そのステージのブックに足し（base の useAddPage。アクション page-add。
// 伸びる向きはページの設定の項目、根はページのフィールド root）、そのページを開く。伸びる向きの初めの値は設定の項目の既定の向きで、
// 既定を選んでいればページに書かない。紙と紙の向きはタイプの既定
import { useState } from "react"
import { type DialogProps, useBook, useCoreCatalog, useMessages } from "../../../plugin-api/ui"
import { nextPageTitle, settingValue } from "../../base"
import { Choices, controlClass, Dialog, Field, Form, useAddPage } from "../../base/ui"
import { useGrowOptions } from "./GrowSetting"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TREE } from "./tree"

export function NewTreePageDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  const book = useBook()
  const addPage = useAddPage()
  const options = useGrowOptions()
  const catalog = useCoreCatalog()
  const [title, setTitle] = useState(() => (book ? nextPageTitle(book, t) : ""))
  const [grow, setGrow] = useState<Grow | undefined>(undefined) // undefined は既定の向き
  const [caption, setCaption] = useState("")
  if (!book) return null
  const inherited = settingValue(catalog, null, GROW) // 書かないときの向き（設定の項目の既定）
  const create = () => {
    const added = addPage({
      type: TREE.id,
      title,
      ...(grow ? { settings: { [GROW.id]: grow } } : {}),
      fields: { root: { caption } },
    })
    if (added) onClose()
  }
  return (
    <Dialog title={t("New tree")} onClose={onClose}>
      <Form submit={t("Create")} ready={title.trim() !== ""} onSubmit={create}>
        <Field label={t("Page name")}>
          {id => (
            <input id={id} className={controlClass} value={title} autoFocus onChange={e => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t("Grow direction")}>
          {() => (
            <Choices<Grow>
              label={t("Grow direction")}
              value={grow ?? inherited}
              options={options}
              onChange={v => setGrow(v === inherited ? undefined : v)}
            />
          )}
        </Field>
        <Field label={t("Root caption")}>
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
        </Field>
      </Form>
    </Dialog>
  )
}
