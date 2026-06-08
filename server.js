const express = require("express");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const crypto = require("crypto");
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
    return res.status(401).json({ message: "Token tidak valid" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Akses hanya untuk admin" });
  }

  next();
}

async function waitDB() {
  for (let i = 1; i <= 30; i++) {
    try {
      await pool.query("SELECT NOW()");
      console.log("Database connected");
      return;
    } catch (err) {
      console.log(`Menunggu database ${i}/30...`);
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_qr_sessions (
      id SERIAL PRIMARY KEY,
      session_token VARCHAR(120) UNIQUE NOT NULL,
      attendance_date DATE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const admin = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    ["admin@absensi.com"]
  );

  if (admin.rows.length === 0) {
    const hash = await bcrypt.hash("admin123", 10);

    await pool.query(
      `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      `,
      ["Administrator", "admin@absensi.com", hash, "admin"]
    );

    console.log("Admin default dibuat: admin@absensi.com / admin123");
  }
}

/* =========================
   AUTH
========================= */

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

    return res.json({
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
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/me", auth, (req, res) => {
  return res.json({ user: req.user });
});

/* =========================
   DASHBOARD STATS
========================= */

app.get("/api/dashboard/stats", auth, async (req, res) => {
  try {
    const today = todayJakarta();

    const totalUsersResult = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE role = 'user'
    `);

    const checkInResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM attendances
      WHERE attendance_date = $1
      `,
      [today]
    );

    const checkOutResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM attendances
      WHERE attendance_date = $1
        AND check_out IS NOT NULL
      `,
      [today]
    );

    const totalUsers = totalUsersResult.rows[0].total;
    const checkInToday = checkInResult.rows[0].total;
    const checkOutToday = checkOutResult.rows[0].total;

    const attendanceRate =
      totalUsers > 0 ? Math.round((checkInToday / totalUsers) * 100) : 0;

    return res.json({
      totalUsers,
      checkInToday,
      checkOutToday,
      attendanceRate
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal mengambil statistik" });
  }
});

/* =========================
   ATTENDANCE MANUAL
========================= */

app.post("/api/attendance/check-in", auth, async (req, res) => {
  try {
    const today = todayJakarta();
    const { note } = req.body;

    const existing = await pool.query(
      `
      SELECT *
      FROM attendances
      WHERE user_id = $1 AND attendance_date = $2
      `,
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
      [req.user.id, today, "Hadir", note || "Absensi manual"]
    );

    return res.json({
      message: "Check-in berhasil",
      attendance: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal check-in" });
  }
});

app.post("/api/attendance/check-out", auth, async (req, res) => {
  try {
    const today = todayJakarta();

    const existing = await pool.query(
      `
      SELECT *
      FROM attendances
      WHERE user_id = $1 AND attendance_date = $2
      `,
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

    return res.json({
      message: "Check-out berhasil",
      attendance: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal check-out" });
  }
});

app.get("/api/attendance/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM attendances
      WHERE user_id = $1
      ORDER BY attendance_date DESC, check_in DESC
      LIMIT 30
      `,
      [req.user.id]
    );

    return res.json({ attendances: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal mengambil riwayat absensi" });
  }
});

/* =========================
   QR ATTENDANCE
========================= */

app.post("/api/admin/qr-session", auth, adminOnly, async (req, res) => {
  try {
    const today = todayJakarta();

    await pool.query(
      `
      UPDATE attendance_qr_sessions
      SET is_active = FALSE
      WHERE attendance_date = $1
        AND is_active = TRUE
      `,
      [today]
    );

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const result = await pool.query(
      `
      INSERT INTO attendance_qr_sessions
      (session_token, attendance_date, expires_at, created_by, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING *
      `,
      [sessionToken, today, expiresAt, req.user.id]
    );

    const qrPayload = JSON.stringify({
      type: "ABSENSI_TELU_QR",
      token: sessionToken,
      date: today
    });

    const qrImage = await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2
    });

    return res.json({
      message: "QR absensi berhasil dibuat",
      qrImage,
      qrPayload,
      session: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal membuat QR absensi" });
  }
});

app.get("/api/admin/qr-session/active", auth, adminOnly, async (req, res) => {
  try {
    const today = todayJakarta();

    const result = await pool.query(
      `
      SELECT *
      FROM attendance_qr_sessions
      WHERE attendance_date = $1
        AND is_active = TRUE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [today]
    );

    if (result.rows.length === 0) {
      return res.json({ active: false });
    }

    const session = result.rows[0];

    const qrPayload = JSON.stringify({
      type: "ABSENSI_TELU_QR",
      token: session.session_token,
      date: session.attendance_date
    });

    const qrImage = await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2
    });

    return res.json({
      active: true,
      qrImage,
      qrPayload,
      session
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal mengambil QR aktif" });
  }
});

app.post("/api/attendance/scan-qr", auth, async (req, res) => {
  try {
    const { qrText } = req.body;

    if (!qrText) {
      return res.status(400).json({ message: "Data QR kosong" });
    }

    let parsed;

    try {
      parsed = JSON.parse(qrText);
    } catch (err) {
      return res.status(400).json({ message: "Format QR tidak valid" });
    }

    if (parsed.type !== "ABSENSI_TELU_QR" || !parsed.token) {
      return res.status(400).json({ message: "QR bukan QR absensi yang valid" });
    }

    const sessionResult = await pool.query(
      `
      SELECT *
      FROM attendance_qr_sessions
      WHERE session_token = $1
        AND is_active = TRUE
        AND expires_at > NOW()
      `,
      [parsed.token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(400).json({
        message: "QR sudah kadaluarsa atau tidak aktif"
      });
    }

    const today = todayJakarta();

    const existing = await pool.query(
      `
      SELECT *
      FROM attendances
      WHERE user_id = $1 AND attendance_date = $2
      `,
      [req.user.id, today]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "Kamu sudah melakukan absensi hari ini"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO attendances (user_id, attendance_date, check_in, status, note)
      VALUES ($1, $2, NOW(), 'Hadir', 'Absensi via QR')
      RETURNING *
      `,
      [req.user.id, today]
    );

    return res.json({
      message: "Absensi QR berhasil",
      attendance: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal melakukan absensi QR" });
  }
});

/* =========================
   ADMIN
========================= */

app.get("/api/admin/attendance", auth, adminOnly, async (req, res) => {
  try {
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

    return res.json({ attendances: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal mengambil data absensi admin" });
  }
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, role, created_at
      FROM users
      ORDER BY id ASC
    `);

    return res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Gagal mengambil data user" });
  }
});

app.post("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Nama, email, dan password wajib diisi"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role, created_at
      `,
      [name, email, hash, role || "user"]
    );

    return res.json({
      message: "User berhasil dibuat",
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email sudah digunakan" });
    }

    console.error(err);
    return res.status(500).json({ message: "Gagal membuat user" });
  }
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.json({
      status: "OK",
      database: "connected",
      app: "Absensi Online Cloud"
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      database: "disconnected"
    });
  }
});

app.get("*", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await waitDB();
  await initDB();

  app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Gagal menjalankan server:", err);
  process.exit(1);
});
