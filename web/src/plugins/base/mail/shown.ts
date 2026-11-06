// 郵便の見せ方: 郵便の種類の定義に、base が拡張ポイントで書き足すフィールド shown（郵便箱の一覧・しおり・ダイアログに出す題と本文）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Mail } from "../../../core/mail"

declare module "../../../core/catalog" {
  interface MailExtras {
    // 題と本文（無ければ、題は種類の名前で、本文は無い）
    shown?: { title(props: never): string; body?(props: never): string }
  }
}

// 郵便 m の題と本文（種類が答えなければ null。props が形に合わなければ null）
export function shownOf(catalog: CoreCatalog, m: Mail): { title: string; body: string } | null {
  const def = catalog.mails.get(m.mail)
  if (!def?.shown || !def.props.safeParse(m.props).success) return null
  return { title: def.shown.title(m.props as never), body: def.shown.body?.(m.props as never) ?? "" }
}
