package server

// 編集ロック: 窓は、利用者が直している物（伝言など）の id を、その物のあるページかブックごとに常駐に知らせる（POST /api/view の editLocks）。
// AI のアクション（と、利用者でも編集ロックで断るアクション）が、どこかの窓が知らせた物を変えるか消すなら、何も変えずに断る（being-edited）。
// 断るかはエンジンが決め（engine.Input の Watched を、どのアクションにも渡す）、ここは窓の知らせをまとめるだけ。窓が離れたら、その窓の分は消える

import "slices"

// watched は、どこかの窓で利用者が直している物（ページかブックの id → その中の物の id。無ければ nil。h.mu を持って呼ぶ）
func (h *Hub) watched() map[string][]string {
	var all map[string][]string
	for _, c := range h.clients {
		for within, ids := range c.editLocks {
			if all == nil {
				all = map[string][]string{}
			}
			for _, id := range ids {
				if !slices.Contains(all[within], id) {
					all[within] = append(all[within], id)
				}
			}
		}
	}
	return all
}

// watchedRecords は、どこかの窓で利用者が直しているレコード（対象の種類の id → レコードの id。無ければ nil。h.mu を持って呼ぶ）
func (h *Hub) watchedRecords() map[string][]string {
	var all map[string][]string
	for _, c := range h.clients {
		for subject, ids := range c.recordLocks {
			if all == nil {
				all = map[string][]string{}
			}
			for _, id := range ids {
				if !slices.Contains(all[subject], id) {
					all[subject] = append(all[subject], id)
				}
			}
		}
	}
	return all
}
