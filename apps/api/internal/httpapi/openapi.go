package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"regexp"
	"sort"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// The OpenAPI document is built from the route table and the Go types, so it cannot drift from what
// the server does. routeDocs adds what the table does not know: request and response bodies.

type routeDoc struct {
	body     any
	response any
	status   int
}

type (
	statusInput struct {
		Status string `json:"status"`
	}
	noteInput struct {
		Note string `json:"note"`
	}
	templateInput struct {
		TemplateID string `json:"templateId"`
	}
	adjustInput struct {
		Delta int    `json:"delta"`
		Note  string `json:"note"`
	}
	placeOrderInput struct {
		Order    domain.Order     `json:"order"`
		Customer *domain.Customer `json:"customer"`
	}
	loginInput struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	loginResponse struct {
		Token     string      `json:"token"`
		ExpiresAt string      `json:"expiresAt"`
		User      domain.User `json:"user"`
		// Sellers are the user's active seller profiles, for the seller app.
		Sellers []domain.Seller `json:"sellers"`
	}
	attributesInput struct {
		Attributes map[string]string `json:"attributes"`
	}
	advanceInput struct {
		TrackingNo *string `json:"trackingNo"`
	}
	cancelInput struct {
		Reason string `json:"reason"`
		Note   string `json:"note"`
	}
	refundInput struct {
		Amount int    `json:"amount"`
		Note   string `json:"note"`
	}
	pointsInput struct {
		Points int    `json:"points"`
		Reason string `json:"reason"`
	}
	leadStageInput struct {
		Stage      string  `json:"stage"`
		LostReason *string `json:"lostReason"`
	}
	assignInput struct {
		AssigneeID *string `json:"assigneeId"`
	}
	scheduleInput struct {
		At string `json:"at"`
	}
	rollbackInput struct {
		RevisionID string `json:"revisionId"`
	}
	priceInput struct {
		Lines         []rules.PricedLine `json:"lines"`
		Code          string             `json:"code"`
		PaymentTypeID string             `json:"paymentTypeId"`
		SellerID      string             `json:"sellerId"`
	}
	okResponse struct {
		Ok bool `json:"ok"`
	}
	enabledInput struct {
		Enabled bool `json:"enabled"`
	}
	// DeltaResponse is what every write answers: the rows it wrote and the ids it removed.
	DeltaResponse struct {
		Upserts map[string][]any    `json:"upserts"`
		Removes map[string][]string `json:"removes"`
		Now     string              `json:"now"`
	}
)

