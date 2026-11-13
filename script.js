const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const appScreen = $("appScreen");
const expenseForm = $("expenseForm");
const expenseList = $("expenseList");
const categories = ["Food", "Transport", "Shopping", "Bills", "Subscription", "Entertainment", "Health", "Other"];
const colors = ["#4d9b67", "#7c86bd", "#e5a366", "#62a7a2", "#8974b8", "#d77c70", "#9b79b2", "#9da99b"];
let expenses = [];
let chart = null;
let userName = "friend";
let currentPage = "overview";

async function api(path, options = {}) {
  const token = await window.Clerk?.session?.getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || data?.error || "Something went wrong."), { status: res.status });
  return data;
}
async function load() {
  expenses = await api("/api/expenses");
}
function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function dateText(value) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function showApp(name = "friend") {
  userName = name || "friend";
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  const initial = userName === "friend" ? "P" : userName[0].toUpperCase();
  $("welcomeName").textContent = userName;
  $("userLabel").textContent = userName === "friend" ? "Personal account" : userName;
  $("userAvatar").textContent = initial;
  $("topAvatar").textContent = initial;
  $("todayLabel").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  render();
  navigate(location.hash.slice(1) || "overview");
}
function thisMonth(expense) {
  const date = new Date(`${expense.date}T12:00:00`);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}
