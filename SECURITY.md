# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in OCR, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Send an email to **ikashue@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, typically within 2 weeks

### What to Expect

- We will acknowledge receipt of your report
- We will work with you to understand the issue
- We will keep you informed of our progress
- We will credit you in the fix (unless you prefer to remain anonymous)

## Security Measures

### Client-side processing

- OCR models and document processing run in the browser.
- Source files are not uploaded to an OCR or LLM service.
- The backend exposes only static metadata, health checks, and SEO assets.

### API and deployment boundaries

- CORS uses the configured `PUBLIC_ORIGIN`, with the production origin as fallback.
- Security headers are applied to API responses.
- API errors return generic messages and do not expose internal exceptions.
- No application API keys are required for OCR or local development.

### Input handling

- The browser accepts only PNG, JPEG, WebP, BMP, TIFF, and PDF files.
- Images are limited to 10 MB; PDFs are limited to 200 MB.
- PDF rendering is capped at 50 pages by default to bound browser memory usage.

## Supported Versions

| Version | Supported |
|---|---|
| Latest | ✅ |
| Older | ❌ |

We only provide security updates for the latest version.
