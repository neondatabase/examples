import sql from '../postgres.server'

async function populateFeatureFlags() {
  await sql`CREATE TABLE IF NOT EXISTS feature_flags (flagName text PRIMARY KEY, enabled boolean)`
  console.log('✅ Setup database for feature flag')
  await sql`INSERT INTO feature_flags (flagName, enabled) VALUES ('fast_payments', true)`
  console.log('✅ Setup an enabled feature flag to accept fast payment methods.')
}

populateFeatureFlags()
