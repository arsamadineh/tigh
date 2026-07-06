# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Tigh, please email security@example.com instead of using the issue tracker. Please include:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

We will acknowledge receipt of your report within 48 hours and will provide an estimated timeline for a fix.

## Security Best Practices

When using Tigh in production:

1. **Keep dependencies updated** - Run `npm audit` regularly
2. **Validate input** - Always validate request data before processing
3. **Use HTTPS** - Always use HTTPS in production
4. **Implement authentication** - Use proper authentication middleware
5. **Rate limit aggressively** - Protect against brute force attacks
6. **Monitor metrics** - Track unusual patterns in your metrics
7. **Use environment variables** - Never hardcode secrets
8. **Enable circuit breaker** - Protect against cascading failures

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | ✓ Current release  |

## Security Updates

We will release security updates for the latest version. Users are responsible for upgrading to the latest version to receive security fixes.

---

Thank you for helping keep Tigh secure!
