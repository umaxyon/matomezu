// コピー・切り取り・貼り付け・複製のコマンド。写し（clip.ts の Clip）は紙の見せ方の窓の外観枠の状態に置く（ブック・ページをまたいで貼れる。読み込み直すと消える）。
// 貼るときは、アクション item-paste に写しを渡す（選んだ物に応じて入れる先を決め、収まらなければ収まる一番近い所へ寄せる）

import { type CommandContext, findShape, type PagedBook, type Point, pagedOf, walkShapes } from "../../../plugin-api"
import { placedSize, refusalMessage, shapeDefOf } from "../../base"
import { kit } from "../kit"
import { ITEM_PASTE, ITEM_REMOVE } from "./actions"
import { type Clip, clipOf, nearestPaste } from "./clip"
import { itemsSelected, onOpenedPage } from "./commands"

// 窓の外観枠の状態に置いた写し（無ければ null）
const clipIn = (ctx: CommandContext): Clip | null => (ctx.frameState as { clip?: Clip } | undefined)?.clip ?? null

// 開いているページ
const pageOf = (ctx: CommandContext) => pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)

// 写しを窓の外観枠の状態に置く（ほかの状態は残す）
const keep = (a: { updateFrameState(change: (now: unknown) => unknown): void }, clip: Clip) =>
  a.updateFrameState(now => ({ ...(typeof now === "object" && now !== null ? now : {}), clip }))

// 貼る先: ページの形を 1 つだけ選んでいれば、子を持てる形ならその中、持てない形ならその形の隣（同じ親の中の、すぐ右）。それ以外はページ（最初の空き）
function targetOf(ctx: CommandContext): { parent: string | null; at?: Point } {
  const page = pageOf(ctx)
  const { selection } = ctx.stage
  const only = page && selection.length === 1 && selection[0] !== undefined ? findShape(page, selection[0]) : undefined
  if (!only) return { parent: null }
  if (shapeDefOf(ctx.catalog, only.shape.item)?.capabilities.includes("nests")) return { parent: only.shape.id }
  const size = placedSize(ctx.catalog, only.shape)
  return size ? { parent: only.parent, at: { x: only.shape.x + size.w + 8, y: only.shape.y } } : { parent: only.parent }
}

// 写し clip を where に貼って、貼った形を選ぶ。at に収まらなければ収まる一番近い所へ寄せる（どこにも収まらなければ最初の空き）。貼れなければトーストで知らせる
function pasteAt(
  ctx: CommandContext,
  a: Parameters<(typeof PAPER_PASTE)["run"]>[1],
  clip: Clip,
  where: { parent: string | null; at?: Point },
): void {
  const { opened, id } = ctx.stage
  const paged: PagedBook | undefined = pagedOf(ctx.book)
  const page = pageOf(ctx)
  if (!opened?.page || !paged || !page) return
  const at = where.at && (nearestPaste(ctx.catalog, paged, page.id, clip, where.parent, where.at) ?? undefined)
  const done = a.perform(
    ITEM_PASTE.id,
    {
      page: page.id,
      ...(where.parent === null ? {} : { parent: where.parent }),
      ...(at ? { at } : {}),
      crowd: "push",
      shapes: clip.shapes as unknown as Record<string, unknown>[],
      connectors: clip.connectors as unknown as Record<string, unknown>[],
    },
    { book: opened.book },
  )
  if (!done.ok) {
    a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")) })
    return
  }
  a.select(id, done.result.items)
}

// 選んでいるアイテムを写しにする。写せない形が混じればトーストで知らせて null
function copiedClip(ctx: CommandContext, a: Parameters<(typeof PAPER_COPY)["run"]>[1]): Clip | null {
  const page = pageOf(ctx)
  const clip = page && clipOf(ctx.catalog, page, ctx.stage.selection)
  if (clip === "uncopyable") a.showToast({ kind: "warn", message: kit.message("Cannot be copied") })
  return clip && clip !== "uncopyable" ? clip : null
}

