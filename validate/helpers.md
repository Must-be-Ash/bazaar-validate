discovery/helpers

package discovery

import (
    "encoding/base64"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "strings"

    x402 "github.com/coinbase/x402/go"
)

func extractResourceInput(outputSchema map[string]any) (input map[string]any, err error) {
    if outputSchema == nil {
        return nil, errors.New("[discover_resource] outputSchema is required")
    }

    inputRaw, ok := outputSchema["input"]
    if !ok {
        return nil, errors.New("[discover_resource] input not found in OutputSchema")
    }

    inputMap, ok := inputRaw.(map[string]any)
    if !ok {
        return nil, errors.New("[discover_resource] input is not a valid object in OutputSchema")
    }

    return inputMap, nil
}

func ExtractResourceTransportType(outputSchema map[string]any) (transportType string, err error) {
    input, err := extractResourceInput(outputSchema)
    if err != nil {
        return "", err
    }

    transportTypeRaw, ok := input["type"].(string)
    if !ok {
        return "", errors.New("[discover_resource] type not found or not a string in input")
    }

    return strings.ToLower(transportTypeRaw), nil
}

func ExtractHTTPResourceMethod(outputSchema map[string]any) (method string, err error) {
    input, err := extractResourceInput(outputSchema)
    if err != nil {
        return "", err
    }

    methodRaw, ok := input["method"].(string)
    if !ok {
        return "", errors.New("[discover_resource] method not found or not a string in input")
    }

    return strings.ToLower(methodRaw), nil
}

const maxDiscoveryResponseBytes int64 = 64 << 10 // 64KB

func ExtractPaymentRequiredFromResponse(
    resp *http.Response,
) (paymentRequired x402.PaymentRequired, responseBytes []byte, err error) {
    if resp == nil {
        return x402.PaymentRequired{}, nil, errors.New("[discover_resource] response is required")
    }

    defer resp.Body.Close()

    headers := resp.Header
    bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxDiscoveryResponseBytes+1))
    if err != nil {
        return x402.PaymentRequired{}, nil, fmt.Errorf("failed to read response body: %w", err)
    }
    if int64(len(bodyBytes)) > maxDiscoveryResponseBytes {
        return x402.PaymentRequired{}, nil, fmt.Errorf("discovery response body exceeds %d bytes", maxDiscoveryResponseBytes)
    }

    // Normalize headers to uppercase
    normalizedHeaders := make(map[string]string)
    for k, v := range headers {
        normalizedHeaders[strings.ToUpper(k)] = strings.Join(v, ", ")
    }

    // Check v2 header first
    if header, exists := normalizedHeaders["PAYMENT-REQUIRED"]; exists {
        return decodePaymentRequiredHeader(header)
    }

    // Fall back to v1 body format
    if len(bodyBytes) > 0 {
        var required x402.PaymentRequired
        if err := json.Unmarshal(bodyBytes, &required); err == nil {
            if required.X402Version == 1 {
                return required, bodyBytes, nil
            }
        }
    }

    return x402.PaymentRequired{}, nil, errors.New("[discover_resource] no payment required found in response")
}

// decodePaymentRequiredHeader decodes a base64 payment required header
func decodePaymentRequiredHeader(header string) (x402.PaymentRequired, []byte, error) {
    data, err := base64.StdEncoding.DecodeString(header)
    if err != nil {
        return x402.PaymentRequired{}, nil, fmt.Errorf("invalid base64 encoding: %w", err)
    }

    var required x402.PaymentRequired
    if err := json.Unmarshal(data, &required); err != nil {
        return x402.PaymentRequired{}, nil, fmt.Errorf("invalid payment required JSON: %w", err)
    }

    return required, data, nil
}

