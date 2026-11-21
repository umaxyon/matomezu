// 参加要求の中身の文（参加要求のダイアログに見せる行）
import type { MessageKey } from "../../../core/i18n/i18n"
import { kit } from "../kit"
import type { Participant } from "."

export function requestLines(p: Participant, t: (key: MessageKey) => string): string {
  return [
    ...(p.as === "visitor"
      ? [`${t(kit.message("Participant category"))}: ${t(kit.message("Visitor (read only)"))}`]
      : []),
    ...(p.wantedName ? [`${t(kit.message("Workroom name"))}: ${p.wantedName}`] : []),
    `${t(kit.message("AI"))}: ${p.ai}`,
    `${t(kit.message("Model"))}: ${p.model}`,
    `${t(kit.message("Environment"))}: ${p.env}`,
    ...(p.orcaWorkspace ? [`${t(kit.message("Orca workspace"))}: ${p.orcaWorkspace}`] : []),
    ...(p.sessionName ? [`${t(kit.message("Session"))}: ${p.sessionName}`] : []),
  ].join("\n")
}
