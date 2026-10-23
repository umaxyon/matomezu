// 線の編集のダイアログ: キャプション、通り方（折れ線・直線。自分に戻る線では出さない）と線の種類（実線・破線）、始点と終点の形、
// 端の位置の一回きりの操作（整列・接辺の自動選択・折れ線を自動に戻す・キャプションの位置を自動に戻す。押すと印が付き、確定で行う）、線を消すボタン。
// 通り方・線の種類・端の形は、選んだそばから線に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// 確定でアクション line.update（変えた項目だけ）。整列は、ほかの項目を変えたあとの形で両端の位置を決める（line/drawn.ts の alignedEndsOf）。
// キャプションで間隔が広がって押した形が紙に収まらなければ、閉じずに理由を出す
import { useCallback, useEffect, useId, useState } from "react"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import {
  ActionButton,
  Choices,
  controlClass,
  Dialog,
  Field,
  Form,
  inlineClass,
  Problem,
  pairClass,
  rowClass,
  Section,
} from "../../../base/ui"
import { rectsOf } from "../items/items"
import { linesOf } from "../placed"
import { useBookOf } from "../shape/parts"
import { elbowAt, type LineRoute } from "."
import { alignedEndsOf } from "./drawn"
import { type LineOnce, linePatch } from "./edit"
import { HEADS, type Head } from "./heads"
import { DASH_ICONS, ROUTE_ICONS } from "./icons"
import type { PlacedLine } from "./placed"

type LineProps = PlacedLine["props"]
type Dash = "solid" | "dashed"
// 選んだそばから線に見せる項目
type Look = Pick<LineProps, "route" | "dash" | "startHead" | "endHead">
// 一回きりの操作
type Once = LineOnce

// 端の形の名前（選ぶ欄。"" は無し。記号は形の見当）
const HEAD_LABELS: Record<Head, MessageKey> = {
  arrow: "▶ Filled triangle",
  open: "> Open arrowhead",
  hollow: "▷ Hollow triangle",
  diamond: "◆ Filled diamond",
  hollowDiamond: "◇ Hollow diamond",
  one: "ER: one",
  many: "ER: many",
  zeroOne: "ER: zero or one",
  zeroMany: "ER: zero or more",
  oneMany: "ER: one or more",
}

