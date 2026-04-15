package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const defaultPort = "8080"

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

// ValidateResponse is the output sent back to Next.js.
type ValidateResponse struct {
	Valid  bool        `json:"valid"`
	Checks []Check    `json:"checks"`
	Raw    RawResponse `json:"raw"`
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
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
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

func validate(req ValidateRequest) ValidateResponse {
	var checks []Check
	raw := RawResponse{Headers: make(map[string]string)}

	// --- Check: URL is HTTPS ---
	parsedURL, err := url.Parse(req.URL)
	if err != nil {
		checks = append(checks, Check{
			Check:  "url_valid",
			Passed: false,
			Detail: fmt.Sprintf("URL is not valid: %v", err),
		})
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}

	checks = append(checks, Check{
		Check:    "url_https",
		Passed:   parsedURL.Scheme == "https",
		Detail:   ternary(parsedURL.Scheme == "https", "Resource URL uses HTTPS", "Resource URL must use HTTPS"),
		Expected: "https",
		Actual:   parsedURL.Scheme,
	})

	if parsedURL.Scheme != "https" {
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}

	// --- Probe the endpoint ---
	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest(req.Method, req.URL, nil)
	if err != nil {
		checks = append(checks, Check{
			Check:  "endpoint_reachable",
			Passed: false,
			Detail: fmt.Sprintf("Failed to create request: %v", err),
		})
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}
	httpReq.Header.Set("Accept", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		isTimeout := strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline")
		detail := fmt.Sprintf("Could not reach endpoint: %v", err)
		if isTimeout {
			detail = "Endpoint timed out after 10 seconds"
		}
		checks = append(checks, Check{
			Check:  "endpoint_reachable",
			Passed: false,
			Detail: detail,
		})
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}
	defer resp.Body.Close()

	raw.StatusCode = resp.StatusCode
	for k, v := range resp.Header {
		raw.Headers[k] = strings.Join(v, ", ")
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	raw.Body = string(bodyBytes)

	checks = append(checks, Check{
		Check:  "endpoint_reachable",
		Passed: true,
		Detail: fmt.Sprintf("Endpoint responded with status %d", resp.StatusCode),
	})

	// --- Check: Returns 402 ---
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
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}

	// --- Parse JSON body ---
	var body map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		checks = append(checks, Check{
			Check:  "valid_json",
			Passed: false,
			Detail: "Response body is not valid JSON",
		})
		return ValidateResponse{Valid: false, Checks: checks, Raw: raw}
	}

	// --- Check: x402Version is 2 ---
	version, _ := body["x402Version"].(float64)
	isV2 := int(version) == 2
	checks = append(checks, Check{
		Check:    "x402_version",
		Passed:   isV2,
		Detail:   ternary(isV2, "x402 version is 2", fmt.Sprintf("x402Version is %d — this tool validates v2 only", int(version))),
		Expected: "2",
		Actual:   fmt.Sprintf("%d", int(version)),
	})

	// --- Check: accepts array ---
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
	}

	// --- Check: resource object ---
	resourceObj, hasResource := body["resource"].(map[string]interface{})
	resourceURL, _ := resourceObj["url"].(string)
	hasResourceURL := hasResource && resourceURL != ""
	checks = append(checks, Check{
		Check:  "has_resource",
		Passed: hasResourceURL,
		Detail: ternary(hasResourceURL, fmt.Sprintf("Resource URL: %s", resourceURL), "Missing resource object or resource.url field"),
	})

	// --- Check: extensions.bazaar ---
	extensions, _ := body["extensions"].(map[string]interface{})
	bazaar, hasBazaar := extensions["bazaar"].(map[string]interface{})
	checks = append(checks, Check{
		Check:  "has_bazaar_extension",
		Passed: hasBazaar,
		Detail: ternary(hasBazaar, "Bazaar extension found", "No bazaar extension in top-level extensions object"),
	})

	if hasBazaar {
		checks = append(checks, validateBazaarExtension(bazaar)...)
	}

	// --- Determine overall validity ---
	allPassed := true
	for _, c := range checks {
		if !c.Passed {
			allPassed = false
			break
		}
	}

	return ValidateResponse{Valid: allPassed, Checks: checks, Raw: raw}
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

		// Scheme must be "exact"
		checks = append(checks, Check{
			Check:    fmt.Sprintf("%s.scheme", prefix),
			Passed:   scheme == "exact",
			Detail:   ternary(scheme == "exact", "Scheme is exact", fmt.Sprintf("Scheme is %q — must be \"exact\"", scheme)),
			Expected: "exact",
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

func validateBazaarExtension(bazaar map[string]interface{}) []Check {
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
		}
	}

	// Check for schema block
	schema, hasSchema := bazaar["schema"].(map[string]interface{})
	_ = schema
	checks = append(checks, Check{
		Check:  "bazaar.schema",
		Passed: hasSchema,
		Detail: ternary(hasSchema, "Bazaar schema present", "Missing bazaar schema — recommended for validation"),
	})

	return checks
}

func ternary(cond bool, ifTrue, ifFalse string) string {
	if cond {
		return ifTrue
	}
	return ifFalse
}
