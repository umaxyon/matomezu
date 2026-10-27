// 自動で整列の確認のダイアログ: 「レイアウトを自動で整えてもよいですか？」と聞き、実行でアクション page-align を行う。
// ページに合わせると変わる形（形の定義の adapt で変わる形）があるときだけ、それも合わせるかの切り替えを、変わる形の名前を並べて出す
// （最初はオフ。置いたときのままを保つ）。
// 紙に収まらず断られたら、閉じずに理由を出す
import { useId, useState } from "react"
import { pagedOf } from "../../../plugin-api"
import { type DialogProps, useBook, useCoreCatalog, useMessages, usePerform } from "../../../plugin-api/ui"
import { ActionButton, Dialog, Form, Problem, rowClass, Switch } from "../../base/ui"
import { adaptedTitles, PAGE_ALIGN } from "./actions"
import { kit } from "./kit"

export function AlignDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const catalog = useCoreCatalog()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const perform = usePerform(stage)
  const [adapt, setAdapt] = useState(false)
  const [refused, setRefused] = useState(false)
  if (!book || !page) return null
  const titles = [...new Set(adaptedTitles(catalog, book, page).map(k => t(k)))]
  const adaptable = titles.length > 0
  const label = t("Fit {shapes} to the page and align", { shapes: titles.join(t("List separator")) })
  const run = () => {
    const done = perform(PAGE_ALIGN.id, { page: page.id, ...(adapt && adaptable ? { adapt: true } : {}) })
    if (done.ok) onClose()
    else setRefused(true)
  }
  return (
    <Dialog
      title={t("Auto align")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("Run")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready onSubmit={run}>
        <p>{t("Arrange the layout automatically?")}</p>
        {adaptable && (
          <div className={rowClass}>
            <span>{label}</span>
            <Switch label={label} checked={adapt} onChange={setAdapt} />
          </div>
        )}
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
