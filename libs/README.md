# Shared libraries

Shared code, one folder per language. Keep these small: they hold
cross-cutting helpers (logging, JWT validation, event envelope, health checks),
never business logic.

- `libs/go/`
- `libs/ts/`
- `libs/python/`
