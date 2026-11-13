// プロジェクトの文言。初期テンプレ（最初のプロジェクトの名前・レーン・チケットタグとそれぞれのプロンプト）は、プロジェクトを作るときの言語で写す
import { defineMessages } from "../../../plugin-api"

export const PROJECT_MESSAGES = defineMessages({
  project: { en: "Project", ja: "プロジェクト" },
  "add project": { en: "Add a project", ja: "プロジェクトを足す" },
  "update project": { en: "Change a project", ja: "プロジェクトを直す" },
  "close project": { en: "Close a project", ja: "プロジェクトを閉じる" },
  "reopen project": { en: "Reopen a project", ja: "プロジェクトを開け直す" },
  Unsorted: { en: "Unsorted", ja: "未分類" },
  "template project name": { en: "Default", ja: "標準" },
  "template lane todo": { en: "To do", ja: "未着手" },
  "template lane todo prompt": {
    en: "When told to add a task, add the ticket here and set a fitting tag",
    ja: "タスク追加、と言われたらここにチケットを追加し、適切なタグを設定する",
  },
  "template lane doing": { en: "Doing", ja: "作業中" },
  "template lane doing prompt": {
    en: "When a ticket is assigned to you, move it to this lane",
    ja: "チケットを割り当てられたら、このレーンにチケットを移動する",
  },
  "template lane done": { en: "Done", ja: "完了" },
  "template lane done prompt": {
    en: "When the commits are merged into main and no work is left, complete the ticket with ticket-complete",
    ja: "コミットがmainにマージされ、残作業が無くなったら ticket-complete で完了にする",
  },
  "template tag task": { en: "Task", ja: "タスク" },
  "template tag task prompt": {
    en: "A normal task. Use this tag when none is given",
    ja: "通常のタスク。指定が無い場合はこのタグをつける",
  },
  "template tag bug": { en: "Bug", ja: "バグ" },
  "template tag bug prompt": {
    en: "Use this tag when filing a fault of an existing feature",
    ja: "既存機能の不具合を起票する場合に付ける",
  },
})
