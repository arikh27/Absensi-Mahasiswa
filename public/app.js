let currentUser = null;

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

    const totalUsers = document.getElementById("totalUsers");
    const checkInToday = document.getElementById("checkInToday");
    const checkOutToday = document.getElementById("checkOutToday");
    const attendanceRate = document.getElementById("attendanceRate");

    const adminTotalUsers = document.getElementById("adminTotalUsers");
    const adminCheckInToday = document.getElementById("adminCheckInToday");

    if (totalUsers) totalUsers.innerText = data.totalUsers;
    if (checkInToday) checkInToday.innerText = data.checkInToday;
    if (checkOutToday) checkOutToday.innerText = data.checkOutToday;
    if (attendanceRate) attendanceRate.innerText = `${data.attendanceRate}%`;

    if (adminTotalUsers) adminTotalUsers.innerText = data.totalUsers;
    if (adminCheckInToday) adminCheckInToday.innerText = data.checkInToday;
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
