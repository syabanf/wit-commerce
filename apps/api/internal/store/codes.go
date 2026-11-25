package store

import "context"

// HighestCode is the highest of a brand's codes in table that are prefix followed by digits only,
// or prefix + "0" when there is none. Postgres finds it, so a brand with many rows does not load
// every code; ids.NextCode([]string{highest}, prefix, digits) is then the next free code.
func HighestCode(ctx context.Context, q Querier, table, tenantID, prefix string) (string, error) {
	var n string
	err := q.QueryRow(ctx, `select coalesce(max(substr(code, length($2) + 1)::numeric), 0)::text from `+table+`
		where tenant_id = $1 and starts_with(code, $2) and substr(code, length($2) + 1) ~ '^[0-9]+$'`, tenantID, prefix).Scan(&n)
	return prefix + n, err
}
