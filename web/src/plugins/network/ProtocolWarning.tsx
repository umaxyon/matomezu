// 約束の版が合わないホストの一言: どちらのホストを更新すれば合うか（常駐が決めた様子のまま出す）。block なら段落、でなければ行の中に置く
import { useMessages } from "../../plugin-api/ui"
import type { PeerLive } from "../base/ui"
import { kit } from "./kit"

export function ProtocolWarning({
  live,
  className,
  block,
}: {
  live: PeerLive | undefined
  className: string | undefined
  block?: boolean
}) {
  const t = useMessages(kit)
  const text =
    live?.state === "update-this"
      ? t("Update this host")
      : live?.state === "update-that"
        ? t("Update {name}", { name: live.label })
        : null
  if (text === null) return null
  return block ? <p className={className}>{text}</p> : <span className={className}>{text}</span>
}
