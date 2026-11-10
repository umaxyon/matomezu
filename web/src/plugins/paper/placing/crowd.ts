// 置く・動かすときのほかの形との関係: 押される形を調べて断る・空きを知らせる。アクションとコピーして貼るが共に使う
import { z } from "zod"
import { type CoreCatalog, type Declined, findShape, type ItemPage, type Point } from "../../../plugin-api"
import { allRectsOf } from "../../base"
import { kit } from "../kit"

export const PointSchema = z.strictObject({ x: z.number(), y: z.number() })

// item-place が空きを探して見つからなかった断りの種類（Declined の kind）
export const NO_FREE_SPOT = kit.name("no-free-spot")

// ほかの形とぶつかるときの扱い: refuse は断る（ほかの形を動かさない。既定）、push は押してどける（画面の置く・動かす）
export const CrowdSchema = z.enum(["refuse", "push"]).optional()
export const CROWD_AI =
  'crowd "push" pushes the other shapes out of the way instead (as the screen does); without it (crowd "refuse"), it is refused when another shape would move, and the refusal names those shapes and a free spot.'

// 形 id の祖先（親から上へ）
export function ancestorsOf(page: ItemPage, id: string): string[] {
  const parent = findShape(page, id)?.parent
  return parent ? [parent, ...ancestorsOf(page, parent)] : []
}

// ページ page を next に変えたとき、紙の上で動いた・大きさの変わった形（free は問わない形、grows は大きさだけ変わってよい形）
export function movedShapes(
  catalog: CoreCatalog,
  page: ItemPage,
  next: ItemPage,
  free: ReadonlySet<string>,
  grows: ReadonlySet<string>,
): string[] {
  const after = allRectsOf(catalog, next)
  return [...allRectsOf(catalog, page)].flatMap(([id, r]) => {
    const now = after.get(id)
    if (free.has(id) || !now) return []
    const moved = now.x !== r.x || now.y !== r.y || (!grows.has(id) && (now.w !== r.w || now.h !== r.h))
    return moved ? [id] : []
  })
}

// 断りに添える、空きの知らせ（spot は、そこへ置けばほかの形を動かさない空き。無ければ crowd "push" を案内する）
const spotText = (spot: Point | null): string =>
  spot
    ? `; a free spot there: at ${JSON.stringify(spot)}`
    : '; there is no free spot there (crowd "push" pushes the others)'

// ほかの形を動かす moved を断った訳（そのうち子を持てる形へ入れる parent と、空きの知らせ）
export function crowded(catalog: CoreCatalog, page: ItemPage, moved: readonly string[], spot: Point | null): Declined {
  const nests = moved.filter(id => {
    const shape = findShape(page, id)?.shape
    return shape && catalog.items.get(shape.item)?.capabilities.includes("nests")
  })
  const into = nests.map(id => `; ${id} can hold children: pass parent "${id}" to put it inside`).join("")
  return { declined: `it would move ${moved.join(", ")}${into}${spotText(spot)}` }
}
