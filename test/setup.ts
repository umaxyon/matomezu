// テスト用の DOM。レイアウトの計算が無いので、大きさは文字数から決める偽物にする
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const proto = HTMLElement.prototype;
Object.defineProperty(proto, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement) {
    const w = this.style.width;
    if (w && w !== "max-content" && w !== "auto") return parseFloat(w);
    return Array.from(this.textContent ?? "").length * 9 + 16;
  },
});
Object.defineProperty(proto, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    const w = parseFloat(this.style.width) || Infinity;
    const tw = Array.from(this.textContent ?? "").length * 9;
    return Math.max(1, Math.ceil(tw / Math.max(1, w - 16))) * 18 + 8;
  },
});
Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1000 });
Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 700 });
proto.setPointerCapture = () => {};
