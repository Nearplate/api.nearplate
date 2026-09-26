---
paths:
  - "**/*.{ts,json}"
---

# Code style

## Formatting (Prettier + ESLint)

- Tabs for indentation, 80-char line width, semicolons, double quotes, trailing commas (`.prettierrc`).
- ESLint flat config in `eslint.config.mjs` (`typescript-eslint` recommended + `eslint-config-prettier`).
- Run `npm run lint` and `npm run format` before finishing; CI runs `lint:check` and `format:check`.

## Naming

- Files: `kebab-case` with layer suffix (`auth.service.ts`, `auth.transformer.ts`).
- Classes: PascalCase matching file purpose (`AuthService`).
- Types: `T` prefix (`TUserResponse`, `TCreateUserInput`). Interfaces (ports): `I` prefix (`ICRUDService`).
- Transformer methods: `to{Action}RequestDTO` / `to{Action}ResponseDTO`.
- Constants in barrel arrays: PascalCase plural (`Controllers`, `Services`).
- Private members: `_` prefix.
- Injected dependencies are named after their class: `_` + camelCase class name (`_backgroundJobHelper`, `_resendAdapter`, `_authTokenRepository`), never shortened (`_resend`, `_service`). Mongoose `@InjectModel` fields are `_model`, `@InjectConnection` is `_connection`.

## JSDoc

- Write a JSDoc block (`/** ... */`) on **every method** in controllers, transformers, services, repositories, adapters, helpers, and subscribers.
- One line is fine when the method is straightforward; use more when behavior, side effects, or security constraints need explanation.
- Explain _why_ and non-obvious constraints, not a restatement of the name.

## Comments

- Add inline comments for non-obvious business logic, security rationale, and edge cases (CORS preflight, race conditions, cache key shape).
- Class-level block comments explain the file or type's role.

## Imports

- Use `@/` for `src/` and `@db/` for `db/` (schemas, `models.ts`).

## Logging

- `@LogClass()` on controllers, services, repositories, adapters.
- Cron subscribers catch and log errors — unhandled rejections crash the process.
- Use `logContext.run({ traceId, kind: "job" }, ...)` in background jobs.
