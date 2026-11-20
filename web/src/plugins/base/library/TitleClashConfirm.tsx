// 名前が重なったときの確かめ: フォルダ folder に、入れようとした物と同じ名前 name の物が在るとき、番号を付けるか・上書きするか・やめるかを受ける
// （ゴミ箱から戻すときと、動かすときに使う）。上書きは、前から在った方が中身ごと消える（ゴミ箱に入らない）ので、その注意を出す。
// 上書きできないとき（blocked がその訳）は、上書きを選べない形で出し、訳を出す
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import type { ReplaceBlocked } from "./entries"

export function TitleClashConfirm({
  folder,
  name,
  numbered,
  blocked,
  onNumber,
  onReplace,
  onCancel,
}: {
  folder: string // 入る先のフォルダの名前
  name: string
  numbered: string // 番号を付けた名前
  blocked: ReplaceBlocked | null
  onNumber(): void
  onReplace(): void
  onCancel(): void
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const why = (b: ReplaceBlocked): string => {
    if (b.by === "permission") {
      const step = b.permission === null ? undefined : catalog.permissions.get(b.permission)
      return step ? t(step.title) : t("It cannot be done")
    }
    return b.why === "kind"
      ? t("It is a different kind")
      : b.why === "within"
        ? t("It holds what is moved")
        : t("It cannot be done")
  }
  return (
    <Confirm
      message={t("The name is taken")}
      detail={[
        t('"{folder}" has "{name}"', { folder, name }),
        t('With a number it will be "{name}"', { name: numbered }),
        ...(blocked
          ? [t("Cannot replace: {reason}", { reason: why(blocked) })]
          : [t("Replacing deletes what was there and everything in it"), t("(It does not go to the trash)")]),
      ]}
      ok={t("Add a number")}
      cancel={t("Cancel")}
      others={[{ label: t("Replace"), danger: true, disabled: blocked !== null, onClick: onReplace }]}
      onOk={onNumber}
      onCancel={onCancel}
    />
  )
}
