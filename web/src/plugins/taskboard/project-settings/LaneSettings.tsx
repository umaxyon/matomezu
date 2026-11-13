// プロジェクト設定の「レーン」: 上に「未分類を表示する」のスイッチ、左にレーンの一覧（つまみ・名前、「レーン追加」、つまみのドラッグで並べ替え）、右に選んだレーンの「レーンプロンプト」。
// 未分類の行は、スイッチが入っている間だけ並びに出る（「未分類」の字とつまみ。プロンプトは書けない）。切っても並びの位置は残る。
// 名前の入力Formを離れたとき、空か、ほかのレーンと重なっていれば片付ける（settings-rows）
import { useId, useState } from "react"
import { useMessages } from "../../../plugin-api/ui"
import { controlClass, Switch } from "../../base/ui"
import { kit } from "../kit"
import { LANE_NAME_MAX, NO_DONE_LANE } from "../project"
import { Grip } from "../reorder/Grip"
import { useGripDrag } from "../reorder/useGripDrag"
import { useReorderAnimation } from "../reorder/useReorderAnimation"
import settings from "./ProjectSettingsDialog.module.css"
import { NameField, PromptSplit, rowProps } from "./PromptSplit"
import styles from "./PromptSplit.module.css"
import type { LaneRow } from "./rows"
import type { EditableRows } from "./useEditableRows"

export function LaneSettings({
  lanes,
  repeated,
  hides,
  done,
  onDone,
}: {
  lanes: EditableRows<LaneRow>
  repeated: ReadonlySet<string>
  hides: boolean // 保存すると、消したレーンのチケットがボードに出なくなる
  done: string // 完了のレーンに選んだ行の鍵（無ければ none）
  onDone: (key: string) => void
}) {
  const t = useMessages(kit)
  const { rows, change, add, leave, move, nameRef } = lanes
  const [selected, setSelected] = useState<string | null>(null)
  const unsorted = rows.find(r => r.kind === "unsorted")
  const shown = unsorted?.kind === "unsorted" && unsorted.shown
  const visible = rows.filter(r => r.kind === "lane" || shown)
  const { register, snapshot } = useReorderAnimation(visible.map(r => r.key))
  const { dragRowProps, gripProps, markClass } = useGripDrag(
    (dragging, over) => {
      snapshot()
      move(dragging, over)
    },
    visible.map(r => r.key),
  )
  const chosen = rows.find(r => r.key === selected)
  const switchId = useId()
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
      <label className={settings.switchRow}>
        {t("Done lane")}
        <select className={controlClass} value={done} onChange={e => onDone(e.target.value)}>
          <option value={NO_DONE_LANE}>{t("No done lane")}</option>
          {rows
            .flatMap(r => (r.kind === "lane" && r.name.trim() !== "" ? [r] : []))
            .map(r => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <PromptSplit
        notes={[
          ...(repeated.size > 0 ? [t("The names repeat")] : []),
          ...(hides ? [t("Tickets moved to unsorted are not shown on the board")] : []),
        ]}
        addLabel={t("Add a lane")}
        onAdd={() => setSelected(add({ kind: "lane", prompt: "" }))}
        promptTitle={t("Lane prompt")}
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
    </>
  )
}
