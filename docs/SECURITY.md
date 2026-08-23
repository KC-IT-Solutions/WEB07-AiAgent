# Security Rules

Security rules must not be weakened to make a feature easier to implement.

## External Input

Treat all external input as untrusted.

Validate and constrain input at system boundaries.

Do not rely on TypeScript types for runtime validation.

## Authentication and Authorization

* Never trust client-provided authorization decisions.
* Perform authorization checks server-side.
* Check authorization for the specific resource being accessed.
* Fail closed when authorization cannot be determined safely.
* Do not expose privileged functionality through client-side checks only.

## Secrets

Never:

* commit secrets
* hardcode credentials
* expose server secrets to browser code
* log credentials, passwords, tokens, session values, API keys, or authorization headers

Secrets must come from the approved configuration mechanism.

## Database

* Use parameterized queries or safe query builders.
* Never concatenate untrusted input into database queries.
* Apply least privilege to database access where possible.

## HTML and Browser Output

* Do not inject untrusted content into HTML without safe escaping or sanitization.
* Avoid unsafe dynamic HTML generation.
* Treat user-generated content as untrusted.

## Sessions and Cookies

Use secure defaults where supported.

Security-sensitive cookies should use appropriate protections such as:

* `HttpOnly`
* `Secure`
* appropriate `SameSite` policy

Do not expose session identifiers unnecessarily.

## Error Responses

Do not expose:

* stack traces
* secrets
* internal filesystem paths
* database details
* implementation internals

Return controlled public error responses.

## Logging

Logs must not contain sensitive data.

Log security-relevant events with enough context for investigation, but without storing secrets.

## Dependencies

Do not add security-sensitive dependencies casually.

Prefer well-maintained, established packages where a dependency is genuinely required.

Do not disable security checks, validation, TLS verification, authentication, or authorization as a workaround.
