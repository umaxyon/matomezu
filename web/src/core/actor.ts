// アクター: アクション（や、その行う前の問い・行った後の確かめ）の「行った者」。利用者か、AI か。
// 読む所は形を直に見ずに isAI・isUser・canAct・isVisitor・workroomOfActor を通す（形を増やしても、この中だけで済むように）。
// AI の参加の様子: 参加が確定していて（受け入れ済みで準備中でない）ワークルームに入っている AI は入っているワークルーム { id }、
// 参加が確定していてワークルームを持たない AI（ビジター。読むだけ）は "visitor"、確定していない AI（参加者でない・要求中・準備中）は "none"。
// 外（ホスト・AI の口）からは WireActor で来る（actorOfWire）。無ければ利用者
export type Workroom = "none" | "visitor" | { readonly id: string }

export type Actor = { readonly kind: "user" } | { readonly kind: "ai"; readonly workroom: Workroom }

export const USER: Actor = { kind: "user" }
// 参加が確定した AI の例（入っているワークルームの id は "room"）と、確定していない AI
export const AI: Actor = { kind: "ai", workroom: { id: "room" } }
export const AI_NOT_JOINED: Actor = { kind: "ai", workroom: "none" }
export const AI_VISITOR: Actor = { kind: "ai", workroom: "visitor" }

export const isAI = (actor: Actor): actor is Extract<Actor, { kind: "ai" }> => actor.kind === "ai"
export const isUser = (actor: Actor): actor is Extract<Actor, { kind: "user" }> => actor.kind === "user"
// 書ける者か: 利用者か、参加が確定してワークルームに入っている AI（確定していない AI とビジターは false）
export const canAct = (actor: Actor): boolean => !isAI(actor) || typeof actor.workroom === "object"
// AI がビジターか
export const isVisitor = (actor: Actor): boolean => isAI(actor) && actor.workroom === "visitor"
// ワークルームが無いときの値（ワークルームに入っていない者・管理者のワークルームが無い）
export const NO_WORKROOM = "none"
// AI が入っているワークルームの id（利用者・確定していない AI・ビジターは NO_WORKROOM）
export const workroomOfActor = (actor: Actor): string =>
  isAI(actor) && typeof actor.workroom === "object" ? actor.workroom.id : NO_WORKROOM

// 外から来るアクター: 利用者か、AI（入っているワークルームの id か、ビジターなら as が visitor。どちらも無ければ確定していない）
export type WireActor = { kind: "user" } | { kind: "ai"; workroom?: string; as?: "visitor" }

export const actorOfWire = (wire: WireActor | undefined): Actor => {
  if (wire?.kind !== "ai") return USER
  if (wire.as === "visitor") return AI_VISITOR
  return wire.workroom ? { kind: "ai", workroom: { id: wire.workroom } } : AI_NOT_JOINED
}
