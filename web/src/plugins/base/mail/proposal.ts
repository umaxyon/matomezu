// 変更提案郵便: AI のアクションが編集ロックで断られたとき（being-edited）、AI がそのアクションを郵便に乗せて利用者に届け、利用者が押すと反映される郵便。
// 種類は proposal。送るのは proposal-send（AI も送れる）、反映するのは proposal-apply、反映した・失敗したを郵便に残すのは proposal-settle（どちらも利用者だけ）。
// 乗せられるのは 1 冊のブックの、既にある物を変える・消すアクションだけ（物を足すアクション・利用者だけのアクション・画面の履歴に入らないアクションは乗せられない）。
// 送るときに変更を試しに当て（ブックは変えない）、当たる物のその時の自分の値（core/ids.ts の ownValues）を郵便にしまう。反映のときに今の値と比べ、
// 少しでも違う・無いなら失敗にする。反映は 1 つのアクションで、乗せた変更を順に行い、1 つでも断られたら全部取り消す。
// 送ると AI 編集チケットを作り、反映したら閉じ、失敗したら失敗にする（失敗は、次の利用者トリガートークのときに AI に渡る）
import { z } from "zod"
import { USER } from "../../../core/actor"
import type { ActionContext } from "../../../core/def/action"
import type { Mail } from "../../../core/mail"
import { actionsOf, perform } from "../../../core/perform"
import { sameData } from "../../../core/same"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { MAIL, mailAdded } from "."
import { ownChanged, ownValues } from "./own-values"

const ChangeSchema = z.strictObject({ action: z.string().min(1), args: z.unknown() })
const ChangesSchema = z.array(ChangeSchema).min(1).max(50)
type Change = z.output<typeof ChangeSchema>

const ProposalSchema = z.strictObject({
  title: z.string().trim().min(1).max(80), // 題（一覧・しおり・ダイアログの見出し）
  body: z.string().max(4000), // 本文（AI が書いた変更の説明。空でもよい）
  book: z.string().min(1), // 変えるブック
  page: z.string().min(1).optional(), // 変えるページ（許可スコープ。ページを持たないブックや、いくつものページを変えるなら無い）
  changes: ChangesSchema, // 乗せたアクション（順に行う）
  snapshot: z.record(z.string(), z.unknown()), // 当たる物の、送った時の自分の値（物の id → 値）
  appliedAt: z.string().optional(), // 反映した時点
  failedAt: z.string().optional(), // 反映が失敗した時点
  changed: z.array(z.string()).optional(), // 失敗したときの、変わった・無くなった物の id
})
export type ProposalProps = z.output<typeof ProposalSchema>

export const MAIL_PROPOSAL = kit.defineMail({
  id: "proposal",
  title: "Mail proposal",
  aiDescription:
    "A change proposal: actions you could not do because the user was editing what they change (being-edited), sent for the user to apply with one press. Send it with proposal-send.",
  props: ProposalSchema,
  aiBrief: (p: ProposalProps) => p.title,
  shown: {
    title: (p: ProposalProps) => p.title,
    body: (p: ProposalProps) => p.body,
    // 反映した・失敗したら、郵便箱の行にそう添える
    mark: (p: ProposalProps, t) =>
      p.appliedAt ? t(kit.message("Applied")) : p.failedAt ? t(kit.message("Could not apply")) : undefined,
  },
})

// 郵便 mail の変更提案の中身（変更提案郵便でない・形が合わない郵便なら undefined。郵便箱には形の合わない郵便も残る）
export const proposalOf = (mail: Mail | undefined): ProposalProps | undefined =>
  mail?.mail === MAIL_PROPOSAL.id ? ProposalSchema.safeParse(mail.props).data : undefined

// アクションを id で行う（乗せた変更は、どのアクションかを型で言えない）
const performLoose = perform as (
  subject: unknown,
  id: string,
  args: unknown,
  ctx: ActionContext,
) => ReturnType<typeof perform>

