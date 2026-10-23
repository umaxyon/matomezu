// ページの設定のダイアログ: 開いているページの線の既定の通り方（折れ線・直線。線が自分の通り方を持たなければこれ）。
// 見出しの行の右にキャンセルと確定のボタン。確定でアクション page.update を書き、既定（折れ線）に戻せばページの項目を消す
import { useId, useState } from "react"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp } from "../../../../ui/store-context"
import { ActionButton, Choices, Dialog, Form, rowClass } from "../../../base/ui"
import type { LineRoute } from "../line"
import { ROUTE_ICONS } from "../line/icons"
import { DEFAULT_ROUTE } from "../line/placed"
import { useBookOf } from "../shape/parts"

export function PageDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useT()
  const form = useId()
  const book = useBookOf(stage)
  const page = useApp(s => (book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined))?.pages.find(
    p => p.id === args.page,
  )
  const { perform } = useActions()
  const [route, setRoute] = useState<LineRoute>(page?.lineRoute ?? DEFAULT_ROUTE)
  if (!book || !page) return null
  const submit = () => {
    const done = perform("page.update", { page: page.id, lineRoute: route === DEFAULT_ROUTE ? null : route }, { book })
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
        <div className={rowClass}>
          <span>{t("Line route")}</span>
          <Choices
            label={t("Line route")}
            value={route}
            options={[
              { value: "elbow", label: t("Elbow"), icon: ROUTE_ICONS.elbow },
              { value: "straight", label: t("Straight"), icon: ROUTE_ICONS.straight },
            ]}
            onChange={setRoute}
          />
        </div>
      </Form>
    </Dialog>
  )
}
