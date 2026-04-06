/**
 * test.js — Full API test suite (no external test runner needed)
 * Run: node test.js
 */

process.env.DATABASE_URL = "file:./data/test.db";
process.env.JWT_SECRET    = "test_secret_key";
process.env.JWT_EXPIRES_IN = "1h";
process.env.PORT           = "3001";

// Suppress dotenv logs
process.env.DOTENV_QUIET = "true";

const http    = require("http");
const { getDb, run, get } = require("./src/utils/db");

// ── Tiny HTTP helper ─────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "localhost",
      port: 3001,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, got) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    console.log(`     Got: ${JSON.stringify(got)}`);
    failed++;
  }
}

// ── Main test sequence ───────────────────────────────────────────────────────
async function runTests(app) {
  let adminToken, analystToken, viewerToken, recordId;

  // ── Health ────────────────────────────────────────────────────────────────
  console.log("\n── Health ──────────────────────────────────────────");
  {
    const r = await req("GET", "/health");
    assert("GET /health returns 200", r.status === 200, r.body);
    assert("success: true", r.body.success === true, r.body);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log("\n── Auth ────────────────────────────────────────────");
  {
    // Validation error
    const bad = await req("POST", "/api/auth/register", { name: "x", email: "bad", password: "12" });
    assert("Register: validation rejects short password + bad email", bad.status === 400, bad.body);
    assert("Register: returns field-level errors", bad.body.details?.email, bad.body);

    // Duplicate email
    const dup = await req("POST", "/api/auth/register", { name: "Dup", email: "admin@finance.com", password: "admin123" });
    assert("Register: rejects duplicate email with 409", dup.status === 409, dup.body);

    // Role in body must not grant admin (public signup → viewer only)
    const regNew = await req("POST", "/api/auth/register", {
      name: "Self Reg",
      email: "selfreg@test.com",
      password: "secret12",
      role: "admin",
    });
    assert("Register: new user is viewer (role field ignored)", regNew.body.data?.user?.role === "viewer", regNew.body);

    // Login — admin
    const la = await req("POST", "/api/auth/login", { email: "admin@finance.com", password: "admin123" });
    assert("Login admin: 200", la.status === 200, la.body);
    assert("Login admin: token present", !!la.body.data?.token, la.body);
    adminToken = la.body.data.token;

    // Login — analyst
    const lan = await req("POST", "/api/auth/login", { email: "analyst@finance.com", password: "analyst123" });
    assert("Login analyst: 200", lan.status === 200, lan.body);
    analystToken = lan.body.data.token;

    // Login — viewer
    const lv = await req("POST", "/api/auth/login", { email: "viewer@finance.com", password: "viewer123" });
    assert("Login viewer: 200", lv.status === 200, lv.body);
    viewerToken = lv.body.data.token;

    // Wrong password
    const wp = await req("POST", "/api/auth/login", { email: "admin@finance.com", password: "wrong" });
    assert("Login: wrong password → 401", wp.status === 401, wp.body);

    // No token
    const me = await req("GET", "/api/auth/me");
    assert("GET /me without token → 401", me.status === 401, me.body);

    // With token
    const me2 = await req("GET", "/api/auth/me", null, adminToken);
    assert("GET /me with token → 200", me2.status === 200, me2.body);
    assert("GET /me returns correct role", me2.body.data?.user?.role === "admin", me2.body);
  }

  // ── Records ───────────────────────────────────────────────────────────────
  console.log("\n── Records ─────────────────────────────────────────");
  {
    // Viewer can read
    const gr = await req("GET", "/api/records?limit=5", null, viewerToken);
    assert("GET /records as viewer: 200", gr.status === 200, gr.body);
    assert("GET /records: pagination present", !!gr.body.data?.pagination, gr.body);
    assert("GET /records: has records", gr.body.data?.records?.length > 0, gr.body);

    // Viewer cannot create
    const vc = await req("POST", "/api/records",
      { amount: 100, type: "expense", category: "Food", date: "2024-01-01" }, viewerToken);
    assert("POST /records as viewer → 403", vc.status === 403, vc.body);

    // Admin creates
    const cr = await req("POST", "/api/records",
      { amount: 75000, type: "income", category: "Salary", date: "2024-04-01", description: "April" },
      adminToken);
    assert("POST /records as admin → 201", cr.status === 201, cr.body);
    assert("Created record has correct amount", cr.body.data?.record?.amount === 75000, cr.body);
    recordId = cr.body.data.record.id;

    // Validation — negative amount
    const va = await req("POST", "/api/records",
      { amount: -500, type: "income", category: "X", date: "2024-01-01" }, adminToken);
    assert("POST /records: negative amount → 400", va.status === 400, va.body);

    // Get by ID
    const gid = await req("GET", `/api/records/${recordId}`, null, viewerToken);
    assert("GET /records/:id → 200", gid.status === 200, gid.body);

    // Update
    const upd = await req("PUT", `/api/records/${recordId}`, { amount: 80000, description: "Updated" }, adminToken);
    assert("PUT /records/:id → 200", upd.status === 200, upd.body);
    assert("PUT: amount updated correctly", upd.body.data?.record?.amount === 80000, upd.body);

    // Analyst cannot update
    const au = await req("PUT", `/api/records/${recordId}`, { amount: 1 }, analystToken);
    assert("PUT /records/:id as analyst → 403", au.status === 403, au.body);

    // Filtering by type
    const ft = await req("GET", "/api/records?type=income&limit=5", null, analystToken);
    assert("GET /records?type=income: all returned are income",
      ft.body.data?.records?.every(r => r.type === "income"), ft.body);

    // Soft delete
    const del = await req("DELETE", `/api/records/${recordId}`, null, adminToken);
    assert("DELETE /records/:id → 200", del.status === 200, del.body);

    // After delete — 404
    const gone = await req("GET", `/api/records/${recordId}`, null, adminToken);
    assert("GET deleted record → 404", gone.status === 404, gone.body);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  console.log("\n── Dashboard ───────────────────────────────────────");
  {
    // Summary — all roles
    const sum = await req("GET", "/api/dashboard/summary", null, viewerToken);
    assert("GET /dashboard/summary as viewer → 200", sum.status === 200, sum.body);
    assert("Summary: has total_income", typeof sum.body.data?.summary?.total_income === "number", sum.body);
    assert("Summary: has net_balance", typeof sum.body.data?.summary?.net_balance === "number", sum.body);

    // Recent — all roles
    const rec = await req("GET", "/api/dashboard/recent?limit=5", null, viewerToken);
    assert("GET /dashboard/recent as viewer → 200", rec.status === 200, rec.body);
    assert("Recent: returns array", Array.isArray(rec.body.data?.records), rec.body);

    // By-category — viewer blocked
    const bcv = await req("GET", "/api/dashboard/by-category", null, viewerToken);
    assert("GET /dashboard/by-category as viewer → 403", bcv.status === 403, bcv.body);

    // By-category — analyst allowed
    const bca = await req("GET", "/api/dashboard/by-category", null, analystToken);
    assert("GET /dashboard/by-category as analyst → 200", bca.status === 200, bca.body);
    assert("By-category: returns categories array", Array.isArray(bca.body.data?.categories), bca.body);

    // Trends — viewer blocked
    const tv = await req("GET", "/api/dashboard/trends", null, viewerToken);
    assert("GET /dashboard/trends as viewer → 403", tv.status === 403, tv.body);

    // Trends — analyst allowed
    const ta = await req("GET", "/api/dashboard/trends?period=monthly&months=6", null, analystToken);
    assert("GET /dashboard/trends as analyst → 200", ta.status === 200, ta.body);
    assert("Trends: has period field", ta.body.data?.period === "monthly", ta.body);

  }

  // ── Users (Admin only) ────────────────────────────────────────────────────
  console.log("\n── Users ───────────────────────────────────────────");
  {
    // Viewer cannot list users
    const vusr = await req("GET", "/api/users", null, viewerToken);
    assert("GET /users as viewer → 403", vusr.status === 403, vusr.body);

    // Admin can list users
    const ausrs = await req("GET", "/api/users", null, adminToken);
    assert("GET /users as admin → 200", ausrs.status === 200, ausrs.body);
    assert("GET /users: returns users array", Array.isArray(ausrs.body.data?.users), ausrs.body);

    // Admin creates user with role
    const created = await req(
      "POST",
      "/api/users",
      {
        name: "Created By Admin",
        email: "createdbyadmin@test.com",
        password: "password12",
        role: "analyst",
      },
      adminToken
    );
    assert("POST /users as admin → 201", created.status === 201, created.body);
    assert("POST /users: role persisted", created.body.data?.user?.role === "analyst", created.body);

    const noCreate = await req("POST", "/api/users", { name: "X", email: "y@z.com", password: "longpass12", role: "viewer" }, viewerToken);
    assert("POST /users as viewer → 403", noCreate.status === 403, noCreate.body);

    // Get analyst user id
    const analytistId = ausrs.body.data.users.find(u => u.role === "analyst")?.id;

    // Update role
    const ur = await req("PATCH", `/api/users/${analytistId}/role`, { role: "viewer" }, adminToken);
    assert("PATCH /users/:id/role → 200", ur.status === 200, ur.body);
    assert("Role updated to viewer", ur.body.data?.user?.role === "viewer", ur.body);

    // Restore role
    await req("PATCH", `/api/users/${analytistId}/role`, { role: "analyst" }, adminToken);

    // Update status
    const us = await req("PATCH", `/api/users/${analytistId}/status`, { status: "inactive" }, adminToken);
    assert("PATCH /users/:id/status → 200", us.status === 200, us.body);
    assert("Status updated to inactive", us.body.data?.user?.status === "inactive", us.body);

    // Inactive user cannot login
    await req("PATCH", `/api/users/${analytistId}/status`, { status: "inactive" }, adminToken);
    const inact = await req("POST", "/api/auth/login", { email: "analyst@finance.com", password: "analyst123" });
    assert("Inactive user login → 403", inact.status === 403, inact.body);

    // Restore
    await req("PATCH", `/api/users/${analytistId}/status`, { status: "active" }, adminToken);

    // Invalid role value
    const invr = await req("PATCH", `/api/users/${analytistId}/role`, { role: "superadmin" }, adminToken);
    assert("PATCH role with invalid value → 400", invr.status === 400, invr.body);
  }

  // ── Edge cases ────────────────────────────────────────────────────────────
  console.log("\n── Edge Cases ──────────────────────────────────────");
  {
    // Unknown route
    const nr = await req("GET", "/api/nonexistent", null, adminToken);
    assert("Unknown route → 404", nr.status === 404, nr.body);

    // No auth token
    const noauth = await req("GET", "/api/records");
    assert("Protected route without token → 401", noauth.status === 401, noauth.body);

    // Expired/invalid token
    const badtok = await req("GET", "/api/records", null, "not.a.real.token");
    assert("Invalid token → 401", badtok.status === 401, badtok.body);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  console.log("🧪 Finance Dashboard — API Test Suite\n");

  // Reset test DB — delete file and force re-init
  const fs = require("fs");
  if (fs.existsSync("./data/test.db")) fs.unlinkSync("./data/test.db");

  // Clear the singleton so getDb() creates a fresh DB
  const dbModule = require("./src/utils/db");
  dbModule.resetDb();
  await dbModule.getDb();
  const bcrypt = require("bcryptjs");
  const { generateId } = require("./src/utils/helpers");

  const users = [
    { name: "Admin",   email: "admin@finance.com",   password: "admin123",   role: "admin"   },
    { name: "Analyst", email: "analyst@finance.com", password: "analyst123", role: "analyst" },
    { name: "Viewer",  email: "viewer@finance.com",  password: "viewer123",  role: "viewer"  },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [generateId(), u.name, u.email, hash, u.role]);
  }

  // Add some records
  const adminId = get("SELECT id FROM users WHERE role='admin'").id;
  const types = ["income", "expense"];
  const cats  = ["Salary", "Food", "Rent", "Freelance", "Transport"];
  for (let i = 0; i < 20; i++) {
    run("INSERT INTO records (id, amount, type, category, date, created_by) VALUES (?,?,?,?,?,?)", [
      generateId(),
      Math.round(Math.random() * 50000 + 1000),
      types[i % 2],
      cats[i % cats.length],
      new Date(2024, i % 12, (i % 28) + 1).toISOString(),
      adminId,
    ]);
  }

  // Start Express
  const express   = require("express");
  const cors      = require("cors");
  const app       = express();
  app.use(cors());
  app.use(express.json());
  app.get("/health", (_, res) => res.json({ success: true, message: "Finance Dashboard API is running." }));
  app.use("/api/auth",      require("./src/routes/auth.routes"));
  app.use("/api/users",     require("./src/routes/users.routes"));
  app.use("/api/records",   require("./src/routes/records.routes"));
  app.use("/api/dashboard", require("./src/routes/dashboard.routes"));
  app.use((_, res) => res.status(404).json({ success: false, error: "Route not found." }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.name === "ZodError")
      return res.status(400).json({ success: false, error: "Validation failed", details: err.flatten().fieldErrors });
    res.status(500).json({ success: false, error: "Internal server error." });
  });

  const server = app.listen(3001, async () => {
    try {
      await runTests(app);
    } finally {
      server.close();
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`  Results: ${passed} passed, ${failed} failed`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      process.exit(failed > 0 ? 1 : 0);
    }
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