var routeDocs = map[string]routeDoc{
	"POST /auth/login":                         {body: loginInput{}, response: loginResponse{}},
	"POST /auth/forgot":                        {body: forgotInput{}},
	"POST /auth/reset":                         {body: resetInput{}},
	"POST /shop/{store}/forgot":                {body: forgotInput{}},
	"POST /shop/{store}/reset":                 {body: resetInput{}},
	"POST /shop/{store}/verify":                {body: verifyInput{}},
	"POST /auth/password":                      {body: changePasswordInput{}, response: tokenResponse{}},
	"GET /users/events":                        {response: staffEventsResponse{}},
	"POST /users":                              {body: staffInput{}, response: issuedStaffResponse{}},
	"PUT /users/{id}":                          {body: staffInput{}, response: staffResponse{}},
	"POST /users/{id}/status":                  {body: staffStatusInput{}, response: staffResponse{}},
	"POST /users/{id}/reset-password":          {response: issuedStaffResponse{}},
	"POST /users/{id}/invite":                  {response: issuedStaffResponse{}},
	"POST /shop/{store}/login":                 {body: loginInput{}, response: shopperResponse{}},
	"POST /shop/{store}/register":              {body: registerInput{}, response: shopperResponse{}},
	"POST /shop/{store}/password":              {body: changePasswordInput{}, response: tokenResponse{}},
	"POST /tenants":                            {body: domain.Tenant{}},
	"PUT /tenants/{id}/brand":                  {body: domain.BrandConfig{}},
	"PUT /tenants/{id}/agent-policy":           {body: domain.AgentPolicy{}},
	"PUT /products/{id}":                       {body: domain.Product{}},
	"PUT /products/{id}/attributes":            {body: attributesInput{}},
	"POST /products/{id}/status":               {body: statusInput{}},
	"PUT /categories/{id}":                     {body: domain.Category{}},
	"PUT /attributes/{id}":                     {body: domain.AttributeDef{}},
	"PUT /modifiers/{id}":                      {body: domain.ModifierGroup{}},
	"PUT /collections/{id}":                    {body: domain.Collection{}},
	"PUT /payment-types/{id}":                  {body: domain.PaymentType{}},
	"POST /stock/{id}/adjust":                  {body: adjustInput{}},
	"POST /stock/receive":                      {body: service.ReceiveInput{}},
	"POST /modifier-stock/{id}/adjust":         {body: adjustInput{}},
	"POST /modifier-stock/receive":             {body: service.ReceiveInput{}},
	"POST /orders":                             {body: placeOrderInput{}},
	"POST /orders/{id}/advance":                {body: advanceInput{}},
	"POST /orders/{id}/cancel":                 {body: cancelInput{}},
	"POST /orders/{id}/refund":                 {body: refundInput{}},
	"POST /orders/{id}/notes":                  {body: noteInput{}},
	"PUT /customers/{id}":                      {body: domain.Customer{}},
	"POST /customers/{id}/notes":               {body: noteInput{}},
	"POST /customers/{id}/points":              {body: pointsInput{}},
	"PUT /segments/{id}":                       {body: domain.Segment{}},
	"PUT /leads/{id}":                          {body: domain.Lead{}},
	"POST /leads/{id}/stage":                   {body: leadStageInput{}},
	"POST /tickets/{id}/assign":                {body: assignInput{}},
	"PUT /campaigns/{id}":                      {body: domain.Campaign{}},
	"PUT /automations/{id}":                    {body: domain.Automation{}},
	"POST /automations/{id}/status":            {body: statusInput{}},
	"PUT /promotions/{id}":                     {body: domain.Promotion{}},
	"POST /promotions/{id}/status":             {body: statusInput{}},
	"POST /pages":                              {body: domain.Page{}},
	"PUT /pages/{id}":                          {body: service.SavePageInput{}},
	"POST /pages/{id}/template":                {body: templateInput{}},
	"POST /pages/{id}/schedule":                {body: scheduleInput{}},
	"POST /pages/{id}/rollback":                {body: rollbackInput{}},
	"PUT /sellers/{id}":                        {body: domain.Seller{}},
	"POST /sellers/{id}/template":              {body: templateInput{}},
	"POST /sellers/{id}/status":                {body: statusInput{}},
	"GET /tenants/{id}/credentials":            {response: CredentialList{}},
	"POST /tenants/{id}/credentials":           {body: service.NewCredential{}, response: service.IssuedCredential{}, status: http.StatusCreated},
	"POST /credentials/{id}/rotate":            {response: service.IssuedCredential{}},
	"POST /credentials/{id}/revoke":            {response: service.Credential{}},
	"GET /integrations/{id}/credentials":       {response: service.ConnectorCredentials{}},
	"PUT /integrations/{id}/credentials":       {body: ConnectorValuesInput{}, response: service.ConnectorCredentials{}},
	"POST /integrations/{id}/credentials/test": {response: service.ConnectionResult{}},
	"GET /tenants/{id}/webhooks":               {response: WebhookList{}},
	"POST /tenants/{id}/webhooks":              {body: service.NewWebhook{}, response: service.IssuedWebhook{}, status: http.StatusCreated},
	"POST /webhooks/{id}/enabled":              {body: enabledInput{}, response: service.WebhookEndpoint{}},
	"POST /webhooks/{id}/rotate":               {response: service.IssuedWebhook{}},
	"POST /webhooks/{id}/test":                 {response: okResponse{}},
	"DELETE /webhooks/{id}":                    {response: okResponse{}},
	"POST /webhook-deliveries/{id}/retry":      {response: okResponse{}},
	"POST /shop/{store}/ai/chat":               {body: AIChatInput{}, response: AIChatAnswer{}},
	"POST /shop/{store}/price":                 {body: priceInput{}, response: rules.CartPrice{}},
	"POST /shop/{store}/orders":                {body: placeOrderInput{}},
	"POST /shop/{store}/leads":                 {body: domain.Lead{}},
}

