// Package aiwire は、mcp とホストの AI の口（/api/ai/...）で同じでなければならない値（ヘッダの名前と、答えの値）
package aiwire

const (
	// ParticipantHeader は、MCP が join の返事で受けた参加の id を添えるヘッダ
	ParticipantHeader = "X-Matomezu-Participant"
	// NoticeHeader は、ホストが AI への知らせを返すヘッダ（値は URL エンコード）
	NoticeHeader = "X-Matomezu-Notice"
	// BranchHeader は、MCP が git のブランチを添えるヘッダ（値は URL エンコード。参加の id を添えるときはいつも添え、空はブランチが無い）
	BranchHeader = "X-Matomezu-Branch"
	// HostHeader は、MCP が AI のプログラムのプロセス id を添えるヘッダ（join も含めていつも）
	HostHeader = "X-Matomezu-Host"
	// HostSessionHeader は、MCP が、AI のプログラムが MCP を立てたときのセッション id を添えるヘッダ（分かるときだけ。/clear でも変わらない。起こす知らせの宛て先で、参加の id が無い呼び出しでは、常駐がこれに結ばれた参加者を呼び出しの参加者にする）
	HostSessionHeader = "X-Matomezu-Host-Session"
	// SessionPidHeader は、MCP が、セッションと同じだけ生きるプロセスの id を名乗るヘッダ（居なくなればセッションが終わった。名乗らない MCP の参加者は、プロセスでは見ない）
	SessionPidHeader = "X-Matomezu-Session-Pid"
	// SessionPidSpaceHeader は、セッションのプロセスを名乗った MCP が、プロセス id が通じる範囲の印を添えるヘッダ（ホストが同じ印のときだけ、居るかを確かめる）
	SessionPidSpaceHeader = "X-Matomezu-Session-Pid-Space"
	// ModelHeader は、MCP が、呼び出しが運んだモデルを添えるヘッダ（値は URL エンコード。参加の id と一緒に、呼び出しの _meta にモデルがあったときだけ）
	ModelHeader = "X-Matomezu-Model"
	// WorkTitleHeader は、ホストが、呼び出しの参加者のセッション名に書く作業名を返すヘッダ（値は URL エンコード。書かないなら無い。
	// 呼び出しを終えたあとの作業名。MCP は、変わったら ADE のワークスペースの表示名に書く）
	WorkTitleHeader = "X-Matomezu-Work-Title"
)

// BulkMax は、AI が perform の 1 回で並べて頼めるアクションの数
const BulkMax = 10

// AI 間メッセージを受けたときの、いつ渡るか（send_message の答えの delivers）
const (
	DeliversNow      = "now"       // 起こす知らせを渡せる matomezu watch がつながっていて、すぐ渡す
	DeliversNextCall = "next-call" // 宛て先の AI が次に matomezu を呼んだときの返事で渡す
	DeliversUnknown  = "unknown"   // 分からない（古い版の常駐やほかのホストが受けた）
)

// KnownDelivers は、受け取った delivers の値 v を、知っている値に揃える（無いか知らない値なら DeliversUnknown）
func KnownDelivers(v string) string {
	if v == DeliversNow || v == DeliversNextCall {
		return v
	}
	return DeliversUnknown
}

// アセット（画像のバイト列）を受ける口（画面の /api/assets と AI の /api/ai/assets）の、大きさの上限と、受けない理由（答えの reason）
const (
	MaxAsset      = 25 << 20
	AssetTooLarge = "too-large" // 上限を超える
	AssetNotImage = "not-image" // 受ける種類の画像として読めない
)
