// ツリーのページの設定のダイアログ（根のダイアログを兼ねる）: base のページの設定のダイアログの枠（PageSettingsFrame。ページ名・紙と向き・ページの設定の項目〈木の伸びる向き・節の大きさなど〉・ロック・削除）に、
// 根のキャプション・本文・本文を紙に描くか（ページのフィールド root）を足す。確定で、根はアクション page-update の fields に書かれる。
// 書いている根を重ねたページで、ページの問題（木が紙に入らないなど）を確かめる
import { useState } from "react"
import type { PageSettingsArgs } from "../../../plugin-api"
import { type DialogProps, useMessages, usePageById } from "../../../plugin-api/ui"
import { BODY_MAX } from "../../base"
import { controlClass, Field, PageSettingsFrame, RichBody, rowClass, Switch } from "../../base/ui"
import { kit } from "./kit"
import { treeRootOf } from "./node"

export function TreePageSettingsDialog({ args, onClose }: DialogProps<PageSettingsArgs>) {
  const t = useMessages(kit)
  const root = treeRootOf(usePageById(args.page))
  const [caption, setCaption] = useState(root ? root.caption : "")
  const [body, setBody] = useState(root ? (root.body ?? "") : "")
  const [showBody, setShowBody] = useState(root?.showBody === true)
  if (!root) return null
  const { body: _body, showBody: _show, ...rest } = root
  const draftRoot = { ...rest, caption, ...(body ? { body } : {}), ...(showBody ? { showBody } : {}) }
  return (
    <PageSettingsFrame
      page={args.page}
      onClose={onClose}
      fields={{ root: { caption, body: body === "" ? null : body, showBody } }}
      draft={page => ({ ...page, root: draftRoot })}
    >
      <Field label={t("Root caption")}>
        {fid => <input id={fid} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
      </Field>
      <Field label={t("Root body")}>
        {fid => (
          <RichBody id={fid} label={t("Root body")} rows={4} maxLength={BODY_MAX} value={body} onChange={setBody} />
        )}
      </Field>
      <div className={rowClass}>
        <span>{t("Show the body on the paper")}</span>
        <Switch label={t("Show the body on the paper")} checked={showBody} onChange={setShowBody} />
      </div>
    </PageSettingsFrame>
  )
}
