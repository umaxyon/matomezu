//go:build embed

package server

import (
	"net/http"

	"github.com/umaxyon/matomezu/internal/engine"
)

// rejoinPasses は、リリースの実行ファイルでは何も持たない（開発用の再参加の承認は rejoin_pass.go）
type rejoinPasses struct{}

// routesForDev は、リリースの実行ファイルでは何も足さない
func routesForDev(*http.ServeMux, Options) {}

// joinByPass は、リリースの実行ファイルではいつも ok が false（参加の要求として、利用者が画面で受け入れる）
func (h *Hub) joinByPass(JoinRequest, *engine.JoinActions, string, string) (Joined, bool, error) {
	return Joined{}, false, nil
}
