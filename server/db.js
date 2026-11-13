import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const file = process.env.DATABASE_FILE || "data/app.db";
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS expense_user_date ON expense (userId, date);

  CREATE TABLE IF NOT EXISTS plaid_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    itemId TEXT NOT NULL UNIQUE,
    accessToken TEXT NOT NULL,
    institutionName TEXT NOT NULL DEFAULT 'Bank',
    cursor TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS plaid_item_user ON plaid_item (userId);
`);

// Imported bank transactions keep Plaid's id so re-syncing never duplicates them
const columns = db.prepare("PRAGMA table_info(expense)").all().map((c) => c.name);
if (!columns.includes("plaidTransactionId")) db.exec("ALTER TABLE expense ADD COLUMN plaidTransactionId TEXT");
if (!columns.includes("plaidItemId")) db.exec("ALTER TABLE expense ADD COLUMN plaidItemId TEXT");
db.exec("DROP INDEX IF EXISTS expense_plaid_tx");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS expense_plaid_tx_unique ON expense (plaidTransactionId)");
