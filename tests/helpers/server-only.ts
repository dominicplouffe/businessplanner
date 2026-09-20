/* A no-op stand-in for the `server-only` package.
 *
 * The real module throws when imported outside a server component, which is
 * exactly what it is for — and what makes any module carrying it impossible to
 * unit-test. Aliased in vitest.config.mts so the guard stays in the shipped
 * build and the logic behind it stays testable. */
export {};
