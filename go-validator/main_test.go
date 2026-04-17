package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// helper: build an `accepts` array entry as a generic map (matches the JSON
// shape that ends up in `body["accepts"]`).
func acceptsItem(scheme, network, asset, amount, payTo string, timeout interface{}, extras map[string]interface{}) map[string]interface{} {
	m := map[string]interface{}{}
	if scheme != "" {
		m["scheme"] = scheme
	}
	if network != "" {
		m["network"] = network
	}
	if asset != "" {
		m["asset"] = asset
	}
	if amount != "" {
		m["amount"] = amount
	}
	if payTo != "" {
		m["payTo"] = payTo
	}
	if timeout != nil {
		m["maxTimeoutSeconds"] = timeout
	}
	for k, v := range extras {
		m[k] = v
	}
	return m
}

func findCheck(checks []Check, id string) *Check {
	for i := range checks {
		if checks[i].Check == id {
			return &checks[i]
		}
	}
	return nil
}

func TestValidateAccepts_USDCMinBoundary(t *testing.T) {
	usdcSepolia := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

	cases := []struct {
		name     string
		amount   string
		wantPass bool
	}{
		{"below_min_999", "999", false},
		{"exact_min_1000", "1000", true},
		{"above_min", "10000", true},
		{"missing_amount", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			arr := []interface{}{
				acceptsItem("exact", "eip155:84532", usdcSepolia, tc.amount, "0xabc", float64(60), nil),
			}
			out := validateAccepts(arr)
			c := findCheck(out, "accepts[0].amount")
			if c == nil {
				t.Fatal("amount check missing")
			}
			if c.Passed != tc.wantPass {
				t.Fatalf("amount %q: want pass=%v, got pass=%v (detail=%q)", tc.amount, tc.wantPass, c.Passed, c.Detail)
			}
		})
	}
}

func TestValidateAccepts_NetworkMismatch(t *testing.T) {
	arr := []interface{}{
		acceptsItem("exact", "eip155:9999", "0xdead", "1000", "0xabc", float64(60), nil),
	}
	out := validateAccepts(arr)
	c := findCheck(out, "accepts[0].network")
	if c == nil || c.Passed {
		t.Fatalf("expected network check to fail for unknown network, got %+v", c)
	}
}

func TestValidateAccepts_V1MaxAmountRequiredDetected(t *testing.T) {
	usdcSepolia := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	arr := []interface{}{
		acceptsItem("exact", "eip155:84532", usdcSepolia, "", "0xabc", float64(60),
			map[string]interface{}{"maxAmountRequired": "1000"}),
	}
	out := validateAccepts(arr)
	c := findCheck(out, "accepts[0].amount")
	if c == nil || c.Passed {
		t.Fatalf("expected v1-amount-detection failure, got %+v", c)
	}
	if !strings.Contains(c.Detail, "maxAmountRequired") {
		t.Fatalf("detail should mention maxAmountRequired, got %q", c.Detail)
	}
}

func TestValidateAccepts_AssetMustMatchNetworkUSDC(t *testing.T) {
	// Mainnet network with sepolia USDC asset → should fail.
	arr := []interface{}{
		acceptsItem("exact", "eip155:8453",
			"0x036CbD53842c5426634e7929541eC2318f3dCF7e", // sepolia USDC
			"1000", "0xabc", float64(60), nil),
	}
	out := validateAccepts(arr)
	c := findCheck(out, "accepts[0].asset")
	if c == nil || c.Passed {
		t.Fatalf("expected asset mismatch, got %+v", c)
	}
}

// --- End-to-end validate() tests using httptest --------------------------

func newServingHandler(status int, body string, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}
}

const happyV2BazaarBody = `{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "1000",
    "payTo": "0x0000000000000000000000000000000000000001",
    "maxTimeoutSeconds": 60
  }],
  "resource": { "url": "%s" },
  "extensions": {
    "bazaar": {
      "info": {
        "input": { "type": "http", "method": "GET" },
        "output": { "type": "json", "example": { "temperature": 72 } }
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object"
      }
    }
  }
}`

