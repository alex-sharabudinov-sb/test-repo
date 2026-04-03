const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = process.env.APP_DB_PATH || "./data/app.db";

// Ensure data dir
const fs = require("fs");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#3b82f6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    department_id INTEGER,
    scope TEXT NOT NULL CHECK(scope IN ('company','department')),
    period TEXT NOT NULL CHECK(period IN ('week','month','year')),
    period_label TEXT NOT NULL,
    status TEXT DEFAULT 'planned' CHECK(status IN ('planned','in-progress','completed','cancelled')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    progress INTEGER DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS objectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
  );
`);

// Seed departments if empty
const deptCount = db.prepare("SELECT COUNT(*) as c FROM departments").get();
if (deptCount.c === 0) {
  const insert = db.prepare("INSERT INTO departments (name, color) VALUES (?, ?)");
  const depts = [
    ["Engineering", "#3b82f6"],
    ["Marketing", "#10b981"],
    ["Sales", "#f59e0b"],
    ["Operations", "#8b5cf6"],
    ["Human Resources", "#ec4899"],
    ["Finance", "#ef4444"]
  ];
  for (const [name, color] of depts) insert.run(name, color);
}

app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- Departments ---
app.get("/api/departments", (req, res) => {
  res.json(db.prepare("SELECT * FROM departments ORDER BY name").all());
});

app.post("/api/departments", (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const r = db.prepare("INSERT INTO departments (name, color) VALUES (?, ?)").run(name, color || "#3b82f6");
    res.json({ id: r.lastInsertRowid, name, color: color || "#3b82f6" });
  } catch (e) {
    res.status(409).json({ error: "Department already exists" });
  }
});

app.delete("/api/departments/:id", (req, res) => {
  db.prepare("DELETE FROM departments WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// --- Plans ---
app.get("/api/plans", (req, res) => {
  const { scope, period, department_id, status } = req.query;
  let sql = `SELECT p.*, d.name as department_name, d.color as department_color
             FROM plans p LEFT JOIN departments d ON p.department_id = d.id WHERE 1=1`;
  const params = [];
  if (scope) { sql += " AND p.scope = ?"; params.push(scope); }
  if (period) { sql += " AND p.period = ?"; params.push(period); }
  if (department_id) { sql += " AND p.department_id = ?"; params.push(department_id); }
  if (status) { sql += " AND p.status = ?"; params.push(status); }
  sql += " ORDER BY p.priority DESC, p.created_at DESC";
  const plans = db.prepare(sql).all(...params);
  
  const objStmt = db.prepare("SELECT * FROM objectives WHERE plan_id = ?");
  for (const plan of plans) {
    plan.objectives = objStmt.all(plan.id);
  }
  res.json(plans);
});

app.post("/api/plans", (req, res) => {
  const { title, description, department_id, scope, period, period_label, status, priority, progress, start_date, end_date, objectives } = req.body;
  if (!title || !scope || !period || !period_label) return res.status(400).json({ error: "Missing required fields" });

  const r = db.prepare(`INSERT INTO plans (title, description, department_id, scope, period, period_label, status, priority, progress, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    title, description || "", department_id || null, scope, period, period_label,
    status || "planned", priority || "medium", progress || 0, start_date || null, end_date || null
  );

  if (objectives && objectives.length) {
    const objInsert = db.prepare("INSERT INTO objectives (plan_id, text, completed) VALUES (?, ?, ?)");
    for (const obj of objectives) objInsert.run(r.lastInsertRowid, obj.text, obj.completed ? 1 : 0);
  }

  res.json({ id: r.lastInsertRowid });
});

app.put("/api/plans/:id", (req, res) => {
  const { title, description, department_id, scope, period, period_label, status, priority, progress, start_date, end_date, objectives } = req.body;
  db.prepare(`UPDATE plans SET title=?, description=?, department_id=?, scope=?, period=?, period_label=?, status=?, priority=?, progress=?, start_date=?, end_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    title, description || "", department_id || null, scope, period, period_label,
    status || "planned", priority || "medium", progress || 0, start_date || null, end_date || null, req.params.id
  );

  db.prepare("DELETE FROM objectives WHERE plan_id = ?").run(req.params.id);
  if (objectives && objectives.length) {
    const objInsert = db.prepare("INSERT INTO objectives (plan_id, text, completed) VALUES (?, ?, ?)");
    for (const obj of objectives) objInsert.run(req.params.id, obj.text, obj.completed ? 1 : 0);
  }

  res.json({ ok: true });
});

app.delete("/api/plans/:id", (req, res) => {
  db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// --- Dashboard stats ---
app.get("/api/stats", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM plans").get().c;
  const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM plans GROUP BY status").all();
  const byPeriod = db.prepare("SELECT period, COUNT(*) as count FROM plans GROUP BY period").all();
  const byScope = db.prepare("SELECT scope, COUNT(*) as count FROM plans GROUP BY scope").all();
  const avgProgress = db.prepare("SELECT AVG(progress) as avg FROM plans").get().avg || 0;
  res.json({ total, byStatus, byPeriod, byScope, avgProgress: Math.round(avgProgress) });
});

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
process.on("SIGTERM", () => { server.close(); db.close(); process.exit(0); });
process.on("SIGINT", () => { server.close(); db.close(); process.exit(0); });
