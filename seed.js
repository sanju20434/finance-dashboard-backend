/**
 * Seed Script — populates the DB with test users and financial records.
 * Run: node seed.js
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { getDb, run, get } = require("./src/utils/db");
const { generateId } = require("./src/utils/helpers");

const USERS = [
  {
    name: "Admin User",
    email: "admin@finance.com",
    password: process.env.SEED_ADMIN_PASSWORD || "admin123",
    role: "admin",
  },
  {
    name: "Ana Analyst",
    email: "analyst@finance.com",
    password: process.env.SEED_ANALYST_PASSWORD || "analyst123",
    role: "analyst",
  },
  {
    name: "Victor Viewer",
    email: "viewer@finance.com",
    password: process.env.SEED_VIEWER_PASSWORD || "viewer123",
    role: "viewer",
  },
];

const CATEGORIES = {
  income:  ["Salary", "Freelance", "Investment", "Bonus", "Rental Income"],
  expense: ["Food", "Rent", "Transport", "Utilities", "Healthcare", "Entertainment", "Shopping"],
};

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDateInLastYear() {
  const now = new Date();
  const pastYear = new Date(now);
  pastYear.setFullYear(now.getFullYear() - 1);
  const time = pastYear.getTime() + Math.random() * (now.getTime() - pastYear.getTime());
  return new Date(time).toISOString();
}

async function seed() {
  console.log("🌱 Starting seed...\n");
  await getDb();

  // ── Create Users ──────────────────────────────────────────────────────────
  const userIds = {};
  for (const u of USERS) {
    const existing = get("SELECT id FROM users WHERE email = ?", [u.email]);
    if (existing) {
      console.log(`  ⏭  User already exists: ${u.email}`);
      userIds[u.role] = existing.id;
      continue;
    }

    const hashed = await bcrypt.hash(u.password, 12);
    const id = generateId();
    run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)", [
      id, u.name, u.email, hashed, u.role,
    ]);
    userIds[u.role] = id;
    console.log(`  ✅ Created ${u.role}: ${u.email} / ${u.password}`);
  }

  // ── Create Financial Records ──────────────────────────────────────────────
  const adminId = userIds["admin"];
  let recordCount = 0;

  for (let i = 0; i < 60; i++) {
    const type = Math.random() > 0.4 ? "expense" : "income";
    const categories = CATEGORIES[type];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const amount = type === "income"
      ? randomBetween(5000, 80000)
      : randomBetween(200, 15000);

    run(
      `INSERT INTO records (id, amount, type, category, date, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        amount,
        type,
        category,
        randomDateInLastYear(),
        `Auto-generated ${type} record`,
        adminId,
      ]
    );
    recordCount++;
  }

  console.log(`\n  ✅ Created ${recordCount} financial records\n`);
  console.log("─────────────────────────────────────────────");
  console.log("✅ Seed complete! Test credentials:\n");
  console.log(`  Admin   → admin@finance.com   / ${USERS[0].password}`);
  console.log(`  Analyst → analyst@finance.com / ${USERS[1].password}`);
  console.log(`  Viewer  → viewer@finance.com  / ${USERS[2].password}`);
  console.log("─────────────────────────────────────────────\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
