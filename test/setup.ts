// テスト用の DOM。配置の計算が無いので、表示領域の大きさは固定にする（文字の大きさは helpers.ts の fakeMeasure で測る）
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const proto = HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1000 });
Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 700 });
proto.setPointerCapture = () => {};

// 画面の文言は日本語で確かめる（happy-dom のブラウザの言語は英語。i18n.ts は読み込んだときに言語を決める）
localStorage.setItem("matomezu.lang", "ja");
