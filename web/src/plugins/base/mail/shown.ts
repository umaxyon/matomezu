// 郵便の見せ方: 郵便の種類の定義に、base が拡張ポイントで書き足すフィールド shown（郵便箱の一覧・しおり・ダイアログに出す題と本文）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { MessageKey, Params } from "../../../core/i18n/i18n"
import type { Mail } from "./mail"

// 種類が題と本文を作るときに使う、今の言語の t()（文言の鍵は kit.message で作った鍵）
export type MailT = (key: MessageKey, params?: Params) => string

declare module "../../../core/catalog" {
  interface MailExtras {
    // 題と本文（無ければ、題は種類の名前で、本文は無い）と、郵便箱の行に添える短い印（反映済みなど。無ければ添えない）。t は今の言語の t()
    shown?: {
      title(props: never, t: MailT): string
      body?(props: never, t: MailT): string
      mark?(props: never, t: MailT): string | undefined
    }
  }
}

// 郵便 m の題と本文と印（種類が答えなければ null。props が形に合わなければ null）。t は今の言語の t()
export function shownOf(
  catalog: CoreCatalog,
  m: Mail,
  t: MailT,
): { title: string; body: string; mark: string | undefined } | null {
  const def = catalog.mails.get(m.mail)
  if (!def?.shown || !def.props.safeParse(m.props).success) return null
  return {
    title: def.shown.title(m.props as never, t),
    body: def.shown.body?.(m.props as never, t) ?? "",
    mark: def.shown.mark?.(m.props as never, t),
  }
}
