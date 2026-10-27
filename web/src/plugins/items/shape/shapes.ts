// 形のアイテム: キャプションを 1 行持つ、輪郭の違う 8 つの形（角丸・ひし形・平行四辺形とその逆・台形とその逆・六角形・円）。
// 向きが逆の形は、反転の項目ではなく別のアイテムにする。本文は持たない。大きさの決まりは箱と同じ（w・h を利用者が変える）。
// 項目はキャプションと寄せ・色（代表色の名前か #rrggbb）。個別のテーマは持たない（いつもブックのテーマで描く）。台形とその逆は向きも持つ（turnable）。テーマキーは 8 つの形で共通の 1 組。
// 置くときは形ごとの追加のダイアログでキャプションと色を聞いてから置き、中身は 1 つの編集のダイアログで変える
import { z } from "zod"
import {
  type Book,
  type CoreCatalog,
  HEX,
  PALETTE,
  pagedOf,
  type ShapeAddArgs,
  type ShapeEditArgs,
} from "../../../plugin-api"
import { AlignSchema, pageContext } from "../../base"
import { kit } from "./kit"
import type { SHAPE_MESSAGES } from "./messages"
import { shapeMinimap } from "./minimap"
import type { ShapeKind } from "./outline"
import { SHAPE_RULES } from "./outline"
import { placedWidth, SHAPE_MIN } from "./size"

export const SHAPE_FILL = { id: kit.name("shape-fill"), fallback: "fill" } as const
// 8 つの形で共通のテーマキー（プラグインが持つ。形のアイテムは自分のテーマキーを持たない）
export const SHAPE_TOKENS = [
  SHAPE_FILL,
  { id: kit.name("shape-line"), value: "#cdcdd6" }, // 輪郭の線
  { id: kit.name("shape-text"), fallback: "text" },
  { id: kit.name("shape-shadow"), value: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.14))" }, // 影（CSS の filter の値）
] as const

export const ShapePropsSchema = z.strictObject({
  caption: z.string().default(""),
  captionAlign: AlignSchema.default("center"),
  color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 塗りの色（代表色の名前か #rrggbb。無ければテーマの塗り）
})

// 回せる形（台形とその逆）の項目: ほかの形の項目に、向き turned（true なら反時計回りに 90 度回した横向き。文字も縦になる）を足す
export const TurnablePropsSchema = ShapePropsSchema.extend({ turned: z.boolean().default(false) })

// タイプが回せる形に渡す指定（ItemOptionTable）。turned はそのブックで回せる形を横向きにするか（setting はそのページで効いている設定の値）。
// 追加のダイアログが最初に選ぶ向きと、形をブックに合わせるとき（adapt）の向きに使う
export interface ShapeOptions {
  turned?(setting: (id: string) => unknown): boolean
}

// 回せる形 item を、ブック book のページ page に置くときの最初の向き（タイプの指定 ShapeOptions の turned。ページの設定で決める）
export function startTurned(catalog: CoreCatalog, book: Book, page: string, item: string): boolean {
  const options = catalog.bookTypes.get(book.type)?.items.options as Record<string, ShapeOptions> | undefined
  const placed = pagedOf(book)?.pages.find(p => p.id === page) ?? null
  return options?.[item]?.turned?.(pageContext(catalog, book, placed).setting) ?? false
}

// 編集のダイアログ（どの形も同じ）
export const SHAPE_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "shape-edit" })

// 形 1 つの定義と、その追加のダイアログ（置く形はダイアログで決まっているので、形ごとに 1 つ）
function shape<const Id extends string, const Title extends keyof typeof SHAPE_MESSAGES & string>(
  name: Id,
  kind: ShapeKind,
  title: Title,
  family?: keyof typeof SHAPE_MESSAGES & string, // 向きが逆の形の仲間の名前（familyTitle）
) {
  const add = kit.defineDialogWith<ShapeAddArgs>()({ id: `${name}-add` })
  const rule = SHAPE_RULES[kind]
  const item = kit.defineShape({
    id: `shape-${name}`,
    kind: "shape",
    version: 1,
    title,
    capabilities: ["connectable", "resizable"],
    captionProp: "caption",
    toolbox: true,
    ...(family ? { familyTitle: kit.message(family) } : {}),
    props: ShapePropsSchema,
    size: rule.size,
    min: SHAPE_MIN,
    ports: rule.ports,
    sizeOf: s => ({ w: s.w ?? placedWidth(kind, s.props.caption), h: s.h ?? rule.size.h }),
    captionWidth: s => placedWidth(kind, s.props.caption),
    minimap: (_, r) => shapeMinimap(kind, r),
    dialogs: { add: add.id, edit: SHAPE_EDIT_DIALOG.id },
    tokens: [],
  })
  return { item, add, kind }
}

