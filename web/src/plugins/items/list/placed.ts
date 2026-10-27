// 置いたリストのデータの型
import type { PlacedOf } from "../../../plugin-api"
import type { LIST } from "./list"

export type PlacedList = PlacedOf<typeof LIST.id>