// hiddenRoutes are for the demo and for this server's own apps, so the published contract leaves them out.
var hiddenRoutes = map[string]bool{
	"GET /auth/demo-accounts":          true,
	"GET /shop/{store}/demo-customers": true,
	"POST /shop/{store}/sign-in":       true,
	"GET /shop/{store}/me":             true,
	"POST /system/tick":                true,
	"GET /state":                       true,
	"GET /events":                      true,
	"GET /shop/{store}/events":         true,
	"GET /shop/{store}/state":          true,
	"GET /routes":                      true,
	"GET /openapi.json":                true,
	"GET /docs":                        true,
}

// publicRoutes need no token.
var publicRoutes = map[string]bool{
	"GET /health":                     true,
	"POST /auth/login":                true,
	"POST /shop/{store}/login":        true,
	"POST /auth/forgot":               true,
	"POST /auth/reset":                true,
	"POST /shop/{store}/forgot":       true,
	"POST /shop/{store}/reset":        true,
	"POST /shop/{store}/verify":       true,
	"POST /shop/{store}/verify-email": true,
	"POST /shop/{store}/register":     true,
	"POST /shop/{store}/password":     true,
	"GET /shop":                       true,
	"POST /shop/{store}/ai/chat":      true,
	"POST /shop/{store}/price":        true,
	"POST /shop/{store}/orders":       true,
	"POST /shop/{store}/leads":        true,
}

var pathParam = regexp.MustCompile(`\{([a-zA-Z]+)\}`)

type schemas struct {
	defs map[string]any
}

func ref(name string) map[string]any { return map[string]any{"$ref": "#/components/schemas/" + name} }

// of builds the schema of a Go type: named structs become components, in OpenAPI 3.0 terms.
func (s *schemas) of(t reflect.Type) map[string]any {
	switch t.Kind() {
	case reflect.Pointer:
		inner := s.of(t.Elem())
		if _, isRef := inner["$ref"]; isRef {
			return map[string]any{"allOf": []any{inner}, "nullable": true}
		}
		inner["nullable"] = true
		return inner
	case reflect.String:
		return map[string]any{"type": "string"}
	case reflect.Bool:
		return map[string]any{"type": "boolean"}
	case reflect.Int, reflect.Int64:
		return map[string]any{"type": "integer"}
	case reflect.Float64:
		return map[string]any{"type": "number"}
	case reflect.Slice:
		return map[string]any{"type": "array", "items": s.of(t.Elem())}
	case reflect.Map:
		return map[string]any{"type": "object", "additionalProperties": s.of(t.Elem())}
	case reflect.Interface:
		return map[string]any{}
	case reflect.Struct:
		name := t.Name()
		if _, seen := s.defs[name]; !seen {
			s.defs[name] = nil // Marks it, so a recursive type ends here.
			s.defs[name] = s.object(t)
		}
		return ref(name)
	}
	panic("openapi: no schema for " + t.String())
}

func (s *schemas) object(t reflect.Type) map[string]any {
	props := map[string]any{}
	var required []string
	var walk func(reflect.Type)
	walk = func(t reflect.Type) {
		for i := range t.NumField() {
			f := t.Field(i)
			if f.Anonymous {
				walk(f.Type)
				continue
			}
			name, options, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "" || name == "-" {
				continue
			}
			props[name] = s.of(f.Type)
			if options == "" {
				required = append(required, name)
			}
		}
	}
	walk(t)
	sort.Strings(required)
	out := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		out["required"] = required
	}
	return out
}

func jsonContent(schema any) map[string]any {
	return map[string]any{"application/json": map[string]any{"schema": schema}}
}

