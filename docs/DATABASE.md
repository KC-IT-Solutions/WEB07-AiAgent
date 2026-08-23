# Database Rules

The project uses SQLite.

The database model is intentionally hybrid:

* relational columns for identity, relationships, constraints, and lifecycle metadata
* JSON for flexible domain data that would otherwise require frequent schema changes

## Standard Table Structure

Use this structure unless a concrete reason requires something else:

```sql
CREATE TABLE example (
    id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL CHECK (json_valid(data))
);
```

Standard columns:

* `id` — integer primary key
* `created_at` — creation timestamp
* `updated_at` — last modification timestamp
* `data` — JSON document containing flexible domain properties

Use integer Unix timestamps consistently unless the project defines another standard.

## Primary Keys

Use:

```sql
id INTEGER PRIMARY KEY
```

Do not use UUIDs or string IDs unless explicitly required.

Do not store the primary ID redundantly inside `data`.

## JSON Data

Use `data` for flexible attributes primarily interpreted by application code.

Example:

```json
{
  "name": "Example",
  "status": "active",
  "settings": {
    "language": "sv",
    "theme": "dark"
  }
}
```

JSON may represent multiple logical or virtual columns.

Keep JSON structures:

* explicit
* typed in application code
* reasonably shallow
* consistent within the same entity type

Do not create multiple names for the same concept.

For example, do not mix:

```text
status
state
itemStatus
```

for the same semantic field.

## Real Columns vs JSON

Use real columns when the database must understand the value structurally.

Prefer real columns for:

* primary keys
* foreign keys
* frequently joined values
* values requiring database-level `UNIQUE` constraints
* values requiring foreign-key constraints
* values heavily used for filtering or sorting
* values needed for database integrity

Prefer JSON for:

* optional domain attributes
* configuration
* settings
* metadata
* display-related properties
* flexible feature-specific data
* attributes likely to evolve without requiring relational constraints

Do not place relational identifiers only inside JSON when a real foreign key is appropriate.

Bad:

```json
{
  "userId": 42
}
```

when the entity has a real relationship to `users`.

Prefer:

```sql
user_id INTEGER NOT NULL REFERENCES users(id)
```

plus flexible attributes in `data`.

## Example Relational Table

```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL CHECK (json_valid(data)),

    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## JSON Validation

Stored JSON must always be valid JSON.

Use:

```sql
CHECK (json_valid(data))
```

for JSON-backed columns where appropriate.

Application code must also validate the semantic structure before using stored or incoming JSON.

SQLite JSON validity does not replace application-level schema validation.

## TypeScript Models

Every important JSON structure should have an explicit TypeScript type or runtime schema.

Example:

```ts
interface UserData {
  name: string;
  status: "active" | "inactive";

  settings?: {
    language?: string;
    theme?: "light" | "dark";
  };
}
```

Prefer runtime schema validation when data crosses a trust boundary or when stored data may have multiple historical versions.

Do not use `any` for database JSON.

## JSON Evolution

Prefer backward-compatible changes to JSON structures.

Safe changes usually include:

* adding optional properties
* adding nested objects with defaults
* accepting older representations during migration periods

Avoid changing the meaning of an existing property silently.

When renaming or restructuring existing JSON:

* support old data explicitly
* migrate stored data when necessary
* update tests
* document meaningful compatibility decisions

Do not assume every existing row contains newly introduced properties.

## Defaults

Application code must define sensible defaults for optional JSON properties.

Do not require immediate database migrations only to add optional JSON fields.

Example:

```ts
const theme = data.settings?.theme ?? "light";
```

Use explicit migrations when a new value is required for correctness rather than merely optional.

## Querying JSON

SQLite JSON functions may be used when appropriate.

Example:

```sql
SELECT
    id,
    json_extract(data, '$.status') AS status
