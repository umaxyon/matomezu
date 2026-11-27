// コピー・切り取り・貼り付け・複製のコマンド。写し（clip.ts の Clip）は紙のプラグインのプラグイン状態（CLIP_STATE。窓の写し）に置き（ブック・ページをまたいで貼れる。読み込み直すと消える）、
// コピーと切り取りは OS のクリップボードにも書く（土台のクリップボード。種類 clip）。キーの貼り付け（Ctrl+V）は OS のクリップボードから貼り（別の窓でも、読み込み直したあとでも貼れる）、
// 写しが無くファイル（画像など）があれば、紙のビューに渡す。右クリックのメニューの貼り付けは、窓の写しを貼る（ブラウザは、メニューからは OS のクリップボードの独自の形式を読ませない）。
// 貼るときは、アクション item-paste に写しを渡す（選んだ物に応じて入れる先を決め、収まらなければ収まる一番近い所へ寄せる）

import {
  type CommandContext,
  findShape,
  NO_CLIP_DATA,
  NO_ITEM,
  NO_PAPER,
  NO_STATE,
  OTHER_HOST,
  PAGE_ITSELF,
  type Point,
  type ShapeParent,
  walkShapes,
} from "../../../plugin-api"
import { hasOpenedPage, NO_SHAPE_DEF, NO_SIZE, placedSize, refusalMessage, shapeDefOf } from "../../base"
import { kit } from "../kit"
import { ITEM_PASTE, ITEM_REMOVE } from "./actions"
import { type Clip, clipOf, clipOfData, nearestPaste } from "./clip"
import { itemsSelected } from "./commands"
import { CLIP_STATE } from "./states"

// プラグイン状態に置いた写し（無ければ null）
function clipIn(ctx: CommandContext): Clip | null {
  const clip = ctx.pluginState(CLIP_STATE)
  return clip === NO_STATE ? null : clip
}

// OS のクリップボードに書く写しの種類
const CLIP_KIND = "clip"

// 写しをプラグイン状態に置く
const keep = (a: { updatePluginState(def: typeof CLIP_STATE, change: () => Clip): void }, clip: Clip) =>
  a.updatePluginState(CLIP_STATE, () => clip)

// 写しを、プラグイン状態と OS のクリップボード（コピー・切り取りのイベントの中なら）に置く
const keepAndWrite = (a: Parameters<(typeof PAPER_COPY)["run"]>[1], clip: Clip) => {
  keep(a, clip)
  a.clipboard.write(CLIP_KIND, clip)
}

// 貼る先: ページの形を 1 つだけ選んでいれば、子を持てる形ならその中、持てない形（と、写した形そのもの）ならその形の隣（同じ親の中の、すぐ右）。それ以外はページ（最初の空き）
function targetOf(ctx: CommandContext, clip: Clip): { parent: ShapeParent; at?: Point } {
  const page = hasOpenedPage(ctx) ? ctx.page : undefined
  const { selection } = ctx.stage
  const only = page && selection.length === 1 && selection[0] !== undefined ? findShape(page, selection[0]) : NO_ITEM
  if (only === NO_ITEM) return { parent: PAGE_ITSELF }
  // 写した形そのものを選んでいるときは、その中でなく隣に貼る（自分の中には入れない）
  const copied = clip.shapes.some(c => c.id === only.shape.id)
  const def = shapeDefOf(ctx.catalog, only.shape.item)
  if (!copied && def !== NO_SHAPE_DEF && def.capabilities.includes("nests")) return { parent: only.shape.id }
  const size = placedSize(ctx.catalog, only.shape)
  return size !== NO_SIZE
    ? { parent: only.parent, at: { x: only.shape.x + size.w + 8, y: only.shape.y } }
    : { parent: only.parent }
}

// 写し clip を where に貼って、貼った形を選ぶ。at に収まらなければ収まる一番近い所へ寄せる（どこにも収まらなければ最初の空き）。貼れなければトーストで知らせる
function pasteAt(
  ctx: CommandContext,
  a: Parameters<(typeof PAPER_PASTE)["run"]>[1],
  clip: Clip,
  where: { parent: ShapeParent; at?: Point },
  quiet = false,
): boolean {
  if (!hasOpenedPage(ctx)) return false
  const page = ctx.page
  const at = where.at && (nearestPaste(ctx.catalog, page, clip, where.parent, where.at) ?? undefined)
  const done = a.perform(
    ITEM_PASTE.id,
    {
      ...(where.parent === PAGE_ITSELF ? {} : { parent: where.parent }),
      ...(at ? { at } : {}),
      crowd: "push",
      shapes: clip.shapes as unknown as Record<string, unknown>[],
      connectors: clip.connectors as unknown as Record<string, unknown>[],
    },
    { page: page.id },
  )
  if (!done.ok) {
    if (!quiet)
      a.showToast({
        kind: "warn",
        message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")),
      })
    return false
  }
  a.select(done.result.items)
  return true
}

// 選んでいる物に応じた貼る先に貼り、入れなければ（入れ物が狭い・隣に収まらない）ページの最初の空きに貼る。どこにも貼れなければトーストで知らせる
function pasteNearSelection(ctx: CommandContext, a: Parameters<(typeof PAPER_PASTE)["run"]>[1], clip: Clip): void {
  const where = targetOf(ctx, clip)
  if (where.parent === PAGE_ITSELF) {
    pasteAt(ctx, a, clip, where)
    return
  }
  if (!pasteAt(ctx, a, clip, where, true)) pasteAt(ctx, a, clip, { parent: PAGE_ITSELF })
}

