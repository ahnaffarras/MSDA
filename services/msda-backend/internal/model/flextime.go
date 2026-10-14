package model

import (
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/bsontype"
	"go.mongodb.org/mongo-driver/x/bsonx/bsoncore"
)

// FlexTime membaca field waktu yang di MongoDB bisa tersimpan sebagai
// BSON Date ATAU string ISO-8601.
//
// Koleksi ip_access_dns ditulis n8n; node MongoDB n8n menyimpan string ISO apa
// adanya (lihat data-struktur/STRUCTURE.md), sedangkan time.Time biasa hanya
// bisa membaca BSON Date dan akan error pada string.
type FlexTime struct {
	time.Time
}

func (t *FlexTime) UnmarshalBSONValue(bt bsontype.Type, data []byte) error {
	switch bt {
	case bsontype.DateTime:
		ms, _, ok := bsoncore.ReadDateTime(data)
		if !ok {
			return fmt.Errorf("flextime: invalid datetime")
		}
		t.Time = time.UnixMilli(ms).UTC()
	case bsontype.String:
		s, _, ok := bsoncore.ReadString(data)
		if !ok {
			return fmt.Errorf("flextime: invalid string")
		}
		if s == "" {
			t.Time = time.Time{}
			return nil
		}
		parsed, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return fmt.Errorf("flextime: %w", err)
		}
		t.Time = parsed.UTC()
	case bsontype.Null:
		t.Time = time.Time{}
	default:
		return fmt.Errorf("flextime: unsupported bson type %s", bt)
	}
	return nil
}

func (t FlexTime) MarshalBSONValue() (bsontype.Type, []byte, error) {
	return bsontype.DateTime, bsoncore.AppendDateTime(nil, t.Time.UnixMilli()), nil
}
