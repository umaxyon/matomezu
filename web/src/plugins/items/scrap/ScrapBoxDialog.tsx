// スクラップボックスの編集のダイアログ: 見る範囲を base の ScrapForm で直し、その右の列で枠線（引くか・色）を決め、アクション item-update で書く（指すページは変えない）。
// 枠線の色の「なし」は、テーマの線の色（項目を持たない）。
// 紙に収まらないなど断られたら、閉じずに理由を出す。「元のページを開く」で、このステージで元のページを開いて閉じる
import { useState } from "react"
import type { ItemProps, ShapeEditArgs } from "../../../plugin-api"
import { NO_ITEM } from "../../../plugin-api"
import { type DialogProps, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage, scrapScaleMin } from "../../base"
import {
  ActionButton,
  ColorPicker,
  Dialog,
  Form,
  NO_COLOR,
  NO_SWATCHES,
  Problem,
  rowClass,
  ScrapForm,
  Switch,
  usePageTheme,
  useSwatches,
} from "../../base/ui"
import { NO_LINE, type SCRAP_BOX, SCRAP_LINE } from "."
import { kit } from "./kit"

type ScrapProps = ItemProps<typeof SCRAP_BOX.id>

export function EditScrapBoxDialog({ args, onClose }: DialogProps<ShapeEditArgs>) {
  const placed = useItem(args.page, args.item)
  const start = placed === NO_ITEM ? undefined : (placed.props as ScrapProps)
  return start ? <Editor args={args} start={start} onClose={onClose} /> : null
}

function Editor({ args, start, onClose }: { args: ShapeEditArgs; start: ScrapProps; onClose: () => void }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const perform = usePerform()
  const [value, setValue] = useState(start)
  const { line, ...scrap } = value
  const swatches = useSwatches(usePageTheme(), SCRAP_LINE)
  // 枠線だけを変える（色の「なし」は項目を外す）
  const withLine = (next: string | typeof NO_COLOR) => setValue(next === NO_COLOR ? scrap : { ...scrap, line: next })
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
          const done = perform("@matomezu/paper:item-update", { item: args.item, props: value }, { page: args.page })
          if (done.ok) {
            onClose()
            return
          }
          setRefused(t(refusalMessage(catalog, done, kit.message("Does not fit on the paper"))))
        }}
      >
        <ScrapForm
          value={scrap}
          onChange={next => {
            // 見る範囲を狭めたら、倍率を、その範囲の下限まで上げる（置いた短い辺が小さくなりすぎない）
            const fitted = { ...next, scale: Math.max(next.scale, scrapScaleMin(next.area)) }
            setValue(line === undefined ? fitted : { ...fitted, line })
          }}
          opens={{ onOpened: onClose, edited: JSON.stringify(value) !== JSON.stringify(start) }}
          side={
            <div className={rowClass}>
              <span>{t("Border")}</span>
              <Switch
                label={t("Border")}
                checked={line !== NO_LINE}
                onChange={on => withLine(on ? NO_COLOR : NO_LINE)}
              />
              {swatches !== NO_SWATCHES && line !== NO_LINE && (
                <ColorPicker
                  label={t("Border color")}
                  value={line ?? NO_COLOR}
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
