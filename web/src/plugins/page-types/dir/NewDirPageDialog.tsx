// ディレクトリ構成図のページを作るダイアログ: ページ名（初めは base の useNewPage の名前）と根のフォルダの名前を決めて、受けた作る先に作る（base の useNewPage。ステージのブックならアクション page-add で足してそのページを開き、書庫のフォルダなら page-create。根はページのフィールド root）。
// 根のフォルダの名前の初めの値はページ名と同じ。紙と紙の向きはタイプの既定
import { useState } from "react"
import type { NewPageDialogArgs } from "../../../plugin-api"
import { type DialogProps, useMessages } from "../../../plugin-api/ui"
import { controlClass, Dialog, Field, Form, useNewPage } from "../../base/ui"
import { DIR } from "./dir"
import { kit } from "./kit"

export function NewDirPageDialog({ args, onClose }: DialogProps<NewPageDialogArgs>) {
  const t = useMessages(kit)
  const { lineup, titles, add: addPage } = useNewPage(args)
  const [title, setTitle] = useState(titles.page)
  const [name, setName] = useState<string | null>(null) // null はページ名と同じ
  if (!lineup) return null
  const create = () => {
    if (addPage({ type: DIR.id, title, fields: { root: { name: name ?? title } } })) onClose()
  }
  return (
    <Dialog title={t("New directory diagram")} onClose={onClose}>
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
