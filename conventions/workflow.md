# 作業の進め方

## 決めてから作る

- 決まっていない操作や見た目は、作る前にユーザーに確かめる。選択肢を出すときは、何に使い、無いと何ができないかを先に書く
- 「理解を合わせたい」「触らない」と前置きされた問いには、説明だけを返して動かさない
- 作っている途中で残した細かな保留は、まとめてユーザーに渡す（勝手に決めない）

## テスト

- 作業中は、直したものに関係するテストだけを流す（`bun test test/xxx.test.ts`・`go test ./internal/xxx -run Xxx`・`bunx playwright test e2e/xxx.spec.ts`）
- 全部を流すのは、コミットの前と、ユーザーに画面の確認を頼む前だけ
  - 単体: `bun test`
  - Go: `go test ./...`（リポジトリの根から動かす）
  - 型: `bun run typecheck`
  - lint: `bun run lint`（直すのは `bun run format`）
  - e2e: `bun run e2e`
- `bun test` の結果は末尾だけでなく、pass と fail の行を見る

## ビルドと常駐

- `web/src/engine/engine.ts` か、それが読む core とプラグインを直したら `bun run build:engine` で `internal/engine/engine.js` を作り直す（テストが見張る）
- 開発は `bun run dev`（5300）。Go の常駐を `.dev-home` で立て、`web/dist` を配る。ホットリロードは無いので、直したら起動し直し、開いているタブも読み直す
- アクションを足したら、常駐の実行ファイルを作り直して起動し直すまで、画面からも AI からも使えない
- 常駐を止めるコマンドと立て直すコマンドは、別々に動かす
- 常駐を起動し直すと MCP の鍵が古くなるので、MCP を使うなら `/mcp` でつなぎ直す

## コミット

- main に直接積む。捨てるかもしれない試みだけブランチを切り、戻る目印はタグ
- 区切りのコミットは頼まれなくてよい。push は頼まれたときだけ
- コミットの前に、変更をステージしてから、サブエージェント conventions-review（`.claude/agents/conventions-review.md`）でステージ済みの変更が規約に違反していないかを確かめる。違反があれば直してからコミットする
- 画面や AI の操作が変わるコミットでは、変更をステージしてから、サブエージェント manual-creator（`.claude/agents/manual-creator.md`）で利用者向けマニュアルの下書きに書き足す。書き足した下書きもステージしてから conventions-review で確かめ、一緒にコミットする。返ってきた問いには答えるかユーザーに聞き、使い方の不備はユーザーに伝える
- メッセージは英語で、何をどう変えたかを書く。Co-Authored-By を付けない
- `docs/`・`_old_docs/`・`tmp/` はコミットしない
