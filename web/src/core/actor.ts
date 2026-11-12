// アクター: アクション（や、その行う前の問い・行った後の確かめ）の「行った者」。利用者か、AI か。
// 読む所は形を直に見ずに isAI・isUser・hasJoined を通す（形を増やしても、この中だけで済むように）。
// AI はワークルームを持つ: 参加が確定している（受け入れ済みで準備中でなく、部屋に入っている）AI は入っている部屋 { id }、確定していない AI
// （参加者でない・要求中・準備中）は "none"。外（ホスト・AI の口）からは WireActor で来る（actorOfWire）。無ければ利用者
export type Workroom = "none" | { readonly id: string }

export type Actor = { readonly kind: "user" } | { readonly kind: "ai"; readonly workroom: Workroom }

export const USER: Actor = { kind: "user" }
// 参加が確定した AI の例（入っている部屋の id は "room"）と、確定していない AI
export const AI: Actor = { kind: "ai", workroom: { id: "room" } }
export const AI_NOT_JOINED: Actor = { kind: "ai", workroom: "none" }

export const isAI = (actor: Actor): actor is Extract<Actor, { kind: "ai" }> => actor.kind === "ai"
export const isUser = (actor: Actor): actor is Extract<Actor, { kind: "user" }> => actor.kind === "user"
// 参加が確定している AI か（利用者は参加を問わないので、確定していない AI だけが false）
export const hasJoined = (actor: Actor): boolean => !isAI(actor) || actor.workroom !== "none"

// 外から来るアクター: 利用者か、AI（入っている部屋の id。無ければ確定していない）
export type WireActor = { kind: "user" } | { kind: "ai"; workroom?: string }

export const actorOfWire = (wire: WireActor | undefined): Actor =>
  wire?.kind === "ai" ? (wire.workroom ? { kind: "ai", workroom: { id: wire.workroom } } : AI_NOT_JOINED) : USER
