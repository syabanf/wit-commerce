package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/catalog"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
)

// ProductImportInput is a dry run: the file, its delimiter ("," or ";", empty to detect) and the
// column mapping from file column to field.
type ProductImportInput struct {
	TenantID  string            `json:"tenantId"`
	FileName  string            `json:"fileName"`
	CSV       string            `json:"csv"`
	Delimiter string            `json:"delimiter"`
	Mapping   map[string]string `json:"mapping"`
}

// ImportPlan is what the dry run found: products it will create, update or leave as they are, and
// rows it refused.
type ImportPlan struct {
	Create    int `json:"create"`
	Update    int `json:"update"`
	Unchanged int `json:"unchanged"`
	Invalid   int `json:"invalid"`
}

// ProductImport is an import's state: its plan, how far apply has come and what it did.
type ProductImport struct {
	ID         string        `json:"id"`
	TenantID   string        `json:"tenantId"`
	FileName   string        `json:"fileName"`
	Status     string        `json:"status"`
	Rows       int           `json:"rows"`
	Total      int           `json:"total"`
	Next       int           `json:"next"`
	Plan       ImportPlan    `json:"plan"`
	Created    int           `json:"created"`
	Updated    int           `json:"updated"`
	Unchanged  int           `json:"unchanged"`
	Skipped    int           `json:"skipped"`
	Issues     []ImportIssue `json:"issues"`
	CreatedAt  time.Time     `json:"createdAt"`
	FinishedAt *time.Time    `json:"finishedAt,omitempty"`
}

// PlanProductImport validates every row against the catalog and stores the valid products for
// apply. Nothing in the catalog changes. A product with any refused row is left out whole.
func (s *Service) PlanProductImport(ctx context.Context, m Meta, in ProductImportInput) (ProductImport, error) {
	if err := kernel.Access(m, in.TenantID); err != nil {
		return ProductImport{}, err
	}
	if len(in.CSV) > ImportMaxBytes {
		return ProductImport{}, kernel.Invalid{Reason: "The file is over 5 MB. Split it and import each part."}
	}
	groups, rows, issues, err := parseProductCSV([]byte(in.CSV), in.Delimiter, in.Mapping)
	if err != nil {
		return ProductImport{}, err
	}
	out := ProductImport{ID: ids.New("pim"), TenantID: in.TenantID, FileName: in.FileName, Status: "ready", Rows: rows}
	var valid []importGroup
	_, err = s.Run(ctx, func(t *kernel.Tx) error {
		v, err := loadCatalogView(t, in.TenantID)
		if err != nil {
			return err
		}
		dupes := duplicateSKUs(groups)
		for _, g := range groups {
			bad := dupes[strings.ToLower(g.Handle)]
			built, refused := v.build(g, m, func(prefix string) string { return prefix + "-new" })
			if len(bad)+len(refused) > 0 {
				issues = append(issues, bad...)
				issues = append(issues, refused...)
				out.Plan.Invalid++
				continue
			}
			valid = append(valid, g)
			switch {
			case built.created:
				out.Plan.Create++
			case built.changed:
				out.Plan.Update++
			default:
				out.Plan.Unchanged++
			}
		}
		out.Total = len(valid)
		out.Issues = issues
		if out.Issues == nil {
			out.Issues = []ImportIssue{}
		}
		groupsJSON, err := json.Marshal(valid)
		if err != nil {
			return err
		}
		plan, _ := json.Marshal(out.Plan)
		issuesJSON, _ := json.Marshal(out.Issues)
		return t.QueryRow(t.Ctx, `insert into product_imports (id, tenant_id, created_by, file_name, groups, total, rows, plan, issues)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning created_at`,
			out.ID, in.TenantID, m.By(), in.FileName, groupsJSON, out.Total, rows, plan, issuesJSON).Scan(&out.CreatedAt)
	})
	return out, err
}

// duplicateSKUs finds SKUs on more than one row of the file and names the products holding the
// repeats, by lowercased handle.
func duplicateSKUs(groups []importGroup) map[string][]ImportIssue {
	firstLine := map[string]int{}
	out := map[string][]ImportIssue{}
	for _, g := range groups {
		for _, r := range g.Rows {
			sku := strings.ToUpper(r.Cells["sku"])
			if sku == "" {
				continue
			}
			if line, seen := firstLine[sku]; seen {
				key := strings.ToLower(g.Handle)
				out[key] = append(out[key], ImportIssue{Line: r.Line, Handle: g.Handle, SKU: sku, Column: "sku",
					Message: fmt.Sprintf("SKU %s is already on line %d.", sku, line)})
				continue
			}
			firstLine[sku] = r.Line
		}
	}
	return out
}

// ProductImportStatus reads an import.
func (s *Service) ProductImportStatus(ctx context.Context, m Meta, id string) (ProductImport, error) {
	var out ProductImport
	_, err := s.Run(ctx, func(t *kernel.Tx) error {
		var err error
		out, _, err = loadImport(t, id, false)
		return err
	})
	if err != nil {
		return out, err
	}
	return out, kernel.Access(m, out.TenantID)
}