// 選んでいるアイテムを写しにする。写せない形が混じればトーストで知らせて null
function copiedClip(ctx: CommandContext, a: Parameters<(typeof PAPER_COPY)["run"]>[1]): Clip | null {
  const clip = hasOpenedPage(ctx) && clipOf(ctx.catalog, ctx.page, ctx.stage.selection)
  if (clip === "uncopyable") a.showToast({ kind: "warn", message: kit.message("Cannot be copied") })
  return clip && clip !== "uncopyable" ? clip : null
}

// 選んでいるアイテム（子孫と中の線ごと）を写しにする（OS のクリップボードにも書く）。ブックは変えない
export const PAPER_COPY = kit.defineCommand({
  id: "paper-copy",
  title: "Copy",
  clipboard: "copy",
  run: (ctx, a) => {
    const clip = copiedClip(ctx, a)
    if (clip) keepAndWrite(a, clip)
  },
  // 形を選んでいるときだけ出す（選んでいなければ、ブラウザ自身のコピーを塞がない）
  when: ctx => hasOpenedPage(ctx) && itemsSelected(ctx) && ctx.page.items !== undefined,
})

// 写してから消す（消すアクション 1 つ。履歴は 1 段）
export const PAPER_CUT = kit.defineCommand({
  id: "paper-cut",
  performs: [ITEM_REMOVE.id],
  permissionScope: "selection",
  title: "Cut",
  clipboard: "cut",
  run: (ctx, a) => {
    const { selection } = ctx.stage
    const clip = copiedClip(ctx, a)
    if (!hasOpenedPage(ctx) || !clip) return
    const done = a.perform(ITEM_REMOVE.id, { items: [...selection] }, { page: ctx.page.id })
    if (!done.ok) return
    keepAndWrite(a, clip)
    a.select([])
  },
  when: ctx => hasOpenedPage(ctx) && itemsSelected(ctx),
})

// 窓の写しを貼る（アイテムの右クリックのメニュー）。入れる先は選んでいる物で決める
export const PAPER_PASTE = kit.defineCommand({
  id: "paper-paste",
  performs: [ITEM_PASTE.id],
  permissionScope: "opened-page",
  title: "Paste",
  run: (ctx, a) => {
    const clip = clipIn(ctx)
    if (clip) pasteNearSelection(ctx, a, clip)
  },
  when: hasOpenedPage,
  enabled: ctx => clipIn(ctx) !== null,
})

// OS のクリップボードから貼る（キー）。matomezu の写しなら、窓の写しにも置いて、選んでいる物で決めた所に貼る（ほかの常駐の写しは、トーストで断る）。
// 写しが無くファイルがあれば、紙のビューに渡す（ビューが画像を取り込んでスクラップを置く）
export const PAPER_PASTE_CLIPBOARD = kit.defineCommand({
  id: "paper-paste-clipboard",
  performs: [ITEM_PASTE.id],
  permissionScope: "opened-page",
  title: "Paste",
  clipboard: "paste",
  run: (ctx, a) => {
    const data = a.clipboard.read(CLIP_KIND)
    if (data === OTHER_HOST) {
      a.showToast({ kind: "warn", message: kit.message("It was copied in another matomezu") })
      return
    }
    const clip = data === NO_CLIP_DATA ? null : clipOfData(ctx.catalog, data)
    if (clip) {
      keep(a, clip)
      pasteNearSelection(ctx, a, clip)
      return
    }
    a.clipboard.passFiles()
  },
  when: hasOpenedPage,
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
    if (clip) pasteAt(ctx, a, clip, at && at !== NO_PAPER ? { parent: PAGE_ITSELF, at } : { parent: PAGE_ITSELF })
  },
  when: hasOpenedPage,
  enabled: ctx => clipIn(ctx) !== null,
})

// 選んでいるアイテムの複製: 写して、同じ親の中の少し右下に貼る（親が違う物を選んでいればページに貼る）
export const PAPER_DUPLICATE = kit.defineCommand({
  id: "paper-duplicate",
  performs: [ITEM_PASTE.id],
  permissionScope: "opened-page",
  title: "Duplicate",
  run: (ctx, a) => {
    const clip = copiedClip(ctx, a)
    if (!hasOpenedPage(ctx) || !clip) return
    const roots = walkShapes(ctx.page).filter(s => clip.shapes.some(c => c.id === s.shape.id))
    const parents = new Set(roots.map(r => r.parent))
    const parent = parents.size === 1 ? (roots[0]?.parent ?? PAGE_ITSELF) : PAGE_ITSELF
    const origin = {
      x: Math.min(...roots.map(r => (parent === PAGE_ITSELF ? r.at.x : r.shape.x))),
      y: Math.min(...roots.map(r => (parent === PAGE_ITSELF ? r.at.y : r.shape.y))),
    }
    pasteAt(ctx, a, clip, { parent, at: { x: origin.x + 16, y: origin.y + 16 } })
  },
  when: ctx => hasOpenedPage(ctx) && itemsSelected(ctx),
})

export const COPY_PASTE_KEYS = [
  kit.defineKey({ id: "paper-copy-mod-c", key: "Mod+C", command: PAPER_COPY.id, scope: "stage" }),
  kit.defineKey({ id: "paper-cut-mod-x", key: "Mod+X", command: PAPER_CUT.id, scope: "stage" }),
  kit.defineKey({ id: "paper-paste-mod-v", key: "Mod+V", command: PAPER_PASTE_CLIPBOARD.id, scope: "stage" }),
  kit.defineKey({ id: "paper-duplicate-mod-d", key: "Mod+D", command: PAPER_DUPLICATE.id, scope: "stage" }),
]
