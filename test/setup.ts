// テスト用の DOM。配置の計算が無いので、表示領域の大きさは固定にする（文字の大きさは helpers.ts の fakeMeasure で測る）
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const proto = HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1000 });
Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 700 });
proto.setPointerCapture = () => {};
