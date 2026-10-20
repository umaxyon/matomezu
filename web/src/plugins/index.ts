// 中の部品の一覧（React を使わない app 用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { DRAWING_PLUGIN } from "./drawing"

export const BUILTIN = [BASE, DRAWING_PLUGIN] as const
