// 英語の辞書をまとめる。持ち場ごとにファイルを分ける（app: ヘッダー・知らせ・設定、dialog: ダイアログ、panel: サイドバー、
// graph: 図の操作と描画、validate: データの誤り）。同じキーが 2 つの辞書にあるときは、同じ訳にする（test/i18n.test.ts）
import app from "./en-app";
import dialog from "./en-dialog";
import graph from "./en-graph";
import panel from "./en-panel";
import validate from "./en-validate";

export const PARTS: Record<string, Record<string, string>> = { app, dialog, graph, panel, validate };
export const EN: Record<string, string> = Object.assign({}, ...Object.values(PARTS));
