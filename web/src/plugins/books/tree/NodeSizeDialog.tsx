// 節の大きさのダイアログ: 子の節の大きさの選び方を、先頭の「ページを継承（ページで効いている選び方）」か、伸びる・N 字で折り返す・N 字で固定から選ぶ。
// 確定でアクション node-update を行う（継承は size を消す）。断られたら、閉じずに理由を出す（許可の段が止めたならその段の名前、ほかは紙に入らない）
import { useId, useState } from "react"
import { type MessageKey, pagedOf } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage, settingValue } from "../../base"
import { ActionButton, Dialog, Form, Problem, rowClass } from "../../base/ui"
import { NODE_UPDATE } from "./actions"
import { nodeOf } from "./edit"
import { kit } from "./kit"
import { NodeSizeSelect } from "./NodeSizeSetting"
import { TreeRootSchema } from "./node"
import { DEFAULT_NODE_SIZE, NODE_SIZE, type NodeSize } from "./size"

export function NodeSizeDialog({ stage, args, onClose }: DialogProps<{ page: string; node: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const catalog = useCoreCatalog()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
  const node = root.success ? nodeOf(root.data, args.node) : null
  const perform = usePerform(stage)
  const [size, setSize] = useState<NodeSize | undefined>(node?.size)
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
  if (!book || !page || !node) return null
  const inherited =
    NODE_SIZE.schema.safeParse(settingValue(catalog, book, page, NODE_SIZE.id)).data ?? DEFAULT_NODE_SIZE
  const submit = () => {
    const done = perform(NODE_UPDATE.id, { page: page.id, node: node.id, size: size ?? null })
    if (done.ok) onClose()
    else setRefused(refusalMessage(catalog, done, kit.message("Does not fit on the paper")))
  }
  return (
    <Dialog
      title={t("Node size")}
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
        <div className={rowClass}>
          <span>{t("Node size")}</span>
          <NodeSizeSelect
            label={t("Node size")}
            value={size}
            inherit={{ size: inherited, from: "page" }}
            onChange={setSize}
          />
        </div>
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}
