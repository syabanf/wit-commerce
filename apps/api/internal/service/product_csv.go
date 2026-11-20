package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/catalog"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
)

// The product CSV: one row per variant. Product columns repeat on every row of a product; on import
// the first non-empty value of a product's rows wins. handle is the product code.

// CSVBOM starts every CSV the API writes, so Excel opens it as UTF-8.
const CSVBOM = "\ufeff"

// CSVDelimiter is ';' when asked for, ',' otherwise.
func CSVDelimiter(v string) rune {
	if v == ";" || v == "semicolon" {
		return ';'
	}
	return ','
}

// formulaStart are the first characters that make a spreadsheet read a cell as a formula.
const formulaStart = "=+-@\t\r"

// CSVSafe prefixes a cell that a spreadsheet would run as a formula with an apostrophe. The import
// takes the apostrophe off again, so an export reads back unchanged.
func CSVSafe(cells []string) []string {
	for i, c := range cells {
		if c != "" && strings.ContainsRune(formulaStart, rune(c[0])) {
			cells[i] = "'" + c
		}
	}
	return cells
}

func csvUnsafe(c string) string {
	if len(c) > 1 && c[0] == '\'' && strings.ContainsRune(formulaStart, rune(c[1])) {
		return c[1:]
	}
	return c
}

// Columns of the product CSV. Option columns run option1_name, option1_value and on; stock columns
// are stock:<warehouse code>.
var productColumns = []string{
	"handle", "name", "description", "category", "status", "sku", "barcode", "price", "compare_at_price",
	"weight_grams", "image_url",
}

var (
	optionColumn = regexp.MustCompile(`^option([1-9])_(name|value)$`)
	stockPrefix  = "stock:"
)

// knownColumn reports whether an import column maps to a field.
func knownColumn(c string) bool {
	return slices.Contains(productColumns, c) || optionColumn.MatchString(c) || strings.HasPrefix(c, stockPrefix)
}

// ProductExportFilter narrows an export; empty fields keep every product.
type ProductExportFilter struct {
	Status     string
	CategoryID string
	Query      string
	IDs        []string
}

// ExportProducts writes a tenant's products as CSV, sorted by handle.
func (s *Service) ExportProducts(ctx context.Context, m Meta, tenantID string, f ProductExportFilter, delimiter rune, w io.Writer) error {
	if err := kernel.Access(m, tenantID); err != nil {
		return err
	}
	var products []domain.Product
	var cats []domain.Category
	var warehouses []domain.Warehouse
	var levels []domain.StockLevel
	if _, err := s.Run(ctx, func(t *kernel.Tx) error {
		var err error
		if products, err = catalog.TenantProducts(t, tenantID); err != nil {
			return err
		}
		if cats, err = catalog.TenantCategories(t, tenantID); err != nil {
			return err
		}
		if warehouses, err = inventory.TenantWarehouses(t, tenantID); err != nil {
			return err
		}
		levels, err = inventory.TenantStock(t, tenantID)
		return err
	}); err != nil {
		return err
	}
	catName := map[string]string{}
	for _, c := range cats {
		catName[c.ID] = c.Name
	}
	sort.Slice(warehouses, func(i, j int) bool { return warehouses[i].Code < warehouses[j].Code })
	onHand := map[[2]string]int{}
	for _, l := range levels {
		onHand[[2]string{l.VariantID, l.WarehouseID}] = l.OnHand
	}
	q := strings.ToLower(strings.TrimSpace(f.Query))
	kept := products[:0]
	for _, p := range products {
		if (f.Status != "" && p.Status != f.Status) || (f.CategoryID != "" && p.CategoryID != f.CategoryID) ||
			(len(f.IDs) > 0 && !slices.Contains(f.IDs, p.ID)) ||
			(q != "" && !strings.Contains(strings.ToLower(p.Name+" "+p.Code), q)) {
			continue
		}
		kept = append(kept, p)
	}
	sort.SliceStable(kept, func(i, j int) bool { return kept[i].Code < kept[j].Code })
	options := 1
	for _, p := range kept {
		options = max(options, len(p.Options))
	}
	header := slices.Clone(productColumns)
	for i := 1; i <= options; i++ {
		header = append(header, fmt.Sprintf("option%d_name", i), fmt.Sprintf("option%d_value", i))
	}
	for _, wh := range warehouses {
		header = append(header, stockPrefix+wh.Code)
	}
	if _, err := io.WriteString(w, CSVBOM); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	cw.Comma = delimiter
	if err := cw.Write(header); err != nil {
		return err
	}
	for _, p := range kept {
		for _, v := range p.Variants {
			row := []string{
				p.Code, p.Name, p.Description, catName[p.CategoryID], p.Status, v.Sku, v.Barcode, strconv.Itoa(v.Price),
				optInt(p.CompareAt), optInt(p.WeightGrams), optString(p.ImageURL),
			}
			for i := range options {
				if i < len(p.Options) {
					row = append(row, p.Options[i].Name, v.OptionValues[p.Options[i].Name])
				} else {
					row = append(row, "", "")
				}
			}
			for _, wh := range warehouses {
				if n, ok := onHand[[2]string{v.ID, wh.ID}]; ok {
					row = append(row, strconv.Itoa(n))
				} else {
					row = append(row, "")
				}
			}
			if err := cw.Write(CSVSafe(row)); err != nil {
				return err
			}
		}
	}
	cw.Flush()
	return cw.Error()
}

