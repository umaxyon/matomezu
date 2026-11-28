// 常駐とやり取りする JSON の形（zod）: 読み込みの答え・知らせごとの中身・API の答え

import { z } from "zod"
import type { AssetPut } from "../core/assets"
import { BROKEN, MOVED_CODES } from "../core/folders"
import type { PageUsers } from "../core/page-users"
import { NOT_INSIDE } from "../core/unreadable"

const SHOW_AT = { stage: z.string().optional(), split: z.boolean().optional() }
export const ShowSchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("book"),
    book: z.string(),
    page: z.string().optional(),
    mode: z.enum(["edit", "print-preview"]).optional(),
    ...SHOW_AT,
  }),
  z.object({ to: z.literal("page"), page: z.string(), ...SHOW_AT }),
  z.object({ to: z.literal("binder"), binder: z.string(), page: z.string().optional(), ...SHOW_AT }),
])

// POST api/screen-plugins/remove の答え
export const SCREEN_PLUGINS_REMOVED = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), id: z.string(), reason: z.string() }),
])

export const PURGE_ANSWER = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.literal(NOT_INSIDE) }),
])
// ページを使っている所の答え（POST /api/page-users）
export const PAGE_USERS_ANSWER = z.object({
  users: z.record(z.string(), z.array(z.string())),
  sure: z.boolean(),
}) satisfies z.ZodType<PageUsers>

export const MOVED_IF_OFF_ANSWER = z.union([
  z.object({
    ok: z.literal(true),
    moved: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["page", "binder", "book", "folder"]),
        holder: z.string(),
        code: z.enum(MOVED_CODES),
        type: z.string().optional(),
      }),
    ),
  }),
  z.object({ ok: z.literal(false), reason: z.literal(BROKEN) }),
])

export const NoticeSchema = z.object({
  moved: z.array(z.object({ code: z.enum(MOVED_CODES), type: z.string().optional(), count: z.number().int() })),
  returned: z.number().int(),
})
export const PluginsSchema = z.object({
  moved: NoticeSchema.shape.moved.optional(),
  returned: z.number().int().optional(),
  by: z.string().optional(),
})

// 画像のバイト列を置いた答え（常駐の assets.go の importAsset）
export const ASSET_PUT = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), asset: z.string(), mime: z.string(), width: z.number(), height: z.number() }),
  z.object({ ok: z.literal(false), reason: z.enum(["too-large", "not-image"]) }),
]) satisfies z.ZodType<AssetPut>

