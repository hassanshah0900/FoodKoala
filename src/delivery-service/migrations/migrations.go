// Package migrations holds the SQL migrations of the `delivery` schema, embedded in the binary.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