// ProductCSVTemplate is the header and one example row, for the import page's template download.
func ProductCSVTemplate(delimiter rune) []byte {
	var b bytes.Buffer
	b.WriteString(CSVBOM)
	cw := csv.NewWriter(&b)
	cw.Comma = delimiter
	_ = cw.Write(append(slices.Clone(productColumns), "option1_name", "option1_value", "stock:WH-JKT"))
	_ = cw.Write([]string{"TEE-001", "Everyday tee", "Soft cotton tee.", "Tops", "draft", "TEE-001-M", "", "150000", "",
		"200", "", "Size", "M", "10"})
	cw.Flush()
	return b.Bytes()
}

func optInt(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}

func optString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// Import limits.
const (
	ImportMaxBytes = 5 << 20
	ImportMaxRows  = 5000
	ImportBatch    = 100
)

// ImportIssue is a row the import refused, or a problem with the whole file (line 0).
type ImportIssue struct {
	Line    int    `json:"line"`
	Handle  string `json:"handle,omitempty"`
	SKU     string `json:"sku,omitempty"`
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}

// importRow is one data row: its line in the file and its cells by field.
type importRow struct {
	Line  int               `json:"line"`
	Cells map[string]string `json:"cells"`
}

// importGroup is one product's rows.
type importGroup struct {
	Handle string      `json:"handle"`
	Rows   []importRow `json:"rows"`
}