func loadImport(t *kernel.Tx, id string, lock bool) (ProductImport, []importGroup, error) {
	var out ProductImport
	var groups, plan, issues []byte
	sql := `select id, tenant_id, file_name, status, rows, total, next_index, plan, created, updated, unchanged, skipped,
		issues, created_at, finished_at, groups from product_imports where id = $1`
	if lock {
		sql += " for update"
	}
	err := t.QueryRow(t.Ctx, sql, id).Scan(&out.ID, &out.TenantID, &out.FileName, &out.Status, &out.Rows, &out.Total, &out.Next,
		&plan, &out.Created, &out.Updated, &out.Unchanged, &out.Skipped, &issues, &out.CreatedAt, &out.FinishedAt, &groups)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil, kernel.NotFound{What: "import"}
	}
	if err != nil {
		return out, nil, err
	}
	var all []importGroup
	if err := errors.Join(json.Unmarshal(plan, &out.Plan), json.Unmarshal(issues, &out.Issues)); err != nil {
		return out, nil, err
	}
	if lock {
		if err := json.Unmarshal(groups, &all); err != nil {
			return out, nil, err
		}
	}
	return out, all, nil
}

// ApplyProductImport applies the next batch of an import's products in one transaction, through
// the same writes as products/save and stock/adjust, each product with its own audit row. A product
// that no longer passes (a SKU taken since the dry run, stock below what is reserved) is skipped
// with its reason. Call it until the status is done; an import cut off midway carries on.
func (s *Service) ApplyProductImport(ctx context.Context, m Meta, id string, batch int) (ProductImport, *Delta, error) {
	if batch <= 0 || batch > ImportBatch {
		batch = ImportBatch
	}
	var out ProductImport
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		job, groups, err := loadImport(t, id, true)
		if err != nil {
			return err
		}
		if err := kernel.Access(m, job.TenantID); err != nil {
			return err
		}
		out = job
		if job.Status == "done" {
			return nil
		}
		v, err := loadCatalogView(t, job.TenantID)
		if err != nil {
			return err
		}
		end := min(job.Next+batch, len(groups))
		for _, g := range groups[job.Next:end] {
			if why, err := s.applyGroup(t, m, v, g, &out); err != nil {
				return err
			} else if why != nil {
				out.Skipped++
				out.Issues = append(out.Issues, why...)
			}
		}
		out.Next = end
		out.Status = "applying"
		if end == len(groups) {
			out.Status = "done"
			now := time.Now()
			out.FinishedAt = &now
		}
		issues, _ := json.Marshal(out.Issues)
		_, err = t.Exec(t.Ctx, `update product_imports set status = $2, next_index = $3, created = $4, updated = $5,
			unchanged = $6, skipped = $7, issues = $8, finished_at = $9 where id = $1`,
			id, out.Status, out.Next, out.Created, out.Updated, out.Unchanged, out.Skipped, issues, out.FinishedAt)
		return err
	})
	return out, d, err
}

// applyGroup writes one product and its stock cells. Refusals come back as issues and leave the
// transaction usable: every check runs before the first write.
func (s *Service) applyGroup(t *kernel.Tx, m Meta, v *catalogView, g importGroup, out *ProductImport) ([]ImportIssue, error) {
	built, issues := v.build(g, m, ids.New)
	if len(issues) > 0 {
		return issues, nil
	}
	if !built.changed {
		out.Unchanged++
		return nil, nil
	}
	p := built.product
	t.AuditAs("products/import", "products", p.ID)
	if !built.created {
		if _, err := catalog.LockProduct(t, p.ID); err != nil {
			return nil, err
		}
	}
	reservedBlock := ""
	for _, st := range built.stock {
		if lvl, ok := v.reserved[[2]string{variantID(p, st.sku), st.warehouseID}]; ok && st.onHand < lvl {
			reservedBlock = fmt.Sprintf("Stock of %s cannot drop below the %d units reserved for open orders.", st.sku, lvl)
		}
	}
	if reservedBlock != "" {
		return []ImportIssue{{Line: g.Rows[0].Line, Handle: g.Handle, Message: reservedBlock}}, nil
	}
	if err := catalog.PutProduct(t, m, p); err != nil {
		return nil, err
	}
	for _, st := range built.stock {
		vid := variantID(p, st.sku)
		if err := inventory.SetOnHand(t, m, p.TenantID, p.ID, vid, st.warehouseID, st.onHand, "CSV import"); err != nil {
			return nil, err
		}
		v.onHand[[2]string{vid, st.warehouseID}] = st.onHand
	}
	v.remember(p)
	if built.created {
		out.Created++
	} else {
		out.Updated++
	}
	return nil, nil
}

func sameJSONValue(a, b any) bool {
	x, err1 := json.Marshal(a)
	y, err2 := json.Marshal(b)
	return err1 == nil && err2 == nil && bytes.Equal(x, y)
}
