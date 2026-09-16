// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'

// Redirect tests to isolated test database unless explicitly overridden
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/kientaohub(\?.*)?$/, '/kientaohub_test$1')
    : 'postgres://payload:payload@127.0.0.1:5433/kientaohub_test')

process.env.DATABASE_URL = testDbUrl

