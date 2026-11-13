// プロジェクト設定の「レーン」: 上に「未分類を表示する」のスイッチ、左にレーンの一覧（つまみ・名前、「レーン追加」、つまみのドラッグで並べ替え）、右に選んだレーンの「レーンプロンプト」。
// 未分類の行は、スイッチが入っている間だけ並びに出る（「未分類」の字とつまみ。プロンプトは書けない）。切っても並びの位置は残る。
// 名前の入力Formを離れたとき、空か、ほかのレーンと重なっていれば片付ける（settings-rows）
import { useId, useState } from "react"
import { useMessages } from "../../plugin-api/ui"
import { Switch } from "../base/ui"
import { Grip } from "./Grip"
import { kit } from "./kit"
import settings from "./ProjectSettingsDialog.module.css"
import { NameInput, PromptSplit, rowProps } from "./PromptSplit"
import styles from "./PromptSplit.module.css"
import { LANE_NAME_MAX } from "./project"
import type { LaneRow } from "./settings-rows"
import type { EditableRows } from "./useEditableRows"
import { useGripDrag } from "./useGripDrag"
import { useReorderAnimation } from "./useReorderAnimation"

export function LaneSettings({
  lanes,
  repeated,
  hides,
}: {
  lanes: EditableRows<LaneRow>
  repeated: ReadonlySet<string>
  hides: boolean // 保存すると、消したレーンのチケットがボードに出なくなる
}) {
  const t = useMessages(kit)
  const { rows, change, add, leave, move, nameRef } = lanes
  const [selected, setSelected] = useState<string | null>(null)
  const unsorted = rows.find(r => r.kind === "unsorted")
  const shown = unsorted?.kind === "unsorted" && unsorted.shown
  const visible = rows.filter(r => r.kind === "lane" || shown)
  const { register, snapshot } = useReorderAnimation(visible.map(r => r.key))
  const { dragRowProps, gripProps } = useGripDrag((dragging, over) => {
    snapshot()
    move(dragging, over)
  })
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
            {...rowProps(lane.key, selected, setSelected)}
            {...dragRowProps(lane.key)}
          >
            <Grip {...gripProps(lane.key)} />
            {lane.kind === "lane" ? (
              <NameInput
                label={t("Lane name")}
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
