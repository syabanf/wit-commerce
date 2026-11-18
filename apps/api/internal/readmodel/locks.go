package readmodel

import "context"

// lockKeys takes a transaction-scoped advisory lock on each key. Two writes that derive the same
// rows (a sales day, a sales month, a customer's metrics) then run one after the other: the second
// waits for the first to commit, and its next statement reads what the first wrote instead of both
// deleting and inserting the same rows. The locks go in one order, by their hash, so two writes
// never wait on each other crosswise. Across kinds, a write locks customers before days and days
// before months.
func lockKeys(ctx context.Context, q Querier, keys []string) error {
	if len(keys) == 0 {
		return nil
	}
	_, err := q.Exec(ctx, `select pg_advisory_xact_lock(h) from (
		select distinct hashtextextended(k, 0) h from unnest($1::text[]) k order by h) s`, keys)
	return err
}

// pairKeys names a lock for each tenant and day or month, as kind:tenant:key.
func pairKeys(kind string, tenants, keys []string) []string {
	out := make([]string, len(tenants))
	for i := range tenants {
		out[i] = kind + ":" + tenants[i] + ":" + keys[i]
	}
	return out
}
