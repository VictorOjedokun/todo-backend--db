// src/db.js
// ─────────────────────────────────────────────────────────────
// Cloud SQL (MySQL) connection pool using mysql2.
// All route files import { pool } from "./db.js" and call
// pool.execute(sql, params) — no manual connect/disconnect needed.
// ─────────────────────────────────────────────────────────────

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST,       // Cloud SQL public IP
  port:     parseInt(process.env.DB_PORT || "3306"),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,                 // max simultaneous connections
  queueLimit: 0,
});

// Verify the connection is working when the app starts.
// Logs success or failure — does NOT crash the process on failure
// so PM2 can still restart and retry on the next boot.
pool.getConnection()
  .then((conn) => {
    console.log("✅ Connected to Cloud SQL (MySQL)");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ Cloud SQL connection failed:", err.message);
  });

module.exports = { pool };