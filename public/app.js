let currentUser = null;

function token() {
  return localStorage.getItem("token");
}

function saveToken(t) {
  localStorage.setItem("token", t);
}

function clearToken() {
  localStorage.removeItem("token");
}

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  });
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta"
  });
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token()) {
    headers.Authorization = `Bearer ${token()}`;
  }

  const res = await fetch(path, {
    ...options,
    headers
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Request gagal");
  }

  return data;
}

async function login() {
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    saveToken(data.token);
    currentUser = data.user;

    showDashboard();
    await loadMyAttendance();

    if (currentUser.role === "admin") {
      await loadAdminAttendance();
    }
  } catch (err) {
    alert(err.message);
  }
}

function showDashboard() {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  document.getElementById("userInfo").innerHTML =
    `Login sebagai <b>${currentUser.name}</b> (${currentUser.role})`;

  if (currentUser.role === "admin") {
    document.getElementById("adminBox").classList.remove("hidden");
  } else {
    document.getElementById("adminBox").classList.add("hidden");
  }
}

function logout() {
  clearToken();
  location.reload();
}

function setMsg(text, error = false) {
  const el = document.getElementById("msg");
  el.innerText = text;
  el.style.color = error ? "#dc2626" : "#16a34a";
}

async function checkIn() {
  try {
    const note = document.getElementById("note").value;

    const data = await request("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ note })
    });

    setMsg(data.message);
    await loadMyAttendance();

    if (currentUser.role === "admin") {
      await loadAdminAttendance();
    }
  } catch (err) {
    setMsg(err.message, true);
  }
}

async function checkOut() {
  try {
    const data = await request("/api/attendance/check-out", {
      method: "POST"
    });

    setMsg(data.message);
    await loadMyAttendance();

    if (currentUser.role === "admin") {
      await loadAdminAttendance();
    }
  } catch (err) {
    setMsg(err.message, true);
  }
}

async function loadMyAttendance() {
  const data = await request("/api/attendance/me");
  const tbody = document.getElementById("myTable");

  tbody.innerHTML = "";

  data.attendances.forEach((a) => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(a.attendance_date)}</td>
        <td>${formatDateTime(a.check_in)}</td>
        <td>${formatDateTime(a.check_out)}</td>
        <td>${a.status}</td>
      </tr>
    `;
  });
}

async function loadAdminAttendance() {
  const data = await request("/api/admin/attendance");
  const tbody = document.getElementById("adminTable");

  tbody.innerHTML = "";

  data.attendances.forEach((a) => {
    tbody.innerHTML += `
      <tr>
        <td>${a.name}</td>
        <td>${a.email}</td>
        <td>${formatDate(a.attendance_date)}</td>
        <td>${formatDateTime(a.check_in)}</td>
        <td>${formatDateTime(a.check_out)}</td>
      </tr>
    `;
  });
}

async function createUser() {
  try {
    const name = document.getElementById("newName").value;
    const email = document.getElementById("newEmail").value;
    const password = document.getElementById("newPassword").value;
    const role = document.getElementById("newRole").value;

    const data = await request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role })
    });

    alert(data.message);
  } catch (err) {
    alert(err.message);
  }
}

async function checkSession() {
  if (!token()) return;

  try {
    const data = await request("/api/me");
    currentUser = data.user;

    showDashboard();
    await loadMyAttendance();

    if (currentUser.role === "admin") {
      await loadAdminAttendance();
    }
  } catch (err) {
    clearToken();
  }
}

checkSession();