// parseProductCSV reads the file into groups by handle, in file order. mapping renames a file
// column to a field ("" drops it); columns without a mapping keep their name when it is a field.
func parseProductCSV(raw []byte, delimiter string, mapping map[string]string) ([]importGroup, int, []ImportIssue, error) {
	raw = bytes.TrimPrefix(raw, []byte(CSVBOM))
	r := csv.NewReader(bytes.NewReader(raw))
	switch delimiter {
	case ";", "semicolon":
		r.Comma = ';'
	case ",", "comma":
	default:
		first, _, _ := bytes.Cut(raw, []byte("\n"))
		if bytes.Count(first, []byte(";")) > bytes.Count(first, []byte(",")) {
			r.Comma = ';'
		}
	}
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, 0, nil, kernel.Invalid{Reason: "The file has no header row."}
	}
	fields := make([]string, len(header))
	seen := map[string]bool{}
	for i, h := range header {
		h = strings.TrimSpace(h)
		f, mapped := mapping[h]
		if !mapped {
			f = strings.ToLower(h)
			if strings.HasPrefix(f, stockPrefix) {
				f = stockPrefix + strings.ToUpper(strings.TrimSpace(h[len(stockPrefix):]))
			}
		}
		if f == "" || !knownColumn(f) {
			continue
		}
		if seen[f] {
			return nil, 0, nil, kernel.Invalid{Reason: fmt.Sprintf("Two columns map to %s. Map each field once.", f)}
		}
		seen[f] = true
		fields[i] = f
	}
	for _, need := range []string{"handle", "sku"} {
		if !seen[need] {
			return nil, 0, nil, kernel.Invalid{Reason: "Map a column to " + need + "."}
		}
	}
	var groups []importGroup
	at := map[string]int{}
	var issues []ImportIssue
	rows := 0
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		line, _ := r.FieldPos(0)
		if err != nil {
			var pe *csv.ParseError
			if errors.As(err, &pe) {
				return nil, rows, nil, kernel.Invalid{Reason: fmt.Sprintf("Line %d is not valid CSV: %v.", pe.Line, pe.Err)}
			}
			return nil, rows, nil, err
		}
		if len(rec) == 1 && strings.TrimSpace(rec[0]) == "" {
			continue
		}
		rows++
		if rows > ImportMaxRows {
			return nil, rows, nil, kernel.Invalid{Reason: fmt.Sprintf("The file has more than %d rows. Split it and import each part.", ImportMaxRows)}
		}
		cells := map[string]string{}
		for i, v := range rec {
			if i < len(fields) && fields[i] != "" {
				if v = strings.TrimSpace(csvUnsafe(v)); v != "" {
					cells[fields[i]] = v
				}
			}
		}
		handle := cells["handle"]
		if handle == "" {
			issues = append(issues, ImportIssue{Line: line, SKU: cells["sku"], Column: "handle", Message: "Enter the product's handle."})
			continue
		}
		key := strings.ToLower(handle)
		i, ok := at[key]
		if !ok {
			i = len(groups)
			at[key] = i
			groups = append(groups, importGroup{Handle: handle})
		}
		groups[i].Rows = append(groups[i].Rows, importRow{Line: line, Cells: cells})
	}
	return groups, rows, issues, nil
}

// catalogView is what building a product from CSV rows looks up.
type catalogView struct {
	tenantID   string
	byHandle   map[string]*domain.Product
	skuOwner   map[string]string
	categories []domain.Category
	warehouses map[string]string
	onHand     map[[2]string]int
	reserved   map[[2]string]int
}

func loadCatalogView(t *kernel.Tx, tenantID string) (*catalogView, error) {
	products, err := catalog.TenantProducts(t, tenantID)
	if err != nil {
		return nil, err
	}
	cats, err := catalog.TenantCategories(t, tenantID)
	if err != nil {
		return nil, err
	}
	whs, err := inventory.TenantWarehouses(t, tenantID)
	if err != nil {
		return nil, err
	}
	levels, err := inventory.TenantStock(t, tenantID)
	if err != nil {
		return nil, err
	}
	v := &catalogView{tenantID: tenantID, byHandle: map[string]*domain.Product{}, skuOwner: map[string]string{},
		categories: cats, warehouses: map[string]string{}, onHand: map[[2]string]int{}, reserved: map[[2]string]int{}}
	for i := range products {
		v.remember(products[i])
	}
	for _, w := range whs {
		v.warehouses[strings.ToUpper(w.Code)] = w.ID
	}
	for _, l := range levels {
		v.onHand[[2]string{l.VariantID, l.WarehouseID}] = l.OnHand
		v.reserved[[2]string{l.VariantID, l.WarehouseID}] = l.Reserved
	}
	return v, nil
}

func (v *catalogView) remember(p domain.Product) {
	v.byHandle[strings.ToLower(p.Code)] = &p
	for _, variant := range p.Variants {
		v.skuOwner[strings.ToUpper(variant.Sku)] = p.ID
	}
}

