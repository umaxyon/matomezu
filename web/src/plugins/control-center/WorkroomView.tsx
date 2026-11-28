// 右の下のワークルームの枠: 選んでいる参加者の鳥・名前・管理者の王冠（管理者なら金、ほかは薄い灰色。押すと管理者にする）・情報（最終アクセス・ブランチ（あれば）・model・os・インターフェース（あれば））・カレントチケット・チケット履歴。
// 情報の列の右下に、引継ぎページを書いて会話を空にするよう AI に頼むアイコン（確かめのダイアログを開く）と退室のアイコン。情報の列の右には、スロット workroom-columnsに置かれたウィジェットの列（カレントチケット・チケット履歴など）が並ぶ。
// ワークルームとビジターのほかの種類を選んでいれば、スロット picked-detail のその種類の物が枠の中を描く。ビジターを選んでいれば、ビジターの印・呼び名・（ビジター（読むだけ））・情報と、右下に外すアイコン（確かめのダイアログを開く）
import { KindSlot, Slot, useActions, useAllowedOn, useMessages, useT } from "../../plugin-api/ui"
import {
  aiUiText,
  NO_AI_UI,
  NO_BRANCH,
  NO_MODEL,
  NO_OCCUPANT,
  NOT_CALLED,
  type VisitorRow,
  visitorName,
  type WorkroomRow,
} from "../base"
import { CrownIcon, Elapsed, IconButton, Panel, Tip, useWorkroomActions, VisitorIcon } from "../base/ui"
import { BIRD_SIZE, Bird } from "./Bird"
import { HAND_OFF_DIALOG, type Picked, VISITOR_LEAVE_DIALOG, WORKROOM_LEAVE_DIALOG } from "./control-center"
import { ClearIcon, LeaveIcon, TrashIcon } from "./icons"
import { kit } from "./kit"
import { lastAccessOf } from "./rows"
import { PICKED_DETAIL, WORKROOM_COLUMNS } from "./slots"
import text from "./text.module.css"
import styles from "./WorkroomView.module.css"

export function WorkroomView({
  row,
  visitor,
  detail,
  hidden,
}: {
  row: WorkroomRow | undefined
  visitor: VisitorRow | undefined
  detail: Picked | undefined
  hidden: boolean
}) {
  const t = useMessages(kit)
  return (
    <Panel className={styles.room} data-max={hidden} aria-hidden={hidden} inert={hidden} data-workroom-panel>
      {detail ? (
        <KindSlot name={PICKED_DETAIL} kind={detail.kind} props={{ id: detail.id }} />
      ) : visitor ? (
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

// 空室: 名前と（空室）、右下に「部屋を削除する」のボタン（ごみ箱のアイコン。ダイアログは削除だけを選べる）
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
            {access === "called" && row.calledAt !== NOT_CALLED ? (
              <Elapsed at={row.calledAt} />
            ) : access === "preparing" ? (
              t("Preparing")
            ) : (
              t("None")
            )}
          </dd>
          {/* ブランチは git を使っている参加者だけが持つ（git は必須でない）。無ければ行ごと出さない */}
          {row.branch !== NO_BRANCH ? (
            <>
              <dt>{t("Branch:")}</dt>
              <dd>{row.branch}</dd>
            </>
          ) : null}
          <dt>{t("Model:")}</dt>
          <dd>{row.model !== NO_MODEL ? row.model : ""}</dd>
          <dt>{t("Environment:")}</dt>
          <dd>{participant !== NO_OCCUPANT ? participant.env : ""}</dd>
          <AiUiFact aiUi={row.aiUi} />
        </dl>
        <span className={styles.leave}>
          {participant !== NO_OCCUPANT ? (
            <>
              <ClearButton participant={participant.id} />
              <LeaveButton workroom={row.room.id} participant={participant.id} />
            </>
          ) : (
            <LeaveIconButton workroom={row.room.id} enabled={false} />
          )}
        </span>
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
  )
}

// 参加者 participant に、引継ぎページを書いて会話を空にするよう頼むボタン（確かめのダイアログを開く。送れるかはダイアログの送るが決める）。
// 題は吹き出しの幅に入らないので、文言の改行で 2 行に分ける
function ClearButton({ participant }: { participant: string }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  return (
    <Tip text={t("Send the instruction to clear the context")} side="above">
      <IconButton
        className={styles.leaveButton}
        label={t("Clear")}
        title={undefined}
        onClick={() => openDialog(HAND_OFF_DIALOG.id, { participant })}
      >
        <ClearIcon />
      </IconButton>
    </Tip>
  )
}

// AI の UI の行（分からなければ、ブランチと同じに行ごと出さない）
function AiUiFact({ aiUi }: { aiUi: string | typeof NO_AI_UI }) {
  const t = useMessages(kit)
  const tt = useT()
  if (aiUi === NO_AI_UI) return null
  return (
    <>
      <dt>{t("Interface:")}</dt>
      <dd>{aiUiText(aiUi, tt)}</dd>
    </>
  )
}

// ビジター: 印・呼び名・（ビジター（読むだけ））・情報（最終アクセス・ブランチ（あれば）・model・os・インターフェース（あれば））、右下に外すアイコン
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
            {access === "called" && row.calledAt !== NOT_CALLED ? (
              <Elapsed at={row.calledAt} />
            ) : access === "preparing" ? (
              t("Preparing")
            ) : (
              t("None")
            )}
          </dd>
          {row.branch !== NO_BRANCH ? (
            <>
              <dt>{t("Branch:")}</dt>
              <dd>{row.branch}</dd>
            </>
          ) : null}
          <dt>{t("Model:")}</dt>
          <dd>{row.model}</dd>
          <dt>{t("Environment:")}</dt>
          <dd>{participant.env}</dd>
          <AiUiFact aiUi={row.aiUi} />
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
