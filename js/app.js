// ============================================================
// app.js — Logic หน้านักเรียน
// ============================================================

// ---- State ----
let currentStudent = null;
let allSubjects = [];
let selectedSubjects = [];
let maxChoices = 2;
let pollTimer = null;
let registrationOpen = true;

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  loadSettings();
});

// ============================================================
// API Helper
// ============================================================
async function apiGet(params) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res.json();
}

// ============================================================
// Toast Notification
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'error' ? 'error' : type === 'success' ? 'success' : 'info'}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// Settings
// ============================================================
async function loadSettings() {
  try {
    const data = await apiGet({ action: 'getSettings' });
    if (data.success) {
      registrationOpen = data.settings['registration_open'] === 'true';
      const schoolName = data.settings['school_name'] || CONFIG.SCHOOL_NAME;
      document.querySelectorAll('.school-name').forEach(el => el.textContent = schoolName);
      document.title = schoolName + ' — ลงทะเบียนวิชาเลือก';
    }
  } catch (e) { /* silently ignore */ }
}

// ============================================================
// Session Management
// ============================================================
function checkSession() {
  const saved = sessionStorage.getItem(CONFIG.SESSION_KEY);
  if (saved) {
    try {
      currentStudent = JSON.parse(saved);
      showStep('step-subjects');
      loadSubjects();
    } catch (e) {
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
    }
  }
}

function saveSession(student) {
  currentStudent = student;
  sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(student));
}

function clearSession() {
  currentStudent = null;
  selectedSubjects = [];
  sessionStorage.removeItem(CONFIG.SESSION_KEY);
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ============================================================
// Step Navigation
// ============================================================
function showStep(stepId) {
  document.querySelectorAll('.step-section').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(stepId);
  if (el) el.classList.remove('hidden');

  // Update step indicators
  const stepMap = { 'step-login': 1, 'step-subjects': 2, 'step-confirm': 3 };
  const current = stepMap[stepId] || 1;
  document.querySelectorAll('.step-item').forEach((item, i) => {
    item.classList.remove('active', 'done');
    if (i + 1 < current) item.classList.add('done');
    else if (i + 1 === current) item.classList.add('active');
  });
}

// ============================================================
// STEP 1: Login
// ============================================================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const student_id = document.getElementById('studentId').value.trim();
  const password = document.getElementById('studentPassword').value.trim();
  const errorEl = document.getElementById('loginError');

  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> กำลังตรวจสอบ...';

  try {
    const data = await apiPost({ action: 'login', student_id, password });
    if (data.success) {
      saveSession(data.student);
      showToast(`ยินดีต้อนรับ ${data.student.name}`, 'success');
      showStep('step-subjects');
      loadSubjects();
    } else {
      errorEl.textContent = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔑 เข้าสู่ระบบ';
  }
});

