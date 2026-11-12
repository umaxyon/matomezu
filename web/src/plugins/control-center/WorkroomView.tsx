// 右の下のワークルームの枠: 選んでいる参加者の鳥・名前・管理者の王冠（管理者なら金、ほかは薄い灰色。押すと管理者にする）・情報（最終アクセス・ブランチ（あれば）・model・os）・現在のタスク・履歴。
// 情報の列の右下に退室のアイコン。現在のタスクと履歴の列は、中身が無ければ「なし」
import { useActions, useAllowedOn, useMessages, useWindowStage } from "../../plugin-api/ui"
import type { WorkroomRow } from "../base"
import { Elapsed, IconButton, Panel, Tip, useWorkroomActions } from "../base/ui"
import { Bird } from "./Bird"
import { WORKROOM_LEAVE_DIALOG } from "./control-center"
import { CrownIcon, LeaveIcon } from "./icons"
import { kit } from "./kit"
import { lastAccessOf } from "./rows"
import text from "./text.module.css"
import styles from "./WorkroomView.module.css"

export function WorkroomView({ row }: { row: WorkroomRow | undefined }) {
  const t = useMessages(kit)
  return (
    <Panel className={styles.room} data-workroom-panel>
      {row && row.state === "empty" ? (
        <p className={text.note}>
          {row.room.name}
          {t("(empty)")}
        </p>
      ) : row ? (
        <Occupied row={row} />
      ) : (
        <p className={text.note}>{t("Workroom information")}</p>
      )}
    </Panel>
  )
}

function Occupied({ row }: { row: WorkroomRow }) {
  const t = useMessages(kit)
  const stage = useWindowStage()
  const { openDialog } = useActions()
  const rooms = useWorkroomActions()
  const participant = row.participant
  const access = lastAccessOf(row)
  const canAdmin = useAllowedOn("@matomezu/base:admin-set", { workroom: row.room.id }).ok
  const canLeave = useAllowedOn("@matomezu/base:participant-remove", {}, { record: participant?.id ?? "-" }).ok
  return (
    <div className={styles.body}>
      <div className={styles.info}>
        <div className={styles.head}>
          <Bird row={row} />
          <span className={styles.name}>{row.room.name}</span>
          <Tip text={row.admin ? t("Administrator") : t("Make administrator")}>
            <button
              type="button"
              className={styles.crown}
              aria-label={t("Administrator")}
              aria-pressed={row.admin}
              disabled={!canAdmin}
              onClick={() => {
                if (!row.admin) rooms.makeAdmin(row.room.id)
              }}
            >
              <CrownIcon />
            </button>
          </Tip>
        </div>
        <dl className={styles.facts}>
          <dt>{t("Last access:")}</dt>
          <dd>
            {access === "called" && row.calledAt ? (
              <Elapsed at={row.calledAt} />
            ) : access === "preparing" ? (
              t("Preparing")
            ) : (
              t("None")
            )}
          </dd>
          {/* ブランチは git を使っている参加者だけが持つ（git は必須でない）。無ければ行ごと出さない */}
          {row.branch ? (
            <>
              <dt>{t("Branch:")}</dt>
              <dd>{row.branch}</dd>
            </>
          ) : null}
          <dt>{t("Model:")}</dt>
          <dd>{row.model}</dd>
          <dt>{t("Environment:")}</dt>
          <dd>{participant?.env}</dd>
        </dl>
        <span className={styles.leave}>
          <Tip text={t("Leave the workroom")} side="above">
            <IconButton
              className={styles.leaveButton}
              label={t("Leave")}
              title={undefined}
              disabled={!canLeave}
              onClick={() => openDialog(stage, WORKROOM_LEAVE_DIALOG.id, { workroom: row.room.id })}
            >
              <LeaveIcon />
            </IconButton>
          </Tip>
        </span>
      </div>
      <div className={styles.task}>
        <span className={`${text.sectionHeading} ${styles.heading}`}>{t("Current task")}</span>
        <div className={styles.taskScroll}>
          <p className={text.note}>{t("None")}</p>
        </div>
      </div>
      <div className={styles.history}>
        <span className={`${text.sectionHeading} ${styles.heading}`}>{t("History")}</span>
        <div className={styles.historyList}>
          <p className={text.note}>{t("None")}</p>
        </div>
      </div>
    </div>
  )
}
