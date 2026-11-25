// This is a compatibility exception for the unconnected historical private
// validator, not a second migration registry. All other tracked files are required.
export const OPTIONAL_MIGRATIONS = Object.freeze(['0003_proposal_validation.sql']);

export function appliedMigrations(files, rows) {
  if (!Array.isArray(rows) || rows.some(row => typeof row?.name !== 'string')) return null;
  const names = rows.map(row => row.name);
  if (new Set(names).size !== names.length || names.some(name => !files.includes(name)) ||
      files.some(name => !OPTIONAL_MIGRATIONS.includes(name) && !names.includes(name))) return null;
  return files.filter(name => names.includes(name));
}
