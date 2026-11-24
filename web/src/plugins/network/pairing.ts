// ペアリング: ペアリングしたホスト（paired-host）と、このホストに届いた受け入れ待ちのペアリングの頼み（pairing-request）。どちらも常駐が役で引く。
// 頼みは、ほかのホストから届いたときに常駐が載せ（pairing-request-add）、利用者が受け入れる（pairing-accept。頼みを消し、ペアリングしたホストを載せる）か断る
// （pairing-decline。取り下げ・時間切れ・起動し直したときも、常駐がこれで消す）。こちらから頼んで相手が受け入れたら、常駐がペアリングしたホストを載せる（paired-host-add）。
// ペアリングを解くのは paired-host-remove（利用者が解く。相手が解いた・相手がペアリングしていないと答えたときも、常駐がこれで消す）。
// 頼みの扱い（requests）は利用者だけが替える（paired-host-requests-set）。
// 相手の身元はホスト id（鍵の印）だけで決まる。名前・利用者名はペアリングしたときに相手が名乗った物で、今の名前は常駐だけが持つ
import { z } from "zod"
import { PAIRED_HOST_REQUESTS } from "../../core/def/subject"
import type { ActionContext } from "../../plugin-api"
import { kit } from "./kit"

const HOST_ID = z.string().regex(/^[0-9a-f]{64}$/)
const NAME = z.string().max(40)
const ADDR = z.string().max(300) // 番地とポート（例 192.168.11.20:7240）
const REQUESTS = z.enum(PAIRED_HOST_REQUESTS)

export const PAIRED_HOST = kit.defineSubject({
  id: "paired-host",
  title: "pairedHost",
  aiDescription:
    "A host (the matomezu of another machine) this host is paired with: hostId (the fingerprint of its key), nameAtPairing and userNameAtPairing (the host name and user name it gave when it was paired; it may have changed them since), addr (the address and port the user typed to reach it, or empty when it was found on the network), pairedAt and requests (how messages from the AIs of that host are taken: ask-user, the AI that gets one asks the user before doing what it asks, or as-user, it is taken as the user's request). Only the user pairs, unpairs and changes requests.",
  role: "paired-hosts",
  record: z.strictObject({
    id: z.string().min(1),
    hostId: HOST_ID,
    nameAtPairing: NAME,
    userNameAtPairing: NAME,
    addr: ADDR,
    pairedAt: z.string(),
    requests: REQUESTS,
  }),
  keys: { hostId: { type: "text", of: h => h.hostId } },
})

export const PAIRING_REQUEST = kit.defineSubject({
  id: "pairing-request",
  title: "pairingRequest",
  aiDescription:
    "A request from another host to pair with this host, waiting for the user's answer: hostId, name, userName (as it gave them), addr (where it asked from), code (the connection check code shown on both screens) and requestedAt. Only the user accepts or declines it; it goes away when the other host gives up or after a while.",
  role: "pairing-requests",
  record: z.strictObject({
    id: z.string().min(1),
    hostId: HOST_ID,
    name: NAME,
    userName: NAME,
    addr: ADDR,
    code: z.string().regex(/^[0-9]{6}$/),
    requestedAt: z.string(),
  }),
  keys: { hostId: { type: "text", of: r => r.hostId } },
})

export type PairedHost = z.output<typeof PAIRED_HOST.record>
export type PairingRequest = z.output<typeof PAIRING_REQUEST.record>

// 同じホスト id の頼み・ペアリングしたホストを、索引キーだけ読む
const readsRequest = (hostId: string) =>
  ({ subject: PAIRING_REQUEST.id, where: [{ key: "hostId", eq: hostId }], keysOnly: true }) as const
const readsPaired = (where: readonly { key: "hostId"; eq: string }[]) =>
  ({ subject: PAIRED_HOST.id, where, keysOnly: true }) as const

const hasHost = (ctx: ActionContext, subject: typeof PAIRED_HOST.id | typeof PAIRING_REQUEST.id, hostId: string) =>
  Object.values(ctx.keys?.[subject] ?? {}).some(k => k.hostId === hostId)

