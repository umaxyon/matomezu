// 読めない物が移った・戻ったときの知らせ（窓が読み直したあと 1 回）: 移った物の数と訳ごとの数（多い順に 3 行まで、残りは「ほか」）と、戻った物の数のダイアログ。
// 移った物が在れば［閉じる］［見る］（読めない物のフォルダを開く）、戻っただけなら［閉じる］だけ。閉じたら、同じ窓では二度と出さない（閉じた印はプラグイン状態 unreadable-notice-closed）。
// 何を知らせるかはホストクライアントが決めて運ぶ（自分の設定で無効にして移った分は除いてある）
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { useInstance } from "../../../ui/store-context"
import { usePluginState, useSetPluginState } from "../../../ui/view-hooks"
import { Confirm, NO_OK } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { NO_TYPE } from "./outline"
import { useReasonOf } from "./reasons"
import { LIBRARY_UNREADABLE_OPEN } from "./screen"
import { NOTICE_CLOSED, UNREADABLE_NOTICE_CLOSED } from "./state"

// 名前を出す訳の行の数（ほかは数だけ）
const SHOWN_REASONS = 3

export function UnreadableNoticeView() {
  const notice = useInstance().unreadableNotice
  const closed = usePluginState(kit, UNREADABLE_NOTICE_CLOSED) === NOTICE_CLOSED
  const setClosed = useSetPluginState(kit, UNREADABLE_NOTICE_CLOSED)
  const t = useMessages(kit)
  const reasonOf = useReasonOf()
  const open = useCommand(LIBRARY_UNREADABLE_OPEN.id).run
  if (!notice || closed) return null
  const moved = notice.moved.reduce((n, m) => n + m.count, 0)
  if (moved === 0 && notice.returned === 0) return null
  const close = () => setClosed(NOTICE_CLOSED)
  const returned = t("{count} items are readable again and went back", { count: notice.returned })
  if (moved === 0) return <Confirm message={returned} ok={NO_OK} cancel={t("Close")} onCancel={close} />
  // 訳の言葉ごとの数（同じプラグインの別のタイプは 1 行にまとめる）。多い順
  const counts = new Map<string, number>()
  for (const m of notice.moved) {
    const reason = reasonOf(m.code, m.type ?? NO_TYPE)
    counts.set(reason, (counts.get(reason) ?? 0) + m.count)
  }
  const reasons = [...counts].sort((a, b) => b[1] - a[1])
  const rest = reasons.slice(SHOWN_REASONS).reduce((n, [, c]) => n + c, 0)
  return (
    <Confirm
      message={t("{count} items became unreadable and moved to the unreadable folder", { count: moved })}
      detail={[
        ...reasons.slice(0, SHOWN_REASONS).map(([reason, count]) => t("{reason}: {count}", { reason, count })),
        ...(rest > 0 ? [t("{count} more", { count: rest })] : []),
        ...(notice.returned > 0 ? [returned] : []),
      ]}
      ok={t("View")}
      cancel={t("Close")}
      onOk={() => {
        close()
        open()
      }}
      onCancel={close}
    />
  )
}

export const UNREADABLE_NOTICE = defineWidget({
  id: kit.name("unreadable-notice"),
  slots: ["root"],
  view: UnreadableNoticeView,
})