func tagOf(path string) string {
	switch first, _, _ := strings.Cut(strings.TrimPrefix(path, "/"), "/"); first {
	case "products", "categories", "attributes", "modifiers", "collections":
		return "Catalog"
	case "stock", "modifier-stock", "warehouses":
		return "Inventory"
	case "orders":
		return "Orders"
	case "customers", "leads", "tickets", "segments":
		return "Customers"
	case "campaigns", "automations", "promotions":
		return "Marketing"
	case "pages", "sellers", "tenants", "payment-types":
		if strings.HasSuffix(path, "/credentials") {
			return "Credentials"
		}
		if strings.HasSuffix(path, "/webhooks") {
			return "Webhooks"
		}
		return "Store"
	case "credentials":
		return "Credentials"
	case "webhooks", "webhook-deliveries":
		return "Webhooks"
	case "integrations":
		if strings.Contains(path, "/credentials") {
			return "Credentials"
		}
		return "Integrations"
	case "shop":
		return "Storefront"
	case "auth", "health", "users":
		return "Platform"
	}
	panic("openapi: no tag for " + path)
}

var operationWord = regexp.MustCompile(`[^a-zA-Z0-9]+`)

func operationID(method, path string) string {
	parts := operationWord.Split(strings.ToLower(method)+" "+path, -1)
	var b strings.Builder
	for i, p := range parts {
		if i == 0 || p == "" {
			b.WriteString(p)
			continue
		}
		b.WriteString(strings.ToUpper(p[:1]) + p[1:])
	}
	return b.String()
}

