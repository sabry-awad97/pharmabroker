# WhatsApp Service Security Guide

Security considerations and best practices for deploying the WhatsApp Service in production.

## Overview

This document covers security features, configuration recommendations, and best practices for securing your WhatsApp Service deployment.

## Authentication

### API Key Authentication

The service supports API key authentication for all `/api/*` endpoints.

**Configuration:**

```bash
WHATSAPP_API_KEY_ENABLED=true
WHATSAPP_API_KEYS=sk_live_key1,sk_live_key2
WHATSAPP_API_KEY_HEADER=X-API-Key
```

**Best Practices:**

- Use strong, randomly generated API keys (minimum 32 characters)
- Rotate API keys regularly
- Use different keys for different environments
- Never commit API keys to version control
- Store keys in secure secret management systems (Vault, AWS Secrets Manager, etc.)

**Key Generation Example:**

```bash
# Generate a secure API key
openssl rand -base64 32
```

### Bypassed Endpoints

The following endpoints bypass API key authentication:

| Endpoint | Reason |
|----------|--------|
| `/health` | Kubernetes liveness probe |
| `/ready` | Kubernetes readiness probe |
| `/metrics` | Prometheus scraping |

## Rate Limiting

Rate limiting protects against abuse and denial-of-service attacks.

**Configuration:**

```bash
WHATSAPP_RATELIMIT_ENABLED=true
WHATSAPP_RATELIMIT_RPS=10
WHATSAPP_RATELIMIT_BURST=20
WHATSAPP_RATELIMIT_BY_IP=true
```

**Features:**

- Token bucket algorithm for smooth rate limiting
- Per-IP rate limiting to prevent single-source abuse
- Automatic cleanup of stale rate limit buckets
- Rate limit headers in responses for client awareness

**Response Headers:**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait (when rate limited) |

## CORS (Cross-Origin Resource Sharing)

CORS configuration controls which origins can access the API.

**Configuration:**

```bash
WHATSAPP_CORS_ORIGINS=https://app.example.com,https://admin.example.com
WHATSAPP_CORS_ALLOW_CREDENTIALS=true
```

**Best Practices:**

- Never use `*` (wildcard) in production
- Specify exact allowed origins
- Enable credentials only if needed
- Limit allowed methods and headers

**WebSocket Origin Validation:**

WebSocket connections also validate the `Origin` header against the CORS allowed origins list.

## Input Validation

All API inputs are validated before processing.

### Phone Number Validation

- Must be in E.164 format (`+` followed by country code and number)
- Length: 2-16 characters
- Only digits after the `+` prefix

### Message Content Validation

| Type | Max Length |
|------|------------|
| Text | 4096 characters |
| Caption | 1024 characters |

### Session Name Validation

- Length: 1-100 characters
- Trimmed of leading/trailing whitespace

## Circuit Breaker

The circuit breaker prevents cascading failures when WhatsApp services are unavailable.

**Configuration:**

```bash
WHATSAPP_CIRCUIT_BREAKER_ENABLED=true
WHATSAPP_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
WHATSAPP_CIRCUIT_BREAKER_TIMEOUT=30s
```

**States:**

| State | Behavior |
|-------|----------|
| Closed | Normal operation |
| Open | Requests fail immediately |
| Half-Open | Limited requests to test recovery |

## Network Security

### TLS/HTTPS

The service itself does not terminate TLS. Use a reverse proxy or load balancer for TLS termination.

**Recommended Setup:**

```
Client → Load Balancer (TLS) → WhatsApp Service (HTTP)
```

**Example Nginx Configuration:**

```nginx
server {
    listen 443 ssl;
    server_name whatsapp.example.com;

    ssl_certificate /etc/ssl/certs/whatsapp.crt;
    ssl_certificate_key /etc/ssl/private/whatsapp.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://whatsapp-service:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://whatsapp-service:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### IP Whitelisting

For additional security, restrict access to known IP ranges at the network level.

## Database Security

### SQLite Security

- Database file permissions should be restricted (600 or 640)
- Store database in a dedicated volume with appropriate permissions
- Enable WAL mode for better concurrency (enabled by default)

**Docker Volume Permissions:**

```dockerfile
RUN chown -R appuser:appuser /data
USER appuser
```

## Logging Security

### Sensitive Data

The service avoids logging sensitive data:

- API keys are never logged
- Phone numbers may be partially masked in logs
- Message content is not logged

### Log Levels

| Level | Use Case |
|-------|----------|
| `error` | Production (minimal logging) |
| `warn` | Production (with warnings) |
| `info` | Standard production |
| `debug` | Development only |

**Warning:** Never use `debug` level in production as it may expose sensitive information.

## Container Security

### Non-Root User

Run the container as a non-root user:

```dockerfile
RUN adduser -D -u 1000 appuser
USER appuser
```

### Read-Only Filesystem

Mount the root filesystem as read-only where possible:

```yaml
securityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  runAsNonRoot: true
```

### Resource Limits

Set appropriate resource limits:

```yaml
resources:
  limits:
    memory: "512Mi"
    cpu: "500m"
  requests:
    memory: "128Mi"
    cpu: "100m"
```

## Kubernetes Security

### Network Policies

Restrict network access to the service:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: whatsapp-network-policy
spec:
  podSelector:
    matchLabels:
      app: whatsapp
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api-server
      ports:
        - protocol: TCP
          port: 3000
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443  # WhatsApp servers
```

### Pod Security Standards

Apply restrictive pod security standards:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: whatsapp
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: whatsapp
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
        readOnlyRootFilesystem: true
```

## Security Checklist

### Pre-Deployment

- [ ] API key authentication enabled
- [ ] Strong API keys generated and stored securely
- [ ] CORS origins configured (no wildcards)
- [ ] Rate limiting enabled
- [ ] TLS termination configured
- [ ] Log level set appropriately
- [ ] Database file permissions restricted

### Runtime

- [ ] Container running as non-root
- [ ] Resource limits configured
- [ ] Network policies applied
- [ ] Secrets managed securely
- [ ] Monitoring and alerting configured

### Ongoing

- [ ] Regular API key rotation
- [ ] Security updates applied
- [ ] Logs monitored for anomalies
- [ ] Access patterns reviewed

## Incident Response

### Compromised API Key

1. Immediately disable the compromised key
2. Generate and deploy new keys
3. Review access logs for unauthorized activity
4. Notify affected parties if data was accessed

### Rate Limit Bypass Detected

1. Review rate limit configuration
2. Check for IP spoofing attempts
3. Consider additional IP-based restrictions
4. Enable additional logging for investigation

### Unauthorized Access Attempt

1. Review authentication logs
2. Check for brute force patterns
3. Consider temporary IP blocking
4. Enable additional monitoring

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. Do not disclose publicly until fixed
2. Provide detailed reproduction steps
3. Allow reasonable time for fix deployment

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