// 選んでいるアイテム（子孫と中の線ごと）を写しにする。ブックは変えない
export const PAPER_COPY = kit.defineCommand({
  id: "paper-copy",
  title: "Copy",
  run: (ctx, a) => {
    const clip = copiedClip(ctx, a)
    if (clip) keep(a, clip)
  },
  // 形を選んでいるときだけ出す（選んでいなければ、ブラウザ自身のコピーを塞がない）
  when: ctx => onOpenedPage(ctx) && itemsSelected(ctx) && pageOf(ctx)?.items !== undefined,
})

// 写してから消す（消すアクション 1 つ。履歴は 1 段）
export const PAPER_CUT = kit.defineCommand({
  id: "paper-cut",
  performs: [ITEM_REMOVE.id],
  permissionScope: "selection",
  title: "Cut",
  run: (ctx, a) => {
    const { opened, selection, id } = ctx.stage
    const clip = copiedClip(ctx, a)
    if (!opened?.page || !clip) return
    const done = a.perform(ITEM_REMOVE.id, { page: opened.page, items: [...selection] }, { book: opened.book })
    if (!done.ok) return
    keep(a, clip)
    a.select(id, [])
  },
  when: ctx => onOpenedPage(ctx) && itemsSelected(ctx),
})

// 写しを貼る（キーと、アイテムの右クリックのメニュー）。入れる先は選んでいる物で決める
export const PAPER_PASTE = kit.defineCommand({
  id: "paper-paste",
  performs: [ITEM_PASTE.id],
  permissionScope: "opened-page",
  title: "Paste",
  run: (ctx, a) => {
    const clip = clipIn(ctx)
    if (clip) pasteAt(ctx, a, clip, targetOf(ctx))
  },
  when: onOpenedPage,
  enabled: ctx => clipIn(ctx) !== null,
})

// 紙の右クリックのメニューから、右クリックした所へ写しを貼る
export const PAPER_PASTE_AT = kit.defineCommand({
  id: "paper-paste-at",
  performs: [ITEM_PASTE.id],
  permissionScope: "opened-page",
  title: "Paste",
  run: (ctx, a, args: { pointer?: Point }) => {
    const clip = clipIn(ctx)
    const at = args.pointer && ctx.toPaper(args.pointer)
    if (clip) pasteAt(ctx, a, clip, at ? { parent: null, at } : { parent: null })
  },
  when: onOpenedPage,
  enabled: ctx => clipIn(ctx) !== null,
})

// 選んでいるアイテムの複製: 写して、同じ親の中の少し右下に貼る（親が違う物を選んでいればページに貼る）
export const PAPER_DUPLICATE = kit.defineCommand({
  id: "paper-duplicate",
  performs: [ITEM_PASTE.id],
  permissionScope: "selection",
  title: "Duplicate",
  run: (ctx, a) => {
    const page = pageOf(ctx)
    const clip = copiedClip(ctx, a)
    if (!page || !clip) return
    const roots = walkShapes(page).filter(s => clip.shapes.some(c => c.id === s.shape.id))
    const parents = new Set(roots.map(r => r.parent))
    const parent = parents.size === 1 ? (roots[0]?.parent ?? null) : null
    const origin = {
      x: Math.min(...roots.map(r => (parent === null ? r.at.x : r.shape.x))),
      y: Math.min(...roots.map(r => (parent === null ? r.at.y : r.shape.y))),
    }
    pasteAt(ctx, a, clip, { parent, at: { x: origin.x + 16, y: origin.y + 16 } })
  },
  when: ctx => onOpenedPage(ctx) && itemsSelected(ctx),
})

export const CLIPBOARD_KEYS = [
  kit.defineKey({ id: "paper-copy-mod-c", key: "Mod+C", command: PAPER_COPY.id, scope: "stage" }),
  kit.defineKey({ id: "paper-cut-mod-x", key: "Mod+X", command: PAPER_CUT.id, scope: "stage" }),
  kit.defineKey({ id: "paper-paste-mod-v", key: "Mod+V", command: PAPER_PASTE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-duplicate-mod-d", key: "Mod+D", command: PAPER_DUPLICATE.id, scope: "stage" }),
]
