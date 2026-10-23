// ページの設定のダイアログ: 開いているページの線の既定の通り方（ブックを継承・折れ線・直線。線が自分の通り方を持たなければこれ）。
// 「ブックを継承」は、ブックの既定（ブックの設定）に従う（名前の後ろに、今のブックの既定を添える）。
// 見出しの行の右にキャンセルと確定のボタン。確定でアクション page.update（ブックのタイプの設定の項目 settings）を書き、「ブックを継承」ならページの項目を消す
import { useId, useState } from "react"
import { settingValue } from "../../../../core/book-settings"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import { ActionButton, controlClass, Dialog, Field, Form } from "../../../base/ui"
import { LINE_ROUTE, type LineRoute } from "../line"
import { useBookOf } from "../shape/parts"

const ROUTE_NAMES = { elbow: "Elbow", straight: "Straight" } as const

export function PageDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useT()
  const form = useId()
  const registry = useRegistry()
  const book = useBookOf(stage)
  const drawing = useApp(s => (book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined))
  const page = drawing?.pages.find(p => p.id === args.page)
  const { perform } = useActions()
  const [route, setRoute] = useState<LineRoute | "">(page?.lineRoute ?? "")
  if (!book || !drawing || !page) return null
  const inherited = settingValue(registry, drawing, null, LINE_ROUTE.id) as LineRoute
  const submit = () => {
    const done = perform("page.update", { page: page.id, settings: { lineRoute: route || null } }, { book })
    if (done.ok) onClose()
  }
  return (
    <Dialog
      title={t("Page settings")}
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
        <Field label={t("Line route")}>
          {id => (
            <select
              id={id}
              className={controlClass}
              value={route}
              onChange={e => setRoute(e.target.value as LineRoute | "")}
            >
              <option value="">{t("Inherit from book ({route})", { route: t(ROUTE_NAMES[inherited]) })}</option>
              <option value="elbow">{t("Elbow")}</option>
              <option value="straight">{t("Straight")}</option>
            </select>
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
