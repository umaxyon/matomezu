// データの編集のダイアログ: 表の格子をその場で書き換え、確定で表を丸ごと入れ替える（アクション data-set）。
// 見出しの行で列の名前と型（数・文字）を選び、列を足す・消す。行は最後に足し、左の × で消す。数の列に数でない文字を書いたセルは赤くし、確定を押せない。
// 上でキャプション・本文と文字の置き場所（TextFields）、見た目（表・棒・折れ線・円・散布図）と軸（AxesFields）を選ぶ。軸の列は下書きの列から選ぶ。
// 文字の列を数の列に変えられるのは、どのセルも数として読めるときだけ。置けない（紙からはみ出すなど）ときは閉じずに理由を出す
import { useId, useState } from "react"
import { type DialogProps, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { ActionButton, Dialog, Form, Problem } from "../../base/ui"
import { AxesFields } from "./AxesFields"
import { DATA_SET } from "./actions"
import styles from "./DataDialog.module.css"
import { DATA } from "./data"
import {
  type AxesDraft,
  addColumn,
  addRow,
  axesForText,
  axesOk,
  axesProps,
  axesWithout,
  axesWithoutRow,
  cellOk,
  type Draft,
  draftArgs,
  removeColumn,
  removeRow,
  renameColumn,
  retypeColumn,
  setCell,
  toAxesDraft,
  toDraft,
  togglePicked,
} from "./draft"
import { kit } from "./kit"
import { type DataTextDraft, TextFields } from "./TextFields"
import type { ColumnType } from "./table"

export function EditDataDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const placed = useItem(stage, args.page, args.item, DATA.id)
  const perform = usePerform(stage)
  if (!placed) return null
  // 表と一緒に、見た目・文字・軸を書く（表の見た目なら、大きさが表と文字に合う。軸は列と行の位置で書く）
  const save = (d: Draft, a: AxesDraft, text: DataTextDraft) => {
    const set = draftArgs(d)
    if (!set) return false
    const done = perform(DATA_SET.id, { page: args.page, item: args.item, ...set, props: { ...text, ...axesProps(a) } })
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <DataDialog
      start={toDraft(placed.table)}
      startAxes={toAxesDraft(placed.props, placed.table)}
      startText={textDraftOf(placed.props)}
      stage={stage}
      onSubmit={save}
      onClose={onClose}
    />
  )
}

// 文字の領域の項目の下書き
const textDraftOf = (p: DataTextDraft): DataTextDraft => ({
  caption: p.caption,
  rule: p.rule,
  body: p.body,
  captionAlign: p.captionAlign,
  bodyAlign: p.bodyAlign,
  textAt: p.textAt,
})

function DataDialog({
  start,
  startAxes,
  startText,
  stage,
  onSubmit,
  onClose,
}: {
  start: Draft
  startAxes: AxesDraft
  startText: DataTextDraft
  stage: string
  onSubmit: (d: Draft, a: AxesDraft, text: DataTextDraft) => boolean // 決められたか
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [draft, setDraft] = useState(start)
  const [axes, setAxes] = useState(startAxes)
  const [text, setText] = useState(startText)
  const [problem, setProblem] = useState<"fit" | "type" | null>(null)
  const change = (next: Draft, nextAxes = axes) => {
    setDraft(next)
    setAxes(nextAxes)
    setProblem(null)
  }
  const retype = (col: number, type: ColumnType) => {
    const next = retypeColumn(draft, col, type)
    if (next) change(next, type === "text" ? axesForText(axes, col) : axes)
    else setProblem("type")
  }
  // 行ごとに項目の文字を出すかの印（棒と折れ線で、選んだ行だけを出すとき）
  const picking = (axes.view === "bar" || axes.view === "line") && axes.skip === "picked"
  // 列が無ければ表は無いので、軸は見ない
  const ok = draftArgs(draft) !== null && (draft.columns.length === 0 || axesOk(axes, draft))
  return (
    <Dialog
      title={t("Edit data")}
      width={560}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!ok}>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={ok} onSubmit={() => setProblem(onSubmit(draft, axes, text) ? null : "fit")}>
        <TextFields stage={stage} text={text} onChange={setText} />
        <AxesFields draft={draft} axes={axes} onChange={setAxes} />
        <div className={styles.grid}>
          <table>
            <thead>
              <tr>
                <th />
                {draft.columns.map((c, i) => (
                  <th key={c.id ?? `new-${i}`}>
                    <div className={styles.head}>
                      <input
                        className={styles.input}
                        size={1}
                        aria-label={t("Column name")}
                        value={c.name}
                        onChange={e => change(renameColumn(draft, i, e.target.value))}
                      />
                      <div className={styles.headRow}>
                        <select
                          className={styles.input}
                          aria-label={t("Column type")}
                          value={c.type}
                          onChange={e => retype(i, e.target.value as ColumnType)}
                        >
                          <option value="number">{t("Number")}</option>
                          <option value="text">{t("Text")}</option>
                        </select>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={t("Remove column")}
                          onClick={() => change(removeColumn(draft, i), axesWithout(axes, i))}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
                <th>
                  <button
                    type="button"
                    className={styles.add}
                    onClick={() => change(addColumn(draft, t("Column {n}", { n: draft.columns.length + 1 })))}
                  >
                    ＋ {t("Add column")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r, row) => (
                <tr key={r.id ?? `new-${row}`}>
                  <td>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={t("Remove row")}
                      onClick={() => change(removeRow(draft, row), axesWithoutRow(axes, row))}
                    >
                      ×
                    </button>
                    {picking && (
                      <input
                        type="checkbox"
                        aria-label={t("Show label")}
                        checked={axes.picked.includes(row)}
                        onChange={() => setAxes(togglePicked(axes, row))}
                      />
                    )}
                  </td>
                  {r.cells.map((text, col) => {
                    const type = draft.columns[col]?.type ?? "text"
                    const bad = !cellOk(type, text)
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: セルは列の順の並び
                      <td key={col}>
                        <input
                          className={styles.input}
                          size={1}
                          data-type={type}
                          aria-invalid={bad}
                          title={bad ? t("Not a number") : undefined}
                          value={text}
                          onChange={e => change(setCell(draft, row, col, e.target.value))}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {draft.columns.length > 0 && (
          <div className={styles.footer}>
            <button type="button" className={styles.add} onClick={() => change(addRow(draft))}>
              ＋ {t("Add row")}
            </button>
          </div>
        )}
        {problem === "type" && <Problem>{t("Some cells are not numbers")}</Problem>}
        {problem === "fit" && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
