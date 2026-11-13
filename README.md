# Expense Tracker

Express server + [Clerk](https://clerk.com) authentication + SQLite. Expenses are stored per Clerk user.

## Run

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com) and enable the sign-in methods you want (email, Google, etc.).
2. Copy the keys from **Configure → API keys** into `.env` (see `.env.example`):

   ```
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

3. Start the app:

   ```bash
   npm install
   npm start        # http://localhost:3456
   ```

Clerk development keys work on `localhost`, so no custom domain is needed until you go to production.
The SQLite database (`data/app.db`) is created automatically on first start.

## API

All routes require a Clerk session token (`Authorization: Bearer ...`), which the front-end attaches automatically.

| Route | Description |
| --- | --- |
| `GET /api/config` | Public: returns the Clerk publishable key |
| `GET /api/expenses` | List the signed-in user's expenses |
| `POST /api/expenses` | Add an expense (`item`, `amount`, `category`, `date`) |
| `DELETE /api/expenses/:id` | Delete one of your expenses |

## Bank sync (Plaid, optional)

1. Create a free account at https://dashboard.plaid.com and copy your Sandbox `client_id` and secret.
2. Add `PLAID_CLIENT_ID`, `PLAID_SECRET` and `PLAID_ENV=sandbox` to `.env`, then restart the server.
3. Click **Connect bank** on the Overview page. In Sandbox, sign in with `user_good` / `pass_good`.

Purchases are imported (deduplicated) as expenses and auto-categorized; use **Sync now** to pull new ones. Access tokens are stored encrypted.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/plaid/items` | Connected banks |
| POST | `/api/plaid/link-token` | Start Plaid Link |
| POST | `/api/plaid/exchange` | Save a connected bank |
| POST | `/api/plaid/sync` | Import new transactions |
| DELETE | `/api/plaid/items/:id` | Disconnect a bank |