export const PAIRING_REQUEST_ADD = kit.defineAction({
  id: "pairing-request-add",
  aiDescription:
    "Put a request from another host to pair (only matomezu does this, when the request arrives). Refused when a request from the same host is waiting. Returns the request's id.",
  title: "Put a pairing request",
  target: PAIRING_REQUEST.id,
  userOnly: true,
  runsBetweenHosts: "add-pairing-request",
  reads: args => [readsRequest(args.hostId)],
  args: z.strictObject({
    hostId: HOST_ID,
    name: NAME,
    userName: NAME,
    addr: ADDR,
    code: z.string().regex(/^[0-9]{6}$/),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (hasHost(ctx, PAIRING_REQUEST.id, args.hostId)) return { declined: "a request from that host is waiting" }
    const id = ctx.newId()
    return { next: { id, ...args, requestedAt: ctx.now }, result: { request: id } }
  },
})

export const PAIRING_ACCEPT = kit.defineAction({
  id: "pairing-accept",
  aiDescription:
    "Accept the pairing request named by on.record (only the user): the request goes and the host is put among the paired hosts, in one transaction. Refused when that host is paired already.",
  title: "Accept a pairing request",
  target: PAIRING_REQUEST.id,
  userOnly: true,
  writes: [PAIRED_HOST.id],
  // 宛先の頼みのホスト id は引数に無いので、ペアリングしたホストの索引キーを全部読む（数は少ない）
  reads: () => [readsPaired([])],
  args: z.strictObject({}),
  run: (now, _args, ctx) => {
    if (now === "none") return null
    if (hasHost(ctx, PAIRED_HOST.id, now.hostId)) return { declined: "that host is paired already" }
    const id = ctx.newId()
    const host: PairedHost = {
      id,
      hostId: now.hostId,
      nameAtPairing: now.name,
      userNameAtPairing: now.userName,
      addr: "",
      pairedAt: ctx.now,
      requests: "ask-user",
    }
    return {
      next: "removed",
      others: [{ subject: PAIRED_HOST.id, id, record: host }],
      result: { pairedHost: id },
    }
  },
})

export const PAIRING_DECLINE = kit.defineAction({
  id: "pairing-decline",
  aiDescription:
    "Decline the pairing request named by on.record and remove it (only the user; matomezu also removes it when the other host gives up or it waits too long).",
  title: "Decline a pairing request",
  target: PAIRING_REQUEST.id,
  userOnly: true,
  runsBetweenHosts: "remove-pairing-request",
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed", result: {} }),
})

export const PAIRED_HOST_ADD = kit.defineAction({
  id: "paired-host-add",
  aiDescription:
    "Put a paired host (only matomezu does this, when the other host accepted this host's request). Refused when that host is paired already. Returns its id.",
  title: "Put a paired host",
  target: PAIRED_HOST.id,
  userOnly: true,
  runsBetweenHosts: "add-paired-host",
  reads: args => [readsPaired([{ key: "hostId", eq: args.hostId }])],
  args: z.strictObject({ hostId: HOST_ID, nameAtPairing: NAME, userNameAtPairing: NAME, addr: ADDR }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (hasHost(ctx, PAIRED_HOST.id, args.hostId)) return { declined: "that host is paired already" }
    const id = ctx.newId()
    return { next: { id, ...args, pairedAt: ctx.now, requests: "ask-user" }, result: { pairedHost: id } }
  },
})

export const PAIRED_HOST_REMOVE = kit.defineAction({
  id: "paired-host-remove",
  aiDescription:
    "Unpair the paired host named by on.record (only the user): it is removed here, and matomezu tells the other host, which removes this host too.",
  title: "Unpair a host",
  target: PAIRED_HOST.id,
  userOnly: true,
  runsBetweenHosts: "remove-paired-host",
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed", result: {} }),
})

export const PAIRED_HOST_REQUESTS_SET = kit.defineAction({
  id: "paired-host-requests-set",
  aiDescription:
    "Change how messages from the AIs of the paired host named by on.record are taken (only the user): ask-user or as-user.",
  title: "Change how requests from a host are taken",
  target: PAIRED_HOST.id,
  userOnly: true,
  args: z.strictObject({ requests: REQUESTS }),
  run: (now, args) => (now === "none" ? null : { next: { ...now, requests: args.requests }, result: {} }),
})
