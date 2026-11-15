// Package deliver は、opencode の会話に matomezu の起こす知らせを渡す（matomezu deliver opencode の中身）。
// opencode の TUI は、マシンに 1 つのサーバー（opencode serve --service）につなぐ。サーバーは動いている間、状態のフォルダ（$XDG_STATE_HOME/opencode、
// 無ければ ~/.local/state/opencode）の service.json に、待ち受けの url と Basic 認証の鍵を置く。そこへ POST /api/session/{セッション id}/synthetic で本文を送る。
// 送った本文は利用者の発言でない入力（synthetic）としてその会話に入り（入力を待っている会話は動き出し、生成中の会話には割り込む）、TUI には説明（description）だけが出る。
// サーバーは受け付けた時点で答える。本文には起こす知らせの印（WakeMetadata）を付け、clients/opencode のプラグインが、そのターンの最初のモデルの呼び出しで見分ける。
// service.json が無い・サーバーにつながらない・会話が無いときは Absent（その AI のプログラムに会話が無い。matomezu は次の呼び出しの返事で渡す）。
// つながったのに断られたときは Failed。matomezu の常駐やほかのパッケージは読まない
package deliver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Result は渡した結果
type Result string

const (
	Delivered Result = "delivered" // 渡せた
	Absent    Result = "absent"    // そのサーバーに会話が無い（サーバーが動いていない・つながらないときも）
	Failed    Result = "failed"    // つながったのに渡せなかった
)

// WakeMetadata は、送る本文に付ける起こす知らせの印（opencode の発言の metadata。プラグインが同じ印を見る）
var WakeMetadata = map[string]string{"matomezu": "wake"}

// description は、TUI に入力の代わりに出る説明
const description = "matomezu"

// delivery は、生成中の会話への渡し方（steer は生成中のターンに割り込む。queue はターンの終わりまで待たせる）
const delivery = "steer"

// user は、opencode のサーバーの Basic 認証のユーザー名
const user = "opencode"

// sessionNotFound は、会話が無いときにサーバーが返す誤りの印（404 の本文の _tag）
const sessionNotFound = "SessionNotFoundError"

// ServicePath は、状態のフォルダ stateHome（XDG_STATE_HOME。空なら ~/.local/state）の、opencode のサーバーの service.json
func ServicePath(stateHome string) string {
	if stateHome == "" {
		home, _ := os.UserHomeDir()
		stateHome = filepath.Join(home, ".local", "state")
	}
	return filepath.Join(stateHome, "opencode", "service.json")
}

// service は、service.json のうち使う所
type service struct {
	URL      string `json:"url"`
	Password string `json:"password"`
}

// Deliver は、service.json（path）のサーバーが持つ会話 session に、本文 text を渡す
func Deliver(ctx context.Context, path, session, text string) (Result, error) {
	if session == "" {
		return Absent, errors.New("no session id of the conversation")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return Absent, err
	}
	var s service
	if err := json.Unmarshal(b, &s); err != nil || s.URL == "" {
		return Absent, fmt.Errorf("%s has no url of the opencode server", path)
	}
	body, _ := json.Marshal(map[string]any{"text": text, "description": description, "metadata": WakeMetadata, "delivery": delivery})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(s.URL, "/")+"/api/session/"+url.PathEscape(session)+"/synthetic", bytes.NewReader(body))
	if err != nil {
		return Absent, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(user, s.Password)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		// サーバーが止まって service.json だけが残っているときも、ここに来る
		return Absent, err
	}
	defer res.Body.Close()
	answer, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
	if res.StatusCode == http.StatusOK {
		return Delivered, nil
	}
	var refused struct {
		Tag string `json:"_tag"`
	}
	if res.StatusCode == http.StatusNotFound && json.Unmarshal(answer, &refused) == nil && refused.Tag == sessionNotFound {
		return Absent, fmt.Errorf("the opencode server does not have conversation %s", session)
	}
	return Failed, fmt.Errorf("the opencode server answered %s: %s", res.Status, strings.TrimSpace(string(answer)))
}