// buildSpec turns the route table into an OpenAPI 3.0.3 document. openapi_test.go fails when a write
// route has no body documented, so a new endpoint cannot ship undocumented by accident.
func buildSpec(table []Route, version string) []byte {
	defs := &schemas{defs: map[string]any{}}
	problem := ref("Problem")
	defs.of(reflect.TypeOf(Problem{}))
	delta := defs.of(reflect.TypeOf(DeltaResponse{}))
	paths := map[string]any{}
	for _, c := range readable {
		defs.of(reflect.TypeOf(c.item))
	}
	itemOf := map[string]reflect.Type{}
	for _, c := range readable {
		itemOf[c.path] = reflect.TypeOf(c.item)
	}
	for _, route := range table {
		path := strings.TrimPrefix(route.Path, prefix)
		key := route.Method + " " + path
		if hiddenRoutes[key] {
			continue
		}
		doc := routeDocs[key]
		op := map[string]any{
			"operationId": operationID(route.Method, path),
			"summary":     route.Summary,
			"tags":        []string{tagOf(path)},
		}
		var params []any
		for _, m := range pathParam.FindAllStringSubmatch(path, -1) {
			params = append(params, map[string]any{"name": m[1], "in": "path", "required": true, "schema": map[string]any{"type": "string"}})
		}
		status := "200"
		if doc.status != 0 {
			status = fmt.Sprint(doc.status)
		}
		var success map[string]any
		isList := false
		switch {
		case doc.response != nil:
			success = jsonContent(defs.of(reflect.TypeOf(doc.response)))
		case route.Method == http.MethodGet:
			if item, ok := itemOf[path]; ok {
				isList = true
				success = jsonContent(map[string]any{"type": "object", "required": []string{"items", "nextCursor"}, "properties": map[string]any{
					"items":      map[string]any{"type": "array", "items": defs.of(item)},
					"nextCursor": map[string]any{"type": "string", "nullable": true, "description": "Pass as cursor for the next page; null on the last."},
				}})
			} else if item, ok := itemOf[strings.TrimSuffix(path, "/{id}")]; ok {
				success = jsonContent(defs.of(item))
			} else {
				success = jsonContent(map[string]any{"type": "object"})
			}
		default:
			success = jsonContent(delta)
		}
		if isList {
			for _, q := range []struct{ name, kind, about string }{
				{"limit", "integer", "Page size, 1 to 200; 50 when left out."},
				{"cursor", "string", "nextCursor of the previous page."},
				{"updatedSince", "string", "RFC 3339. Only rows changed at or after this instant."},
				{"status", "string", "Filter by status, where the resource has one."},
				{"tenantId", "string", "Required with a user token; an API key always reads its own tenant."},
			} {
				params = append(params, map[string]any{"name": q.name, "in": "query", "description": q.about, "schema": map[string]any{"type": q.kind}})
			}
		}
		if params != nil {
			op["parameters"] = params
		}
		if doc.body != nil {
			op["requestBody"] = map[string]any{"required": true, "content": jsonContent(defs.of(reflect.TypeOf(doc.body)))}
		}
		responses := map[string]any{status: map[string]any{"description": "Success", "content": success}}
		for code, about := range map[string]string{
			"409": "A business rule refused the action; detail holds the sentence to show.",
			"422": "The request cannot be acted on.",
			"404": "No such record, or it belongs to another tenant.",
		} {
			responses[code] = map[string]any{"description": about, "content": map[string]any{"application/problem+json": map[string]any{"schema": problem}}}
		}
		if !publicRoutes[key] {
			for code, about := range map[string]string{
				"401": "Missing or invalid token.",
				"403": "The role or the API key's scopes do not allow this, or the tenant is out of reach.",
			} {
				responses[code] = map[string]any{"description": about, "content": map[string]any{"application/problem+json": map[string]any{"schema": problem}}}
			}
			if route.Scope != "" {
				op["security"] = []any{map[string]any{"apiKey": []string{}}, map[string]any{"apiKeyHeader": []string{}}, map[string]any{"session": []string{}}}
				op["x-required-scope"] = route.Scope
				op["description"] = "API keys need the scope `" + route.Scope + "`."
				responses["429"] = map[string]any{"description": "This API key sent more than 600 requests this minute."}
			} else {
				op["security"] = []any{map[string]any{"session": []string{}}}
				op["description"] = "For people signed in to the console. API keys cannot call this."
			}
			if route.Permission != "" {
				op["x-required-permission"] = route.Permission
			}
		} else {
			op["security"] = []any{}
		}
		if route.Action != "" {
			op["x-action"] = route.Action
		}
		op["responses"] = responses
		entry, _ := paths[path].(map[string]any)
		if entry == nil {
			entry = map[string]any{}
			paths[path] = entry
		}
		entry[strings.ToLower(route.Method)] = op
	}
	spec := map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":   "Commerce OS API",
			"version": version,
			"description": "The API behind the Commerce OS console, seller app and storefront.\n\n" +
				"Connected systems authenticate with an API key created under Integrations → API credentials: " +
				"`Authorization: Bearer rck_…` or `X-Api-Key: rck_…`. A key belongs to one tenant and acts within its scopes. " +
				"Lists page by id with `limit` and `cursor`; use `updatedSince` for incremental sync. " +
				"Writes answer with the rows they changed. Errors are `application/problem+json`.\n\n" +
				"Webhooks POST `{event, tenantId, at, data}` with `X-Commerce-Signature: t=<unix>,v1=<hex>`, " +
				"the HMAC-SHA256 of `<unix>.<raw body>` under the endpoint's secret. Answer 2xx; other answers retry for about a day.",
		},
		"servers": []any{map[string]any{"url": prefix}},
		"paths":   paths,
		"components": map[string]any{
			"schemas": defs.defs,
			"securitySchemes": map[string]any{
				"apiKey":       map[string]any{"type": "http", "scheme": "bearer", "bearerFormat": "rck_…", "description": "An API credential."},
				"apiKeyHeader": map[string]any{"type": "apiKey", "in": "header", "name": "X-Api-Key"},
				"session":      map[string]any{"type": "http", "scheme": "bearer", "bearerFormat": "JWT", "description": "The token from POST /auth/login."},
			},
		},
	}
	out, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		panic(err)
	}
	return append(out, '\n')
}

// Spec is the OpenAPI document.
func (s *Server) Spec() []byte { return s.spec }

const docsPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commerce OS API</title>
<style>body{margin:0}</style>
</head>
<body>
<redoc spec-url="openapi.json"></redoc>
<script src="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js"></script>
</body>
</html>
`

func serveDocs(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(docsPage))
}
