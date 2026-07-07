// src/index.js
// ─────────────────────────────────────────────────────────────
// Todo backend — routes rewritten to use Cloud SQL (MySQL)
// via the pool in ./db.js. Everything else is unchanged from
// the original in-memory version.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const cors    = require("cors");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

const app = express();
const PORT         = process.env.PORT         || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

// ── Health check ─────────────────────────────────────────────
// Now also pings the DB so you can tell at a glance whether
// the app AND the database are both healthy.
app.get("/health", async (req, res) => {
  try {
    await pool.execute("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "ok", database: "unreachable", error: err.message });
  }
});

// ── GET /api/todos ────────────────────────────────────────────
// Returns all todos ordered newest first.
app.get("/api/todos", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, title, completed FROM todos ORDER BY created_at DESC"
    );
    // MySQL stores TINYINT(1) for booleans — convert to JS boolean
    const todos = rows.map((r) => ({ ...r, completed: !!r.completed }));
    res.json(todos);
  } catch (err) {
    console.error("GET /api/todos:", err.message);
    res.status(500).json({ error: "Failed to fetch todos" });
  }
});

// ── POST /api/todos ───────────────────────────────────────────
// Creates a new todo. Same validation as the original.
app.post("/api/todos", async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });

  const id = uuidv4();
  try {
    await pool.execute(
      "INSERT INTO todos (id, title, completed) VALUES (?, ?, false)",
      [id, title.trim()]
    );
    res.status(201).json({ id, title: title.trim(), completed: false });
  } catch (err) {
    console.error("POST /api/todos:", err.message);
    res.status(500).json({ error: "Failed to create todo" });
  }
});

// ── PUT /api/todos/:id ────────────────────────────────────────
// Updates title and/or completed status. Same logic as original —
// only updates fields that are actually present in the request body.
app.put("/api/todos/:id", async (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;

  try {
    // Build the SET clause dynamically — only update what was sent
    const fields = [];
    const values = [];

    if (title !== undefined)     { fields.push("title = ?");     values.push(title.trim()); }
    if (completed !== undefined) { fields.push("completed = ?"); values.push(completed);    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE todos SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    // Fetch and return the updated row (matches original behaviour)
    const [rows] = await pool.execute(
      "SELECT id, title, completed FROM todos WHERE id = ?",
      [id]
    );
    const todo = { ...rows[0], completed: !!rows[0].completed };
    res.json(todo);
  } catch (err) {
    console.error("PUT /api/todos/:id:", err.message);
    res.status(500).json({ error: "Failed to update todo" });
  }
});

// ── DELETE /api/todos/:id ─────────────────────────────────────
// Deletes a todo. Returns 404 if it doesn't exist, 204 if deleted.
app.delete("/api/todos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.execute(
      "DELETE FROM todos WHERE id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/todos/:id:", err.message);
    res.status(500).json({ error: "Failed to delete todo" });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on port ${PORT}`);
});