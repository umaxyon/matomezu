// アクター: アクション（や、その行う前の問い・行った後の確かめ）の「行った者」。利用者か、AI か。
// 読む所は形を直に見ずに isAI・isUser を通す（形を増やしても、この中だけで済むように）。
// 外（ホスト・AI の口）からは "ai" の印だけが来る（actorOfWire）。印が無ければ利用者
export type Actor = { readonly kind: "user" } | { readonly kind: "ai" }

export const USER: Actor = { kind: "user" }
export const AI: Actor = { kind: "ai" }

export const isAI = (actor: Actor): actor is Extract<Actor, { kind: "ai" }> => actor.kind === "ai"
export const isUser = (actor: Actor): actor is Extract<Actor, { kind: "user" }> => actor.kind === "user"

// 外から来た印（"ai"。無ければ利用者）のアクター
export const actorOfWire = (by: "ai" | undefined): Actor => (by === "ai" ? AI : USER)
