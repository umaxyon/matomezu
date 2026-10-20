// アクションを行う、データを変える入口。対象で使えるアクションかと引数の形を確かめてから run する。
// 使えるかは、book が対象ならそのブックのタイプ、library と settings が対象なら app のホームのブックのタイプが決める（ホームが無ければ断る）
import type { z } from "zod"
import type { ActionContext, ActionDef, Subjects } from "./def/action"
import { bookType, type Registry } from "./registry"
import type { Book } from "./schema/book"
import type { ActionId, ActionTable } from "./tables"

type ActionOf<Id extends ActionId> = ActionTable[Id]
export type SubjectOf<Id extends ActionId> = Subjects[ActionOf<Id>["target"]]
export type ArgsOf<Id extends ActionId> = z.input<ActionOf<Id>["args"]>
export type ResultOf<Id extends ActionId> =
  ActionOf<Id> extends ActionDef<infer _T, infer _A, infer R, infer _I> ? R : never

export type Refusal = "unknown" | "not-allowed" | "bad-args" | "refused"
export type Performed<Id extends ActionId> =
  | { ok: true; next: SubjectOf<Id>; result: ResultOf<Id> }
  | { ok: false; reason: Refusal }

// ブックで使えるアクション（タイプの既定）
export function actionsOf(reg: Registry, book: Book): readonly string[] {
  return bookType(reg, book.type).actions.defaults
}

// ホームのブックで使えるアクション（ホームが無ければ無い）。ホームは 1 冊だけのタイプで、ブックの id はタイプの id
export function homeActions(reg: Registry, home: string | null): readonly string[] {
  return home === null ? [] : bookType(reg, home).actions.defaults
}

function allowed(ctx: ActionContext, action: ActionDef, subject: Subjects[keyof Subjects]): boolean {
  const usable =
    action.target === "book" ? actionsOf(ctx.registry, subject as Book) : homeActions(ctx.registry, ctx.home)
  return usable.includes(action.id)
}

export function perform<Id extends ActionId>(
  subject: SubjectOf<Id>,
  id: Id,
  args: ArgsOf<Id>,
  ctx: ActionContext,
): Performed<Id> {
  const action: ActionDef | undefined = ctx.registry.actions.get(id)
  if (!action) return { ok: false, reason: "unknown" }
  if (!allowed(ctx, action, subject)) return { ok: false, reason: "not-allowed" }
  const parsed = action.args.safeParse(args)
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  const done = action.run(subject, parsed.data, ctx)
  if (!done) return { ok: false, reason: "refused" }
  return { ok: true, next: done.next, result: done.result } as Performed<Id>
}
