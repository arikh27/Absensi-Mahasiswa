const express = require("express");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "absensi-secret";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "absensi_db",
  user: process.env.POSTGRES_USER || "absensi_user",
  password: process.env.POSTGRES_PASSWORD || "absensi_password"
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "Token tidak ditemukan" });
  }

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ message: "Token tidak valid" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Akses hanya untuk admin" });
  }

  next();
}

async function waitDB() {
  for (let i = 1; i <= 20; i++) {
    try {
      await pool.query("SELECT NOW()");
      console.log("Database connected");
      return;
    } catch (err) {
      console.log(`Menunggu database ${i}/20...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  throw new Error("Database gagal terkoneksi");
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(120) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendances (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      check_in TIMESTAMPTZ,
      check_out TIMESTAMPTZ,
      status VARCHAR(30) DEFAULT 'Hadir',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, attendance_date)
    );
  `);

  const admin = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    ["admin@absensi.com"]
  );

  if (admin.rows.length === 0) {
    const hash = await bcrypt.hash("admin123", 10);

    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["Administrator", "admin@absensi.com", hash, "admin"]
    );

    console.log("Admin default dibuat: admin@absensi.com / admin123");
  }
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Email atau password salah" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: "Email atau password salah" });
    }

    res.json({
      message: "Login berhasil",
      token: makeToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/attendance/check-in", auth, async (req, res) => {
  try {
    const today = todayJakarta();
    const { note } = req.body;

    const existing = await pool.query(
      "SELECT * FROM attendances WHERE user_id = $1 AND attendance_date = $2",
      [req.user.id, today]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Kamu sudah check-in hari ini" });
    }

    const result = await pool.query(
      `
      INSERT INTO attendances (user_id, attendance_date, check_in, status, note)
      VALUES ($1, $2, NOW(), $3, $4)
      RETURNING *
      `,
      [req.user.id, today, "Hadir", note || ""]
    );

    res.json({ message: "Check-in berhasil", attendance: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal check-in" });
  }
});

app.post("/api/attendance/check-out", auth, async (req, res) => {
  try {
    const today = todayJakarta();

    const existing = await pool.query(
      "SELECT * FROM attendances WHERE user_id = $1 AND attendance_date = $2",
      [req.user.id, today]
    );

    if (existing.rows.length === 0) {
      return res.status(400).json({ message: "Kamu belum check-in hari ini" });
    }

    if (existing.rows[0].check_out) {
      return res.status(400).json({ message: "Kamu sudah check-out hari ini" });
    }

    const result = await pool.query(
      `
      UPDATE attendances
      SET check_out = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND attendance_date = $2
      RETURNING *
      `,
      [req.user.id, today]
    );

    res.json({ message: "Check-out berhasil", attendance: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal check-out" });
  }
});

app.get("/api/attendance/me", auth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT *
    FROM attendances
    WHERE user_id = $1
    ORDER BY attendance_date DESC
    LIMIT 30
    `,
    [req.user.id]
  );

  res.json({ attendances: result.rows });
});

app.get("/api/admin/attendance", auth, adminOnly, async (req, res) => {
  const result = await pool.query(`
    SELECT 
      a.id,
      u.name,
      u.email,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.status,
      a.note
    FROM attendances a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.attendance_date DESC, a.check_in DESC
    LIMIT 100
  `);

  res.json({ attendances: result.rows });
});

app.post("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role, created_at
      `,
      [name, email, hash, role || "user"]
    );

    res.json({ message: "User berhasil dibuat", user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email sudah digunakan" });
    }

    console.error(err);
    res.status(500).json({ message: "Gagal membuat user" });
  }
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "OK", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "ERROR", database: "disconnected" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await waitDB();
  await initDB();

  app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