// 乗せた変更 changes を、ブック book に順に行った結果（利用者のアクションとして。どれかが乗せられない・断られたら、その理由の英語の文）。
// tried なら、1 つずつ perform で試す（送るとき。ノーマライズと認可ステップもかける）。そうでなければ、1 つずつ run だけを行い、
// ノーマライズと認可ステップは、反映のアクションを行う perform に 1 回だけ任せる（中で整えると、整えた所を run が書いたことになって断られるため）
function carry(
  book: Book,
  changes: readonly Change[],
  ctx: ActionContext,
  tried: boolean,
): { after: Book } | { declined: string } {
  const { actor: _, books: __, records: ___, number: ____, ...rest } = ctx
  const user: ActionContext = { ...rest, actor: USER }
  let after = book
  for (const [i, c] of changes.entries()) {
    const def = ctx.catalog.actions.get(c.action)
    const what = `change ${i + 1} (${c.action})`
    if (!def) return { declined: `${what}: there is no action with that id` }
    if (def.target !== "book" || def.userOnly || def.history === false || def.lockedForUser)
      return { declined: `${what}: only actions that change a book can be carried` }
    let adds = false
    const counted = {
      ...user,
      newId: () => {
        adds = true
        return user.newId()
      },
    }
    if (tried) {
      const done = performLoose(after, c.action, c.args, counted)
      if (adds) return { declined: `${what}: it adds things; only changes to things there now can be carried` }
      if (!done.ok)
        return {
          declined: `${what} is refused (${done.reason}${"detail" in done && done.detail ? `: ${done.detail}` : ""})`,
        }
      after = done.next as Book
      continue
    }
    // 送ってから反映するまでにプラグインが変わっていても、そのブックのタイプで使えないアクションは行わない
    if (!actionsOf(ctx.catalog, after).includes(c.action))
      return { declined: `${what}: it cannot be done on this book` }
    const parsed = def.args.safeParse(c.args)
    const ran = parsed.success ? def.run(after as never, parsed.data as never, counted) : null
    if (adds) return { declined: `${what}: it adds things; only changes to things there now can be carried` }
    if (!ran || "declined" in ran) return { declined: `${what} is refused` }
    after = ran.next as Book
  }
  return { after }
}

// ブック book の今の値が、送った時の値 snapshot から変わった・無くなった物の id
export function proposalChanged(book: Book, snapshot: Readonly<Record<string, unknown>>): string[] {
  const now = ownValues(book)
  return Object.entries(snapshot)
    .filter(([id, v]) => !now.has(id) || !sameData(now.get(id), v))
    .map(([id]) => id)
}

