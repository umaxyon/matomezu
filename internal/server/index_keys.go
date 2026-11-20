package server

// 種類の索引キーで探す条件の確かめ（AI のレコードの一覧と横断検索が使う）

import (
	"fmt"
	"strings"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// keyIndex は、種類の索引キーの名前（宣言の順）と型（名前 → "text" か "number"）
type keyIndex struct {
	names []string
	types map[string]string
}

func keyIndexOf(kind engine.Kind) keyIndex {
	k := keyIndex{names: make([]string, 0, len(kind.Keys)), types: map[string]string{}}
	for _, key := range kind.Keys {
		k.names = append(k.names, key.Name)
		k.types[key.Name] = key.Type
	}
	return k
}

// typeOf は、名前 name の索引キーの型。索引キーでなければ、断りの文（of は断りの文で種類を指す言葉）
func (k keyIndex) typeOf(name, of string) (typ string, refusal string) {
	typ, has := k.types[name]
	if !has {
		return "", fmt.Sprintf("%s is not an index key of %s (its index keys: %s)", name, of, strings.Join(k.names, ", "))
	}
	return typ, ""
}

// isCond は、名前 name の索引キーに値が無い（absent）か、ある（present）かの条件。is がどちらでもなければ、断りの文
func isCond(name, is string) (storage.Cond, string) {
	if is != "absent" && is != "present" {
		return storage.Cond{}, "is takes absent or present"
	}
	return storage.Cond{Key: name, Op: is}, ""
}
