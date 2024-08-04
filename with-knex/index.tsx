import 'dotenv/config'
import knex from 'knex'

const connectionString = process.env.DATABASE_URL

const client = knex({
  client: 'pg',
  connection: {
    connectionString,
  },
})

function replaceQueryParams(query, values) {
  let replacedQuery = query
  values.forEach((tmpParameter) => {
    if (typeof tmpParameter === 'string') {
      replacedQuery = replacedQuery.replace('?', `'${tmpParameter}'`)
    } else {
      replacedQuery = replacedQuery.replace('?', tmpParameter)
    }
  })
  return replacedQuery
}

async function executeQuery(text, values, normalize = false) {
  if (normalize) return await client.raw(replaceQueryParams(text, values))
  return await client.raw(text, values)
}

await client.raw('SELECT 1')

let s = performance.now()

const query_1 = await executeQuery('SELECT * from playing_with_neon LIMIT ?', [5])

console.log(performance.now() - s)

s = performance.now()

const query_2 = await executeQuery('SELECT * from playing_with_neon LIMIT ?', [5], true)

console.log(performance.now() - s)

process.exit(0)
