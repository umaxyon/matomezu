package storage

import (
	"cmp"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"time"
)

// currentWorkKind は、ワークルームごとのカレントワーク（今やっているチケットの id か none）の種類
const currentWorkKind = "@matomezu/taskboard:current-work"

// fillCurrentWorks は、カレントワークのレコードの無いワークルームに、それまで画面がそのワークルームのチケットとして先頭に見せていたチケットを書く:
// 担当に入っていて、プロジェクトの作業中のレーンにあるチケットのうち、更新の新しい順・プロジェクト・番号の順で先頭の物（無ければ書かない）。
// 種類の表（rec_<n>）があればそこへ、無ければ伝えられる前の records の行に入れる（種類を伝えたときに表へ移り、索引キーも入る）
func fillCurrentWorks(tx *sql.Tx) error {
	type ticket struct {
		ID        string   `json:"id"`
		Project   string   `json:"project"`
		Number    int      `json:"number"`
		Lane      string   `json:"lane"`
		Assignees []string `json:"assignees"`
		UpdatedAt string   `json:"updatedAt"`
	}
	type project struct {
		Lanes []struct {
			Kind    string `json:"kind"`
			ID      string `json:"id"`
			Working bool   `json:"working"`
		} `json:"lanes"`
	}
	var tickets []ticket
	if err := readBodies(tx, ticketKind, func(_ string, body []byte) {
		var t ticket
		if json.Unmarshal(body, &t) == nil && t.ID != "" {
			tickets = append(tickets, t)
		}
	}); err != nil {
		return err
	}
	working := map[string]map[string]bool{} // プロジェクトの id → 作業中のレーンの id
	if err := readBodies(tx, projectKind, func(id string, body []byte) {
		var p project
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
	has := map[string]bool{}
	if err := readBodies(tx, currentWorkKind, func(id string, _ []byte) { has[id] = true }); err != nil {
		return err
	}
	slices.SortFunc(tickets, func(a, b ticket) int {
		return cmp.Or(cmp.Compare(b.UpdatedAt, a.UpdatedAt), cmp.Compare(a.Project, b.Project), cmp.Compare(a.Number, b.Number))
	})
	chosen := map[string]string{} // ワークルームの id → チケットの id
	var rooms []string
	for _, t := range tickets {
		if !working[t.Project][t.Lane] {
			continue
		}
		for _, room := range t.Assignees {
			if _, ok := chosen[room]; ok || has[room] || room == "" {
				continue
			}
			chosen[room] = t.ID
			rooms = append(rooms, room)
		}
	}
	insert := `INSERT INTO records (subject, id, body, version, updated_at) VALUES (?, ?, ?, 1, ?)`
	var n int
	switch err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, currentWorkKind).Scan(&n); err {
	case nil:
		insert = fmt.Sprintf(`INSERT INTO rec_%d (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, n)
	case sql.ErrNoRows:
	default:
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, room := range rooms {
		body, err := json.Marshal(map[string]string{"id": room, "ticket": chosen[room]})
		if err != nil {
			return err
		}
		args := []any{room, string(body), now}
		if n == 0 {
			args = append([]any{currentWorkKind}, args...)
		}
		if _, err := tx.Exec(insert, args...); err != nil {
			return err
		}
	}
	return nil
}

// readBodies は、種類 subject のレコードの id と body を 1 件ずつ each に渡す（種類の表があればその表の、伝えられる前の records の行も）
func readBodies(tx *sql.Tx, subject string, each func(id string, body []byte)) error {
	read := func(q string, args ...any) error {
		rows, err := tx.Query(q, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id, body string
			if err := rows.Scan(&id, &body); err != nil {
				return err
			}
			each(id, []byte(body))
		}
		return rows.Err()
	}
	var n int
	switch err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, subject).Scan(&n); err {
	case nil:
		if err := read(fmt.Sprintf(`SELECT id, body FROM rec_%d`, n)); err != nil {
			return err
		}
	case sql.ErrNoRows:
	default:
		return err
	}
	return read(`SELECT id, body FROM records WHERE subject = ?`, subject)
}
