// 中の部品の一覧（React を使わない app 用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { DRAWING_PLUGIN } from "./books/drawing"
import { MASTER_PLUGIN } from "./books/master"

export const BUILTIN = [BASE, MASTER_PLUGIN, DRAWING_PLUGIN] as const