func (v *catalogView) categoryID(name, current string) (string, bool) {
	var match []string
	for _, c := range v.categories {
		if strings.EqualFold(c.Name, name) {
			if c.ID == current {
				return current, true
			}
			match = append(match, c.ID)
		}
	}
	if len(match) == 1 {
		return match[0], true
	}
	return "", false
}

// stockSet is one stock cell: the variant's on-hand count in one warehouse.
type stockSet struct {
	sku, warehouseID string
	onHand           int
}

// builtProduct is a product as the CSV rows leave it.
type builtProduct struct {
	product domain.Product
	created bool
	changed bool
	stock   []stockSet
}

var productStatuses = []string{"draft", "active", "archived"}

// build applies a group's rows to the product with its handle, or to a new one. Blank cells keep
// what the product has; nothing is removed.
func (v *catalogView) build(g importGroup, m Meta, newID func(string) string) (builtProduct, []ImportIssue) {
	var issues []ImportIssue
	fail := func(r importRow, column, msg string) {
		issues = append(issues, ImportIssue{Line: r.Line, Handle: g.Handle, SKU: r.Cells["sku"], Column: column, Message: msg})
	}
	first := func(field string) (string, importRow) {
		for _, r := range g.Rows {
			if c := r.Cells[field]; c != "" {
				return c, r
			}
		}
		return "", g.Rows[0]
	}
	var out builtProduct
	existing := v.byHandle[strings.ToLower(g.Handle)]
	var p domain.Product
	if existing != nil {
		p = cloneProduct(*existing)
	} else {
		out.created = true
		p = domain.Product{
			ID: newID("prd"), TenantID: v.tenantID, Code: g.Handle, Type: "physical", Status: "draft",
			Tags: []string{}, Options: []domain.ProductOption{}, Attributes: map[string]string{}, Variants: []domain.Variant{},
			CreatedAt: m.At,
		}
	}
	if name, _ := first("name"); name != "" {
		p.Name = name
	} else if out.created {
		fail(g.Rows[0], "name", "Enter a name for a new product.")
	}
	if d, _ := first("description"); d != "" {
		p.Description = d
	}
	if c, r := first("category"); c != "" {
		if id, ok := v.categoryID(c, p.CategoryID); ok {
			p.CategoryID = id
		} else {
			fail(r, "category", fmt.Sprintf("No single category is named %q. Create it first or fix the name.", c))
		}
	} else if out.created {
		fail(g.Rows[0], "category", "Choose a category for a new product.")
	}
	if st, r := first("status"); st != "" && st != p.Status {
		if !slices.Contains(productStatuses, st) {
			fail(r, "status", "Status is draft, active or archived.")
		} else {
			p.Status = st
		}
	}
	if c, r := first("compare_at_price"); c != "" {
		if n, ok := amount(c); ok {
			p.CompareAt = &n
		} else {
			fail(r, "compare_at_price", "Compare-at price must be a whole number of rupiah, like 150000.")
		}
	}
	if c, r := first("weight_grams"); c != "" {
		if n, ok := amount(c); ok {
			p.WeightGrams = &n
		} else {
			fail(r, "weight_grams", "Weight must be a whole number of grams.")
		}
	}
	if c, _ := first("image_url"); c != "" {
		p.ImageURL = &c
	}
	uniformPrice := true
	for _, variant := range p.Variants {
		uniformPrice = uniformPrice && variant.Price == p.Price
	}
	for _, r := range g.Rows {
		sku := strings.ToUpper(r.Cells["sku"])
		if sku == "" {
			fail(r, "sku", "Enter the variant's SKU.")
			continue
		}
		if owner, ok := v.skuOwner[sku]; ok && owner != p.ID {
			fail(r, "sku", fmt.Sprintf("SKU %s belongs to another product.", sku))
			continue
		}
		i := slices.IndexFunc(p.Variants, func(x domain.Variant) bool { return strings.EqualFold(x.Sku, sku) })
		if i < 0 {
			p.Variants = append(p.Variants, domain.Variant{ID: newID("var"), Sku: sku, OptionValues: map[string]string{}})
			i = len(p.Variants) - 1
			if r.Cells["price"] == "" {
				fail(r, "price", "Enter a price for a new variant.")
			}
		}
		variant := &p.Variants[i]
		if c := r.Cells["price"]; c != "" {
			if n, ok := amount(c); ok {
				variant.Price = n
			} else {
				fail(r, "price", "Price must be a whole number of rupiah, like 150000.")
			}
		}
		if c := r.Cells["barcode"]; c != "" {
			variant.Barcode = c
		}
		values := map[string]string{}
		for n := 1; n <= 9; n++ {
			name, value := r.Cells[fmt.Sprintf("option%d_name", n)], r.Cells[fmt.Sprintf("option%d_value", n)]
			if name != "" && value != "" {
				values[name] = value
			} else if name != "" || value != "" {
				fail(r, fmt.Sprintf("option%d_value", n), "Fill both the option name and its value, or neither.")
			}
		}
		if len(values) > 0 && !sameValues(values, variant.OptionValues) {
			variant.OptionValues = values
			for name, value := range values {
				p.Options = withOptionValue(p.Options, name, value)
			}
			variant.Name = ""
		}
		for field, cell := range r.Cells {
			code, ok := strings.CutPrefix(field, stockPrefix)
			if !ok {
				continue
			}
			wh, known := v.warehouses[code]
			n, valid := amount(cell)
			switch {
			case !known:
				fail(r, field, fmt.Sprintf("No warehouse has the code %s.", code))
			case !valid:
				fail(r, field, "Stock must be a whole number of at least 0.")
			default:
				out.stock = append(out.stock, stockSet{sku: sku, warehouseID: wh, onHand: n})
			}
		}
	}
	for i := range p.Variants {
		if p.Variants[i].Name == "" {
			p.Variants[i].Name = variantLabel(p.Options, p.Variants[i].OptionValues)
		}
	}
	if len(p.Variants) > 0 && (out.created || uniformPrice) {
		p.Price = p.Variants[0].Price
	}
	out.product = p
	out.changed = out.created || !sameJSONValue(*existing, p)
	for _, st := range out.stock {
		if id := variantID(p, st.sku); id == "" || v.onHand[[2]string{id, st.warehouseID}] != st.onHand {
			out.changed = true
		}
	}
	return out, issues
}

