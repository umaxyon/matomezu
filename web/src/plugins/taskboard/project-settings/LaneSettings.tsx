// プロジェクト設定の「レーン」: 上に「未分類を表示する」と「件数を表示する」（レーンのタイトル帯にチケットの数を出す）のスイッチ、左にレーンの一覧（つまみ・名前、「レーン追加」、つまみのドラッグで並べ替え）、右に選んだレーンの「レーンプロンプト」。
// プロンプトの上に「完了レーンにする」のスイッチ（名前のあるレーンだけ）。ほかのレーンが完了のレーンなら、入れる前に確かめる。切ると完了のレーンは無し。
// その下に「作業中レーンにする」のスイッチ（いくつのレーンにも入れられる）。同じレーンを完了と作業中の両方にはできず、片方が入っている間はもう片方を押せない。
// 未分類の行は、スイッチが入っている間だけ並びに出る（「未分類」の字とつまみ。プロンプトは書けない）。切っても並びの位置は残る。
// 名前の入力Formを離れたとき、空か、ほかのレーンと重なっていれば片付ける（settings-rows）
import { useId, useState } from "react"
import { useMessages } from "../../../plugin-api/ui"
import { Confirm, Switch, useRowSlide } from "../../base/ui"
import { kit } from "../kit"
import { INHERIT_CARD_SIZE, LANE_NAME_MAX, NO_DONE_LANE } from "../project"
import { Grip } from "../reorder/Grip"
import { useGripDrag } from "../reorder/useGripDrag"
import { LaneCardSizeChoices } from "./CardSizeChoices"
import settings from "./ProjectSettingsDialog.module.css"
import { NameField, PromptSplit, rowProps } from "./PromptSplit"
import styles from "./PromptSplit.module.css"
import { doneChoices, doneElsewhereOf, type LaneRow, sizedAsDone } from "./rows"
import type { EditableRows } from "./useEditableRows"

export function LaneSettings({
  lanes,
  repeated,
  hides,
  done,
  onDone,
  doneBlocked,
  count,
  onCount,
}: {
  lanes: EditableRows<LaneRow>
  repeated: ReadonlySet<string>
  hides: boolean // 保存すると、消したレーンのチケットがボードに出なくなる
  done: string // 完了のレーンに選んだ行の鍵（無ければ none）
  onDone: (key: string) => void
  doneBlocked: boolean // 完了のレーンに選んだ行に、担当のいるチケットがある（保存できない）
  count: boolean // レーンのタイトル帯にチケットの数を出す
  onCount: (on: boolean) => void
}) {
  const t = useMessages(kit)
  const { rows, change, add, leave, move, nameRef } = lanes
  const [selected, setSelected] = useState<string | null>(null)
  const unsorted = rows.find(r => r.kind === "unsorted")
  const shown = unsorted?.kind === "unsorted" && unsorted.shown
  const visible = rows.filter(r => r.kind === "lane" || shown)
  const { register, snapshot } = useRowSlide(
    visible.map(r => r.key),
    { from: "snapshot" },
  )
  const { dragRowProps, gripProps, markClass } = useGripDrag(
    (dragging, over) => {
      snapshot()
      move(dragging, over)
    },
    visible.map(r => r.key),
  )
  const chosen = rows.find(r => r.key === selected)
  const switchId = useId()
  const countId = useId()
  const doneId = useId()
  const workingId = useId()
  // 完了のレーンにしようとして、確かめている行の鍵と、今の完了のレーンの名前
  const [asking, setAsking] = useState<{ key: string; now: string } | null>(null)
  const doneChoice = doneChoices(rows).find(r => r.key === chosen?.key)
  // 完了のレーンにする（その行のチケットサイズを small にする）
  const makeDone = (key: string) => {
    onDone(key)
    lanes.apply(list => sizedAsDone(list, key) as LaneRow[])
  }
  const toggleDone = (key: string, on: boolean) => {
    if (!on) return onDone(NO_DONE_LANE)
    const now = doneElsewhereOf(rows, done, key)
    if (now === null) makeDone(key)
    else setAsking({ key, now })
  }
  return (
    <>
      <div className={settings.switchRow}>
        <Switch
          id={switchId}
          label={t("Show unsorted")}
          checked={shown}
          onChange={on => unsorted && change(unsorted.key, { shown: on })}
        />
        <label htmlFor={switchId}>{t("Show unsorted")}</label>
      </div>
      <div className={settings.switchRow}>
        <Switch id={countId} label={t("Show ticket counts")} checked={count} onChange={onCount} />
        <label htmlFor={countId}>{t("Show ticket counts")}</label>
      </div>
      <PromptSplit
        notes={[
          ...(repeated.size > 0 ? [t("The names repeat")] : []),
          ...(hides ? [t("Tickets moved to unsorted are not shown on the board")] : []),
          ...(doneBlocked ? [t("The done lane has tickets with assignees: complete them first")] : []),
        ]}
        addLabel={t("Add a lane")}
        onAdd={() => setSelected(add({ kind: "lane", prompt: "", cardSize: INHERIT_CARD_SIZE, working: false }))}
        promptTitle={t("Lane prompt")}
        promptHead={
          chosen?.kind === "lane" ? (
            <div className={settings.promptHeadRows}>
              {doneChoice ? (
                <div className={settings.switchRow}>
                  <Switch
                    id={doneId}
                    label={t("Make it the done lane")}
                    checked={done === doneChoice.key}
                    disabled={chosen.working}
                    onChange={on => toggleDone(doneChoice.key, on)}
                  />
                  <label htmlFor={doneId}>{t("Make it the done lane")}</label>
                </div>
              ) : null}
              {doneChoice ? (
                <div className={settings.switchRow}>
                  <Switch
                    id={workingId}
                    label={t("Make it a working lane")}
                    checked={chosen.working}
                    disabled={done === doneChoice.key}
                    onChange={on => change(doneChoice.key, { working: on })}
                  />
                  <label htmlFor={workingId}>{t("Make it a working lane")}</label>
                </div>
              ) : null}
              <div className={settings.switchRow}>
                <span>{t("Ticket size")}</span>
                <LaneCardSizeChoices value={chosen.cardSize} onChange={cardSize => change(chosen.key, { cardSize })} />
              </div>
            </div>
          ) : null
        }
        prompt={chosen?.kind === "lane" ? chosen.prompt : undefined}
        onPromptChange={prompt => chosen && change(chosen.key, { prompt })}
      >
        {visible.map(lane => (
          <div
            key={lane.key}
            ref={register(lane.key)}
            {...rowProps(lane.key, selected, setSelected, markClass)}
            {...dragRowProps(lane.key)}
          >
            <Grip {...gripProps(lane.key)} />
            {lane.kind === "lane" ? (
              <NameField
                label={t("Lane name")}
                editLabel={t("Edit the name")}
                value={lane.name}
                max={LANE_NAME_MAX}
                repeated={repeated.has(lane.key)}
                inputRef={nameRef(lane.key)}
                onFocus={() => setSelected(lane.key)}
                onChange={name => change(lane.key, { name })}
                onLeave={() => leave(lane.key)}
              />
            ) : (
              <span className={styles.label}>{t("Unsorted")}</span>
            )}
          </div>
        ))}
      </PromptSplit>
      {asking ? (
        <Confirm
          message={t("{name} is the done lane now. Change it?", { name: asking.now })}
          ok={t("Change it")}
          cancel={t("Keep it")}
          onOk={() => {
            makeDone(asking.key)
            setAsking(null)
          }}
          onCancel={() => setAsking(null)}
        />
      ) : null}
    </>
  )
}
