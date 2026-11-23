// Package peer は、ホストどうしのつなぎの部品: ホストの鍵とホスト id、ホストどうしの入口の TLS（相手の鍵の固定）、ホストどうしの約束の版。
// matomezu のほかのパッケージを読まない（鍵の置き場所は呼ぶ側が渡す）
package peer

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

// Protocol は、ホストどうしの約束の版。ペアリングと運ぶときに確かめ、合わなければ断る
const Protocol = 1

// Identity は、このホストの鍵: TLS で見せる証明書と、その公開鍵から決まるホスト id
type Identity struct {
	Cert   tls.Certificate
	HostID string
}

const keyPEMType = "PRIVATE KEY"

// LoadOrCreate は、path の秘密鍵を読む。無ければ作って、本人だけが読める権限で書く。
// 証明書は読むたびに鍵から作り直す（ホスト id は公開鍵だけで決まるので、証明書の期限や作り直しで変わらない）
func LoadOrCreate(path string) (*Identity, error) {
	key, err := readKey(path)
	if errors.Is(err, os.ErrNotExist) {
		key, err = createKey(path)
	}
	if err != nil {
		return nil, err
	}
	return identityOf(key)
}

func readKey(path string) (ed25519.PrivateKey, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(b)
	if block == nil || block.Type != keyPEMType {
		return nil, fmt.Errorf("%s is not a host key", path)
	}
	k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	key, ok := k.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("%s is not an ed25519 key", path)
	}
	return key, nil
}

func createKey(path string) (ed25519.PrivateKey, error) {
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	// 書きかけを読ませないよう、別名に書いてから置き換える
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, pem.EncodeToMemory(&pem.Block{Type: keyPEMType, Bytes: der}), 0o600); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, path); err != nil {
		return nil, err
	}
	return key, nil
}

// certYears は、作る証明書の期限の長さ。相手は証明書の期限を見ず、公開鍵だけで確かめる
const certYears = 100

func identityOf(key ed25519.PrivateKey) (*Identity, error) {
	now := time.Now()
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "matomezu host"},
		NotBefore:    now.Add(-time.Hour),
		NotAfter:     now.AddDate(certYears, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, key.Public(), key)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	return &Identity{
		Cert:   tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: cert},
		HostID: HostIDOf(cert),
	}, nil
}

// HostIDOf は、証明書の公開鍵（SubjectPublicKeyInfo）の指紋: SHA-256 の 16 進（小文字 64 字）
func HostIDOf(cert *x509.Certificate) string {
	sum := sha256.Sum256(cert.RawSubjectPublicKeyInfo)
	return hex.EncodeToString(sum[:])
}
