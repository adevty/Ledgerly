import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabaseBackup(customDbPath, customBackupDir) {
  const dbPath = resolve(
    process.cwd(),
    customDbPath ??
      process.env.LEDGERLY_DB_PATH ??
      process.env.LEDGERLY_SQLITE_PATH ??
      ".data/ledgerly.sqlite",
  );

  if (!existsSync(dbPath)) {
    throw new Error(`Database file does not exist at '${dbPath}'. Cannot perform backup.`);
  }

  const backupDir = resolve(process.cwd(), customBackupDir ?? "backups");
  mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(backupDir, `ledgerly-backup-${timestamp}.sqlite`);

  if (existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite existing backup file at '${backupPath}'.`);
  }

  const db = new DatabaseSync(dbPath);
  try {
    // VACUUM INTO creates an exact, atomic, vacuumed snapshot of the SQLite database
    const stmt = db.prepare("VACUUM INTO ?");
    stmt.run(backupPath);
  } finally {
    db.close();
  }

  return backupPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const backupFile = createDatabaseBackup();
    console.log(`[db:backup] Snapshot successfully written to: ${backupFile}`);
  } catch (err) {
    console.error(`[db:backup] Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
