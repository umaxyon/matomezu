// 節の色のダイアログ: 節（根も）の色を、ブックのテーマの代表色・好きな色・「なし」（テーマの塗り）から選ぶ。
// 確定で、子はアクション node-update、根は base の page-update（ページのフィールドの受け方で根の色だけ）を行う。断られたら、閉じずに理由を出す（認可ステップが止めたならそのステップの名前、ほかは紙に入らない）
import { useId, useState } from "react"
import { type MessageKey, pagedOf } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import { ActionButton, ColorPicker, Dialog, Form, Problem, rowClass, useBookTheme, useSwatches } from "../../base/ui"
import { NODE_UPDATE } from "./actions"
import { nodeOf } from "./edit"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { NODE_FILL } from "./tree"

export function NodeColorDialog({ stage, args, onClose }: DialogProps<{ page: string; node: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
  const isRoot = root.success && root.data.id === args.node
  const node = root.success ? (isRoot ? root.data : nodeOf(root.data, args.node)) : null
  const perform = usePerform(stage)
  const swatches = useSwatches(useBookTheme(book?.id), NODE_FILL)
  const [color, setColor] = useState<string | undefined>(node?.color)
  const catalog = useCoreCatalog()
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!book || !page || !node) return null
  const submit = () => {
    const done = isRoot
      ? perform("@matomezu/base:page-update", { page: page.id, fields: { root: { color: color ?? null } } })
      : perform(NODE_UPDATE.id, { page: page.id, node: node.id, color: color ?? null })
    if (done.ok) onClose()
    else setRefused(refusalMessage(catalog, done, kit.message("Does not fit on the paper")))
  }
  return (
    <Dialog
      title={t("Node color")}
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
      <Form id={form} ready onSubmit={submit}>
        {swatches && (
          <div className={rowClass}>
            <span>{t("Color")}</span>
            <ColorPicker
              label={t("Color")}
              value={color}
              palette={swatches.palette}
              none={swatches.none}
              onChange={setColor}
            />
          </div>
        )}
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}