function render() {
  const query = $("searchInput").value.trim().toLowerCase();
  const monthly = expenses.filter(thisMonth);
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const visible = sorted.filter((e) => `${e.item} ${e.category} ${e.date}`.toLowerCase().includes(query));
  $("monthTotal").textContent = money(monthly.reduce((sum, e) => sum + e.amount, 0));
  $("monthCount").textContent = monthly.length;
  $("monthSubtext").textContent = monthly.length ? `${monthly.length} expense${monthly.length === 1 ? "" : "s"} this month` : "Your monthly spending at a glance";
  $("countSubtext").textContent = monthly.length ? "Recorded this month" : "No expenses recorded yet";
  const totals = monthly.reduce((acc, e) => (acc[e.category] = (acc[e.category] || 0) + e.amount, acc), {});
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  $("topCategory").textContent = top ? top[0] : "—";
  $("topCategoryAmount").textContent = top ? `${money(top[1])} this month` : "Add an expense to see your top category";
  $("emptyState").classList.toggle("hidden", expenses.length > 0 || !!query);
  $("noResults").classList.toggle("hidden", !query || visible.length > 0);
  const recent = visible.slice(0, 5);
  $("transactionCount").textContent = query ? `Showing ${recent.length} matching transaction${recent.length === 1 ? "" : "s"}` : `Showing ${recent.length} of ${expenses.length} transactions`;
  $("clearSearchBtn").classList.toggle("hidden", !query);
  expenseList.innerHTML = recent.map(transactionRow).join("");
  renderAllTransactions(sorted);
  renderChart(totals);
  renderInsights(monthly, totals);
}
function transactionRow(e) { return `<tr><td><div class="description-cell"><span class="transaction-mark">${icon(e.category)}</span><span>${escapeHtml(e.item)}</span></div></td><td><span class="category-pill">${escapeHtml(e.category)}</span></td><td>${dateText(e.date)}</td><td class="amount-cell">${money(e.amount)}</td><td><button class="delete-expense" type="button" data-delete="${e.id}" aria-label="Delete ${escapeHtml(e.item)}" title="Delete expense">×</button></td></tr>`; }
function renderAllTransactions(sorted = [...expenses]) {
  const query = $("allSearchInput").value.trim().toLowerCase();
  const category = $("categoryFilter").value;
  const filtered = sorted.filter((e) => `${e.item} ${e.category} ${e.date}`.toLowerCase().includes(query) && (!category || e.category === category));
  $("allExpenseList").innerHTML = filtered.map(transactionRow).join("");
  $("allCount").textContent = expenses.length;
  $("allTotal").textContent = money(expenses.reduce((sum, e) => sum + e.amount, 0));
  $("allMonthTotal").textContent = money(expenses.filter(thisMonth).reduce((sum, e) => sum + e.amount, 0));
  $("allTransactionCount").textContent = `Showing ${filtered.length} of ${expenses.length} transaction${expenses.length === 1 ? "" : "s"}`;
  $("allEmptyState").classList.toggle("hidden", expenses.length > 0);
  $("allNoResults").classList.toggle("hidden", filtered.length > 0 || expenses.length === 0);
  $("resetFiltersBtn").classList.toggle("hidden", !query && !category);
}
function renderInsights(monthly, totals) {
  const categoryEntries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = monthly.reduce((sum, e) => sum + e.amount, 0);
  const top = categoryEntries[0];
  $("insightsSpent").textContent = money(total);
  $("insightsAverage").textContent = money(monthly.length ? total / monthly.length : 0);
  $("insightsTopCategory").textContent = top ? top[0] : "—";
  $("insightsTopAmount").textContent = top ? `${money(top[1])} this month` : "No category data yet";
  $("categoryBreakdown").innerHTML = categoryEntries.map(([name, amount]) => {
    const percent = total ? Math.round(amount / total * 100) : 0;
    const color = colors[categories.indexOf(name)] || colors[6];
    return `<div class="breakdown-row"><div class="breakdown-heading"><span><i class="legend-dot" style="background:${color}"></i>${escapeHtml(name)}</span><strong>${money(amount)} <small>${percent}%</small></strong></div><div class="breakdown-track"><span style="width:${percent}%;background:${color}"></span></div></div>`;
  }).join("");
  $("insightsEmpty").classList.toggle("hidden", categoryEntries.length > 0);
  const months = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = expenses.filter((e) => e.date.slice(0, 7) === key).reduce((sum, e) => sum + e.amount, 0);
    months.push({ label: date.toLocaleDateString("en-US", { month: "short" }), amount });
  }
  const max = Math.max(...months.map((m) => m.amount), 1);
  $("monthlyTrend").innerHTML = months.map((m) => `<div class="trend-column"><span class="trend-amount">${m.amount ? money(m.amount) : "—"}</span><div class="trend-track"><i style="height:${m.amount ? Math.max(5, m.amount / max * 100) : 0}%"></i></div><span class="trend-label">${m.label}</span></div>`).join("");
  const largest = [...monthly].sort((a, b) => b.amount - a.amount)[0];
  $("largestExpense").textContent = largest ? `${largest.item} · ${money(largest.amount)}` : "No expenses recorded this month";
}
function navigate(page) {
  currentPage = ["overview", "transactions", "insights"].includes(page) ? page : "overview";
  document.querySelector(".dashboard-content").classList.toggle("hidden", currentPage !== "overview");
  $("transactionsPage").classList.toggle("hidden", currentPage !== "transactions");
  $("insightsPage").classList.toggle("hidden", currentPage !== "insights");
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    const active = link.dataset.page === currentPage;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("currentPageName").textContent = currentPage === "overview" ? "Overview" : currentPage === "transactions" ? "Transactions" : "Spending insights";
  if (location.hash !== `#${currentPage}`) history.pushState(null, "", `#${currentPage}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function icon(category) { return ({ Food: "🍽️", Transport: "🚗", Shopping: "🛍️", Bills: "💡", Subscription: "🔄", Entertainment: "🎬", Health: "💊", Other: "📦" })[category] || "📦"; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function renderChart(totals) {
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const hasData = labels.length > 0;
  $("chartWrap").classList.toggle("hidden", !hasData);
  $("chartEmpty").classList.toggle("hidden", hasData);
  $("chartTotal").textContent = money(values.reduce((a, b) => a + b, 0));
  $("categoryLegend").innerHTML = labels.map((label, i) => `<div class="legend-row"><span class="legend-dot" style="background:${colors[categories.indexOf(label)] || colors[6]}"></span>${escapeHtml(label)}<strong>${money(values[i])}</strong></div>`).join("");
  if (!window.Chart || !hasData) { if (chart) { chart.destroy(); chart = null; } return; }
  if (chart) chart.destroy();
  chart = new Chart($("expenseChart"), { type: "doughnut", data: { labels, datasets: [{ data: values, backgroundColor: labels.map((label) => colors[categories.indexOf(label)] || colors[6]), borderWidth: 0, hoverOffset: 5 }] }, options: { cutout: "76%", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${money(ctx.raw)}` } } } } });
}

