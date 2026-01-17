# Database Initialization Scripts

This directory contains SQL scripts that are automatically executed when the PostgreSQL Docker container starts for the first time.

## How It Works

The PostgreSQL Docker image automatically runs all `.sql` and `.sh` files in `/docker-entrypoint-initdb.d/` in alphabetical order during the first container initialization.

Our `docker-compose.yml` mounts this directory:

```yaml
volumes:
  - ./packages/db/init-db:/docker-entrypoint-initdb.d:ro
```

## Scripts

### 001-init-extensions.sql

**Purpose:** Enable required PostgreSQL extensions

**Actions:**

- Enables `pgvector` extension for vector similarity search
- Verifies extension installation

**When it runs:** Always on first container start

### 002-add-indexes.sql

**Purpose:** Create performance indexes for high-volume queries

**Actions:**

- Creates HNSW indexes for vector similarity search
- Checks if tables exist before creating indexes
- Provides informative notices about index creation

**When it runs:** Only if tables exist (after Prisma migrations)

**Note:** If tables don't exist yet, you'll need to run this manually after running `bun run db:push`

## Usage

### New Database Setup

1. Start the database container:

   ```bash
   docker compose up -d postgres
   ```

2. Wait for the container to be healthy:

   ```bash
   docker compose ps postgres
   ```

3. Run Prisma migrations to create tables:

   ```bash
   cd packages/db
   bun run db:push
   ```

4. Apply indexes (if not already applied):
   ```bash
   bun run db:apply-indexes
   ```

### Existing Database

If you already have a running database, the init scripts won't run automatically. Instead:

1. Apply indexes manually:

   ```bash
   cd packages/db
   bun run db:apply-indexes
   ```

2. Or execute the SQL files directly:
   ```bash
   docker compose exec postgres psql -U postgres -d pharmabroker -f /docker-entrypoint-initdb.d/002-add-indexes.sql
   ```

## Troubleshooting

### Scripts Not Running

**Problem:** Init scripts only run on first container start

**Solution:**

1. Stop and remove the container:

   ```bash
   docker compose down -v
   ```

2. Remove the data volume:

   ```bash
   rm -rf pg_data
   ```

3. Start fresh:
   ```bash
   docker compose up -d postgres
   ```

### Tables Don't Exist

**Problem:** `002-add-indexes.sql` reports tables don't exist

**Solution:** This is expected. Run Prisma migrations first:

```bash
cd packages/db
bun run db:push
bun run db:apply-indexes
```

### Permission Denied

**Problem:** Cannot read init scripts

**Solution:** Check file permissions:

```bash
chmod +r packages/db/init-db/*.sql
```

## Adding New Init Scripts

To add new initialization scripts:

1. Create a new `.sql` file with a numeric prefix:

   ```
   003-your-script-name.sql
   ```

2. Add your SQL commands

3. Restart the container (only works on fresh database):
   ```bash
   docker compose down -v
   docker compose up -d postgres
   ```

## Best Practices

1. **Idempotent Scripts:** Use `IF NOT EXISTS` and `IF EXISTS` to make scripts safe to run multiple times

2. **Ordering:** Use numeric prefixes (001, 002, etc.) to control execution order

3. **Error Handling:** Use `DO $$ ... END $$` blocks for conditional logic

4. **Logging:** Use `RAISE NOTICE` to provide feedback during execution

5. **Testing:** Test scripts on a fresh database before deploying

## Monitoring

Check if init scripts ran successfully:

```bash
# View container logs
docker compose logs postgres | grep -A 10 "init"

# Check for extensions
docker compose exec postgres psql -U postgres -d pharmabroker -c "\dx"

# Check for indexes
docker compose exec postgres psql -U postgres -d pharmabroker -c "\di"
```

## Related Documentation

- [INDEXING_STRATEGY.md](../INDEXING_STRATEGY.md) - Complete indexing documentation
- [VECTOR_EMBEDDINGS.md](../VECTOR_EMBEDDINGS.md) - Vector embeddings guide
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres) - Official documentation
