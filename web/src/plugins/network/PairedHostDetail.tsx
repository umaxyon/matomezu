// ペアリングしたホストの詳しい所（スロット picked-detail に置き、種類 paired-host を名乗る）: 題にホスト名（利用者名）、● つながっているか、
// 目（AI 用ホストリストに載せる・隠すを替える）、歯車（待っている所・鍵の印・最後につながった時刻のダイアログ）。覚えた鍵と合わない相手が答えたときは、題の下に一言。
// 「〈ホスト〉から届いた指示: ［AI｜ユーザー］の指示として扱う」（ユーザーに替えるときは確かめのダイアログ）。
// 右下にペアリングを解くアイコン（ワークルームの退室・ビジターの外すと同じ置き方。押すと確かめのダイアログ）
import { useActions, useAllowedOn, useMessages } from "../../plugin-api/ui"
import { Choices, ChoiceText, GearIcon, IconButton, TextAround, Tip } from "../base/ui"
import { AS_USER_DIALOG, PAIRED_HOST_INFO_DIALOG, UNPAIR_DIALOG } from "./dialogs"
import { usePairedHostRow } from "./HostDialog"
import { EyeHiddenIcon, EyeIcon, UnpairIcon } from "./icons"
import { kit } from "./kit"
import styles from "./OtherHosts.module.css"
import { PAIRED_HOST_LISTED_SET, PAIRED_HOST_REMOVE, PAIRED_HOST_REQUESTS_SET } from "./pairing"

export function PairedHostDetail({ id }: { id: string }) {
  const t = useMessages(kit)
  const { openDialog, perform } = useActions()
  const row = usePairedHostRow(id)
  const canRemove = useAllowedOn(PAIRED_HOST_REMOVE.id, {}, { record: id }).ok
  const canSet = useAllowedOn(PAIRED_HOST_REQUESTS_SET.id, { requests: "ask-user" }, { record: id }).ok
  const canList = useAllowedOn(PAIRED_HOST_LISTED_SET.id, { listed: "listed" }, { record: id }).ok
  if (!row) return null
  const record = row.record
  const listed = record.listed !== "hidden"
  const eye = listed ? t("Hide from the host list for AIs") : t("Put on the host list for AIs")
  return (
    <div className={styles.detail}>
      <h2 className={styles.title}>
        {row.label}
        {row.userName ? <span className={styles.user}>{t("({name})", { name: row.userName })}</span> : null}
        <span
          className={styles.dot}
          data-connected={row.live?.connected === true}
          role="img"
          aria-label={row.live?.connected ? t("Connected") : t("Not connected")}
        />
        <Tip text={eye} side="below" align="start">
          <IconButton
            small
            className={styles.titleButton}
            label={eye}
            title={undefined}
            disabled={!canList}
            onClick={() => perform(PAIRED_HOST_LISTED_SET.id, { listed: listed ? "hidden" : "listed" }, { record: id })}
          >
            {listed ? <EyeIcon size={14} /> : <EyeHiddenIcon size={14} />}
          </IconButton>
        </Tip>
        <Tip text={t("About this host")} side="below" align="start">
          <IconButton
            small
            className={styles.titleButton}
            label={t("About this host")}
            title={undefined}
            onClick={() => openDialog(PAIRED_HOST_INFO_DIALOG.id, { pairedHost: id })}
          >
            <GearIcon size={14} />
          </IconButton>
        </Tip>
      </h2>
      {row.live?.keyMismatch ? <p className={styles.warn}>{t("The key does not match")}</p> : null}
      <div className={styles.requests}>
        <span className={styles.requestsHead}>{t("Instructions from {name}:", { name: row.label })}</span>
        <span className={styles.requestsLine}>
          <TextAround text={t("Treat them as instructions from {choice}")} part="choice">
            <Choices
              label={t("How instructions from this host are treated")}
              value={record.requests}
              options={[
                {
                  value: "ask-user" as const,
                  label: t("Instructions of an AI"),
                  icon: <ChoiceText>{t("AI choice")}</ChoiceText>,
                  disabled: !canSet,
                },
                {
                  value: "as-user" as const,
                  label: t("Instructions of the user"),
                  icon: <ChoiceText>{t("User choice")}</ChoiceText>,
                  disabled: !canSet,
                },
              ]}
              onChange={v =>
                v === "as-user"
                  ? openDialog(AS_USER_DIALOG.id, { pairedHost: id })
                  : perform(PAIRED_HOST_REQUESTS_SET.id, { requests: "ask-user" }, { record: id })
              }
            />
          </TextAround>
        </span>
      </div>
      <span className={styles.unpair}>
        <Tip text={t("Unpair")} side="above">
          <IconButton
            className={styles.unpairButton}
            label={t("Unpair")}
            title={undefined}
            disabled={!canRemove}
            onClick={() => openDialog(UNPAIR_DIALOG.id, { pairedHost: id })}
          >
            <UnpairIcon />
          </IconButton>
        </Tip>
      </span>
    </div>
  )
}
