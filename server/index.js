import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { db } from "./db.js";
import { plaidEnabled, createLinkToken, exchangeAndStore, syncItem, removeItem } from "./plaid.js";

if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
  console.error("Missing CLERK_PUBLISHABLE_KEY or CLERK_SECRET_KEY. Copy .env.example to .env and add the keys from the Clerk dashboard (API keys).");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Subscription", "Entertainment", "Health", "Other"];

app.use(express.json({ limit: "10kb" }));
app.use(clerkMiddleware());

app.get("/api/config", (_req, res) => res.json({ clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY, plaidEnabled }));

function requireUser(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });
  req.user = { id: userId };
  next();
}

const toExpense = (row) => ({ id: row.id, item: row.item, amount: row.amount, category: row.category, date: row.date, bank: Boolean(row.plaidTransactionId) });

function parseExpense(body = {}) {
  const item = String(body.item ?? "").trim().slice(0, 80);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const { category, date } = body;
  if (!item || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return null;
  if (!CATEGORIES.includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  return { item, amount, category, date };
}

app.get("/api/expenses", requireUser, (req, res) => {
  const rows = db.prepare("SELECT * FROM expense WHERE userId = ? ORDER BY date DESC, id DESC").all(req.user.id);
  res.json(rows.map(toExpense));
});

app.post("/api/expenses", requireUser, (req, res) => {
  const expense = parseExpense(req.body);
  if (!expense) return res.status(400).json({ error: "Invalid expense" });
  const { lastInsertRowid } = db
    .prepare("INSERT INTO expense (userId, item, amount, category, date) VALUES (?, ?, ?, ?, ?)")
    .run(req.user.id, expense.item, expense.amount, expense.category, expense.date);
  res.status(201).json({ id: Number(lastInsertRowid), ...expense });
});

app.delete("/api/expenses/:id", requireUser, (req, res) => {
  const { changes } = db.prepare("DELETE FROM expense WHERE id = ? AND userId = ?").run(Number(req.params.id), req.user.id);
  if (!changes) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

function requirePlaid(_req, res, next) {
  if (!plaidEnabled) return res.status(503).json({ error: "Bank sync isn’t configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env." });
  next();
}
const userItems = (userId) => db.prepare("SELECT * FROM plaid_item WHERE userId = ? ORDER BY id").all(userId);
const plaidError = (res, error) => {
  console.error("Plaid error:", error.response?.data?.error_code || error.message);
  res.status(502).json({ error: error.response?.data?.error_message || "Couldn’t reach your bank. Please try again." });
};

app.get("/api/plaid/items", requireUser, (req, res) => {
  res.json(userItems(req.user.id).map(({ id, institutionName, createdAt }) => ({ id, institutionName, createdAt })));
});

app.post("/api/plaid/link-token", requireUser, requirePlaid, async (req, res) => {
  try {
    res.json({ linkToken: await createLinkToken(req.user.id) });
  } catch (error) {
    plaidError(res, error);
  }
});

app.post("/api/plaid/exchange", requireUser, requirePlaid, async (req, res) => {
  const { publicToken, institutionName } = req.body ?? {};
  if (typeof publicToken !== "string" || !publicToken) return res.status(400).json({ error: "Missing public token" });
  try {
    const itemId = await exchangeAndStore(req.user.id, publicToken, institutionName);
    const item = db.prepare("SELECT * FROM plaid_item WHERE itemId = ?").get(itemId);
    res.status(201).json({ id: item.id, institutionName: item.institutionName });
  } catch (error) {
    plaidError(res, error);
  }
});

app.post("/api/plaid/sync", requireUser, requirePlaid, async (req, res) => {
  let imported = 0;
  try {
    for (const item of userItems(req.user.id)) imported += (await syncItem(item)).imported;
    res.json({ imported });
  } catch (error) {
    plaidError(res, error);
  }
});

app.delete("/api/plaid/items/:id", requireUser, requirePlaid, async (req, res) => {
  const item = db.prepare("SELECT * FROM plaid_item WHERE id = ? AND userId = ?").get(Number(req.params.id), req.user.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  await removeItem(item);
  res.status(204).end();
});

// Serve only the front-end files, never the server code, .env or database
for (const file of ["index.html", "script.js", "style.css"]) {
  app.get(file === "index.html" ? ["/", "/index.html"] : `/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
}
app.use("/img", express.static(path.join(root, "img")));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Expense tracker running at http://localhost:${port}`));
