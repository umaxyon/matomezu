package server

// 編集ロック: 窓は、利用者が直している物（伝言など）の id を、ブックごとに常駐に知らせる（POST /api/view の editLocks）。
// AI のアクションが、どこかの窓が知らせた物を変えるか消すなら、何も変えずに断る（being-edited）。利用者のアクションは断らない。
// 変わったかはエンジンが比べ（engine.Input の Watched と、Output の Touched）、ここは窓の知らせをまとめるだけ。窓が離れたら、その窓の分は消える

import "slices"

// watched は、どこかの窓で利用者が直している物（ブックの id → 物の id。無ければ nil。h.mu を持って呼ぶ）
func (h *Hub) watched() map[string][]string {
	var all map[string][]string
	for _, c := range h.clients {
		for book, ids := range c.editLocks {
			if all == nil {
				all = map[string][]string{}
			}
			for _, id := range ids {
				if !slices.Contains(all[book], id) {
					all[book] = append(all[book], id)
				}
			}
		}
	}
	return all
}
