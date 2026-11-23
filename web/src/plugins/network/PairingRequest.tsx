// ほかのホストから届いたペアリングの頼み（参加要求と同じ形）: しおり（スロット bookmarks に置く。頼み 1 つに 1 つ）・見張り（根に置き、頼みが増えたらマーキー）・ダイアログ。
// ダイアログは、頼んだホスト（ホスト名・利用者名・番地）と接続確認コードと、断る・受け入れる。閉じる（Esc・×）だけなら頼みは残り、しおりもそのまま。
// 頼みが消えたら（相手がやめた・時間切れ・答えた）「返事済み」と見せる
import { useMemo } from "react"
import { type DialogProps, useActions, useAllowedOn, useMessages, useRecord, useRecords } from "../../plugin-api/ui"
import {
  ActionButton,
  type Bookmark,
  Dialog,
  LETTER_ICON,
  useArrivalMarquee,
  useOpenDialogInRecentStage,
  useShowBookmarks,
} from "../base/ui"
import { PAIRING_REQUEST_DIALOG } from "./dialogs"
import { ipOf } from "./hosts"
import { kit } from "./kit"
import styles from "./Pairing.module.css"
import { Code } from "./PairingDialog"
import { PAIRING_ACCEPT, PAIRING_DECLINE, PAIRING_REQUEST } from "./pairing"

const TITLE = "A pairing request arrived from another host"

export function PairingRequestBookmarks() {
  const t = useMessages(kit)
  const open = useOpenDialogInRecentStage()
  const requests = useRecords(PAIRING_REQUEST.id, { where: [] })
  const bookmarks = useMemo(
    (): Bookmark[] =>
      requests.map(r => ({
        key: r.id,
        at: r.requestedAt,
        title: t(TITLE),
        face: LETTER_ICON,
        open: () => open(PAIRING_REQUEST_DIALOG.id, { request: r.id }),
      })),
    [requests, t, open],
  )
  useShowBookmarks(bookmarks)
  return null
}

export function PairingRequestWatch() {
  useArrivalMarquee(useRecords(PAIRING_REQUEST.id, { where: [] }), () => ({ message: kit.message(TITLE) }))
  return null
}

export function PairingRequestDialog({ args, onClose }: DialogProps<{ request: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const request = useRecord(PAIRING_REQUEST.id, args.request)
  const on = { record: args.request }
  const canAccept = useAllowedOn(PAIRING_ACCEPT.id, {}, on).ok
  const canDecline = useAllowedOn(PAIRING_DECLINE.id, {}, on).ok
  const answer = (action: typeof PAIRING_ACCEPT.id | typeof PAIRING_DECLINE.id) => {
    if (perform(action, {}, on).ok) onClose()
  }
  const ip = request ? ipOf(request.addr) : ""
  return (
    <Dialog title={t(TITLE)} width={440} onClose={onClose}>
      {request ? (
        <>
          <p className={styles.request}>
            <span className={styles.name}>{request.name}</span>
            {request.userName ? (
              <span className={styles.muted}>{t("({name})", { name: request.userName })}</span>
            ) : null}{" "}
            <span className={styles.ip}>{ip}</span>
          </p>
          <Code code={request.code} />
          <div className={styles.buttons}>
            <ActionButton danger disabled={!canDecline} onClick={() => answer(PAIRING_DECLINE.id)}>
              {t("Decline")}
            </ActionButton>
            <ActionButton primary disabled={!canAccept} onClick={() => answer(PAIRING_ACCEPT.id)}>
              {t("Accept")}
            </ActionButton>
          </div>
        </>
      ) : (
        <p>{t("Already answered")}</p>
      )}
    </Dialog>
  )
}
