// 今の作業が替わったら聞く: ワークルームの今の作業が、AI が知っている今の作業から替わったかを判じ、替わっていれば利用者に聞く問いを作る。
// 常駐が参加者ごとに AI が知っている今の作業の印（mark）を覚え、ターンの終わりに AI のプログラムの部品が訊く。問いを出す・セッションを新しくする・文を打つのは、その部品が行う。
// 印はターンの終わりと、その AI 自身のアクションバルクが今の作業を替えたとき（workMarkShiftIn）に進む。AI が自分で替えた作業は問いにならず、利用者やほかの AI が替えたときだけ聞く。
// 選べる事は、セッションを新しくするか（clear。チャットスレッドはそのまま）と、新しい作業のワーカーブックを読ませるか（read）の組。読ませる文と、利用者が選べる事の外に書いた答えを渡す文は AI の種類を問わないので、ここが持つ
import type { CoreCatalog } from "../../../core/core-catalog"
import type { WorkKey } from "../../../core/folders"
import { translate } from "../../../core/i18n/i18n"
import { overlaid, type RecordSource, readerOf } from "../../../core/record-source"
import type { RecordChange } from "../../../core/records"
import { langOf, type Settings } from "../../../core/settings"
import { kit } from "../kit"
import { MY_WORKDESK } from "../library/system-folders"
import {
  type WorkroomWork,
  workRecordNameOf,
  workRecordNameReadsOf,
  workroomWorkFrom,
  workroomWorkReadsOf,
} from "./activity"

// 前のターンの終わりの印: 作業中ならその作業のレコード、空きなら idle（作業を答える種類が無ければ印を作らない）
type WorkMark = { kind: "working"; key: WorkKey } | { kind: "idle" }

const CHANGED = kit.message("Your current work changed from {from} to {to}. What should happen?")
const STARTED = kit.message("Your current work is now {to}. What should happen?")
const ENDED = kit.message("{from} ended. Clear the conversation?")
const CLEAR_READ = kit.message("Clear the conversation and read the worker book")
const CLEAR_ONLY = kit.message("Only clear the conversation")
const READ_ONLY = kit.message("Only read the worker book")
const KEEP = kit.message("Leave it as it is")
const YES = kit.message("Yes")
const NO = kit.message("No")

// 問いの選べる事 1 つ: 利用者の言語の文 label と、セッションを新しくするか clear、ワーカーブックを読ませるか read
export interface WorkShiftChoice {
  label: string
  clear: boolean
  read: boolean
}

// ターンの終わりの答え: 次に覚える印 mark（作業を答える種類が無ければ空）と、替わっていれば利用者に聞く問い（ask）。
// read は、読ませるを選んだときに AI に打つ英語の文（今の作業のレコードとワーカーブックを読ませる）。
// answered は、利用者が選べる事の外に書いた答えの前に付けて AI に打つ英語の文（問いの文を添える）
export interface WorkShift {
  mark: string
  ask?: { question: string; choices: WorkShiftChoice[]; read: string; answered: string }
}

const markOf = (work: WorkroomWork): string =>
  JSON.stringify(work.kind === "working" ? { kind: "working", key: work.key } : { kind: "idle" })

// アクションバルクが書いたレコード written（読み口 source はバルクの前）で、ワークルーム room の今の作業の印が替わったなら新しい印（替わらない・作業を答える種類が無ければ undefined）。
// 常駐は、行った AI の参加者の印をこれに進める。作業を答える種類を書かないバルクは読まずに答える
export function workMarkShiftIn(
  catalog: CoreCatalog,
  source: RecordSource,
  written: readonly RecordChange[],
  room: string,
): string | undefined {
  const reads = new Set(workroomWorkReadsOf(catalog))
  const touched = written.filter(c => reads.has(c.subject))
  if (touched.length === 0) return undefined
  const before = workroomWorkFrom(catalog, source, room)
  if (before === "unknown") return undefined
  const rows: Record<string, Record<string, unknown>> = {}
  for (const c of touched) rows[c.subject] = { ...rows[c.subject], [c.id]: c.record }
  const after = workroomWorkFrom(catalog, overlaid(catalog, source, rows), room)
  if (after === "unknown") return undefined
  const mark = markOf(after)
  return mark === markOf(before) ? undefined : mark
}

function parseMark(mark: string): WorkMark | undefined {
  if (mark === "") return undefined
  try {
    const m = JSON.parse(mark) as WorkMark
    if (m.kind === "idle") return m
    if (m.kind === "working" && typeof m.key?.subject === "string" && typeof m.key.id === "string") return m
  } catch {}
  return undefined
}

const sameMark = (a: WorkMark, b: WorkMark) =>
  a.kind === "idle"
    ? b.kind === "idle"
    : b.kind === "working" && a.key.subject === b.key.subject && a.key.id === b.key.id

// 利用者の設定 settings で、ワークルーム room の今の作業と、前のターンの終わりの印 before（覚えていなければ空）から、WorkShift。
// 覚えていない（初めてのターンの終わり）・替わっていない・作業を答える種類が無いときは、問いを作らない
export function workShiftIn(
  catalog: CoreCatalog,
  settings: Settings,
  source: RecordSource,
  room: string,
  before: string,
): WorkShift {
  const work = workroomWorkFrom(catalog, source, room)
  if (work === "unknown") return { mark: "" }
  const now: WorkMark = work.kind === "working" ? { kind: "working", key: work.key } : { kind: "idle" }
  const mark = markOf(work)
  const was = parseMark(before)
  if (!was || sameMark(was, now)) return { mark }
  const lang = langOf(catalog, settings, "en")
  const t = (m: Parameters<typeof translate>[2], params?: Record<string, string>) =>
    translate(catalog.messages, lang, m, params)
  const read = readerOf(catalog, source, workRecordNameReadsOf(catalog))
  const label = (m: WorkMark) => (m.kind === "working" ? workRecordNameOf(catalog, read, m.key)?.label : undefined)
  const from = label(was)
  const to = label(now)
  if (now.kind === "idle") {
    if (!from) return { mark }
    return {
      mark,
      ask: {
        question: t(ENDED, { from }),
        answered: answeredOf(t(ENDED, { from })),
        choices: [
          { label: t(YES), clear: true, read: false },
          { label: t(NO), clear: false, read: false },
        ],
        read: "",
      },
    }
  }
  const title = to ?? now.key.id
  const question = from ? t(CHANGED, { from, to: title }) : t(STARTED, { to: title })
  return {
    mark,
    ask: {
      question,
      answered: answeredOf(question),
      choices: [
        { label: t(CLEAR_READ), clear: true, read: true },
        { label: t(CLEAR_ONLY), clear: true, read: false },
        { label: t(READ_ONLY), clear: false, read: true },
        { label: t(KEEP), clear: false, read: false },
      ],
      read: `Your current work is now ${title}. Read it: read_records with kind "${now.key.subject}" and id "${now.key.id}". Then read your worker book (the book of your current work): read_folder with folder "${MY_WORKDESK}".`,
    },
  }
}

// 利用者が選べる事の外に書いた答えの前に付ける文（問い question を添える）
const answeredOf = (question: string) =>
  `When your current work changed, the user was asked "${question}" and answered (not one of the choices):`
