package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"github.com/bazaar-validate/go-validator/internal/discovery"
)

const defaultPort = "8080"
const validatorVersion = "0.2.0"

// ValidateRequest is the input from the Next.js backend.
type ValidateRequest struct {
	URL    string `json:"url"`
	Method string `json:"method"`
}

// Check is a single validation check result.
type Check struct {
	Check    string `json:"check"`
	Passed   bool   `json:"passed"`
	Detail   string `json:"detail"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
}

// RawResponse captures what the endpoint returned.
type RawResponse struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
}

// Stage represents the result of a single pipeline stage (parse, etc.).
type Stage struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// SimulateResult mirrors discovery.SimulationResult in the wire shape.
type SimulateResult struct {
	Outcome        string `json:"outcome"` // "processing" | "rejected" | "noop"
	RejectedReason string `json:"rejectedReason,omitempty"`
	WorkflowIDHint string `json:"workflowIdHint,omitempty"`
}

// Meta carries provenance info so the UI can show which SDK ran.
type Meta struct {
	SDKVersion       string `json:"sdkVersion,omitempty"`
	ValidatorVersion string `json:"validatorVersion,omitempty"`
}

// ValidateResponse is the output sent back to Next.js. Three-stage shape:
// preflight (existing surface checks), parse (SDK extractor), simulate
// (mirrored facilitator decision tree).
type ValidateResponse struct {
	Valid     bool           `json:"valid"`
	Preflight []Check        `json:"preflight"`
	Parse     Stage          `json:"parse"`
	Simulate  SimulateResult `json:"simulate"`
	Raw       RawResponse    `json:"raw"`
	Meta      Meta           `json:"meta"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("POST /validate", handleValidate)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Go validation server starting on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	meta := currentMeta()
	json.NewEncoder(w).Encode(map[string]string{
		"status":           "ok",
		"sdkVersion":       meta.SDKVersion,
		"validatorVersion": meta.ValidatorVersion,
	})
}

// currentMeta returns the SDK + validator versions baked into this binary.
// SDK version is read from the build info (the version coinbase/x402/go was
// resolved to in go.mod).
func currentMeta() Meta {
	m := Meta{ValidatorVersion: validatorVersion}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "github.com/coinbase/x402/go" {
				m.SDKVersion = dep.Version
				break
			}
		}
	}
	return m
}

