// 物に付ける色の書き方: テーマの代表色の名前か、じかの色（#rrggbb）。代表色はどのテーマでもそのテーマの色で描く
import { z } from "zod"
import { HEX, PALETTE } from "../../../core/color"

export const ColorSchema = z.union([z.enum(PALETTE), z.string().regex(HEX)])
