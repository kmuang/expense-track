import crypto from "node:crypto";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { db } from "./db.js";

export const plaidEnabled = Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

const client = plaidEnabled
  ? new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
        baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID, "PLAID-SECRET": process.env.PLAID_SECRET } },
      }),
    )
  : null;

// Access tokens grant bank access, so they're encrypted at rest (AES-256-GCM)
const key = crypto.createHash("sha256").update(process.env.PLAID_TOKEN_KEY || process.env.CLERK_SECRET_KEY).digest();
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decrypt(payload) {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const CATEGORY_MAP = {
  FOOD_AND_DRINK: "Food",
  TRANSPORTATION: "Transport",
  TRAVEL: "Transport",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  RENT_AND_UTILITIES: "Bills",
  LOAN_PAYMENTS: "Bills",
  GOVERNMENT_AND_NON_PROFIT: "Bills",
  ENTERTAINMENT: "Entertainment",
  MEDICAL: "Health",
  PERSONAL_CARE: "Health",
};

export function mapCategory(tx) {
  const primary = tx.personal_finance_category?.primary;
  const detailed = tx.personal_finance_category?.detailed || "";
  if (/SUBSCRIPTION|STREAMING|SOFTWARE/.test(detailed) || /TV_AND_MOVIES|MUSIC_AND_AUDIO/.test(detailed)) return "Subscription";
  return CATEGORY_MAP[primary] || "Other";
}

// Plaid reports money leaving the account as positive amounts; income and transfers are skipped
export function toExpenseRow(tx) {
  const primary = tx.personal_finance_category?.primary;
  if (tx.pending || !(tx.amount > 0) || ["INCOME", "TRANSFER_IN", "TRANSFER_OUT"].includes(primary)) return null;
  return {
    item: String(tx.merchant_name || tx.name || "Bank transaction").slice(0, 80),
    amount: Math.round(tx.amount * 100) / 100,
    category: mapCategory(tx),
    date: tx.date,
  };
}

export async function createLinkToken(userId) {
  const { data } = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Expense Tracker",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return data.link_token;
}

export async function exchangeAndStore(userId, publicToken, institutionName) {
  const { data } = await client.itemPublicTokenExchange({ public_token: publicToken });
  db.prepare(
    "INSERT INTO plaid_item (userId, itemId, accessToken, institutionName) VALUES (?, ?, ?, ?) ON CONFLICT(itemId) DO UPDATE SET accessToken = excluded.accessToken, userId = excluded.userId",
  ).run(userId, data.item_id, encrypt(data.access_token), String(institutionName || "Bank").slice(0, 60));
  return data.item_id;
}

const insertTx = db.prepare(
  "INSERT INTO expense (userId, item, amount, category, date, plaidTransactionId, plaidItemId) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(plaidTransactionId) DO UPDATE SET item = excluded.item, amount = excluded.amount, category = excluded.category, date = excluded.date WHERE userId = excluded.userId",
);
const deleteTx = db.prepare("DELETE FROM expense WHERE plaidTransactionId = ? AND userId = ?");

// Pulls every page of changes since the stored cursor and applies them in one transaction
export async function syncItem(item, api = client) {
  const token = decrypt(item.accessToken);
  let cursor = item.cursor || undefined;
  let hasMore = true;
  const added = [], modified = [], removed = [];
  while (hasMore) {
    const { data } = await api.transactionsSync({ access_token: token, cursor, count: 500 });
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  let imported = 0;
  db.transaction(() => {
    for (const tx of [...added, ...modified]) {
      const row = toExpenseRow(tx);
      if (!row) {
        deleteTx.run(tx.transaction_id, item.userId);
        continue;
      }
      const { changes } = insertTx.run(item.userId, row.item, row.amount, row.category, row.date, tx.transaction_id, item.itemId);
      imported += changes;
    }
    for (const tx of removed) deleteTx.run(tx.transaction_id, item.userId);
    db.prepare("UPDATE plaid_item SET cursor = ? WHERE id = ?").run(cursor, item.id);
  })();
  return { imported, removed: removed.length };
}

export async function removeItem(item) {
  try {
    await client.itemRemove({ access_token: decrypt(item.accessToken) });
  } catch {
    // The bank link may already be revoked; still remove our copy
  }
  db.prepare("DELETE FROM plaid_item WHERE id = ?").run(item.id);
}