func variantID(p domain.Product, sku string) string {
	for _, v := range p.Variants {
		if strings.EqualFold(v.Sku, sku) {
			return v.ID
		}
	}
	return ""
}

// amount reads a whole number of at least 0.
func amount(s string) (int, bool) {
	n, err := strconv.Atoi(s)
	return n, err == nil && n >= 0
}

func sameValues(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func withOptionValue(options []domain.ProductOption, name, value string) []domain.ProductOption {
	for i, o := range options {
		if o.Name == name {
			if !slices.Contains(o.Values, value) {
				options[i].Values = append(slices.Clone(o.Values), value)
			}
			return options
		}
	}
	return append(options, domain.ProductOption{Name: name, Values: []string{value}})
}

// variantLabel mirrors the fixtures' variantLabel: "42 / Black" in option order.
func variantLabel(options []domain.ProductOption, values map[string]string) string {
	var parts []string
	for _, o := range options {
		if v := values[o.Name]; v != "" {
			parts = append(parts, v)
		}
	}
	if len(parts) == 0 {
		return "Standard"
	}
	return strings.Join(parts, " / ")
}

func cloneProduct(p domain.Product) domain.Product {
	p.Options = slices.Clone(p.Options)
	p.Variants = slices.Clone(p.Variants)
	for i := range p.Variants {
		values := map[string]string{}
		for k, v := range p.Variants[i].OptionValues {
			values[k] = v
		}
		p.Variants[i].OptionValues = values
	}
	return p
}