FROM users;
```

Do not repeatedly parse JSON in application code when SQLite can perform the required filtering safely and clearly.

## Frequently Queried JSON Values

If a JSON property becomes important for frequent:

* filtering
* sorting
* joining
* uniqueness
* integrity constraints

reassess whether it should remain only inside JSON.

Possible solutions include:

* an expression index
* a generated column
* a real relational column

Do not keep performance-critical or integrity-critical data buried in JSON solely to avoid schema changes.

## Indexes

Create indexes only for demonstrated query needs.

Do not add indexes speculatively.

Foreign keys and frequently queried relational columns should be considered for indexing based on actual access patterns.

JSON expression indexes may be used when a JSON path is queried frequently.

Example:

```sql
CREATE INDEX idx_users_status
ON users(json_extract(data, '$.status'));
```

Before adding an index:

* identify the query it supports
* verify the indexed expression matches the query
* consider write and storage cost

## Timestamps

Every table using the standard model must maintain:

```text
created_at
updated_at
```

`created_at` is set when the row is created.

`updated_at` must change whenever persistent row data changes.

Do not update `created_at`.

Timestamp handling must be implemented consistently across repositories.

Prefer a shared persistence mechanism or database trigger if it prevents inconsistent behavior.

## Foreign Keys

Use SQLite foreign-key constraints for real relationships.

Enable foreign-key enforcement for database connections.

Do not rely only on application code to preserve referential integrity.

Choose deletion behavior intentionally.

Do not use cascading deletes unless the ownership semantics clearly require it.

## Transactions

Use transactions when multiple writes must succeed or fail as one logical operation.

Examples:

* creating multiple related records
* updating a record and related state
* moving ownership or relationships
* operations where partial completion would corrupt application state

Keep transactions as short as practical.

Do not perform slow external API calls while holding a database transaction open.

## Migrations

All structural database changes must be performed through the project's migration mechanism.

Do not modify existing production migrations after they may have been applied.

Create a new migration instead.

Migrations should:

* be deterministic
* preserve existing data unless deletion is intentional
* be safe for existing installations
* clearly describe structural changes

Avoid schema migrations when an optional JSON property solves the requirement cleanly.

Use a migration when database-level structure or integrity actually changes.

## Data Migration

When JSON structure changes require existing records to be transformed:

* make the transformation explicit
* preserve valid existing information
* handle missing or old fields
* make migration behavior deterministic
* test representative old data

Do not assume the database is empty.

## Repository Boundary

Database access belongs in repositories or the designated persistence layer.

Application and HTTP layers should not construct ad-hoc SQL directly.

Repositories are responsible for:

* SQL queries
* serialization
* JSON parsing
* persistence-specific mapping
* database errors where appropriate

Application code should work with typed domain/application objects rather than raw database rows where practical.

## Serialization

JSON serialization and parsing should happen consistently.

Do not spread arbitrary calls to:

```ts
JSON.parse(...)
JSON.stringify(...)
```

through unrelated application code when repository-level mapping can centralize the behavior.

Validate parsed data before trusting it when required.

## Concurrency

Do not assume read-modify-write operations are safe merely because SQLite is local.

When correctness depends on current stored state:

* use appropriate transactions
* use conditional updates where useful
* avoid unnecessary race windows

## Security

Never build SQL by concatenating untrusted values.

Use parameterized queries.

Bad:

```ts
db.prepare(`SELECT * FROM users WHERE id = ${id}`);
```

Good:

```ts
db.prepare("SELECT * FROM users WHERE id = ?").get(id);
```

Do not store secrets in JSON unless persistence is explicitly required and appropriately protected.

## Testing

Database-related behavior should test:

* persistence
* serialization/deserialization
* JSON defaults where relevant
* foreign-key behavior
* migrations when they carry meaningful risk
* important queries and indexes where relevant

Tests must use an isolated test database.

Never run automated tests against production data.

## AI Rules

Before changing database code:

1. Inspect existing tables, migrations, repositories, and JSON structures.
2. Reuse existing persistence patterns.
3. Determine whether new data belongs in `data` or requires a real column.
4. Prefer JSON for flexible domain attributes.
5. Use real columns for relationships, constraints, and structurally important values.
6. Avoid schema changes when an optional JSON property solves the requirement cleanly.
7. Do not hide relational relationships inside JSON.
8. Do not add indexes without a concrete query need.
9. Preserve existing data and compatibility.
10. Add or update relevant database tests.

Do not redesign the persistence model as part of an unrelated feature.

## Core Principle

```text
SQLite owns identity, relationships, integrity, and lifecycle metadata.

JSON owns flexible domain attributes.

Use real columns when the database must understand the value structurally.
Use JSON when the application primarily owns the structure and semantics.
```