// 回せる形 1 つの定義と、その追加のダイアログ。横向きなら回した輪郭とつなぎ口で、置いたときの大きさは縦と横を入れ替える
// （キャプションは縦に並ぶので、キャプションでは縦に広げる）。向きを変えたら（項目を変えたとき・ブックに合わせたとき）、幅と高さを入れ替える
function turnable<const Id extends string, const Title extends keyof typeof SHAPE_MESSAGES & string>(
  name: Id,
  kind: "trapezoid" | "trapezoid-reversed",
  title: Title,
) {
  const family = "Trapezoid"
  const add = kit.defineDialogWith<ShapeAddArgs>()({ id: `${name}-add` })
  const rule = SHAPE_RULES[kind]
  // 回せる形（outline.ts の turned を持つ形）だけを渡す
  const turned = rule.turned as NonNullable<typeof rule.turned>
  type Placed = { w?: number; h?: number; props: z.output<typeof TurnablePropsSchema> }
  const sizeOf = (s: Placed) => {
    const w = s.w ?? (s.props.turned ? rule.size.h : placedWidth(kind, s.props.caption))
    const h = s.h ?? (s.props.turned ? placedWidth(kind, s.props.caption) : rule.size.h)
    return { w, h }
  }
  // 向きを変えた形: 前の形 before と向きが違えば、幅と高さを入れ替える
  const reshaped = <S extends Placed>(next: S, before: Placed): S => {
    if (next.props.turned === before.props.turned) return next
    const { w, h } = sizeOf(before)
    return { ...next, w: h, h: w }
  }
  const item = kit.defineShape({
    id: `shape-${name}`,
    kind: "shape",
    version: 1,
    title,
    capabilities: ["connectable", "resizable"],
    captionProp: "caption",
    toolbox: true,
    familyTitle: kit.message(family),
    props: TurnablePropsSchema,
    size: rule.size,
    min: { w: SHAPE_MIN.h, h: SHAPE_MIN.h }, // 縦向きでも横向きでも、キャプション 1 行の高さまで
    ports: rule.ports,
    portsOf: s => (s.props.turned ? turned.ports : rule.ports),
    sizeOf,
    // 横向きはキャプションが縦に並ぶので、見える幅は一番小さい幅、見える高さがキャプションで決まる
    captionWidth: s => (s.props.turned ? SHAPE_MIN.h : placedWidth(kind, s.props.caption)),
    captionHeight: s => (s.props.turned ? placedWidth(kind, s.props.caption) : null),
    "@matomezu/paper:settle": (s, before) => (before ? reshaped(s, before) : s),
    adapt: (s, option, setting) => {
      const want = (option as ShapeOptions | undefined)?.turned?.(setting) ?? false
      return s.props.turned === want ? s : reshaped({ ...s, props: { ...s.props, turned: want } }, s)
    },
    minimap: (s, r) => shapeMinimap(kind, r, s.props.turned),
    dialogs: { add: add.id, edit: SHAPE_EDIT_DIALOG.id },
    tokens: [],
  })
  return { item, add, kind }
}

export const ROUNDED = shape("rounded", "rounded", "Rounded")
export const DIAMOND = shape("diamond", "diamond", "Diamond")
export const PARALLELOGRAM = shape("parallelogram", "parallelogram", "Parallelogram", "Parallelogram")
export const PARALLELOGRAM_REVERSED = shape(
  "parallelogram-reversed",
  "parallelogram-reversed",
  "Parallelogram (reversed)",
  "Parallelogram",
)
export const TRAPEZOID = turnable("trapezoid", "trapezoid", "Trapezoid")
export const TRAPEZOID_REVERSED = turnable("trapezoid-reversed", "trapezoid-reversed", "Trapezoid (reversed)")
export const HEXAGON = shape("hexagon", "hexagon", "Hexagon")
export const CIRCLE = shape("circle", "circle", "Circle")

export const SHAPES = [
  ROUNDED,
  DIAMOND,
  PARALLELOGRAM,
  PARALLELOGRAM_REVERSED,
  TRAPEZOID,
  TRAPEZOID_REVERSED,
  HEXAGON,
  CIRCLE,
] as const

// 回せる形（台形とその逆）の id
export const TURNABLE: readonly string[] = [TRAPEZOID.item.id, TRAPEZOID_REVERSED.item.id]
