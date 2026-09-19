/**
 * web/scripts/bootstrap-test-db.mts
 *
 * Repeatable one-time bootstrap to provision and migrate the isolated test database
 * (kientaohub_test) from the repository.
 *
 * Usage:
 *   node --import tsx/esm scripts/bootstrap-test-db.mts
 * or:
 *   pnpm test:db:setup
 */

import 'dotenv/config'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEB_ROOT = path.resolve(__dirname, '..')

function executePostgresSql(sql: string): string {
  try {
    return execSync(`docker exec kientaohub-postgres psql -U payload -d postgres -t -A -c "${sql}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch (_dockerErr) {
    // No matching container (CI runs PostgreSQL as a service, not in Docker), so reach the
    // server over the network using the same connection the application uses. The host,
    // port, user and password come from DATABASE_URL rather than being hard-coded, because
    // CI serves PostgreSQL on 127.0.0.1:5432 while local development uses :5433.
    // `hostname`, not `host`: the WHATWG URL `host` includes the port, which psql rejects.
    const { hostname, port, username, password } = new URL(
      process.env.DATABASE_URL || 'postgres://payload:payload@127.0.0.1:5433/kientaohub',
    )
    return execSync(
      `psql -h ${hostname || '127.0.0.1'} -p ${port || '5433'} -U ${username || 'payload'} -d postgres -t -A -c "${sql}"`,
      {
        encoding: 'utf8',
        env: { ...process.env, PGPASSWORD: password || 'payload' },
      },
    ).trim()
  }
}

async function bootstrapTestDatabase() {
  console.log('=== Bootstrapping Isolated Test Database (kientaohub_test) ===')

  const baseDbUrl =
    process.env.DATABASE_URL || 'postgres://payload:payload@127.0.0.1:5433/kientaohub'
  const testDbName = process.env.TEST_DB_NAME || 'kientaohub_test'

  console.log(`Checking if database "${testDbName}" exists...`)
  const checkRes = executePostgresSql(
    `SELECT 1 FROM pg_database WHERE datname = '${testDbName}';`
  )

  if (!checkRes.includes('1')) {
    console.log(`Database "${testDbName}" does not exist. Creating...`)
    executePostgresSql(`CREATE DATABASE "${testDbName}";`)
    console.log(`✓ Created database "${testDbName}".`)
  } else {
    console.log(`✓ Database "${testDbName}" already exists.`)
  }

  // Construct target test database URL
  const testDbUrl = new URL(baseDbUrl)
  testDbUrl.pathname = `/${testDbName}`
  const targetUrl = testDbUrl.toString()

  console.log(`Applying migrations to ${targetUrl}...`)
  execSync(`pnpm payload migrate`, {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      NODE_OPTIONS: '--no-deprecation',
    },
    stdio: 'inherit',
  })

  console.log(`\n✓ Successfully bootstrapped and migrated ${testDbName}!\n`)
}

bootstrapTestDatabase().catch((err) => {
  console.error('Fatal error bootstrapping test database:', err)
  process.exit(1)
})