let clerk = null;
let activeUserId = null;
function loadScript(src, { publishableKey, cors = true } = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    if (cors) script.crossOrigin = "anonymous";
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
async function loadClerk(publishableKey) {
  const frontendApi = atob(publishableKey.split("_")[2]).slice(0, -1);
  // Clerk JS v6 ships its sign-in components in a separate UI bundle
  await loadScript(`https://${frontendApi}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await loadScript(`https://${frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { publishableKey });
  await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
  return window.Clerk;
}
let signInMounted = false;
function showSignIn() {
  if (signInMounted) return;
  signInMounted = true;
  activeUserId = null;
  expenses = [];
  appScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  $("clerkMount").replaceChildren();
  clerk.mountSignIn($("clerkMount"), {
    appearance: {
      variables: { colorPrimary: "#237a50", borderRadius: "9px", fontFamily: "Inter, sans-serif" },
      elements: { rootBox: { width: "100%" }, cardBox: { width: "100%", boxShadow: "none", border: "none" }, card: { boxShadow: "none", border: "none", padding: "0" } },
    },
  });
}
async function syncSession() {
  if (!clerk.user) return showSignIn();
  if (clerk.user.id === activeUserId) return;
  activeUserId = clerk.user.id;
  if (signInMounted) clerk.unmountSignIn($("clerkMount"));
  signInMounted = false;
  try {
    await load();
  } catch {
    return showAuthProblem("We couldn’t load your expenses. Check that the server is running and try again.");
  }
  const user = clerk.user;
  refreshBanks();
  showApp(user.firstName || user.primaryEmailAddress?.emailAddress.split("@")[0]);
}
function showAuthProblem(message) {
  loginScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
  $("clerkMount").innerHTML = `<p class="field-error" role="alert"></p>`;
  $("clerkMount").firstChild.textContent = message;
}
$("logoutBtn").addEventListener("click", () => clerk?.signOut());
$("searchInput").addEventListener("input", render);
$("clearSearchBtn").addEventListener("click", () => { $("searchInput").value = ""; render(); });
async function handleDelete(event) {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const id = Number(button.dataset.delete);
  try {
    await api(`/api/expenses/${id}`, { method: "DELETE" });
    expenses = expenses.filter((e) => e.id !== id);
    render();
  } catch (error) {
    if (error.status === 401) location.reload();
  }
}
expenseList.addEventListener("click", handleDelete);
$("allExpenseList").addEventListener("click", handleDelete);
$("allSearchInput").addEventListener("input", () => renderAllTransactions());
$("categoryFilter").addEventListener("change", () => renderAllTransactions());
$("resetFiltersBtn").addEventListener("click", () => { $("allSearchInput").value = ""; $("categoryFilter").value = ""; renderAllTransactions(); });
function pdfText(value) {
  return String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}
function createTransactionPdf() {
  const records = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const pages = [];
  const rowsPerPage = 32;
  const pageCount = Math.max(1, Math.ceil(records.length / rowsPerPage));
  const total = records.reduce((sum, expense) => sum + expense.amount, 0);
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const text = (value, x, y, size = 9, color = "0.20 0.27 0.22") => `BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET\n`;
  for (let page = 0; page < pageCount; page++) {
    let content = "";
    content += "0.09 0.27 0.17 rg 0 720 612 72 re f\n";
    content += text("Expense Tracker", 42, 758, 10, "0.82 0.92 0.84");
    content += text("Transaction report", 42, 738, 17, "1 1 1");
    content += text(`Generated ${reportDate}`, 420, 758, 9, "0.91 0.96 0.91");
    content += text(`TOTAL SPENDING  ${money(total)}     TRANSACTIONS  ${records.length}`, 42, 693, 10, "0.15 0.31 0.20");
    content += text("DESCRIPTION", 42, 660, 8, "0.43 0.49 0.44");
    content += text("CATEGORY", 330, 660, 8, "0.43 0.49 0.44");
    content += text("DATE", 432, 660, 8, "0.43 0.49 0.44");
    content += text("AMOUNT", 520, 660, 8, "0.43 0.49 0.44");
    content += "0.87 0.90 0.87 RG 0.6 w 42 650 m 570 650 l S\n";
    const pageRows = records.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    if (!pageRows.length) content += text("No transactions recorded.", 42, 628, 10, "0.48 0.53 0.48");
    pageRows.forEach((expense, index) => {
      const y = 630 - index * 17;
      content += text(expense.item.slice(0, 42), 42, y, 9);
      content += text(expense.category, 330, y, 9, "0.37 0.44 0.38");
      content += text(dateText(expense.date), 432, y, 9, "0.37 0.44 0.38");
      const amount = money(expense.amount);
      content += text(amount, 566 - amount.length * 5.2, y, 9, "0.20 0.27 0.22");
      if (index < pageRows.length - 1) content += `0.93 0.95 0.93 RG 0.35 w 42 ${y - 6} m 570 ${y - 6} l S\n`;
    });
    content += "0.87 0.90 0.87 RG 0.6 w 42 45 m 570 45 l S\n";
    content += text("Pennywise  |  Personal expense summary", 42, 29, 8, "0.48 0.53 0.48");
    content += text(`Page ${page + 1} of ${pageCount}`, 510, 29, 8, "0.48 0.53 0.48");
    pages.push(content);
  }
  const objects = [null, "", "", ""];
  const pageIds = [];
  pages.forEach((content) => {
    const pageId = objects.length;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream`);
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
}
$("exportPdfBtn").addEventListener("click", () => {
  const url = URL.createObjectURL(createTransactionPdf());
  const link = document.createElement("a"); link.href = url; link.download = "pennywise-transactions.pdf"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelectorAll(".nav-link[data-page]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); navigate(link.dataset.page); }));
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
window.addEventListener("popstate", () => navigate(location.hash.slice(1)));
document.querySelectorAll("[data-go-add]").forEach((button) => button.addEventListener("click", () => { navigate("overview"); setTimeout(focusForm, 80); }));
function focusForm() { $("addExpensePanel").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => $("item").focus(), 350); }
$("focusAddBtn").addEventListener("click", focusForm);
$("emptyAddBtn").addEventListener("click", focusForm);
expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = $("item").value.trim();
  const amount = Number($("amount").value);
  const error = $("expenseError");
  if (!item || !Number.isFinite(amount) || amount <= 0 || !$("expenseDate").value) {
    error.textContent = "Add a description, a valid amount, and a date."; error.classList.remove("hidden"); return;
  }
  error.classList.add("hidden");
  const feedback = $("expenseFeedback");
  try {
    const created = await api("/api/expenses", { method: "POST", body: JSON.stringify({ item, amount, category: $("category").value, date: $("expenseDate").value }) });
    expenses.push(created);
    expenseForm.reset();
    $("expenseDate").value = localDateValue();
    render();
    feedback.textContent = "Expense added.";
  } catch (err) {
    if (err.status === 401) return location.reload();
    feedback.textContent = "Couldn’t save the expense. Please try again.";
  }
  feedback.classList.remove("hidden");
  $("item").focus();
});
$("expenseDate").value = localDateValue();

let plaidEnabled = false;
let banks = [];
function setBankStatus(text) { $("bankStatus").textContent = text; }
function renderBanks() {
  const connected = banks.length > 0;
  $("connectBankBtn").disabled = !plaidEnabled;
  $("syncBankBtn").classList.toggle("hidden", !connected);
  $("disconnectBankBtn").classList.toggle("hidden", !connected);
  if (!plaidEnabled) setBankStatus("Bank sync isn’t set up yet. Add PLAID_CLIENT_ID and PLAID_SECRET to .env.");
  else if (connected) setBankStatus(`Connected: ${banks.map((b) => b.institutionName).join(", ")}`);
  else setBankStatus("Connect a bank to import purchases automatically.");
}
async function refreshBanks() {
  try { banks = await api("/api/plaid/items"); } catch { banks = []; }
  renderBanks();
}
async function syncBanks() {
  setBankStatus("Syncing…");
  try {
    const { imported } = await api("/api/plaid/sync", { method: "POST" });
    await load();
    render();
    renderBanks();
    setBankStatus(`${$("bankStatus").textContent} · ${imported} new transaction${imported === 1 ? "" : "s"}`);
  } catch (err) {
    setBankStatus(err.message);
  }
}
$("connectBankBtn").addEventListener("click", async () => {
  const button = $("connectBankBtn");
  button.disabled = true;
  try {
    if (!window.Plaid) await loadScript("https://cdn.plaid.com/link/v2/stable/link-initialize.js", { cors: false });
    const { linkToken } = await api("/api/plaid/link-token", { method: "POST" });
    window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          setBankStatus("Connecting…");
          await api("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ publicToken, institutionName: metadata?.institution?.name }) });
          await refreshBanks();
          await syncBanks();
        } catch (err) { setBankStatus(err.message); }
      },
      onExit: () => { button.disabled = !plaidEnabled; },
    }).open();
  } catch (err) {
    setBankStatus(err.message || "Couldn’t open bank connection.");
  }
  button.disabled = !plaidEnabled;
});
$("syncBankBtn").addEventListener("click", syncBanks);
$("disconnectBankBtn").addEventListener("click", async () => {
  if (!confirm("Disconnect your bank? Imported transactions stay in your list.")) return;
  try {
    for (const bank of banks) await api(`/api/plaid/items/${bank.id}`, { method: "DELETE" });
  } catch (err) { setBankStatus(err.message); return; }
  await refreshBanks();
});

(async function init() {
  try {
    const config = await api("/api/config");
    plaidEnabled = Boolean(config.plaidEnabled);
    const { clerkPublishableKey } = config;
    if (!clerkPublishableKey) return showAuthProblem("Clerk isn’t configured. Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .env, then restart the server.");
    clerk = await loadClerk(clerkPublishableKey);
    clerk.addListener(() => syncSession());
    await syncSession();
  } catch {
    showAuthProblem("Sign-in couldn’t be loaded. Check your connection and Clerk keys, then refresh.");
  }
})();