// ============================================================
// STEP 2: Load & Display Subjects
// ============================================================
async function loadSubjects() {
  const grid = document.getElementById('subjectsGrid');
  const infoEl = document.getElementById('studentInfo');
  const selCountEl = document.getElementById('selectionCount');

  // Show student info
  if (currentStudent) {
    infoEl.innerHTML = `
      <div class="d-flex align-center gap-2" style="flex-wrap:wrap">
        <div>
          <span style="font-size:1.1rem;font-weight:700;">${currentStudent.name}</span>
          <span class="badge badge-primary" style="margin-left:8px;">ม.${currentStudent.grade}/${currentStudent.room}</span>
        </div>
        <div class="d-flex gap-1" style="margin-left:auto">
          <button class="btn btn-secondary btn-sm" onclick="checkMyRegistration()">📋 ดูการลงทะเบียนของฉัน</button>
          <button class="btn btn-secondary btn-sm" onclick="logout()">ออกจากระบบ</button>
        </div>
      </div>`;
  }

  // Check if already registered
  try {
    const regData = await apiGet({ action: 'getRegistration', student_id: currentStudent.student_id });
    if (regData.success && regData.registrations.length > 0) {
      showAlreadyRegistered(regData.registrations);
      return;
    }
  } catch(e) {}

  // Show loading
  grid.innerHTML = `<div class="loading-overlay" style="grid-column:1/-1"><div class="spinner" style="width:36px;height:36px;border-width:4px;"></div><p>กำลังโหลดรายวิชา...</p></div>`;

  try {
    const data = await apiGet({
      action: 'getSubjects',
      grade: currentStudent.grade,
      room: currentStudent.room
    });

    if (!data.success) throw new Error(data.message);

    allSubjects = data.subjects;
    renderSubjects();

    // Start polling
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshSeats, CONFIG.POLL_INTERVAL);

    // Get max_choices from first subject
    if (allSubjects.length > 0) {
      maxChoices = allSubjects[0].max_choices || 2;
    }
    selCountEl.textContent = `เลือกได้ ${maxChoices} วิชา`;

  } catch(err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>${err.message}</p><button class="btn btn-secondary mt-2" onclick="loadSubjects()">ลองใหม่</button></div>`;
  }
}

function renderSubjects() {
  const grid = document.getElementById('subjectsGrid');
  if (!registrationOpen) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔒</div><h3>ปิดการลงทะเบียน</h3><p>ขณะนี้ไม่ได้เปิดรับการลงทะเบียน กรุณาติดต่อครู</p></div>`;
    return;
  }
  if (allSubjects.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📚</div><h3>ไม่มีวิชาที่เปิดให้ลงทะเบียน</h3><p>กรุณาติดต่อครูผู้ดูแล</p></div>`;
    return;
  }

  const subjectIcons = ['📚', '🎨', '🔬', '🎵', '💻', '⚽', '🍳', '🌿', '🏛️', '🎭', '🧮', '🌍'];

  grid.innerHTML = allSubjects.map((s, i) => {
    const pct = s.max_seats > 0 ? (s.enrolled / s.max_seats) * 100 : 100;
    const isFull = s.seats_left <= 0;
    const isSelected = selectedSubjects.includes(s.subject_id);
    const barClass = pct >= 90 ? 'full-bar' : pct >= 70 ? 'almost-full' : '';
    const icon = subjectIcons[i % subjectIcons.length];

    return `
      <div class="subject-card ${isFull ? 'full' : ''} ${isSelected ? 'selected' : ''}"
           id="card-${s.subject_id}"
           onclick="${isFull ? '' : `toggleSelect('${s.subject_id}')`}"
           role="button" aria-label="${s.name}">
        <div class="selected-badge">✓</div>
        <div class="subject-card-header">
          <div class="subject-icon">${icon}</div>
          <div>
            <div class="subject-card-title">${s.name}</div>
            <div class="subject-card-teacher">👤 ${s.teacher || 'ไม่ระบุ'}</div>
          </div>
        </div>
        <p class="subject-card-desc">${s.description || 'ไม่มีคำอธิบาย'}</p>
        <div class="d-flex gap-1" style="flex-wrap:wrap;margin-bottom:10px;">
          ${isFull ? '<span class="badge badge-danger">เต็มแล้ว</span>' : `<span class="badge badge-success">ว่าง ${s.seats_left} ที่นั่ง</span>`}
        </div>
        <div class="seat-bar-wrap">
          <div class="seat-bar-label">
            <span>ที่นั่ง ${s.enrolled}/${s.max_seats}</span>
            <span>${Math.round(pct)}%</span>
          </div>
          <div class="seat-bar">
            <div class="seat-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%"></div>
          </div>
        </div>
      </div>`;
  }).join('');

  updateSubmitBtn();
}

// ============================================================
// Realtime Seat Refresh
// ============================================================
async function refreshSeats() {
  try {
    const data = await apiGet({
      action: 'getSubjects',
      grade: currentStudent.grade,
      room: currentStudent.room
    });
    if (data.success) {
      allSubjects = data.subjects;
      renderSubjects();
    }
  } catch(e) {}
}

// ============================================================
// Subject Selection Toggle
// ============================================================
function toggleSelect(subjectId) {
  if (!registrationOpen) { showToast('ปิดการลงทะเบียนแล้ว', 'warning'); return; }
  const idx = selectedSubjects.indexOf(subjectId);
  if (idx >= 0) {
    selectedSubjects.splice(idx, 1);
    document.getElementById(`card-${subjectId}`)?.classList.remove('selected');
  } else {
    if (selectedSubjects.length >= maxChoices) {
      showToast(`เลือกได้สูงสุด ${maxChoices} วิชาเท่านั้น`, 'warning');
      return;
    }
    selectedSubjects.push(subjectId);
    document.getElementById(`card-${subjectId}`)?.classList.add('selected');
  }
  updateSubmitBtn();
}

function updateSubmitBtn() {
  const btn = document.getElementById('submitBtn');
  const countEl = document.getElementById('selectedCount');
  if (!btn) return;
  if (countEl) countEl.textContent = selectedSubjects.length;
  btn.disabled = selectedSubjects.length === 0 || !registrationOpen;
}

// ============================================================
// STEP 3: Confirm Registration
// ============================================================
document.getElementById('showConfirmBtn')?.addEventListener('click', () => {
  if (selectedSubjects.length === 0) { showToast('กรุณาเลือกวิชาก่อน', 'warning'); return; }
  showConfirmStep();
});

function showConfirmStep() {
  const selected = allSubjects.filter(s => selectedSubjects.includes(s.subject_id));
  const confirmList = document.getElementById('confirmList');
  const subjectIcons = ['📚', '🎨', '🔬', '🎵', '💻', '⚽', '🍳', '🌿', '🏛️', '🎭', '🧮', '🌍'];

  document.getElementById('confirmName').textContent = currentStudent.name;
  document.getElementById('confirmClass').textContent = `ม.${currentStudent.grade}/${currentStudent.room}`;

  confirmList.innerHTML = selected.map((s, i) => `
    <div class="confirm-subject-item">
      <div class="item-icon">${subjectIcons[i % subjectIcons.length]}</div>
      <div>
        <div style="font-weight:600;">${s.name}</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);">👤 ${s.teacher || 'ไม่ระบุ'}</div>
      </div>
    </div>`).join('');

  // Email input
  const emailInput = document.getElementById('confirmEmail');
  if (emailInput && currentStudent.email) emailInput.value = currentStudent.email;

  showStep('step-confirm');
}

document.getElementById('backBtn')?.addEventListener('click', () => {
  showStep('step-subjects');
});

document.getElementById('confirmForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('confirmBtn');
  const email = document.getElementById('confirmEmail')?.value.trim() || '';

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> กำลังบันทึก...';

  try {
    const data = await apiPost({
      action: 'register',
      student_id: currentStudent.student_id,
      student_name: currentStudent.name,
      grade: currentStudent.grade,
      room: currentStudent.room,
      email,
      subjects: selectedSubjects
    });

    if (data.success) {
      showSuccessPage(data.registered);
    } else {
      showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
    }
  } catch(err) {
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ ยืนยันการลงทะเบียน';
  }
});

// ============================================================
// Success Page
// ============================================================
function showSuccessPage(registered) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  const subjectIcons = ['📚', '🎨', '🔬', '🎵', '💻', '⚽'];
  document.getElementById('successName').textContent = currentStudent.name;
  document.getElementById('successClass').textContent = `ม.${currentStudent.grade}/${currentStudent.room}`;
  document.getElementById('successTimestamp').textContent = new Date().toLocaleString('th-TH');

  const list = document.getElementById('successSubjectList');
  list.innerHTML = registered.map((s, i) => `
    <div class="confirm-subject-item">
      <div class="item-icon">${subjectIcons[i % subjectIcons.length]}</div>
      <div style="font-weight:600;">${s.subject_name}</div>
    </div>`).join('');

  showStep('step-success');
}

// ============================================================
// Already Registered View
// ============================================================
async function showAlreadyRegistered(registrations) {
  const grid = document.getElementById('subjectsGrid');
  const subjectIcons = ['📚', '🎨', '🔬', '🎵', '💻', '⚽'];
  const items = registrations.map((r, i) => `
    <div class="confirm-subject-item">
      <div class="item-icon">${subjectIcons[i % subjectIcons.length]}</div>
      <div>
        <div style="font-weight:600;">${r.subject_name}</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);">${new Date(r.timestamp).toLocaleString('th-TH')}</div>
      </div>
    </div>`).join('');

  grid.innerHTML = `
    <div style="grid-column:1/-1">
      <div class="alert alert-success" style="margin-bottom:20px;">
        ✅ คุณได้ลงทะเบียนแล้ว
      </div>
      <div style="margin-bottom:20px;">${items}</div>
      <div class="d-flex gap-2">
        <button class="btn btn-danger" onclick="cancelMyRegistration()">🗑️ ยกเลิกการลงทะเบียน</button>
        <button class="btn btn-secondary" onclick="printConfirmation()">🖨️ พิมพ์ใบยืนยัน</button>
      </div>
    </div>`;

  document.getElementById('submitBtn')?.classList.add('hidden');
  document.getElementById('selectionInfo')?.classList.add('hidden');
}

async function cancelMyRegistration() {
  if (!confirm('ต้องการยกเลิกการลงทะเบียนทั้งหมดหรือไม่?')) return;
  try {
    const data = await apiPost({ action: 'cancelRegistration', student_id: currentStudent.student_id });
    if (data.success) {
      showToast('ยกเลิกการลงทะเบียนเรียบร้อย', 'success');
      selectedSubjects = [];
      document.getElementById('submitBtn')?.classList.remove('hidden');
      document.getElementById('selectionInfo')?.classList.remove('hidden');
      loadSubjects();
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function checkMyRegistration() {
  try {
    const data = await apiGet({ action: 'getRegistration', student_id: currentStudent.student_id });
    if (data.success && data.registrations.length > 0) {
      showAlreadyRegistered(data.registrations);
    } else {
      showToast('ยังไม่ได้ลงทะเบียน', 'info');
    }
  } catch(e) {}
}

// ============================================================
// Print
// ============================================================
function printConfirmation() { window.print(); }

// ============================================================
// Logout
// ============================================================
function logout() {
  clearSession();
  showStep('step-login');
  document.getElementById('loginForm')?.reset();
  document.getElementById('loginError')?.classList.add('hidden');
}
