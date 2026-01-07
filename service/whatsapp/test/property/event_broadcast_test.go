package property

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	ws "github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
)

// Feature: websocket-event-bridge, Property 3: Event broadcast delivery
// *For any* event broadcast by the Go service, all connected and authenticated
// clients should receive the event.
// **Validates: Requirements 1.3**

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func TestEventBroadcastDelivery_Property3(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	parameters.MaxSize = 5 // Limit generated sizes
	properties := gopter.NewProperties(parameters)

	// Property 3.1: All authenticated clients receive broadcast events
	properties.Property("all authenticated clients receive broadcast events", prop.ForAll(
		func(clientCount int, eventTypeIdx int) bool {
			if clientCount < 1 || clientCount > 10 {
				return true // skip invalid counts
			}

			eventTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeMessageSent,
				entity.EventTypeConnected,
				entity.EventTypeDisconnected,
				entity.EventTypeAuthenticated,
			}
			eventType := eventTypes[eventTypeIdx%len(eventTypes)]

			// Create hub with API key
			config := ws.EventHubConfig{
				APIKey:       "test-api-key",
				PingInterval: 30 * time.Second,
				WriteTimeout: 10 * time.Second,
				AuthTimeout:  10 * time.Second,
			}
			hub := ws.NewEventHub(config)
			go hub.Run()
			defer hub.Stop()

			// Create test server
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				client := ws.NewClient(conn, hub)
				hub.Register(client)
				go client.WritePump()
				go client.ReadPump()
			}))
			defer server.Close()

			// Connect clients and authenticate them
			wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
			clients := make([]*websocket.Conn, clientCount)
			receivedEvents := make([]chan *entity.Event, clientCount)

			for i := 0; i < clientCount; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					t.Logf("Failed to connect client %d: %v", i, err)
					return false
				}
				clients[i] = conn
				receivedEvents[i] = make(chan *entity.Event, 10)

				// Send auth message
				authMsg := ws.AuthMessage{Type: "auth", APIKey: "test-api-key"}
				if err := conn.WriteJSON(authMsg); err != nil {
					t.Logf("Failed to send auth for client %d: %v", i, err)
					conn.Close()
					return false
				}

				// Read auth response
				var authResp ws.AuthResponse
				if err := conn.ReadJSON(&authResp); err != nil {
					t.Logf("Failed to read auth response for client %d: %v", i, err)
					conn.Close()
					return false
				}
				if !authResp.Success {
					t.Logf("Auth failed for client %d", i)
					conn.Close()
					return false
				}

				// Start reading events in background
				idx := i
				go func() {
					for {
						_, message, err := clients[idx].ReadMessage()
						if err != nil {
							return
						}
						var event entity.Event
						if err := json.Unmarshal(message, &event); err != nil {
							continue
						}
						select {
						case receivedEvents[idx] <- &event:
						default:
						}
					}
				}()
			}

			// Wait for all clients to be registered
			time.Sleep(20 * time.Millisecond)

			// Broadcast an event
			testEvent, _ := entity.NewEventWithPayload(
				"test-event-id",
				eventType,
				"test-session",
				map[string]string{"test": "data"},
			)
			hub.Broadcast(testEvent)

			// Wait for events to be delivered
			time.Sleep(50 * time.Millisecond)

			// Verify all clients received the event
			allReceived := true
			for i := 0; i < clientCount; i++ {
				select {
				case event := <-receivedEvents[i]:
					if event.ID != testEvent.ID || event.Type != testEvent.Type {
						t.Logf("Client %d received wrong event", i)
						allReceived = false
					}
				default:
					t.Logf("Client %d did not receive event", i)
					allReceived = false
				}
			}

			// Cleanup
			for _, conn := range clients {
				if conn != nil {
					conn.Close()
				}
			}

			return allReceived
		},
		gen.IntRange(1, 5),
		gen.IntRange(0, 4),
	))

	// Property 3.2: Unauthenticated clients do not receive broadcast events
	properties.Property("unauthenticated clients do not receive broadcast events", prop.ForAll(
		func(authClientCount, unauthClientCount int) bool {
			if authClientCount < 1 || authClientCount > 5 || unauthClientCount < 1 || unauthClientCount > 5 {
				return true // skip invalid counts
			}

			// Create hub with API key
			config := ws.EventHubConfig{
				APIKey:       "test-api-key",
				PingInterval: 30 * time.Second,
				WriteTimeout: 10 * time.Second,
				AuthTimeout:  10 * time.Second,
			}
			hub := ws.NewEventHub(config)
			go hub.Run()
			defer hub.Stop()

			// Create test server
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				client := ws.NewClient(conn, hub)
				hub.Register(client)
				go client.WritePump()
				go client.ReadPump()
			}))
			defer server.Close()

			wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
			totalClients := authClientCount + unauthClientCount
			clients := make([]*websocket.Conn, totalClients)
			receivedEvents := make([]chan *entity.Event, totalClients)

			// Connect authenticated clients
			for i := 0; i < authClientCount; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					t.Logf("Failed to connect auth client %d: %v", i, err)
					return false
				}
				clients[i] = conn
				receivedEvents[i] = make(chan *entity.Event, 10)

				// Authenticate
				authMsg := ws.AuthMessage{Type: "auth", APIKey: "test-api-key"}
				if err := conn.WriteJSON(authMsg); err != nil {
					conn.Close()
					return false
				}
				var authResp ws.AuthResponse
				if err := conn.ReadJSON(&authResp); err != nil || !authResp.Success {
					conn.Close()
					return false
				}

				idx := i
				go func() {
					for {
						_, message, err := clients[idx].ReadMessage()
						if err != nil {
							return
						}
						var event entity.Event
						if err := json.Unmarshal(message, &event); err != nil {
							continue
						}
						select {
						case receivedEvents[idx] <- &event:
						default:
						}
					}
				}()
			}

			// Connect unauthenticated clients (don't send auth message)
			for i := authClientCount; i < totalClients; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					t.Logf("Failed to connect unauth client %d: %v", i, err)
					return false
				}
				clients[i] = conn
				receivedEvents[i] = make(chan *entity.Event, 10)

				idx := i
				go func() {
					for {
						_, message, err := clients[idx].ReadMessage()
						if err != nil {
							return
						}
						var event entity.Event
						if err := json.Unmarshal(message, &event); err != nil {
							continue
						}
						select {
						case receivedEvents[idx] <- &event:
						default:
						}
					}
				}()
			}

			// Wait for registration
			time.Sleep(20 * time.Millisecond)

			// Broadcast event
			testEvent, _ := entity.NewEventWithPayload(
				"test-event-id",
				entity.EventTypeMessageReceived,
				"test-session",
				map[string]string{"test": "data"},
			)
			hub.Broadcast(testEvent)

			// Wait for delivery
			time.Sleep(50 * time.Millisecond)

			// Verify authenticated clients received the event
			for i := 0; i < authClientCount; i++ {
				select {
				case <-receivedEvents[i]:
					// Good, received
				default:
					t.Logf("Authenticated client %d did not receive event", i)
					for _, conn := range clients {
						if conn != nil {
							conn.Close()
						}
					}
					return false
				}
			}

			// Verify unauthenticated clients did NOT receive the event
			for i := authClientCount; i < totalClients; i++ {
				select {
				case <-receivedEvents[i]:
					t.Logf("Unauthenticated client %d received event (should not)", i)
					for _, conn := range clients {
						if conn != nil {
							conn.Close()
						}
					}
					return false
				default:
					// Good, did not receive
				}
			}

			// Cleanup
			for _, conn := range clients {
				if conn != nil {
					conn.Close()
				}
			}

			return true
		},
		gen.IntRange(1, 3),
		gen.IntRange(1, 3),
	))

	// Property 3.3: Multiple events are all delivered to all authenticated clients
	properties.Property("multiple events are all delivered to all authenticated clients", prop.ForAll(
		func(clientCount, eventCount int) bool {
			if clientCount < 1 || clientCount > 5 || eventCount < 1 || eventCount > 10 {
				return true // skip invalid counts
			}

			// Create hub
			config := ws.EventHubConfig{
				APIKey:       "test-api-key",
				PingInterval: 30 * time.Second,
				WriteTimeout: 10 * time.Second,
				AuthTimeout:  10 * time.Second,
			}
			hub := ws.NewEventHub(config)
			go hub.Run()
			defer hub.Stop()

			// Create test server
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				client := ws.NewClient(conn, hub)
				hub.Register(client)
				go client.WritePump()
				go client.ReadPump()
			}))
			defer server.Close()

			wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
			clients := make([]*websocket.Conn, clientCount)
			receivedEvents := make([]chan *entity.Event, clientCount)
			var mu sync.Mutex
			receivedCounts := make([]int, clientCount)

			// Connect and authenticate clients
			for i := 0; i < clientCount; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					return false
				}
				clients[i] = conn
				receivedEvents[i] = make(chan *entity.Event, eventCount+10)

				authMsg := ws.AuthMessage{Type: "auth", APIKey: "test-api-key"}
				if err := conn.WriteJSON(authMsg); err != nil {
					conn.Close()
					return false
				}
				var authResp ws.AuthResponse
				if err := conn.ReadJSON(&authResp); err != nil || !authResp.Success {
					conn.Close()
					return false
				}

				idx := i
				go func() {
					for {
						_, message, err := clients[idx].ReadMessage()
						if err != nil {
							return
						}
						var event entity.Event
						if err := json.Unmarshal(message, &event); err != nil {
							continue
						}
						mu.Lock()
						receivedCounts[idx]++
						mu.Unlock()
					}
				}()
			}

			// Wait for registration
			time.Sleep(20 * time.Millisecond)

			// Broadcast multiple events
			for i := 0; i < eventCount; i++ {
				event, _ := entity.NewEventWithPayload(
					generateBroadcastTestEventID(i),
					entity.EventTypeMessageReceived,
					"test-session",
					map[string]int{"index": i},
				)
				hub.Broadcast(event)
			}

			// Wait for delivery
			time.Sleep(50 * time.Millisecond)

			// Verify all clients received all events
			mu.Lock()
			allReceived := true
			for i := 0; i < clientCount; i++ {
				if receivedCounts[i] != eventCount {
					t.Logf("Client %d received %d events, expected %d", i, receivedCounts[i], eventCount)
					allReceived = false
				}
			}
			mu.Unlock()

			// Cleanup
			for _, conn := range clients {
				if conn != nil {
					conn.Close()
				}
			}

			return allReceived
		},
		gen.IntRange(1, 3),
		gen.IntRange(1, 5),
	))

	// Property 3.4: Client count is accurate
	properties.Property("client count is accurate", prop.ForAll(
		func(clientCount int) bool {
			if clientCount < 1 || clientCount > 10 {
				return true
			}

			config := ws.EventHubConfig{
				APIKey:       "",
				PingInterval: 30 * time.Second,
				WriteTimeout: 10 * time.Second,
				AuthTimeout:  10 * time.Second,
			}
			hub := ws.NewEventHub(config)
			go hub.Run()
			defer hub.Stop()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				client := ws.NewClient(conn, hub)
				hub.Register(client)
				go client.WritePump()
				go client.ReadPump()
			}))
			defer server.Close()

			wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
			clients := make([]*websocket.Conn, clientCount)

			for i := 0; i < clientCount; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					return false
				}
				clients[i] = conn
			}

			// Wait for registration
			time.Sleep(20 * time.Millisecond)

			count := hub.ClientCount()

			// Cleanup
			for _, conn := range clients {
				if conn != nil {
					conn.Close()
				}
			}

			return count == clientCount
		},
		gen.IntRange(1, 5),
	))

	properties.TestingRun(t)
}

// generateBroadcastTestEventID generates a unique event ID for broadcast testing
func generateBroadcastTestEventID(index int) string {
	return time.Now().Format("20060102150405.000") + "_broadcast_" + string(rune('a'+index))
}
