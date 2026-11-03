// ステージ stage の表示領域の要素（ステージのビューが data-stage に id を付けて描く。描いていなければ null）
export const stageElement = (stage: string): Element | null =>
  document.querySelector(`[data-stage="${CSS.escape(stage)}"]`)
