package property

import (
	"encoding/json"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
)

// Feature: whatsapp-service, Property 10: API Response Structure Consistency
// *For any* API response (success or error), the response should follow the
// APIResponse structure with appropriate fields populated.
// **Validates: Requirements 5.3, 5.4**

func TestAPIResponseStructureConsistency_Property10(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 10.1: Success responses have Success=true and no Error
	properties.Property("Success responses have Success=true and no Error", prop.ForAll(
		func(data string) bool {
			resp := dto.NewSuccessResponse(data)

			// Verify structure
			if !resp.Success {
				return false
			}
			if resp.Error != nil {
				return false
			}
			if resp.Data != data {
				return false
			}
			return true
		},
		gen.AlphaString(),
	))

	// Property 10.2: Error responses have Success=false and Error populated
	properties.Property("Error responses have Success=false and Error populated", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty values
			}

			resp := dto.NewErrorResponse[string](code, message, nil)

			// Verify structure
			if resp.Success {
				return false
			}
			if resp.Error == nil {
				return false
			}
			if resp.Error.Code != code {
				return false
			}
			if resp.Error.Message != message {
				return false
			}
			return true
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 10.3: Error responses with details preserve all details
	properties.Property("Error responses with details preserve all details", prop.ForAll(
		func(code, message, detailKey, detailValue string) bool {
			if code == "" || message == "" || detailKey == "" {
				return true // skip empty values
			}

			details := map[string]string{detailKey: detailValue}
			resp := dto.NewErrorResponse[string](code, message, details)

			// Verify details are preserved
			if resp.Error == nil {
				return false
			}
			if resp.Error.Details == nil {
				return false
			}
			if resp.Error.Details[detailKey] != detailValue {
				return false
			}
			return true
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 10.4: Success responses serialize to valid JSON with correct structure
	properties.Property("Success responses serialize to valid JSON with correct structure", prop.ForAll(
		func(data string) bool {
			// Skip empty strings as omitempty will omit the data field
			if data == "" {
				return true
			}

			resp := dto.NewSuccessResponse(data)

			// Serialize to JSON
			jsonBytes, err := json.Marshal(resp)
			if err != nil {
				return false
			}

			// Deserialize back
			var parsed map[string]interface{}
			if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
				return false
			}

			// Verify structure
			success, ok := parsed["success"].(bool)
			if !ok || !success {
				return false
			}

			// Data should be present for non-empty values
			_, hasData := parsed["data"]
			if !hasData {
				return false
			}

			// Error should not be present (or be null)
			if errVal, hasError := parsed["error"]; hasError && errVal != nil {
				return false
			}

			return true
		},
		gen.AlphaString(),
	))

	// Property 10.5: Error responses serialize to valid JSON with correct structure
	properties.Property("Error responses serialize to valid JSON with correct structure", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty values
			}

			resp := dto.NewErrorResponse[string](code, message, nil)

			// Serialize to JSON
			jsonBytes, err := json.Marshal(resp)
			if err != nil {
				return false
			}

			// Deserialize back
			var parsed map[string]interface{}
			if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
				return false
			}

			// Verify structure
			success, ok := parsed["success"].(bool)
			if !ok || success {
				return false
			}

			// Error should be present
			errorObj, hasError := parsed["error"].(map[string]interface{})
			if !hasError || errorObj == nil {
				return false
			}

			// Error should have code and message
			if errorObj["code"] != code {
				return false
			}
			if errorObj["message"] != message {
				return false
			}

			return true
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 10.6: NewErrorResponseFromError preserves error structure
	properties.Property("NewErrorResponseFromError preserves error structure", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty values
			}

			err := &dto.Error{
				Code:    code,
				Message: message,
				Details: map[string]string{"key": "value"},
			}

			resp := dto.NewErrorResponseFromError[string](err)

			// Verify structure
			if resp.Success {
				return false
			}
			if resp.Error == nil {
				return false
			}
			if resp.Error.Code != code {
				return false
			}
			if resp.Error.Message != message {
				return false
			}
			if resp.Error.Details["key"] != "value" {
				return false
			}
			return true
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 10.7: Generic type parameter works with different types
	properties.Property("Generic type parameter works with different types", prop.ForAll(
		func(intData int, strData string) bool {
			// Test with int
			intResp := dto.NewSuccessResponse(intData)
			if !intResp.Success || intResp.Data != intData {
				return false
			}

			// Test with string
			strResp := dto.NewSuccessResponse(strData)
			if !strResp.Success || strResp.Data != strData {
				return false
			}

			// Test with struct
			type TestStruct struct {
				Field string `json:"field"`
			}
			structData := TestStruct{Field: strData}
			structResp := dto.NewSuccessResponse(structData)
			if !structResp.Success || structResp.Data.Field != strData {
				return false
			}

			return true
		},
		gen.Int(),
		gen.AlphaString(),
	))

	// Property 10.8: Empty data is handled correctly
	properties.Property("Empty data is handled correctly", prop.ForAll(
		func(_ int) bool {
			// Empty string
			resp := dto.NewSuccessResponse("")
			if !resp.Success || resp.Data != "" {
				return false
			}

			// Nil slice
			var nilSlice []string
			sliceResp := dto.NewSuccessResponse(nilSlice)
			return sliceResp.Success
		},
		gen.Const(0),
	))

	properties.TestingRun(t)
}
