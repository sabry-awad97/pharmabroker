package property

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
)

// Feature: whatsapp-service, Property 5: QR Code Base64 Encoding
// *For any* QR code generated, the output should be a valid base64-encoded PNG image
// that can be decoded back to the original QR data.
// **Validates: Requirements 3.2**

func TestQRCodeBase64Encoding_Property5(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 5.1: Encoded QR code should be valid base64
	properties.Property("encoded QR code is valid base64", prop.ForAll(
		func(qrData string) bool {
			if qrData == "" {
				return true // skip empty inputs
			}

			// Encode QR code
			encoded, err := whatsapp.EncodeQRToBase64(qrData)
			if err != nil {
				t.Logf("Failed to encode QR: %v", err)
				return false
			}

			// Try to decode base64
			_, err = base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				t.Logf("Invalid base64: %v", err)
				return false
			}

			return true
		},
		gen.Identifier(),
	))

	// Property 5.2: Decoded base64 should be valid PNG image
	properties.Property("decoded base64 is valid PNG image", prop.ForAll(
		func(qrData string) bool {
			if qrData == "" {
				return true // skip empty inputs
			}

			// Encode QR code
			encoded, err := whatsapp.EncodeQRToBase64(qrData)
			if err != nil {
				t.Logf("Failed to encode QR: %v", err)
				return false
			}

			// Decode base64
			pngData, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				t.Logf("Invalid base64: %v", err)
				return false
			}

			// Verify it's a valid PNG
			_, err = png.Decode(bytes.NewReader(pngData))
			if err != nil {
				t.Logf("Invalid PNG: %v", err)
				return false
			}

			return true
		},
		gen.Identifier(),
	))

	// Property 5.3: PNG image should have expected dimensions (256x256)
	properties.Property("PNG image has expected dimensions", prop.ForAll(
		func(qrData string) bool {
			if qrData == "" {
				return true // skip empty inputs
			}

			// Encode QR code
			encoded, err := whatsapp.EncodeQRToBase64(qrData)
			if err != nil {
				t.Logf("Failed to encode QR: %v", err)
				return false
			}

			// Decode base64
			pngData, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				t.Logf("Invalid base64: %v", err)
				return false
			}

			// Decode PNG and check dimensions
			img, err := png.Decode(bytes.NewReader(pngData))
			if err != nil {
				t.Logf("Invalid PNG: %v", err)
				return false
			}

			bounds := img.Bounds()
			width := bounds.Max.X - bounds.Min.X
			height := bounds.Max.Y - bounds.Min.Y

			// Expected size is 256x256
			if width != 256 || height != 256 {
				t.Logf("Unexpected dimensions: %dx%d", width, height)
				return false
			}

			return true
		},
		gen.Identifier(),
	))

	// Property 5.4: Different QR data produces different encoded output
	properties.Property("different QR data produces different output", prop.ForAll(
		func(data1, data2 string) bool {
			if data1 == "" || data2 == "" || data1 == data2 {
				return true // skip empty or equal inputs
			}

			encoded1, err1 := whatsapp.EncodeQRToBase64(data1)
			encoded2, err2 := whatsapp.EncodeQRToBase64(data2)

			if err1 != nil || err2 != nil {
				return true // skip if encoding fails
			}

			// Different data should produce different output
			return encoded1 != encoded2
		},
		gen.Identifier(),
		gen.Identifier(),
	))

	// Property 5.5: Same QR data produces consistent output
	properties.Property("same QR data produces consistent output", prop.ForAll(
		func(qrData string) bool {
			if qrData == "" {
				return true // skip empty inputs
			}

			// Encode twice
			encoded1, err1 := whatsapp.EncodeQRToBase64(qrData)
			encoded2, err2 := whatsapp.EncodeQRToBase64(qrData)

			if err1 != nil || err2 != nil {
				t.Logf("Encoding failed: %v, %v", err1, err2)
				return false
			}

			// Same data should produce same output
			return encoded1 == encoded2
		},
		gen.Identifier(),
	))

	// Property 5.6: DecodeBase64ToQR reverses EncodeQRToBase64 (produces valid PNG bytes)
	properties.Property("DecodeBase64ToQR reverses encoding", prop.ForAll(
		func(qrData string) bool {
			if qrData == "" {
				return true // skip empty inputs
			}

			// Encode
			encoded, err := whatsapp.EncodeQRToBase64(qrData)
			if err != nil {
				t.Logf("Failed to encode: %v", err)
				return false
			}

			// Decode
			decoded, err := whatsapp.DecodeBase64ToQR(encoded)
			if err != nil {
				t.Logf("Failed to decode: %v", err)
				return false
			}

			// Verify decoded is valid PNG
			_, err = png.Decode(bytes.NewReader(decoded))
			if err != nil {
				t.Logf("Decoded data is not valid PNG: %v", err)
				return false
			}

			return true
		},
		gen.Identifier(),
	))

	// Property 5.7: Long QR data can be encoded
	properties.Property("long QR data can be encoded", prop.ForAll(
		func(length int) bool {
			if length < 1 || length > 1000 {
				return true // skip invalid lengths
			}

			// Generate long data
			data := make([]byte, length)
			for i := range data {
				data[i] = byte('a' + (i % 26))
			}

			encoded, err := whatsapp.EncodeQRToBase64(string(data))
			if err != nil {
				t.Logf("Failed to encode long data: %v", err)
				return false
			}

			// Verify it's valid
			_, err = base64.StdEncoding.DecodeString(encoded)
			return err == nil
		},
		gen.IntRange(1, 500),
	))

	properties.TestingRun(t)
}
