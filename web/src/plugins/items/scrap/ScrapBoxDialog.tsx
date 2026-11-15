// スクラップボックスの編集のダイアログ: 見る範囲を base の ScrapForm で直し、その右の列で枠線（引くか・色）を決め、アクション item-update で書く（指すページは変えない）。
// 枠線の色の「なし」は、テーマの線の色（項目を持たない）。
// 紙に収まらないなど断られたら、閉じずに理由を出す。「元のページを開く」で、このステージで元のページを開いて閉じる
import { useState } from "react"
import type { ItemProps, ShapeEditArgs } from "../../../plugin-api"
import { type DialogProps, useCoreCatalog, useItemAt, useMessages, usePerform, useStage } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  ColorPicker,
  Dialog,
  Form,
  Problem,
  rowClass,
  ScrapForm,
  Switch,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { NO_LINE, type SCRAP_BOX, SCRAP_LINE } from "."
import { kit } from "./kit"

type ScrapProps = ItemProps<typeof SCRAP_BOX.id>

export function EditScrapBoxDialog({ args, onClose }: DialogProps<ShapeEditArgs>) {
  const placed = useItemAt(args.page, args.item)
  const start = placed?.props as ScrapProps | undefined
  return start ? <Editor args={args} start={start} onClose={onClose} /> : null
}

function Editor({ args, start, onClose }: { args: ShapeEditArgs; start: ScrapProps; onClose: () => void }) {
  const stage = useStage()?.id ?? ""
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const perform = usePerform()
  const [value, setValue] = useState(start)
  const { line, ...scrap } = value
  const swatches = useSwatches(useBookTheme(useBookOf()), SCRAP_LINE)
  // 枠線だけを変える（色の「なし」は項目を外す）
  const withLine = (next: string | undefined) => setValue(next === undefined ? scrap : { ...scrap, line: next })
  const [refused, setRefused] = useState<string | null>(null)
  const form = "scrap-box-edit-form"
  return (
    <Dialog
      title={t("Scrap settings")}
      large
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
      <Form
        id={form}
        fill
        ready
        onSubmit={() => {
          const done = perform("@matomezu/paper:item-update", { page: args.page, item: args.item, props: value })
          if (done.ok) {
            onClose()
            return
          }
          setRefused(t(refusalMessage(catalog, done, kit.message("Does not fit on the paper"))))
        }}
      >
        <ScrapForm
          value={scrap}
          onChange={next => setValue(line === undefined ? next : { ...next, line })}
          opens={{ stage, onOpened: onClose, edited: JSON.stringify(value) !== JSON.stringify(start) }}
          side={
            <div className={rowClass}>
              <span>{t("Border")}</span>
              <Switch
                label={t("Border")}
                checked={line !== NO_LINE}
                onChange={on => withLine(on ? undefined : NO_LINE)}
              />
              {swatches && line !== NO_LINE && (
                <ColorPicker
                  label={t("Border color")}
                  value={line}
                  palette={swatches.palette}
                  none={swatches.none}
                  onChange={withLine}
                />
              )}
            </div>
          }
        />
        {refused && <Problem>{refused}</Problem>}
      </Form>
    </Dialog>
  )
}
