// 右の下のワークルームの枠: 選んでいる参加者の鳥・名前・管理者の王冠（管理者なら金、ほかは薄い灰色。押すと管理者にする）・情報（最終アクセス・ブランチ（あれば）・model・os）・今のチケット・チケット履歴。
// 情報の列の右下に退室のアイコン。情報の列の右には、スロット workroom-columnsに置かれたウィジェットの列（今のチケット・チケット履歴など）が並ぶ。
// ビジターを選んでいれば、ビジターの印・呼び名・（ビジター（読むだけ））・情報と、右下に外すアイコン（確かめのダイアログを開く）
import { Slot, useActions, useAllowedOn, useMessages } from "../../plugin-api/ui"
import { type VisitorRow, visitorName, type WorkroomRow } from "../base"
import { Elapsed, IconButton, Panel, Tip, useWorkroomActions, VisitorIcon } from "../base/ui"
import { BIRD_SIZE, Bird } from "./Bird"
import { VISITOR_LEAVE_DIALOG, WORKROOM_LEAVE_DIALOG } from "./control-center"
import { CrownIcon, LeaveIcon, TrashIcon } from "./icons"
import { kit } from "./kit"
import { lastAccessOf } from "./rows"
import { WORKROOM_COLUMNS } from "./slots"
import text from "./text.module.css"
import styles from "./WorkroomView.module.css"

export function WorkroomView({
  row,
  visitor,
  hidden,
}: {
  row: WorkroomRow | undefined
  visitor: VisitorRow | undefined
  hidden: boolean
}) {
  const t = useMessages(kit)
  return (
    <Panel className={styles.room} data-max={hidden} data-workroom-panel>
      {visitor ? (
        <Visitor row={visitor} />
      ) : row && row.state === "empty" ? (
        <Empty row={row} />
      ) : row ? (
        <Occupied row={row} />
      ) : (
        <p className={text.note}>{t("Workroom information")}</p>
      )}
    </Panel>
  )
}

// 空室: 名前と（空室）、右下に部屋を削除するボタン（ごみ箱のアイコン。ダイアログは削除だけを選べる）
function Empty({ row }: { row: WorkroomRow }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  const canRemove = useAllowedOn("@matomezu/base:workroom-remove", {}, { record: row.room.id }).ok
  return (
    <div className={styles.empty}>
      <p className={text.note}>
        {row.room.name}
        {t("(empty)")}
      </p>
      <span className={styles.leave}>
        <Tip text={t("Delete the room")} side="above">
          <IconButton
            className={styles.leaveButton}
            label={t("Delete the room")}
            title={undefined}
            disabled={!canRemove}
            onClick={() => openDialog(WORKROOM_LEAVE_DIALOG.id, { workroom: row.room.id })}
          >
            <TrashIcon />
          </IconButton>
        </Tip>
      </span>
    </div>
  )
}

function Occupied({ row }: { row: WorkroomRow }) {
  const t = useMessages(kit)
  const rooms = useWorkroomActions()
  const participant = row.participant
  const access = lastAccessOf(row)
  const canAdmin = useAllowedOn("@matomezu/base:admin-set", { workroom: row.room.id }).ok
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
        {participant ? (
          <LeaveButton workroom={row.room.id} participant={participant.id} />
        ) : (
          <LeaveIconButton workroom={row.room.id} enabled={false} />
        )}
      </div>
      <Slot name={WORKROOM_COLUMNS} props={{ workroom: row.room.id }} />
    </div>
  )
}

// 参加者 participant をワークルーム workroom から退室させるボタン（外せるときだけ押せる）
function LeaveButton({ workroom, participant }: { workroom: string; participant: string }) {
  const canLeave = useAllowedOn("@matomezu/base:participant-remove", {}, { record: participant }).ok
  return <LeaveIconButton workroom={workroom} enabled={canLeave} />
}

function LeaveIconButton({ workroom, enabled }: { workroom: string; enabled: boolean }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  return (
    <span className={styles.leave}>
      <Tip text={t("Leave the workroom")} side="above">
        <IconButton
          className={styles.leaveButton}
          label={t("Leave")}
          title={undefined}
          disabled={!enabled}
          onClick={() => openDialog(WORKROOM_LEAVE_DIALOG.id, { workroom })}
        >
          <LeaveIcon />
        </IconButton>
      </Tip>
    </span>
  )
}

// ビジター: 印・呼び名・（ビジター（読むだけ））・情報（最終アクセス・ブランチ（あれば）・model・os）、右下に外すアイコン
function Visitor({ row }: { row: VisitorRow }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  const participant = row.participant
  const access = lastAccessOf(row)
  const canLeave = useAllowedOn("@matomezu/base:participant-remove", {}, { record: participant.id }).ok
  return (
    <div className={styles.body}>
      <div className={styles.info}>
        <div className={styles.head}>
          <VisitorIcon size={BIRD_SIZE} />
          <span className={styles.name}>{visitorName(participant)}</span>
          <span className={text.note}>{t("Visitor (read only)")}</span>
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
          {row.branch ? (
            <>
              <dt>{t("Branch:")}</dt>
              <dd>{row.branch}</dd>
            </>
          ) : null}
          <dt>{t("Model:")}</dt>
          <dd>{row.model}</dd>
          <dt>{t("Environment:")}</dt>
          <dd>{participant.env}</dd>
        </dl>
        <span className={styles.leave}>
          <Tip text={t("Remove the visitor")} side="above">
            <IconButton
              className={styles.leaveButton}
              label={t("Remove the visitor")}
              title={undefined}
              disabled={!canLeave}
              onClick={() => openDialog(VISITOR_LEAVE_DIALOG.id, { participant: participant.id })}
            >
              <LeaveIcon />
            </IconButton>
          </Tip>
        </span>
      </div>
    </div>
  )
}
