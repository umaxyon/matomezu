// Package aiwire は、mcp とホストの AI の口（/api/ai/...）で同じでなければならない値（ヘッダの名前）
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
	// HostSessionHeader は、MCP が、AI のプログラムが MCP を立てたときのセッション id を添えるヘッダ（分かるときだけ。/clear でも変わらない。起こす知らせの宛て先）
	HostSessionHeader = "X-Matomezu-Host-Session"
	// SessionPidHeader は、MCP が、セッションと同じだけ生きるプロセスの id を名乗るヘッダ（居なくなればセッションが終わった。名乗らない MCP の参加者は、プロセスでは見ない）
	SessionPidHeader = "X-Matomezu-Session-Pid"
	// SessionPidSpaceHeader は、セッションのプロセスを名乗った MCP が、プロセス id が通じる範囲の印を添えるヘッダ（ホストが同じ印のときだけ、居るかを確かめる）
	SessionPidSpaceHeader = "X-Matomezu-Session-Pid-Space"
	// ModelHeader は、MCP が、呼び出しが運んだモデルを添えるヘッダ（値は URL エンコード。参加の id と一緒に、呼び出しの _meta にモデルがあったときだけ）
	ModelHeader = "X-Matomezu-Model"
)
