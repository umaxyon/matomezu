// ツリーのページを作るダイアログ: ページ名（初めは base の useNewPage の名前）・伸びる向き・根のキャプションを決めて、受けた作る先に作る（base の useNewPage。ステージのブックならアクション page-add で足してそのページを開き、書庫のフォルダなら page-create。
// 伸びる向きはページの設定の項目、根はページのフィールド root）。伸びる向きの初めの値は設定の項目の既定の向きで、
// 既定を選んでいればページに書かない。紙と紙の向きはタイプの既定
import { useState } from "react"
import type { NewPageDialogArgs } from "../../../plugin-api"
import { type DialogProps, useCoreCatalog, useMessages } from "../../../plugin-api/ui"
import { NO_HOLDER, settingValue } from "../../base"
import { Choices, controlClass, Dialog, Field, Form, NO_LINEUP, useNewPage } from "../../base/ui"
import { useGrowOptions } from "./GrowSetting"
import { GROW, type Grow } from "./grow"
import { kit } from "./kit"
import { TREE } from "./tree"

export function NewTreePageDialog({ args, onClose }: DialogProps<NewPageDialogArgs>) {
  const t = useMessages(kit)
  const { lineup, titles, add: addPage } = useNewPage(args)
  const options = useGrowOptions()
  const catalog = useCoreCatalog()
  const [title, setTitle] = useState(titles.page)
  const [grow, setGrow] = useState<Grow | undefined>(undefined) // undefined は既定の向き
  const [caption, setCaption] = useState("")
  if (lineup === NO_LINEUP) return null
  const inherited = settingValue(catalog, NO_HOLDER, GROW) // 書かないときの向き（設定の項目の既定）
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
