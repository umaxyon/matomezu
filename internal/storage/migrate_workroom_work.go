package storage

import (
	"database/sql"
	"encoding/json"
	"slices"
)

// fillWorkroomWorks は、今の作業の写し work の無いワークルームのレコードに、タスクボードがそのワークルームの作業と答えるチケットを書く:
// カレントワークのチケットが在り、そのワークルームが担当で、プロジェクトの作業中の印のあるレーンにある物（taskboard の currentTicketOf と同じ。無ければ書かない）。
// 書かないと、作業の替わりのフォローステップが、初めて答え直したときに、作業が無かった所から替わったと見る（誤った知らせを送り、引継ぎ対象チケットも付かない）
func fillWorkroomWorks(tx *sql.Tx) error {
	type ticket struct {
		Project   string   `json:"project"`
		Lane      string   `json:"lane"`
		Assignees []string `json:"assignees"`
	}
	tickets := map[string]ticket{}
	if err := readBodies(tx, ticketKind, func(id string, body []byte) {
		var t ticket
		if json.Unmarshal(body, &t) == nil {
			tickets[id] = t
		}
	}); err != nil {
		return err
	}
	working := map[string]map[string]bool{} // プロジェクトの id → 作業中の印のあるレーンの id
	if err := readBodies(tx, projectKind, func(id string, body []byte) {
		var p struct {
			Lanes []struct {
				Kind    string `json:"kind"`
				ID      string `json:"id"`
				Working bool   `json:"working"`
			} `json:"lanes"`
		}
		if json.Unmarshal(body, &p) != nil {
			return
		}
		lanes := map[string]bool{}
		for _, l := range p.Lanes {
			if l.Kind == "lane" && l.Working {
				lanes[l.ID] = true
			}
		}
		working[id] = lanes
	}); err != nil {
		return err
	}
	current := map[string]string{} // ワークルームの id → カレントワークのチケットの id
	if err := readBodies(tx, currentWorkKind, func(id string, body []byte) {
		var w struct {
			Ticket string `json:"ticket"`
		}
		if json.Unmarshal(body, &w) == nil {
			current[id] = w.Ticket
		}
	}); err != nil {
		return err
	}
	return rewriteBodies(tx, workroomKind, func(room map[string]json.RawMessage) bool {
		var id string
		if _, has := room["work"]; has || json.Unmarshal(room["id"], &id) != nil {
			return false
		}
		t, ok := tickets[current[id]]
		if !ok || !slices.Contains(t.Assignees, id) || !working[t.Project][t.Lane] {
			return false
		}
		key, err := json.Marshal(map[string]string{"subject": ticketKind, "id": current[id]})
		if err != nil {
			return false
		}
		room["work"] = key
		return true
	})
}
