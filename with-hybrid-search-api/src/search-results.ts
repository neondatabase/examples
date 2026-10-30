export function searchResults(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
    ...("vectorRank" in row
      ? { vectorRank: row.vectorRank === null ? null : Number(row.vectorRank) }
      : {}),
    ...("keywordRank" in row
      ? {
          keywordRank:
            row.keywordRank === null ? null : Number(row.keywordRank),
        }
      : {}),
  }));
}
