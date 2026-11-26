// フォローステップを当てる所（core/def/follow-step.ts）。レコードが対象のアクションが変えたレコードに、台帳の並び（依る順）でフォローステップを応じさせ、
// 応じた変わりを、アクションの変わりに重ねる（同じ種類と id は、あとの物）。バックヤードの中に行う事と常駐メッセージは、応じた順に集める
import type { ActionContext, ActionDef } from "./def/action"
import type { BackyardFollow, FollowContext, FollowedChange, HostMessage } from "./def/follow-step"
import { brokenRecord, recordSettles } from "./perform-checks"
import { overlaid, type RecordSource, readsFrom, SOURCE } from "./record-source"
import { NO_RECORD, RECORDS_MAX, REMOVED, type RecordChange } from "./records"
import { sameData } from "./same"

// 応じた結果: アクションの変わりと応じた変わりを合わせた並び（アクションの物が先）と、そのうち応じた変わりの種類と id と、
// バックヤードの中に行う事 backyard と、送る常駐メッセージ hostMessages（どちらも応じた順）
export type Followed =
  | {
      ok: true
      records: readonly RecordChange[]
      followed: readonly { subject: string; id: string }[]
      backyard: readonly BackyardFollow[]
      hostMessages: readonly HostMessage[]
    }
  | { ok: false; reason: "refused"; detail: string }
  | { ok: false; reason: "denied"; permission: string }

const keyOf = (subject: string, id: string) => `${subject}\n${id}`

// アクション action が変えたレコード changes（source はアクションの前の読み口）に、フォローステップを応じさせる。
// 応じる側は、アクションのあとと、それまでに応じた変わりのあとの値を読む。応じた変わりは、きっかけのアクションの認可ステップのうち followed を持つ物だけで確かめる
export function followChanges(
  ctx: ActionContext,
  action: ActionDef,
  source: RecordSource,
  changes: readonly RecordChange[],
): Followed {
  const steps = ctx.catalog.followSteps
  if (steps.length === 0 || changes.length === 0)
    return { ok: true, records: changes, followed: [], backyard: [], hostMessages: [] }
  // 種類と id → いちばん新しい変わり（並びは初めて変わった順）
  const latest = new Map<string, RecordChange>(changes.map(c => [keyOf(c.subject, c.id), c]))
  const followed = new Set<string>()
  const backyard: BackyardFollow[] = []
  const hostMessages: HostMessage[] = []
  const written = () => {
    const out: Record<string, Record<string, unknown>> = {}
    for (const c of latest.values()) out[c.subject] = { ...(out[c.subject] ?? {}), [c.id]: c.record }
    return out
  }
  for (const { plugin, step, watched: kinds } of steps) {
    const watched = [...latest.values()].filter(c => kinds.includes(c.subject))
    // RECORDS_MAX は、応じる側 1 つごとに、このアクションの中で返した数を合わせて数える
    let returned = 0
    for (const c of watched) {
      const change = {
        subject: c.subject,
        id: c.id,
        before: source.byId(c.subject, c.id) ?? NO_RECORD,
        after: c.record,
      } as FollowedChange
      const now = overlaid(ctx.catalog, source, written())
      const read = readsFrom(ctx.catalog, now, step.reads?.(change, ctx.catalog) ?? [])
      const fctx: FollowContext = {
        catalog: ctx.catalog,
        lang: ctx.lang,
        now: ctx.now,
        today: ctx.today,
        newId: ctx.newId,
        records: read.records,
        keys: read.keys,
        record: read.record,
      }
      const done = step.follow(change, fctx)
      const refused = (why: string) => ({
        ok: false as const,
        reason: "refused" as const,
        detail: `the follow step of ${plugin} (on ${c.subject}) ${why}`,
      })
      const out = done.records ?? []
      for (const b of done.backyard ?? []) {
        if (!(step.backyards ?? []).includes(b.backyard))
          return refused(`writes in the backyard ${b.backyard}, which it does not write in`)
        if (b.does === "retitle" && b.title === "")
          return refused(`names a book in the backyard ${b.backyard} with an empty name`)
        backyard.push(b)
      }
      hostMessages.push(...(done.hostMessages ?? []))
      returned += out.length
      if (returned > RECORDS_MAX) return refused(`changes more than ${RECORDS_MAX} records`)
      const seen = new Set<string>()
      for (const o of out) {
        const key = keyOf(o.subject, o.id)
        if (!step.writes.includes(o.subject)) return refused(`changes ${o.subject}, which it does not write`)
        if (seen.has(key)) return refused(`changes ${o.subject} ${o.id} twice`)
        seen.add(key)
        const had = now.byId(o.subject, o.id)
        // 今と同じ値なら変えない（応じる側は値を作り直して返すので、値で比べる）
        if (o.record === REMOVED ? had === undefined : sameData(o.record, had)) continue
        const was = had ?? NO_RECORD
        // 作るレコードは、変更の id と record の id が同じ
        if (was === NO_RECORD && (o.record as { id?: unknown }).id !== o.id)
          return refused(`makes ${o.subject} ${o.id} with another id in the record`)
        if (!recordSettles(ctx.catalog, o.subject, was, o.record))
          return refused(`gives ${o.subject} ${o.id} that does not fit the kind`)
        // 認可ステップの守らせることは、アクションの前の値から見る（応じる前の変わりを、アクションが変えていても）。指す先は、応じる前の世界で引く
        const kept = brokenRecord(
          { ...ctx, [SOURCE]: now } as ActionContext,
          action,
          o.subject,
          source.byId(o.subject, o.id) ?? NO_RECORD,
          o.record,
          "follow",
        )
        if (kept === "unreadable") return refused(`changes ${o.subject} ${o.id}, which refers to what cannot be read`)
        if (kept) return { ok: false, reason: "denied", permission: kept }
        latest.set(key, { subject: o.subject, id: o.id, record: o.record })
        followed.add(key)
      }
    }
  }
  // 応じた変わりのうち、アクションの前と同じ値に戻った物は、変わりから外す（作って消した物も。アクションの変わりはアクションのとおりに残す）
  const records = [...latest.values()].filter(c => {
    if (!followed.has(keyOf(c.subject, c.id))) return true
    const had = source.byId(c.subject, c.id)
    return c.record === REMOVED ? had !== undefined : !sameData(c.record, had)
  })
  return {
    ok: true,
    records,
    followed: records.filter(c => followed.has(keyOf(c.subject, c.id))).map(c => ({ subject: c.subject, id: c.id })),
    backyard,
    hostMessages,
  }
}
