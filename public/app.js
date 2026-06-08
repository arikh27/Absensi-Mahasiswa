let currentUser = null;
let qrScanner = null;

/* =========================
   AUTH TOKEN
========================= */

function token() {
  return localStorage.getItem("token");
}

function saveToken(value) {
  localStorage.setItem("token", value);
}

function clearToken() {
  localStorage.removeItem("token");
}

/* =========================
   FORMATTER
========================= */

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function getInitial(name) {
  if (!name) return "A";
  return name.trim().charAt(0).toUpperCase();
}

/* =========================
   API REQUEST
========================= */

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token()) {
    headers.Authorization = `Bearer ${token()}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request gagal");
  }

  return data;
}

/* =========================
   UI MESSAGE
========================= */

function setMessage(elementId, text, isError = false) {
  const element = document.getElementById(elementId);

  if (!element) return;

  element.innerText = text;
  element.classList.remove("success-text", "error-text");
  element.classList.add(isError ? "error-text" : "success-text");
}

/* =========================
   CLOCK
========================= */

function updateClock() {
  const clock = document.getElementById("serverClock");
  const date = document.getElementById("serverDate");

  if (!clock || !date) return;

  const now = new Date();

  clock.innerText = now.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  date.innerText = now.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

/* =========================
   SECTION NAVIGATION
========================= */

function showSection(sectionId, menuId) {
  const sections = [
    "dashboardSection",
    "attendanceSection",
    "historySection",
    "qrSection",
    "adminSection"
  ];

  sections.forEach((id) => {
    const section = document.getElementById(id);
    if (section) section.classList.add("hidden");
  });

  const selected = document.getElementById(sectionId);
  if (selected) selected.classList.remove("hidden");

  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach((item) => item.classList.remove("active"));

  if (menuId) {
    const menu = document.getElementById(menuId);
    if (menu) menu.classList.add("active");
  }

  if (sectionId !== "qrSection") {
    stopQrScanner();
  }
}

/* =========================
   LOGIN / LOGOUT
========================= */

async function login() {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Email dan password wajib diisi");
      return;
    }

    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    saveToken(data.token);
    currentUser = data.user;

    await afterLogin();
  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  stopQrScanner();
  clearToken();
  currentUser = null;
  location.reload();
}

async function afterLogin() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("dashboardPage").classList.remove("hidden");

  updateProfileUI();

  await loadStats();
  await loadMyAttendance();

  if (currentUser.role === "admin") {
    showAdminMenu();
    await loadAdminAttendance();
    await loadActiveQrSession();
  } else {
    hideAdminMenu();
  }

  showSection("dashboardSection", "menuDashboard");
}

function updateProfileUI() {
  const name = currentUser?.name || "User";
  const role = currentUser?.role || "user";

  const welcomeText = document.getElementById("welcomeText");
  const userInfo = document.getElementById("userInfo");
  const profileName = document.getElementById("profileName");
  const profileRole = document.getElementById("profileRole");
  const avatarInitial = document.getElementById("avatarInitial");
  const heroTitle = document.getElementById("heroTitle");

  if (welcomeText) welcomeText.innerText = `Halo, ${name} 👋`;
  if (userInfo) userInfo.innerText = `Login sebagai ${name} dengan role ${role}`;
  if (profileName) profileName.innerText = name;
  if (profileRole) profileRole.innerText = role;
  if (avatarInitial) avatarInitial.innerText = getInitial(name);

  if (heroTitle) {
    heroTitle.innerText =
      role === "admin"
        ? "Selamat Datang di Dashboard Admin"
        : "Selamat Datang di Sistem Absensi Mahasiswa";
  }
}

function showAdminMenu() {
  const adminMenus = document.querySelectorAll(".admin-only");
  adminMenus.forEach((item) => item.classList.remove("hidden"));
}

function hideAdminMenu() {
  const adminMenus = document.querySelectorAll(".admin-only");
  adminMenus.forEach((item) => item.classList.add("hidden"));

  const adminSection = document.getElementById("adminSection");
  if (adminSection) adminSection.classList.add("hidden");
}

/* =========================
   DASHBOARD STATS
========================= */

async function loadStats() {
  try {
    const data = await request("/api/dashboard/stats");

    document.getElementById("totalUsers").innerText = data.totalUsers;
    document.getElementById("checkInToday").innerText = data.checkInToday;
    document.getElementById("checkOutToday").innerText = data.checkOutToday;
    document.getElementById("attendanceRate").innerText = `${data.attendanceRate}%`;
  } catch (err) {
    console.error("Gagal load statistik:", err.message);
  }
}

/* =========================
   ATTENDANCE
========================= */

async function checkIn() {
  try {
    const note = document.getElementById("note").value;

    const data = await request("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ note })
    });

    setMessage("msg", data.message);
    await refreshAttendanceData();
  } catch (err) {
    setMessage("msg", err.message, true);
  }
}

async function checkInFromQuick() {
  try {
    const note = document.getElementById("quickNote").value;

    const data = await request("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ note })
    });

    setMessage("quickMsg", data.message);
    await refreshAttendanceData();
  } catch (err) {
    setMessage("quickMsg", err.message, true);
  }
}

async function checkOut() {
  try {
    const data = await request("/api/attendance/check-out", {
      method: "POST"
    });

    setMessage("msg", data.message);
    setMessage("quickMsg", data.message);

    await refreshAttendanceData();
  } catch (err) {
    setMessage("msg", err.message, true);
    setMessage("quickMsg", err.message, true);
  }
}

async function refreshAttendanceData() {
  await loadStats();
  await loadMyAttendance();

  if (currentUser && currentUser.role === "admin") {
    await loadAdminAttendance();
  }
}

/* =========================
   MY ATTENDANCE
========================= */

async function loadMyAttendance() {
  try {
    const data = await request("/api/attendance/me");

    renderMyTable(data.attendances);
    renderRecentTable(data.attendances);
  } catch (err) {
    console.error("Gagal load riwayat:", err.message);
  }
}

function renderMyTable(attendances) {
  const tbody = document.getElementById("myTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!attendances || attendances.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Belum ada data absensi.</td>
      </tr>
    `;
    return;
  }

  attendances.forEach((item) => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(item.attendance_date)}</td>
        <td>${formatDateTime(item.check_in)}</td>
        <td>${formatDateTime(item.check_out)}</td>
        <td><span class="badge badge-success">${item.status || "Hadir"}</span></td>
        <td>${item.note || "-"}</td>
      </tr>
    `;
  });
}

function renderRecentTable(attendances) {
  const tbody = document.getElementById("recentTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const recent = (attendances || []).slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Belum ada data absensi.</td>
      </tr>
    `;
    return;
  }

  recent.forEach((item) => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(item.attendance_date)}</td>
        <td>${formatTime(item.check_in)}</td>
        <td>${formatTime(item.check_out)}</td>
        <td><span class="badge badge-success">${item.status || "Hadir"}</span></td>
      </tr>
    `;
  });
}

/* =========================
   ADMIN ATTENDANCE
========================= */

async function loadAdminAttendance() {
  try {
    const data = await request("/api/admin/attendance");

    const tbody = document.getElementById("adminTable");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!data.attendances || data.attendances.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">Belum ada data absensi mahasiswa.</td>
        </tr>
      `;
      return;
    }

    data.attendances.forEach((item) => {
      tbody.innerHTML += `
        <tr>
          <td>${item.name}</td>
          <td>${item.email}</td>
          <td>${formatDate(item.attendance_date)}</td>
          <td>${formatDateTime(item.check_in)}</td>
          <td>${formatDateTime(item.check_out)}</td>
          <td><span class="badge badge-success">${item.status || "Hadir"}</span></td>
          <td>${item.note || "-"}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Gagal load data admin:", err.message);
  }
}

/* =========================
   CREATE USER
========================= */

async function createUser() {
  try {
    const name = document.getElementById("newName").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const password = document.getElementById("newPassword").value;
    const role = document.getElementById("newRole").value;

    if (!name || !email || !password) {
      alert("Nama, email, dan password wajib diisi");
      return;
    }

    const data = await request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role })
    });

    alert(data.message);

    document.getElementById("newName").value = "";
    document.getElementById("newEmail").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newRole").value = "user";

    await loadStats();
  } catch (err) {
    alert(err.message);
  }
}

/* =========================
   QR ADMIN
========================= */

async function generateQrSession() {
  try {
    const data = await request("/api/admin/qr-session", {
      method: "POST"
    });

    renderAdminQr(data);
  } catch (err) {
    alert(err.message);
  }
}

async function loadActiveQrSession() {
  try {
    const data = await request("/api/admin/qr-session/active");

    if (!data.active) return;

    renderAdminQr(data);
  } catch (err) {
    console.error("Tidak ada QR aktif:", err.message);
  }
}

function renderAdminQr(data) {
  const box = document.getElementById("qrAdminBox");
  if (!box) return;

  const expiresAt = data.session?.expires_at
    ? formatDateTime(data.session.expires_at)
    : "-";

  box.innerHTML = `
    <p><strong>QR Absensi Aktif</strong></p>
    <img src="${data.qrImage}" alt="QR Absensi" />
    <p>Berlaku sampai: <strong>${expiresAt}</strong></p>
    <p class="muted-text">
      Tampilkan QR ini ke mahasiswa agar mereka dapat melakukan absensi.
    </p>

    <details>
      <summary>Payload QR untuk demo manual</summary>
      <textarea readonly style="margin-top:10px; min-height:90px;">${data.qrPayload || ""}</textarea>
      <button class="btn-secondary" onclick="copyQrPayload()">Copy Payload</button>
    </details>
  `;

  window.latestQrPayload = data.qrPayload || "";
}

async function copyQrPayload() {
  if (!window.latestQrPayload) {
    alert("Payload QR belum tersedia");
    return;
  }

  try {
    await navigator.clipboard.writeText(window.latestQrPayload);
    alert("Payload QR berhasil disalin");
  } catch (err) {
    alert("Gagal copy payload. Silakan copy manual dari textarea.");
  }
}

/* =========================
   QR SCANNER USER
========================= */

function startQrScanner() {
  const messageId = "qrMessage";

  setMessage(messageId, "Mengaktifkan kamera...", false);

  if (!window.Html5Qrcode) {
    setMessage(
      messageId,
      "Library QR scanner belum termuat. Pastikan koneksi internet aktif.",
      true
    );
    showManualQrInput();
    return;
  }

  if (qrScanner) {
    setMessage(messageId, "Scanner sudah aktif.");
    return;
  }

  qrScanner = new Html5Qrcode("qr-reader");

  qrScanner
    .start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: {
          width: 240,
          height: 240
        }
      },
      async (decodedText) => {
        await submitQrAttendance(decodedText);
      },
      () => {}
    )
    .then(() => {
      setMessage(messageId, "Scanner aktif. Arahkan kamera ke QR absensi.");
    })
    .catch((err) => {
      console.error(err);

      setMessage(
        messageId,
        "Kamera gagal aktif. Jika aplikasi dibuka lewat HTTP public IP, browser bisa memblokir kamera. Gunakan input manual di bawah untuk demo.",
        true
      );

      showManualQrInput();
      qrScanner = null;
    });
}

function stopQrScanner() {
  if (!qrScanner) return;

  qrScanner
    .stop()
    .then(() => {
      qrScanner.clear();
      qrScanner = null;
      setMessage("qrMessage", "Scanner dihentikan.");
    })
    .catch(() => {
      qrScanner = null;
    });
}

async function submitQrAttendance(qrText) {
  try {
    const data = await request("/api/attendance/scan-qr", {
      method: "POST",
      body: JSON.stringify({ qrText })
    });

    setMessage("qrMessage", data.message);

    await refreshAttendanceData();
    stopQrScanner();
  } catch (err) {
    setMessage("qrMessage", err.message, true);
  }
}

function showManualQrInput() {
  const qrSection = document.getElementById("qrSection");
  if (!qrSection) return;

  if (document.getElementById("manualQrBox")) return;

  const targetPanel = qrSection.querySelector(".panel-card");
  if (!targetPanel) return;

  targetPanel.insertAdjacentHTML(
    "beforeend",
    `
      <div id="manualQrBox" class="qr-admin-box" style="text-align:left;">
        <h3>Input Manual QR untuk Demo</h3>
        <p class="muted-text">
          Jika kamera tidak aktif karena browser memblokir akses kamera di HTTP,
          copy payload QR dari panel admin, lalu paste di sini.
        </p>
        <textarea id="manualQrText" placeholder="Paste payload QR di sini"></textarea>
        <button class="btn-primary" onclick="submitManualQr()">Submit QR Manual</button>
      </div>
    `
  );
}

async function submitManualQr() {
  const textarea = document.getElementById("manualQrText");

  if (!textarea || !textarea.value.trim()) {
    setMessage("qrMessage", "Payload QR belum diisi", true);
    return;
  }

  await submitQrAttendance(textarea.value.trim());
}

/* =========================
   SESSION CHECK
========================= */

async function checkSession() {
  if (!token()) return;

  try {
    const data = await request("/api/me");
    currentUser = data.user;

    await afterLogin();
  } catch (err) {
    clearToken();
  }
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);

  checkSession();
});