// 新しい版の確かめの結果（常駐の update.go の UpdateStatus）
export const UpdateStatusSchema = z.object({
  state: z.enum(["unchecked", "current", "newer", "dev"]),
  version: z.string(),
  latest: z.string().optional(),
  checkedAt: z.string().optional(),
  askedAt: z.string().optional(),
})
export const HostStatusSchema = z.object({
  hostId: z.string(),
  name: z.string(),
  osHostName: z.string(),
  open: z.boolean(),
  port: z.number().int().optional(),
  addrs: z.array(z.string()).optional(),
  wsl: z.boolean().optional(),
  failed: z.enum(["port-in-use", "listen"]).optional(),
  wslProxy: z
    .enum(["starting", "running", "unavailable", "update-windows", "update-this", "port-in-use", "listen", "stopped"])
    .optional(),
  wslProxyAddrs: z.array(z.string()).optional(),
})
export const HostPeersSchema = z.object({
  paired: z.array(
    z.object({
      hostId: z.string(),
      label: z.string(),
      state: z.enum(["connected", "unreachable", "key-mismatch", "update-this", "update-that"]),
      workrooms: z
        .array(
          z.object({
            name: z.string(),
            activity: z.enum(["working", "idle", "unknown"]),
            alive: z.enum(["alive", "lapsed", "unknown"]).catch("unknown"), // 古い版の相手は送らない
          }),
        )
        .optional(),
      lastSeen: z.string().optional(),
      addr: z.string().optional(),
      reverseOnly: z.boolean().optional(),
      name: z.string().optional(),
      userName: z.string().optional(),
    }),
  ),
  found: z.array(z.object({ hostId: z.string(), name: z.string(), userName: z.string(), addr: z.string() })),
  pairing: z
    .object({
      phase: z.enum([
        "asking",
        "waiting",
        "accepted",
        "declined",
        "timed-out",
        "unreachable",
        "refused",
        "key-mismatch",
      ]),
      addr: z.string(),
      hostId: z.string().optional(),
      name: z.string().optional(),
      userName: z.string().optional(),
      code: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
})
// 参加者の会話の今のコンテキストの量と、AI の側の物差し（どちらもトークン。分からなければ常駐が省く）
const CONTEXT_USE = z.object({ used: z.number(), aiScale: z.number().positive() })
export const DataSchema = z.object({
  pages: z.array(z.object({ id: z.string(), page: z.unknown(), version: z.number().int() })),
  folders: z.array(z.object({ id: z.string(), folder: z.unknown(), version: z.number().int() })),
  settings: z.unknown(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  records: z.unknown().optional(),
  counters: z.unknown().optional(),
  plugins: z
    .array(z.object({ id: z.string(), ui: z.string(), css: z.string().optional(), disabled: z.boolean().optional() }))
    .optional(),
  touched: z.record(z.string(), z.string()).optional(),
  participantCalls: z.record(z.string(), z.string()).optional(),
  participantReady: z.array(z.string()).optional(),
  update: UpdateStatusSchema.optional(),
  host: HostStatusSchema.optional(),
  hostPeers: HostPeersSchema.optional(),
  participantLive: z
    .record(
      z.string(),
      z.object({
        model: z.string().optional(),
        branch: z.string().optional(),
        wake: z.literal("reaches").optional(),
        contextUse: CONTEXT_USE.optional(),
      }),
    )
    .optional(),
})
// build は常駐の版とデータの形の番号（移し替えの数）。build の無い hello もある
export const BuildSchema = z.object({ version: z.string(), dataVersion: z.number().int(), web: z.string().optional() })
export const HelloSchema = z.object({ client: z.string(), build: BuildSchema.optional() })
const Mark = { client: z.string().optional(), seq: z.number().int().optional() }
// 変わったページ・フォルダ 1 つ（消したなら removed が true で、中身と版は無い）
const rowSchema = <K extends "page" | "folder">(field: K) =>
  z.object({ id: z.string(), version: z.number().int().optional(), removed: z.literal(true).optional() }).extend({
    [field]: z.unknown().optional(),
  } as Record<K, z.ZodOptional<z.ZodUnknown>>)
// 1 回の perform（アクションバルク）が変えた物の全部: ページとフォルダ（books は、それらを持つブックの id）と、変わったときだけ設定・アノテーション（ページの id → 並び）・
// レコードと進めた番号（window は最後にフォーカスされた窓）。actions は行ったアクションの id の並び、library は、書庫の履歴に入るアクションが変えたページとフォルダごとの前と後（無い側は none）
// ページ・フォルダ 1 つの、前と後（置き場所の形のまま。無い側は none）
const RowSides = z.object({ before: z.unknown(), after: z.unknown() })
export const ChangedSchema = z.object({
  pages: z.array(rowSchema("page")),
  folders: z.array(rowSchema("folder")),
  books: z.array(z.string()),
  library: z.object({ pages: z.record(z.string(), RowSides), folders: z.record(z.string(), RowSides) }).optional(),
  by: z.enum(["ai", "window", "host"]).optional(),
  act: z.string().optional(),
  actions: z.array(z.string()).optional(),
  settings: z.unknown().optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  records: z.array(z.object({ subject: z.string(), id: z.string(), record: z.unknown() })).optional(),
  counters: z.record(z.string(), z.record(z.string(), z.number())).nullish(),
  window: z.string().optional(),
  ...Mark,
})
export const AckSchema = z.object({ seq: z.number().int(), ok: z.boolean(), reason: z.string() })
export const ParticipantCallSchema = z.object({ participant: z.string(), at: z.string() })
export const ParticipantReadySchema = z.object({ participant: z.string() })
export const ParticipantLiveSchema = z.object({
  participant: z.string(),
  model: z.string().optional(),
  branch: z.string().optional(),
  wake: z.literal("reaches").optional(),
  contextUse: CONTEXT_USE.optional(),
})
export const TouchedSchema = z.object({ book: z.string(), at: z.string() })
export const AnnotationsSchema = z.object({ page: z.string(), annotations: z.unknown() })
// 更新を頼んだ答え（ok が偽なら、そのワークルームに参加の確定した AI がいない）
export const ASK_UPDATE_ANSWER = z.object({ ok: z.boolean() })

// 承認待ちの AI 間メッセージ（常駐だけが持つ。知らせ pending-messages の中身は、その並び）。
// 承認待ちは、ほかのホストから届いた物だけ（senderHost は送り手のホスト id、senderHostName はそのホストエイリアス）
export const PENDING_MESSAGES = z.array(
  z.object({
    id: z.string(),
    receiver: z.string(),
    senderRoom: z.string(),
    senderHost: z.string(),
    senderHostName: z.string(),
    body: z.string(),
    at: z.string(),
  }),
)
// 承認・キャンセルの答え（not-pending なら ok が false。画面はどちらでも閉じる）
export const MESSAGE_ANSWER = z.object({ ok: z.boolean(), reason: z.string().optional() })
