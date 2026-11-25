// 古い版の画面のダイアログ: つなぎ直した常駐が窓を開いたときと別の版なら、閉じられないダイアログで読み込み直すよう促す。
// 版が違えば「{from} → {to}」、版が同じでデータの形が違えば（開発の版）「データの形が変わりました」、配る画面だけ違えば「画面が新しくなりました」。送らずに捨てた操作があれば、その数を添える
import { useMessages } from "../../../ui/i18n"
import { Blocking } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { useReloadWindow, useStaleBuild } from "./hooks"

export function StaleBuildDialog() {
  const stale = useStaleBuild()
  const reload = useReloadWindow()
  const t = useMessages(kit)
  if (!stale) return null
  const { from, to, dropped } = stale
  return (
    <Blocking
      message={t("matomezu was updated")}
      detail={[
        from.version !== to.version
          ? t("{from} → {to}", { from: from.version, to: to.version })
          : from.dataVersion !== to.dataVersion
            ? t("The data format changed")
            : t("The screen was updated"),
        ...(dropped > 0
          ? [t("{count} edits did not reach the server", { count: dropped }), t("They are lost when you reload")]
          : []),
      ]}
      action={t("Reload the screen")}
      onAction={reload}
    />
  )
}