export function EditLineDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const t = useT()
  const form = useId()
  const registry = useRegistry()
  const book = useBookOf(stage)
  const drawing = useApp(s => (book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined))
  const page = drawing?.pages.find(p => p.id === args.page)
  const line = page && linesOf(page).find(l => l.id === args.item)
  const { perform, previewDialog } = useActions()
  const elbow = drawing && page ? elbowAt(registry, drawing, page) : true
  const startRoute: LineRoute = line?.props.route ?? (elbow ? "elbow" : "straight")
  const [caption, setCaption] = useState(line?.props.caption ?? "")
  const [route, setRoute] = useState<LineRoute>(startRoute)
  const [dash, setDash] = useState<Dash>(line?.props.dash ?? "solid")
  const [startHead, setStartHead] = useState<Head | "">(line?.props.startHead ?? "")
  const [endHead, setEndHead] = useState<Head | "">(line?.props.endHead ?? "")
  const [once, setOnce] = useState<ReadonlySet<Once>>(new Set())
  const [refused, setRefused] = useState(false)
  const changed =
    route !== startRoute ||
    dash !== (line?.props.dash ?? "solid") ||
    startHead !== (line?.props.startHead ?? "") ||
    endHead !== (line?.props.endHead ?? "")
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  useEffect(() => {
    preview(
      changed
        ? {
            route,
            dash: dash === "dashed" ? "dashed" : undefined,
            startHead: startHead || undefined,
            endHead: endHead || undefined,
          }
        : null,
    )
  }, [changed, route, dash, startHead, endHead, preview])
  if (!book || !page || !line) return null
  const self = line.from === line.to
  const rects = rectsOf(registry, page)
  const p = line.props
  const fixed = p.exitAt !== undefined || p.enterAt !== undefined
  const captionMoved = !!p.caption?.trim() && (p.captionAt !== undefined || p.captionOffset !== undefined)
  const aligned = alignedEndsOf(line, rects, elbow) === null
  // 押した印を入り切りする（整列と接辺の自動選択は、どちらか 1 つ）
  const toggle = (k: Once) =>
    setOnce(now => {
      const next = new Set(now)
      if (next.has(k)) next.delete(k)
      else {
        next.add(k)
        if (k === "align") next.delete("free")
        if (k === "free") next.delete("align")
      }
      return next
    })
  const submit = () => {
    const patch = linePatch(line, { caption, route, dash, startHead, endHead, once }, rects, elbow)
    if (Object.keys(patch).length === 0) return onClose()
    const done = perform("line.update", { page: page.id, line: line.id, props: patch }, { book })
    if (done.ok) onClose()
    else setRefused(true)
  }
  const remove = () => {
    perform("item.remove", { page: page.id, items: [line.id] }, { book })
    onClose()
  }
  const heads = [{ value: "" as const, label: t("None") }, ...HEADS.map(h => ({ value: h, label: t(HEAD_LABELS[h]) }))]
  const onceButton = (k: Once, label: MessageKey, help: MessageKey, disabled = false) => (
    <ActionButton pressed={once.has(k)} disabled={disabled} onClick={() => toggle(k)}>
      <span title={t(help)}>{t(label)}</span>
    </ActionButton>
  )
  return (
    <Dialog
      title={t("Edit line")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready onSubmit={submit}>
        <Field label={t("Caption")}>
          {id => (
            <input
              id={id}
              className={controlClass}
              value={caption}
              placeholder={t("None")}
              onChange={e => setCaption(e.target.value)}
            />
          )}
        </Field>
        <div className={inlineClass}>
          {!self && (
            <span className={pairClass}>
              <span>{t("Route")}</span>
              <Choices
                label={t("Route")}
                value={route}
                options={[
                  { value: "elbow", label: t("Elbow"), icon: ROUTE_ICONS.elbow },
                  { value: "straight", label: t("Straight"), icon: ROUTE_ICONS.straight },
                ]}
                onChange={setRoute}
              />
            </span>
          )}
          <span className={pairClass}>
            <span>{t("Line style")}</span>
            <Choices
              label={t("Line style")}
              value={dash}
              options={[
                { value: "solid", label: t("Solid"), icon: DASH_ICONS.solid },
                { value: "dashed", label: t("Dashed"), icon: DASH_ICONS.dashed },
              ]}
              onChange={setDash}
            />
          </span>
        </div>
        <div className={inlineClass}>
          <label className={pairClass}>
            <span>{t("Start")}</span>
            <select
              className={controlClass}
              aria-label={t("Start head")}
              value={startHead}
              onChange={e => setStartHead(e.target.value as Head | "")}
            >
              {heads.map(h => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className={pairClass}>
            <span>{t("End")}</span>
            <select
              className={controlClass}
              aria-label={t("End head")}
              value={endHead}
              onChange={e => setEndHead(e.target.value as Head | "")}
            >
              {heads.map(h => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(!self || p.via !== undefined || captionMoved) && (
          <Section title={t("Ends")}>
            <div className={inlineClass}>
              {!self &&
                onceButton(
                  "align",
                  "Align ends",
                  "Keeps the shape and fixes both ends at the middle of their sides, or straight across where the facing sides overlap",
                  aligned,
                )}
              {!self &&
                onceButton(
                  "free",
                  "Free ends",
                  "Stops fixing the ends: the sides and places are chosen from the items' positions",
                  !fixed,
                )}
              {p.via !== undefined &&
                onceButton("via", "Auto bends", "Drops the moved middle segments and draws the bends automatically")}
              {captionMoved &&
                onceButton("caption", "Auto caption place", "Puts the caption back at its automatic place on the line")}
            </div>
          </Section>
        )}
        <div className={rowClass}>
          <ActionButton danger onClick={remove}>
            {t("Delete line")}
          </ActionButton>
        </div>
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
