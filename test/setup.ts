// テスト用の DOM。配置の計算が無いので、表示領域の大きさは固定にする（文字の大きさは helpers.ts の fakeMeasure で測る）
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const proto = HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1000 });
Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 700 });
proto.setPointerCapture = () => {};
// 位置から要素を引く関数は happy-dom に無い。配置の計算が無いので、どの位置にも何も無いとする（ドラッグで相手の箱を探すときに使う）
document.elementsFromPoint ??= () => [];

// 画面の文言は日本語で確かめる（happy-dom のブラウザの言語は英語。i18n.ts は読み込んだときに言語を決める）
localStorage.setItem("matomezu.lang", "ja");

// 図の周りの余白（D32）は 0 にして測る（配置の計算を確かめるテストは、ワールドが表示領域の左上にある前提）。
// 余白を確かめるテストは createGraph に margin を渡す。graph を読み込むと画面の言語が決まるので、言語を日本語にしたあとで読み込む
const { DEFAULTS } = await import("../web/src/graph");
DEFAULTS.margin = 0;
// 紙（D33）は製品と同じく使う（ふつうのページは既定の紙 A4 横）。紙の無い動き（マスター）を確かめるテストだけ、createGraph に paper: false を渡し、
// テスト名にそう書く（2026-10-17 ユーザー。以前は全部を紙なしで流していた）
DEFAULTS.paper = true;
