// アクター: アクション（や、その行う前の問い・行った後の確かめ）の「行った者」。利用者か、AI か。
// 読む所は形を直に見ずに isAI・isUser・hasJoined を通す（形を増やしても、この中だけで済むように）。
// AI は参加の状態（participation）を持つ: joined は参加が確定している（受け入れ済みで準備中でない）、none は確定していない（参加者でない・要求中・準備中）。
// 外（ホスト・AI の口）からは "ai" の印と参加の状態が来る（actorOfWire）。印が無ければ利用者
export const PARTICIPATIONS = ["none", "joined"] as const
export type Participation = (typeof PARTICIPATIONS)[number]

export type Actor = { readonly kind: "user" } | { readonly kind: "ai"; readonly participation: Participation }

export const USER: Actor = { kind: "user" }
export const AI: Actor = { kind: "ai", participation: "joined" }
export const AI_NOT_JOINED: Actor = { kind: "ai", participation: "none" }

export const isAI = (actor: Actor): actor is Extract<Actor, { kind: "ai" }> => actor.kind === "ai"
export const isUser = (actor: Actor): actor is Extract<Actor, { kind: "user" }> => actor.kind === "user"
// 参加が確定している AI か（利用者は参加を問わないので、確定していない AI だけが false）
export const hasJoined = (actor: Actor): boolean => !isAI(actor) || actor.participation === "joined"

// 外から来た印（"ai"。無ければ利用者）と、AI の参加の状態（無ければ確定していない）のアクター
export const actorOfWire = (by: "ai" | undefined, participation?: Participation): Actor =>
  by === "ai" ? (participation === "joined" ? AI : AI_NOT_JOINED) : USER
