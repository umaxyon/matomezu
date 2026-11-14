// スクラップボックスの編集のダイアログ: 見る範囲と倍率を base の ScrapForm で直し、アクション item-update で書く（指すページは変えない）。
// 紙に収まらないなど断られたら、閉じずに理由を出す。「元のページを開く」で、このステージで元のページを開いて閉じる
import { useState } from "react"
import type { ItemProps, ShapeEditArgs } from "../../../plugin-api"
import { type DialogProps, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import { ActionButton, Dialog, Form, Problem, ScrapForm } from "../../base/ui"
import type { SCRAP_BOX } from "."
import { kit } from "./kit"

type ScrapProps = ItemProps<typeof SCRAP_BOX.id>

export function EditScrapBoxDialog({ stage, args, onClose }: DialogProps<ShapeEditArgs>) {
  const placed = useItem(stage, args.page, args.item)
  const start = placed?.props as ScrapProps | undefined
  return start ? <Editor stage={stage} args={args} start={start} onClose={onClose} /> : null
}

function Editor({
  stage,
  args,
  start,
  onClose,
}: {
  stage: string
  args: ShapeEditArgs
  start: ScrapProps
  onClose: () => void
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const perform = usePerform(stage)
  const [value, setValue] = useState(start)
  const [refused, setRefused] = useState<string | null>(null)
  const form = "scrap-box-edit-form"
  return (
    <Dialog
      title={t("Scrap settings")}
      width={640}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form
        id={form}
        ready
        onSubmit={() => {
          const done = perform("@matomezu/paper:item-update", { page: args.page, item: args.item, props: value })
          if (done.ok) {
            onClose()
            return
          }
          setRefused(t(refusalMessage(catalog, done, kit.message("Does not fit on the paper"))))
        }}
      >
        <ScrapForm value={value} onChange={setValue} opens={{ stage, onOpened: onClose }} />
        {refused && <Problem>{refused}</Problem>}
      </Form>
    </Dialog>
  )
}