export const PROPOSAL_SEND = kit.defineAction({
  id: "proposal-send",
  aiDescription:
    "Send a change proposal mail: when an action of yours on a book was refused with being-edited (the user is editing what it changes), put the actions here and the user applies them with one press when done. from your short name (as in mail-send), title (80 characters at most) and body (optional) tell the user what it changes and why. book is the book, page the page they change (leave it out if they change several pages), changes the actions in order, each {action, args} as you would perform it on that book. Only actions that change things there now can be carried: no actions that add things, and only one book per mail. They are tried now without changing the book: if one cannot be done, nothing is sent and why is returned. When the user applies it, it fails if what it changes was changed or removed after you sent it; then nothing is changed and you are told the next time the user talks to you (think again from the book as it is then). Returns the mail's id.",
  title: "Send a change proposal",
  target: MAIL.id,
  reads: [MAIL.id],
  // 読むのは、変えるブック 1 冊だけ
  readsBooks: args => [args.book],
  args: z.strictObject({
    from: z.string().trim().min(1).max(40),
    title: ProposalSchema.shape.title,
    body: ProposalSchema.shape.body.optional(),
    book: z.string().min(1),
    page: z.string().min(1).optional(),
    changes: ChangesSchema,
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const book = ctx.books?.[args.book]
    if (!book) return { declined: "there is no book with that id (see list_books)" }
    const carried = carry(book, args.changes, ctx, true)
    if ("declined" in carried) return carried
    const touched = ownChanged(book, carried.after).filter(id => id !== book.id)
    if (touched.length === 0) return { declined: "the changes change nothing" }
    const before = ownValues(book)
    const pages = new Set("pages" in book ? (book.pages as readonly { id: string }[]).map(p => p.id) : [])
    const things = touched.filter(id => !pages.has(id))
    const added = mailAdded(ctx, {
      mail: MAIL_PROPOSAL.id,
      from: args.from,
      sentAt: ctx.now,
      to: {
        book: book.id,
        ...(args.page ? { page: args.page } : {}),
        ...(args.page && things.length > 0 ? { ids: things } : {}),
      },
      props: {
        title: args.title,
        body: args.body ?? "",
        book: book.id,
        ...(args.page ? { page: args.page } : {}),
        changes: args.changes,
        snapshot: Object.fromEntries(touched.map(t => [t, before.get(t)])),
      } satisfies ProposalProps,
    })
    if (!added) return null
    return {
      next: added.next,
      others: added.others,
      result: { mail: added.next.id },
      aiEditTicket: { book: book.id, key: added.next.id, outcome: "open" as const },
    }
  },
})

// 反映の断りの種類: 送ったあとに当たる物が変わった・無くなった（changed）、乗せた変更が断られた（refused）
export const PROPOSAL_CHANGED = kit.name("proposal-changed")
export const PROPOSAL_REFUSED = kit.name("proposal-refused")

const ApplyArgs = z.strictObject({
  page: z.string().min(1).optional(),
  changes: ChangesSchema,
  snapshot: z.record(z.string(), z.unknown()),
})

export const PROPOSAL_APPLY = kit.defineAction({
  id: "proposal-apply",
  attach: { books: true },
  userOnly: true,
  lockedForUser: true,
  aiDescription:
    "Done by the user's screen when the user applies a change proposal mail (only the user): the carried changes, in order, all or none.",
  title: "Apply a change proposal",
  target: "book",
  // 変えるページが分かればそのページと当たる物。分からなければ所は言えず、ページのロックは行った後の keeps が止める
  permissionScope: (args: z.output<typeof ApplyArgs>) =>
    args.page ? { page: args.page, ids: Object.keys(args.snapshot) } : {},
  args: ApplyArgs,
  run: (book, args, ctx) => {
    const changed = proposalChanged(book, args.snapshot)
    if (changed.length > 0)
      return { declined: `changed after it was sent: ${changed.join(", ")}`, kind: PROPOSAL_CHANGED }
    const carried = carry(book, args.changes, ctx, false)
    if ("declined" in carried) return { ...carried, kind: PROPOSAL_REFUSED }
    return { next: carried.after, result: {} }
  },
})

export const PROPOSAL_SETTLE = kit.defineAction({
  id: "proposal-settle",
  aiDescription:
    "Done by the user's screen after the user applied the change proposal mail named by on.record (only the user): it was applied, or it failed (changed is what was changed or removed). Refused if it was settled.",
  title: "Settle a change proposal",
  target: MAIL.id,
  userOnly: true,
  args: z.strictObject({
    outcome: z.enum(["applied", "failed"]),
    changed: z.array(z.string().min(1)).optional(),
  }),
  run: (now, args, ctx) => {
    const found = now === "none" ? undefined : now
    const props = proposalOf(found)
    if (!found || !props || props.appliedAt || props.failedAt) return null
    const next: ProposalProps =
      args.outcome === "applied"
        ? { ...props, appliedAt: ctx.now }
        : { ...props, failedAt: ctx.now, changed: [...(args.changed ?? [])] }
    return {
      next: { ...found, props: next },
      result: {},
      aiEditTicket: {
        book: props.book,
        key: found.id,
        outcome: args.outcome === "applied" ? ("closed" as const) : ("failed" as const),
        ...(args.outcome === "failed" ? { changed: [...(args.changed ?? [])] } : {}),
      },
    }
  },
})
