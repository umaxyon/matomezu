// MCP 公開ツールの actions の元になる物を、台帳アセンブルの結果（Assembled）の機能台帳から書き出す。台帳アセンブルの結果は、呼ぶたびに引数で受ける

import { z } from "zod"
import { PALETTE, PALETTE_MEANINGS } from "../core/color"
import { slideIsBackground } from "../core/def/page-type"
import { shownToAI } from "../core/def/subject"
import { translate } from "../core/i18n/i18n"
import { settingSchema } from "../core/settings"
import { growKindOf, textColorRef, themesFor } from "../plugins/base"
import type { Assembled } from "../store/plugin"

// MCP 公開ツールの actions の元になる物: 表ごとの全文（アクション・アイテム・設定などの args・props の JSON Schema まで）に、目次 index を添える。
// 全文は、機能台帳から AI に見せる物（利用者だけのアクションと、利用者だけが変える設定の項目は除く）を書き出したもの。名前は英語。
// 目次は、AI が最初に受け取る物: 大きい表（アクション・アイテム・設定）は id と題名だけにし、全文は id を渡して取る。小さい表は全文のまま入れる
export function aiCatalog(of: Assembled) {
  const tables = aiTables(of)
  const { actions, items, settings, subjects, ...whole } = tables
  return {
    ...tables,
    index: {
      actions: actions.map(a => ({ id: a.id, target: a.target, title: a.title })),
      items: items.map(i => ({ id: i.id, kind: i.kind, title: i.title })),
      settings: settings.map(s => ({ id: s.id, title: s.title })),
      subjects: subjects.map(s => ({ id: s.id, title: s.title })),
      ...whole,
    },
  }
}

function aiTables(of: Assembled) {
  const catalog = of.catalog.core
  const en = (key: string) => translate(catalog.messages, "en", key as never)
  return {
    actions: [...catalog.actions.values()]
      .filter(a => !a.userOnly)
      .map(a => ({
        id: a.id,
        target: a.target,
        title: en(a.title),
        description: a.aiDescription,
        args: z.toJSONSchema(a.describeArgs?.(catalog) ?? a.args, { io: "input", unrepresentable: "any" }),
      })),
    pageTypes: [...catalog.pageTypes.values()].map(t => ({
      id: t.id,
      title: en(t.title),
      grouping: t.grouping, // binder のタイプのページは、そのタイプのバインダの中にだけ置ける
      grows: growKindOf(t), // 可変ページの決め方（base の growKindOf）
      items: t.items.allowed, // ページに置けるアイテム
      // ページの slide（形だけの並び）に置けるアイテムと、その並びがページの背景か本体か（無ければ null）。read_page には、背景は有無と文字だけが見える（page.background.texts）
      slide: t.slide ? { items: t.slide.allowed, role: slideIsBackground(t) ? "background" : "body" } : null,
      themes: themesFor(catalog, t.id).map(th => th.id), // そのタイプのページと中の形に当てられるテーマ（テーマタイプの重なりは、ここで計算して出す）
    })),
    items: [...catalog.items.values()].map(i => ({
      id: i.id,
      kind: i.kind, // shape は置く形、connector は 2 つの形をつなぐもの
      title: en(i.title),
      size: i.kind === "shape" ? i.size : null,
      props: z.toJSONSchema(i.props, { io: "input", unrepresentable: "any" }),
    })),
    // 利用者の設定の項目（settings-set で変え、read_settings で読む）
    settings: [...catalog.userSettings.values()]
      .filter(d => !d.userOnly)
      .map(d => ({
        id: d.id,
        title: en(d.title),
        schema: z.toJSONSchema(settingSchema(catalog, d, "user"), { io: "input", unrepresentable: "any" }),
      })),
    // アノテーションの種類（read_book・read_page の annotations と view の awaiting の annotation は、この id）
    annotations: [...catalog.annotations.values()].map(a => ({
      id: a.id,
      title: en(a.title),
      description: a.aiDescription,
      props: z.toJSONSchema(a.props, { io: "input", unrepresentable: "any" }),
    })),
    // 対象の定義（レコードの種類。アクションの target はこの id のとき、perform の on は { record: レコードの id }（作るときは on を書かない））
    subjects: [...catalog.subjects.values()].filter(shownToAI).map(s => ({
      id: s.id,
      title: en(s.title),
      description: s.aiDescription,
      record: z.toJSONSchema(s.record, { io: "input", unrepresentable: "any" }),
      // 一覧の既定の目次に載せない物（read_records の unlisted で include か only を付けると取れる）
      ...(s.aiListed ? { unlisted: s.aiListed.unlisted } : {}),
      // 索引キー（read_records の where に書ける名前と型。一覧の既定の並びを持つ種類だけが、索引キーで探す）
      ...(s.aiList && s.keys
        ? { keys: Object.fromEntries(Object.entries(s.keys).map(([name, key]) => [name, key.type])) }
        : {}),
    })),
    // 郵便の種類（read_records の郵便の mail は、この id）
    mails: [...catalog.mails.values()].map(m => ({
      id: m.id,
      title: en(m.title),
      description: m.aiDescription,
      props: z.toJSONSchema(m.props, { io: "input", unrepresentable: "any" }),
    })),
    themes: [...catalog.themes.values()].map(th => ({ id: th.id, title: en(th.title) })),
    // 言語パック（言語の項目の値は、この id）とスキン
    languages: [...catalog.languagePacks.values()].map(p => ({ id: p.id, lang: p.lang, name: p.name })),
    skins: [...catalog.skins.keys()],
    colors: PALETTE.map(id => ({ id, meaning: PALETTE_MEANINGS[id] })),
    // 本文の装飾の文字の色（name は本文に書く名前: {name:文字}）
    textColors: [...catalog.textColors.values()].map(c => ({
      id: c.id,
      name: textColorRef(c.id),
      meaning: c.aiDescription,
    })),
  }
}
