import sql from '../postgres.server'

export const isEnabled = async (flagName: string): Promise<boolean> => {
  const rows = await sql`SELECT enabled FROM feature_flags WHERE flagName = ${flagName}`
  return rows[0].enabled
}