func handleValidate(w http.ResponseWriter, r *http.Request) {
	var req ValidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.URL == "" {
		http.Error(w, `{"error":"url is required"}`, http.StatusBadRequest)
		return
	}

	if req.Method == "" {
		req.Method = "GET"
	}
	req.Method = strings.ToUpper(req.Method)

	resp := validate(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// All check ids that may be emitted by the payment-stage of validation.
// Used to backfill skipped entries when an upstream stage blocks us.
var paymentStageCheckIDs = []string{
	"valid_json",
	"x402_version",
	"has_accepts",
	"accepts[0].scheme",
	"accepts[0].network",
	"accepts[0].asset",
	"accepts[0].amount",
	"accepts[0].payTo",
	"accepts[0].maxTimeoutSeconds",
	"has_resource",
	"has_bazaar_extension",
	"bazaar.info",
	"bazaar.info.output",
	"bazaar.info.output.example",
	"bazaar.schema",
}

func appendSkipped(checks []Check, reason string, ids ...string) []Check {
	for _, id := range ids {
		checks = append(checks, Check{
			Check:  id,
			Passed: false,
			Detail: "Skipped: " + reason,
		})
	}
	return checks
}

// stageSkipped builds a Stage marker for "we didn't run this stage because
// an upstream stage already failed."
func stageSkipped(reason string) Stage {
	return Stage{OK: false, Error: "Skipped: " + reason}
}

// validate runs the three-stage validation pipeline:
//
//  1. preflight  — surface checks the SDK doesn't run (HTTPS, USDC min, etc.).
//  2. parse      — SDK extractor: ExtractDiscoveredResourceFromPaymentRequired.
//  3. simulate   — facilitator decision tree from validate/submitDiscoveryJobIfNeeded.md.
//
// Each stage runs only if its prerequisites succeeded; otherwise it's marked
// Skipped so the UI can show the full pipeline state.
func validate(req ValidateRequest) ValidateResponse {
	preflight, bodyBytes, raw, preflightBlocked, hasBazaar := runPreflight(req)
	resp := ValidateResponse{
		Preflight: preflight,
		Raw:       raw,
		Meta:      currentMeta(),
	}

	if preflightBlocked {
		resp.Parse = stageSkipped("preflight checks failed")
		resp.Simulate = SimulateResult{Outcome: string(discovery.OutcomeNoop)}
		resp.Valid = false
		return resp
	}

	// Stage 2: parse via the SDK.
	parsed, parseErr := discovery.ParseDiscoveryInfo(bodyBytes)
	if parseErr != nil {
		resp.Parse = Stage{OK: false, Error: parseErr.Error()}
	} else {
		resp.Parse = Stage{OK: true}
	}

	// Stage 3: simulate the submit decision tree.
	sim := discovery.SimulateSubmit(parsed, parseErr, hasBazaar)
	resp.Simulate = SimulateResult{
		Outcome:        string(sim.Outcome),
		RejectedReason: sim.RejectedReason,
		WorkflowIDHint: sim.WorkflowIDHint,
	}

	resp.Valid = preflightAllPassed(preflight) && resp.Parse.OK && sim.Outcome == discovery.OutcomeProcessing
	return resp
}

func preflightAllPassed(checks []Check) bool {
	for _, c := range checks {
		if !c.Passed {
			return false
		}
	}
	return true
}

// runPreflight executes the surface-level checks. Returns:
//   - the populated preflight check list
//   - the raw response body bytes (nil if probe failed)
//   - the raw response capture (always populated; status may be 0)
//   - blocked: true when an upstream failure means we cannot run parse/simulate
//   - hasBazaar: whether the response body contained an extensions.bazaar object
func runPreflight(req ValidateRequest) (checks []Check, bodyBytes []byte, raw RawResponse, blocked, hasBazaar bool) {
	raw = RawResponse{Headers: make(map[string]string)}

	// --- Stage 1: URL parse + HTTPS ---
	parsedURL, err := url.Parse(req.URL)
	urlValidPassed := err == nil
	urlValidDetail := "URL is well-formed"
	if !urlValidPassed {
		urlValidDetail = fmt.Sprintf("URL is not valid: %v", err)
	}
	checks = append(checks, Check{
		Check:  "url_valid",
		Passed: urlValidPassed,
		Detail: urlValidDetail,
	})

	if !urlValidPassed {
		checks = appendSkipped(checks, "URL is not valid", "url_https", "endpoint_reachable", "returns_402")
		checks = appendSkipped(checks, "URL is not valid", paymentStageCheckIDs...)
		return checks, nil, raw, true, false
	}

	httpsOK := parsedURL.Scheme == "https"
	checks = append(checks, Check{
		Check:    "url_https",
		Passed:   httpsOK,
		Detail:   ternary(httpsOK, "Resource URL uses HTTPS", "Resource URL must use HTTPS"),
		Expected: "https",
		Actual:   parsedURL.Scheme,
	})

	// --- Stage 2: Probe the endpoint ---
	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, reqErr := http.NewRequest(req.Method, req.URL, nil)
	if reqErr != nil {
		checks = append(checks, Check{
			Check:  "endpoint_reachable",
			Passed: false,
			Detail: fmt.Sprintf("Failed to create request: %v", reqErr),
		})
		checks = appendSkipped(checks, "endpoint not reachable", "returns_402")
		checks = appendSkipped(checks, "endpoint not reachable", paymentStageCheckIDs...)
		return checks, nil, raw, true, false
	}
	httpReq.Header.Set("Accept", "application/json")

	resp, doErr := client.Do(httpReq)
	if doErr != nil {
		isTimeout := strings.Contains(doErr.Error(), "timeout") || strings.Contains(doErr.Error(), "deadline")
		detail := fmt.Sprintf("Could not reach endpoint: %v", doErr)
		if isTimeout {
			detail = "Endpoint timed out after 10 seconds"
		}
		checks = append(checks, Check{
			Check:  "endpoint_reachable",
			Passed: false,
			Detail: detail,
		})
		checks = appendSkipped(checks, "endpoint not reachable", "returns_402")
		checks = appendSkipped(checks, "endpoint not reachable", paymentStageCheckIDs...)
		return checks, nil, raw, true, false
	}
	defer resp.Body.Close()

	raw.StatusCode = resp.StatusCode
	for k, v := range resp.Header {
		raw.Headers[k] = strings.Join(v, ", ")
	}
	bodyBytes, _ = io.ReadAll(resp.Body)
	raw.Body = string(bodyBytes)

	checks = append(checks, Check{
		Check:  "endpoint_reachable",
		Passed: true,
		Detail: fmt.Sprintf("Endpoint responded with status %d", resp.StatusCode),
	})

	// --- Stage 3: returns_402 ---
	returns402 := resp.StatusCode == 402
	detail402 := "Endpoint correctly returns HTTP 402 Payment Required"
	if !returns402 {
		switch resp.StatusCode {
		case 200:
			detail402 = "Endpoint returns 200 OK — it needs to return 402 for unauthenticated requests to be discoverable"
		case 401, 403:
			detail402 = fmt.Sprintf("Endpoint returns %d — auth middleware may be running before x402 middleware", resp.StatusCode)
		default:
			detail402 = fmt.Sprintf("Endpoint returned HTTP %d instead of 402", resp.StatusCode)
		}
	}
	checks = append(checks, Check{
		Check:    "returns_402",
		Passed:   returns402,
		Detail:   detail402,
		Expected: "402",
		Actual:   fmt.Sprintf("%d", resp.StatusCode),
	})

	if !returns402 {
		checks = appendSkipped(checks, "endpoint did not return 402", paymentStageCheckIDs...)
		return checks, bodyBytes, raw, true, false
	}

	// --- Effective payload: prefer the v2 `payment-required` header (base64
	// JSON) over the body. Mirrors the SDK's ExtractPaymentRequiredFromResponse.
	// Many v2 servers (including @x402/next) put requirements in the header
	// and leave the body as `{}`.
	effective := bodyBytes
	if headerPayload, ok := decodePaymentRequiredHeader(raw.Headers); ok {
		effective = headerPayload
	}

	// --- Stage 4: parse JSON body ---
	var body map[string]interface{}
	if err := json.Unmarshal(effective, &body); err != nil {
		checks = append(checks, Check{
			Check:  "valid_json",
			Passed: false,
			Detail: "Response body is not valid JSON",
		})
		toSkip := make([]string, 0, len(paymentStageCheckIDs)-1)
		for _, id := range paymentStageCheckIDs {
			if id == "valid_json" {
				continue
			}
			toSkip = append(toSkip, id)
		}
		checks = appendSkipped(checks, "response body is not valid JSON", toSkip...)
		return checks, bodyBytes, raw, true, false
	}

	checks = append(checks, Check{
		Check:  "valid_json",
		Passed: true,
		Detail: "Response body parsed as JSON",
	})

	// --- Stage 5: x402Version is 2 ---
	version, _ := body["x402Version"].(float64)
	isV2 := int(version) == 2
	checks = append(checks, Check{
		Check:    "x402_version",
		Passed:   isV2,
		Detail:   ternary(isV2, "x402 version is 2", fmt.Sprintf("x402Version is %d — this tool validates v2 only", int(version))),
		Expected: "2",
		Actual:   fmt.Sprintf("%d", int(version)),
	})

	// --- Stage 6: accepts array ---
	acceptsRaw, hasAccepts := body["accepts"]
	acceptsArr, isArr := acceptsRaw.([]interface{})
	hasValidAccepts := hasAccepts && isArr && len(acceptsArr) > 0
	checks = append(checks, Check{
		Check:  "has_accepts",
		Passed: hasValidAccepts,
		Detail: ternary(hasValidAccepts, fmt.Sprintf("Found %d payment method(s) in accepts array", len(acceptsArr)), "Missing or empty accepts array"),
	})

	if hasValidAccepts {
		checks = append(checks, validateAccepts(acceptsArr)...)
	} else {
		checks = appendSkipped(checks, "accepts array is missing or empty",
			"accepts[0].scheme",
			"accepts[0].network",
			"accepts[0].asset",
			"accepts[0].amount",
			"accepts[0].payTo",
			"accepts[0].maxTimeoutSeconds",
		)
	}

	// --- Stage 7: resource object ---
	resourceObj, hasResource := body["resource"].(map[string]interface{})
	resourceURL, _ := resourceObj["url"].(string)
	hasResourceURL := hasResource && resourceURL != ""
	checks = append(checks, Check{
		Check:  "has_resource",
		Passed: hasResourceURL,
		Detail: ternary(hasResourceURL, fmt.Sprintf("Resource URL: %s", resourceURL), "Missing resource object or resource.url field"),
	})

	// --- Stage 8: extensions.bazaar ---
	extensions, _ := body["extensions"].(map[string]interface{})
	bazaar, hasBazaar := extensions["bazaar"].(map[string]interface{})
	checks = append(checks, Check{
		Check:  "has_bazaar_extension",
		Passed: hasBazaar,
		Detail: ternary(hasBazaar, "Bazaar extension found", "No bazaar extension in top-level extensions object"),
	})

	if hasBazaar {
		checks = append(checks, validateBazaarExtension(bazaar, resourceURL)...)
	} else {
		checks = appendSkipped(checks, "bazaar extension is missing",
			"bazaar.info",
			"bazaar.info.output",
			"bazaar.info.output.example",
			"bazaar.schema",
		)
	}

	// Preflight didn't fully block parse/simulate even if some checks failed —
	// we want the SDK to attempt parsing whenever the body is valid JSON, since
	// the user gets useful info from the SDK error messages too.
	// Return `effective` (header-decoded if present, else body) so the SDK
	// parse stage sees the same v2 payload our preflight saw.
	return checks, effective, raw, false, hasBazaar
}

// decodePaymentRequiredHeader looks for the v2 `payment-required` HTTP header
// (case-insensitive) and base64-decodes its value. Returns the decoded JSON
// bytes and true on success, or (nil, false) when the header is missing or
// not valid base64. Mirrors the SDK helper in validate/helpers.md.
func decodePaymentRequiredHeader(headers map[string]string) ([]byte, bool) {
	if len(headers) == 0 {
		return nil, false
	}
	for k, v := range headers {
		if strings.EqualFold(k, "payment-required") {
			decoded, err := base64.StdEncoding.DecodeString(v)
			if err != nil {
				return nil, false
			}
			return decoded, true
		}
	}
	return nil, false
}

// Known USDC contract addresses per network.
var usdcAddresses = map[string]string{
	"eip155:8453":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	"eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
	// Aliases
	"base":         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	"base-sepolia":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
}

func validateAccepts(accepts []interface{}) []Check {
	var checks []Check

	for i, raw := range accepts {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		prefix := fmt.Sprintf("accepts[%d]", i)
		scheme, _ := item["scheme"].(string)
		network, _ := item["network"].(string)
		amount, _ := item["amount"].(string)
		asset, _ := item["asset"].(string)
		payTo, _ := item["payTo"].(string)
		maxTimeout, hasTimeout := item["maxTimeoutSeconds"]

		// Scheme must be "exact" or "upto"
		validScheme := scheme == "exact" || scheme == "upto"
		checks = append(checks, Check{
			Check:    fmt.Sprintf("%s.scheme", prefix),
			Passed:   validScheme,
			Detail:   ternary(validScheme, fmt.Sprintf("Scheme is %s", scheme), fmt.Sprintf("Scheme is %q — must be \"exact\" or \"upto\"", scheme)),
			Expected: "exact or upto",
			Actual:   scheme,
		})

		// Network must be supported
		_, knownNetwork := usdcAddresses[network]
		checks = append(checks, Check{
			Check:    fmt.Sprintf("%s.network", prefix),
			Passed:   knownNetwork,
			Detail:   ternary(knownNetwork, fmt.Sprintf("Network %s is supported", network), fmt.Sprintf("Network %q is not supported", network)),
			Expected: "base (eip155:8453) or base-sepolia (eip155:84532)",
			Actual:   network,
		})

		// Asset must be USDC for the declared network
		expectedAsset := usdcAddresses[network]
		assetMatch := strings.EqualFold(asset, expectedAsset)
		checks = append(checks, Check{
			Check:    fmt.Sprintf("%s.asset", prefix),
			Passed:   assetMatch,
			Detail:   ternary(assetMatch, "Asset is USDC", fmt.Sprintf("Asset does not match USDC for %s", network)),
			Expected: expectedAsset,
			Actual:   asset,
		})

		// Amount must be present and >= 1000 ($0.001 USDC minimum)
		amountOk := false
		if amount != "" {
			var amountVal int64
			fmt.Sscanf(amount, "%d", &amountVal)
			amountOk = amountVal >= 1000
		}
		// Detect v1 field name
		if amount == "" {
			if _, hasOld := item["maxAmountRequired"]; hasOld {
				checks = append(checks, Check{
					Check:    fmt.Sprintf("%s.amount", prefix),
					Passed:   false,
					Detail:   "Found maxAmountRequired (v1 field) — v2 uses amount",
					Expected: "amount",
					Actual:   "maxAmountRequired",
				})
				continue
			}
		}
		checks = append(checks, Check{
			Check:    fmt.Sprintf("%s.amount", prefix),
			Passed:   amountOk,
			Detail:   ternary(amountOk, fmt.Sprintf("Amount %s meets $0.001 USDC minimum", amount), ternary(amount == "", "Missing amount field", fmt.Sprintf("Amount %s is below $0.001 minimum (1000 atomic units)", amount))),
			Expected: ">= 1000",
			Actual:   amount,
		})

		// payTo must be present and look like an address
		validPayTo := len(payTo) > 0 && (strings.HasPrefix(payTo, "0x") || len(payTo) >= 32)
		checks = append(checks, Check{
			Check:  fmt.Sprintf("%s.payTo", prefix),
			Passed: validPayTo,
			Detail: ternary(validPayTo, "payTo address present", "Missing or invalid payTo address"),
			Actual: payTo,
		})

		// maxTimeoutSeconds must be present and positive
		timeoutOk := false
		if hasTimeout {
			if tv, ok := maxTimeout.(float64); ok && tv > 0 {
				timeoutOk = true
			}
		}
		checks = append(checks, Check{
			Check:  fmt.Sprintf("%s.maxTimeoutSeconds", prefix),
			Passed: timeoutOk,
			Detail: ternary(timeoutOk, "maxTimeoutSeconds is set", "Missing or invalid maxTimeoutSeconds"),
		})

		// Only validate the first accepts item in detail (most endpoints have one)
		break
	}

	return checks
}

func validateBazaarExtension(bazaar map[string]interface{}, resourceURL string) []Check {
	var checks []Check

	// Check for info block
	info, hasInfo := bazaar["info"].(map[string]interface{})
	checks = append(checks, Check{
		Check:  "bazaar.info",
		Passed: hasInfo,
		Detail: ternary(hasInfo, "Bazaar info block present", "Missing bazaar info block — required for discovery metadata"),
	})

	if hasInfo {
		// Check for output in info
		output, hasOutput := info["output"].(map[string]interface{})
		checks = append(checks, Check{
			Check:  "bazaar.info.output",
			Passed: hasOutput,
			Detail: ternary(hasOutput, "Output metadata present in bazaar info", "Missing info.output — required for discovery"),
		})

		if hasOutput {
			_, hasExample := output["example"]
			checks = append(checks, Check{
				Check:  "bazaar.info.output.example",
				Passed: hasExample,
				Detail: ternary(hasExample, "Output example provided", "Missing output example — helps consumers understand your response format"),
			})
		} else {
			checks = appendSkipped(checks, "bazaar info.output is missing", "bazaar.info.output.example")
		}
	} else {
		checks = appendSkipped(checks, "bazaar info block is missing", "bazaar.info.output", "bazaar.info.output.example")
	}

	// Check for schema block
	schema, hasSchema := bazaar["schema"].(map[string]interface{})
	_ = schema
	checks = append(checks, Check{
		Check:  "bazaar.schema",
		Passed: hasSchema,
		Detail: ternary(hasSchema, "Bazaar schema present", "Missing bazaar schema — recommended for validation"),
	})

	// Check that the routeTemplate (if declared) actually matches the resource.url.
	// Stricter than the facilitator: it just stores whichever URL came in, but a
	// mismatch usually signals a developer bug — the cataloged template won't
	// predict the resource path consumers see.
	if routeTemplate, ok := bazaar["routeTemplate"].(string); ok && routeTemplate != "" {
		matches := discovery.MatchesRouteTemplate(routeTemplate, resourceURL)
		detail := fmt.Sprintf("resource.url %q matches routeTemplate %q", resourceURL, routeTemplate)
		if !matches {
			detail = fmt.Sprintf("resource.url %q does not match routeTemplate %q", resourceURL, routeTemplate)
		}
		checks = append(checks, Check{
			Check:    "bazaar.routeTemplate.matches_resource",
			Passed:   matches,
			Detail:   detail,
			Expected: routeTemplate,
			Actual:   resourceURL,
		})
	}

	return checks
}

func ternary(cond bool, ifTrue, ifFalse string) string {
	if cond {
		return ifTrue
	}
	return ifFalse
}
