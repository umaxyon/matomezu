package server

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/umaxyon/matomezu/internal/engine"
)

// rejoinAsked は、受け入れ済みの参加者 id が参加を頼み直したときに、頼み直しを書くアクション action（役 rejoin-participant。無ければ何もしない）を、
// 利用者としてその参加者のレコードに行う。引数は参加を頼むときと同じで、何を書き換えるかはアクションが決める。
// 断られても、参加者のまま答える（頼み直しを断らない）ので、断りは常駐の記録に出すだけにする。h.joinMu を持って呼ぶ
func (h *Hub) rejoinAsked(action, id string, req JoinRequest) error {
	if action == "" {
		return nil
	}
	args, err := json.Marshal(req.askedArgs())
	if err != nil {
		return err
	}
	done, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: action, Args: args, On: &engine.On{Record: id}}}})
	if err != nil {
		return err
	}
	if !done.OK {
		fmt.Fprintln(os.Stderr, "join: the rejoin of participant", id, "was not written:", done.Reason, done.Detail)
	}
	return nil
}
