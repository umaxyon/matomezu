// タブ行のモードのボタンの絵（D39）: 3 つのモード（選択・付け替え・手のひら）を輪に並べ、今のモードを手前に大きく、
// 残りの 2 つを左右の後ろに小さく薄く、少し下げて控えさせる。手前には薄い色の丸を敷く（index.html の #mode-tool::before）。右が次（押すと来る）、左が前。モードが変わったら輪を回して入れ替える
// （ボタンを押したときも、右の長押しや Space で変わったときも。近い向きへ 1 つ分回す）。追加のモードは選択の絵で見せる
import type { Mode } from "./graph";
import { modeIcon } from "./mode-icons";

const RING: Mode[] = ["move", "reparent", "pan"]; // 回る順（押すと右隣が手前に来る）
// 左右の控えの位置（手前から 120 度）で、真ん中から 20px 横、4px 下になる値。20px は手前の丸（半径 13px。index.html）に
// 控えの絵（18px の 0.7 倍の半分で 6.3px）が被らない離れ
const R = 20 / Math.sin(Math.PI / 3); // 輪の半径（px）
const DROP = 4 / 0.75;                // 奥に回ったときに下げる量（真後ろで。px）
const TURN_MS = 260;   // 1 つ分回す時間

// 角度（手前が 0、右回りに正）での見え方。奥ほど小さく薄く、少し下がって後ろに回る
function look(deg: number): Keyframe {
  const a = (deg * Math.PI) / 180, front = (1 + Math.cos(a)) / 2; // 手前 1、真後ろ 0
  return {
    transform: `translate(${(R * Math.sin(a)).toFixed(2)}px, ${(DROP * (1 - front)).toFixed(2)}px) scale(${(0.6 + 0.4 * front).toFixed(3)})`,
    opacity: (0.22 + 0.78 * front ** 2).toFixed(3),
    zIndex: String(Math.round(1 + 9 * front)),
  };
}

const wheels = new WeakMap<HTMLElement, { icons: HTMLElement[]; turn: number }>(); // turn は手前にある RING の番号を 120 度の段で数えた値

// ボタンの絵を m に合わせる。animate なら輪を回して入れ替える
export function showModeWheel(button: HTMLElement, m: Mode, animate: boolean): void {
  let w = wheels.get(button);
  if (!w || !button.contains(w.icons[0]!)) {
    button.textContent = "";
    button.classList.add("mode-wheel");
    const icons = RING.map(r => {
      const s = document.createElement("span");
      s.className = "mode-wheel-icon";
      s.dataset.mode = r;
      s.innerHTML = modeIcon(r);
      button.appendChild(s);
      return s;
    });
    w = { icons, turn: 0 };
    wheels.set(button, w);
    animate = false;
  }
  const want = RING.indexOf(m === "add" ? "move" : m);
  const now = ((w.turn % 3) + 3) % 3;
  const step = want === now ? 0 : want === (now + 1) % 3 ? 1 : -1; // 次なら右から、前なら左から
  const from = w.turn;
  w.turn += step;
  w.icons.forEach((el, i) => {
    const angle = (turn: number) => (i - turn) * 120; // 手前からの角度
    const end = look(angle(w.turn));
    // 角度を -180〜180 に収めて置く（同じ段のまま回り続けても値が膨らまないように）
    const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
    if (animate && step !== 0 && typeof el.animate === "function") {
      const a0 = norm(angle(from)), frames: Keyframe[] = [];
      for (let k = 0; k <= 6; k++) frames.push(look(a0 - (step * 120 * k) / 6));
      el.animate(frames, { duration: TURN_MS, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" });
    }
    Object.assign(el.style, end);
    el.classList.toggle("mode-wheel-front", angle(w.turn) % 360 === 0);
  });
}