func TestValidate_HappyV2Bazaar_LocalhostHTTPSPreflightFails(t *testing.T) {
	// httptest gives us http://, so HTTPS preflight will fail. The point of this
	// test is to confirm the response shape is fully populated even when
	// preflight blocks — parse should be Skipped, simulate noop.
	srv := httptest.NewServer(newServingHandler(402, "", "application/json"))
	defer srv.Close()

	resp := validate(ValidateRequest{URL: srv.URL, Method: "GET"})
	if resp.Valid {
		t.Fatal("did not expect Valid=true on http:// endpoint")
	}
	urlHttps := findCheck(resp.Preflight, "url_https")
	if urlHttps == nil || urlHttps.Passed {
		t.Fatalf("expected url_https failure for http://, got %+v", urlHttps)
	}
	if resp.Parse.OK {
		t.Fatal("parse stage should not run / should not be OK when preflight blocks")
	}
	if resp.Simulate.Outcome != string("noop") {
		t.Fatalf("simulate should be noop when preflight blocks, got %+v", resp.Simulate)
	}
	if resp.Meta.SDKVersion == "" || resp.Meta.ValidatorVersion == "" {
		t.Fatalf("meta should be populated, got %+v", resp.Meta)
	}
}

func TestValidate_NotReturning402(t *testing.T) {
	srv := httptest.NewServer(newServingHandler(200, `{"hello":"world"}`, "application/json"))
	defer srv.Close()

	resp := validate(ValidateRequest{URL: srv.URL})
	r402 := findCheck(resp.Preflight, "returns_402")
	if r402 == nil || r402.Passed {
		t.Fatalf("expected returns_402 failure, got %+v", r402)
	}
	// Downstream JSON / version checks should be marked skipped, not missing.
	jsonCheck := findCheck(resp.Preflight, "valid_json")
	if jsonCheck == nil || !strings.HasPrefix(jsonCheck.Detail, "Skipped:") {
		t.Fatalf("expected valid_json to be skipped, got %+v", jsonCheck)
	}
}

func TestValidate_V1PaymentRequirementsDetected(t *testing.T) {
	// v1 response: top-level paymentRequirements, x402Version=1.
	body := `{"x402Version": 1, "paymentRequirements": {"foo": "bar"}}`
	srv := httptest.NewServer(newServingHandler(402, body, "application/json"))
	defer srv.Close()

	resp := validate(ValidateRequest{URL: srv.URL})
	xv := findCheck(resp.Preflight, "x402_version")
	if xv == nil || xv.Passed {
		t.Fatalf("expected x402_version failure for v1 response, got %+v", xv)
	}
	if !strings.Contains(xv.Detail, "1") {
		t.Logf("x402_version detail: %q", xv.Detail)
	}
}

func TestValidate_HappyShapeProducesPreflightNotProcessing(t *testing.T) {
	// Endpoint returns a valid v2 bazaar payload BUT the URL is http:// (httptest
	// limitation). So preflight blocks parse. We at least confirm preflight
	// successfully parses everything *except* url_https, and the response shape
	// is structurally complete.
	body := strings.Replace(happyV2BazaarBody, "%s", "https://example.com/x", 1)
	srv := httptest.NewServer(newServingHandler(402, body, "application/json"))
	defer srv.Close()

	resp := validate(ValidateRequest{URL: srv.URL})
	if findCheck(resp.Preflight, "url_https").Passed {
		t.Fatal("url_https should fail for http:// URL")
	}
	if !findCheck(resp.Preflight, "returns_402").Passed {
		t.Fatal("returns_402 should pass")
	}
	// Even though preflight blocked, validate the response is well-formed JSON.
	bs, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("response should marshal: %v", err)
	}
	if !strings.Contains(string(bs), "preflight") || !strings.Contains(string(bs), "simulate") {
		t.Fatalf("response missing fields: %s", string(bs))
	}
}
