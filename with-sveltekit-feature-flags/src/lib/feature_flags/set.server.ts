import sql from '../postgres.server'

export const setEnabled = async (flagName: string, flagValue: boolean) => {
  await sql`UPDATE feature_flags SET enabled = ${flagValue} WHERE flagName = ${flagName}`
}
