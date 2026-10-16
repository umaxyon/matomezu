// タブの列の横スクロール（G5。2026-10-17 ユーザー）。ページが多くてタブがはみ出したときに:
// - タブの上の縦のホイールで横にスクロールする（ふつうのマウスでも動かせる。Shift やトラックパッドの横の動きはブラウザのまま）
// - 先にタブがある側の端をぼかす（スクロールできることが見えるように。index.html の .tabs.fade-left / .fade-right）
// - 選んでいるタブ（ツアーや AI の操作で移ったページも）を、見える位置までスクロールする
export function setupTabScroll(tabs: HTMLElement): void {
  const fade = () => {
    const max = tabs.scrollWidth - tabs.clientWidth;
    tabs.classList.toggle("fade-left", tabs.scrollLeft > 1);
    tabs.classList.toggle("fade-right", tabs.scrollLeft < max - 1);
  };
  tabs.addEventListener("wheel", e => {
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  }, { passive: false });
  tabs.addEventListener("scroll", fade, { passive: true });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fade).observe(tabs);
  // タブが増えた・減った・選び直された・グループが切り替わった
  new MutationObserver(list => {
    if (list.some(m => m.type === "attributes" && m.attributeName === "aria-selected" && (m.target as Element).getAttribute("aria-selected") === "true")
      || list.some(m => m.type === "attributes" && m.attributeName === "class" && (m.target as Element).classList.contains("tab-group"))) {
      const on = tabs.querySelector<HTMLElement>('.tab-group-current .tab[aria-selected="true"]');
      on?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    fade();
  }).observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "class"] });
  fade();
}
