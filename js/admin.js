// ============================================================
// admin.js — Logic หน้าครู/Admin
// ============================================================

let adminLoggedIn = false;
let allSubjectsAdmin = [];
let allRegistrations = [];
let editingSubjectId = null;

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  checkAdminSession();
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
// Toast
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
// Session
// ============================================================
function checkAdminSession() {
  const saved = sessionStorage.getItem(CONFIG.ADMIN_SESSION_KEY);
  if (saved === 'true') {
    adminLoggedIn = true;
    showAdminPanel();
  }
}

function saveAdminSession() {
  sessionStorage.setItem(CONFIG.ADMIN_SESSION_KEY, 'true');
}

function adminLogout() {
  adminLoggedIn = false;
  sessionStorage.removeItem(CONFIG.ADMIN_SESSION_KEY);
  document.getElementById('adminLoginSection').classList.remove('hidden');
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('adminLoginForm')?.reset();
}

// ============================================================
// Admin Login
// ============================================================
document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('adminLoginBtn');
  const password = document.getElementById('adminPassword').value.trim();
  const errorEl = document.getElementById('adminLoginError');
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> กำลังตรวจสอบ...';

  try {
    const data = await apiPost({ action: 'adminLogin', password });
    if (data.success) {
      saveAdminSession();
      adminLoggedIn = true;
      showAdminPanel();
    } else {
      errorEl.textContent = data.message || 'รหัสผ่านผิด';
      errorEl.classList.remove('hidden');
    }
  } catch(err) {
    errorEl.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔑 เข้าสู่ระบบ';
  }
});

// ============================================================
// Show Admin Panel
// ============================================================
async function showAdminPanel() {
  document.getElementById('adminLoginSection').classList.add('hidden');
  document.getElementById('adminPanel').classList.remove('hidden');
  await loadDashboard();
  switchTab('tab-subjects');
}

// ============================================================
// Tabs
// ============================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(tabId + '-btn')?.classList.add('active');
  document.getElementById(tabId + '-panel')?.classList.add('active');
  if (tabId === 'tab-subjects') loadSubjectsAdmin();
  if (tabId === 'tab-registrations') loadRegistrationsAdmin();
  if (tabId === 'tab-students') loadStudentsAdmin();
  if (tabId === 'tab-settings') loadSettingsAdmin();
}

// ============================================================
// Dashboard Stats
// ============================================================
async function loadDashboard() {
  try {
    const [subData, regData] = await Promise.all([
      apiGet({ action: 'getSubjectsAdmin' }),
      apiGet({ action: 'getAllRegistrations' })
    ]);
    if (subData.success) {
      document.getElementById('statSubjects').textContent = subData.subjects.length;
      const totalSeats = subData.subjects.reduce((a, s) => a + Number(s.max_seats), 0);
      document.getElementById('statSeats').textContent = totalSeats;
    }
    if (regData.success) {
      const uniqueStudents = new Set(regData.registrations.map(r => r.student_id)).size;
      document.getElementById('statStudents').textContent = uniqueStudents;
      document.getElementById('statRegs').textContent = regData.registrations.length;
    }
  } catch(e) {}
}

// ============================================================
// TAB 1: Subjects Management
// ============================================================
async function loadSubjectsAdmin() {
  const tbody = document.getElementById('subjectsTableBody');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:40px;"><span class="spinner"></span></td></tr>`;

  try {
    const data = await apiGet({ action: 'getSubjectsAdmin' });
    if (!data.success) throw new Error(data.message);
    allSubjectsAdmin = data.subjects;
    renderSubjectsTable();
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:var(--danger);padding:30px;">${err.message}</td></tr>`;
  }
}

function renderSubjectsTable() {
  const tbody = document.getElementById('subjectsTableBody');
  if (allSubjectsAdmin.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📚</div><h3>ยังไม่มีวิชาเลือก</h3><p>คลิก "เพิ่มวิชา" เพื่อเริ่มต้น</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = allSubjectsAdmin.map(s => {
    const isActive = String(s.is_active).toLowerCase() === 'true';
    const pct = s.max_seats > 0 ? Math.round((s.enrolled / s.max_seats) * 100) : 0;
    return `
      <tr>
        <td><span class="badge badge-accent">${s.subject_id}</span></td>
        <td><strong>${s.name}</strong></td>
        <td style="color:var(--text-secondary);">${s.teacher || '-'}</td>
        <td>
          <div style="min-width:100px;">
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px;">${s.enrolled}/${s.max_seats} (${pct}%)</div>
            <div class="seat-bar" style="height:5px;">
              <div class="seat-bar-fill ${pct>=90?'full-bar':pct>=70?'almost-full':''}" style="width:${Math.min(pct,100)}%"></div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size:0.8rem;">
            <div>ชั้น: ${s.allowed_grades === 'all' ? 'ทุกชั้น' : 'ม.' + s.allowed_grades.replace(/,/g, ', ม.')}</div>
            <div>ห้อง: ${s.allowed_rooms === 'all' ? 'ทุกห้อง' : s.allowed_rooms}</div>
          </div>
        </td>
        <td><span class="badge badge-primary">เลือกได้ ${s.max_choices} วิชา</span></td>
        <td>
          <label class="toggle" title="${isActive?'เปิด':'ปิด'}อยู่">
            <input type="checkbox" ${isActive?'checked':''} onchange="toggleSubjectActive('${s.subject_id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-secondary btn-sm" onclick="openEditModal('${s.subject_id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSubjectConfirm('${s.subject_id}', '${s.name.replace(/'/g,"\\'")}')">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ---- Toggle Active ----
async function toggleSubjectActive(subject_id, isActive) {
  try {
    await apiPost({ action: 'updateSubject', subject_id, is_active: String(isActive) });
    showToast(isActive ? 'เปิดวิชาแล้ว' : 'ปิดวิชาแล้ว', 'success');
  } catch(e) { showToast('เกิดข้อผิดพลาด', 'error'); }
}

// ---- Delete ----
async function deleteSubjectConfirm(subject_id, name) {
  if (!confirm(`ต้องการลบวิชา "${name}" หรือไม่?\nข้อมูลการลงทะเบียนจะยังคงอยู่`)) return;
  try {
    const data = await apiPost({ action: 'deleteSubject', subject_id });
    if (data.success) { showToast('ลบวิชาเรียบร้อย', 'success'); loadSubjectsAdmin(); loadDashboard(); }
    else showToast(data.message, 'error');
  } catch(e) { showToast('เกิดข้อผิดพลาด', 'error'); }
}

// ---- Add/Edit Modal ----
function openAddModal() {
  editingSubjectId = null;
  document.getElementById('modalTitle').textContent = '➕ เพิ่มวิชาเลือกใหม่';
  document.getElementById('subjectForm').reset();
  document.getElementById('subjectFormId').value = '';
  document.getElementById('subjectFormMaxChoices').value = 2;
  document.getElementById('subjectFormMaxSeats').value = 30;
  document.getElementById('subjectFormGrades').value = 'all';
  document.getElementById('subjectFormRooms').value = 'all';
  document.getElementById('subjectFormActive').checked = true;
  document.getElementById('subjectModal').classList.remove('hidden');
}

function openEditModal(subject_id) {
  const s = allSubjectsAdmin.find(s => String(s.subject_id) === String(subject_id));
  if (!s) return;
  editingSubjectId = subject_id;
  document.getElementById('modalTitle').textContent = '✏️ แก้ไขวิชา';
  document.getElementById('subjectFormId').value = s.subject_id;
  document.getElementById('subjectFormName').value = s.name;
  document.getElementById('subjectFormDesc').value = s.description || '';
  document.getElementById('subjectFormTeacher').value = s.teacher || '';
  document.getElementById('subjectFormMaxSeats').value = s.max_seats;
  document.getElementById('subjectFormMaxChoices').value = s.max_choices;
  document.getElementById('subjectFormGrades').value = s.allowed_grades;
  document.getElementById('subjectFormRooms').value = s.allowed_rooms;
  document.getElementById('subjectFormActive').checked = String(s.is_active).toLowerCase() === 'true';
  document.getElementById('subjectModal').classList.remove('hidden');
}

function closeSubjectModal() {
  document.getElementById('subjectModal').classList.add('hidden');
}

document.getElementById('subjectForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveSubjectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const payload = {
    action: editingSubjectId ? 'updateSubject' : 'addSubject',
    subject_id: document.getElementById('subjectFormId').value,
    name: document.getElementById('subjectFormName').value.trim(),
    description: document.getElementById('subjectFormDesc').value.trim(),
    teacher: document.getElementById('subjectFormTeacher').value.trim(),
    max_seats: document.getElementById('subjectFormMaxSeats').value,
    max_choices: document.getElementById('subjectFormMaxChoices').value,
    allowed_grades: document.getElementById('subjectFormGrades').value.trim() || 'all',
    allowed_rooms: document.getElementById('subjectFormRooms').value.trim() || 'all',
    is_active: String(document.getElementById('subjectFormActive').checked)
  };

  try {
    const data = await apiPost(payload);
    if (data.success) {
      showToast(editingSubjectId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มวิชาเรียบร้อย', 'success');
      closeSubjectModal();
      loadSubjectsAdmin();
      loadDashboard();
    } else {
      showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
    }
  } catch(err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 บันทึก';
  }
});

// ============================================================
// TAB 2: Registrations
// ============================================================
async function loadRegistrationsAdmin() {
  const tbody = document.getElementById('regTableBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px;"><span class="spinner"></span></td></tr>`;
  try {
    const data = await apiGet({ action: 'getAllRegistrations' });
    if (!data.success) throw new Error(data.message);
    allRegistrations = data.registrations;
    renderRegistrationsTable(allRegistrations);
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger);padding:30px;">${err.message}</td></tr>`;
  }
}

function renderRegistrationsTable(regs) {
  const tbody = document.getElementById('regTableBody');
  if (regs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><h3>ยังไม่มีการลงทะเบียน</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = regs.map((r, i) => `
    <tr>
      <td style="color:var(--text-muted);">${i+1}</td>
      <td><strong>${r.student_id}</strong></td>
      <td>${r.student_name}</td>
      <td><span class="badge badge-primary">ม.${r.grade}/${r.room}</span></td>
      <td>${r.subject_name}</td>
      <td style="font-size:0.8rem;color:var(--text-secondary);">${new Date(r.timestamp).toLocaleString('th-TH')}</td>
      <td style="font-size:0.8rem;color:var(--text-secondary);">${r.email || '-'}</td>
    </tr>`).join('');
}

// ---- Filter ----
function filterRegistrations() {
  const searchText = document.getElementById('regSearch').value.toLowerCase();
  const gradeFilter = document.getElementById('regGradeFilter').value;
  const subjectFilter = document.getElementById('regSubjectFilter').value.toLowerCase();

  const filtered = allRegistrations.filter(r => {
    const matchSearch = !searchText ||
      r.student_id.toString().includes(searchText) ||
      r.student_name.toLowerCase().includes(searchText);
    const matchGrade = !gradeFilter || String(r.grade) === gradeFilter;
    const matchSubject = !subjectFilter || r.subject_name.toLowerCase().includes(subjectFilter);
    return matchSearch && matchGrade && matchSubject;
  });

  renderRegistrationsTable(filtered);
  document.getElementById('regCount').textContent = filtered.length;
}

// ---- Export CSV ----
function exportCSV() {
  const headers = ['รหัสนักเรียน', 'ชื่อ-สกุล', 'ชั้น', 'ห้อง', 'วิชา', 'วันที่ลงทะเบียน', 'Email'];
  const rows = allRegistrations.map(r => [
    r.student_id, r.student_name, `ม.${r.grade}`, r.room, r.subject_name,
    new Date(r.timestamp).toLocaleString('th-TH'), r.email || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ลงทะเบียนวิชาเลือก_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('ดาวน์โหลด CSV เรียบร้อย', 'success');
}

// ============================================================
// TAB 3: Students Management
// ============================================================
async function loadStudentsAdmin() {
  // Just show the import UI (read students from sheet not exposed in this view for simplicity)
  document.getElementById('studentsPanel').innerHTML = `
    <div class="card">
      <div class="card-title">📥 นำเข้ารายชื่อนักเรียน</div>
      <div class="card-subtitle">รูปแบบ CSV: รหัสนักเรียน, ชื่อ-สกุล, ชั้น (1-6), ห้อง, รหัสผ่าน, email (optional)</div>
      <div class="alert alert-info mt-2 mb-2">
        ℹ️ ตัวอย่าง: <code>12345,สมชาย ใจดี,4,1,password123,student@school.com</code>
      </div>
      <div class="form-group">
        <label>วางข้อมูล CSV (1 แถวต่อ 1 นักเรียน)</label>
        <textarea class="form-control" id="studentCsvInput" rows="10" placeholder="12345,สมชาย ใจดี,4,1,pass1234,email@school.com&#10;12346,สมหญิง ดีใจ,4,1,pass5678,"></textarea>
      </div>
      <button class="btn btn-primary" onclick="importStudentsFromCSV()">📤 นำเข้าข้อมูล</button>
      <div id="importResult" class="mt-2"></div>
    </div>`;
}

async function importStudentsFromCSV() {
  const raw = document.getElementById('studentCsvInput').value.trim();
  if (!raw) { showToast('กรุณาใส่ข้อมูล', 'warning'); return; }

  const lines = raw.split('\n').filter(l => l.trim());
  const students = lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    return {
      student_id: parts[0] || '',
      name: parts[1] || '',
      grade: parts[2] || '',
      room: parts[3] || '',
      password: parts[4] || '',
      email: parts[5] || ''
    };
  }).filter(s => s.student_id && s.name);

  if (students.length === 0) { showToast('ไม่พบข้อมูลที่ถูกต้อง', 'error'); return; }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> กำลังนำเข้า...';

  try {
    const data = await apiPost({ action: 'importStudents', students });
    if (data.success) {
      document.getElementById('importResult').innerHTML = `<div class="alert alert-success">✅ นำเข้าสำเร็จ ${data.count} รายการ</div>`;
      showToast(`นำเข้านักเรียน ${data.count} คน`, 'success');
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📤 นำเข้าข้อมูล';
  }
}

// ============================================================
// TAB 4: Settings
// ============================================================
async function loadSettingsAdmin() {
  try {
    const data = await apiGet({ action: 'getSettings' });
    if (data.success) {
      const s = data.settings;
      document.getElementById('settingRegOpen').checked = s['registration_open'] === 'true';
      document.getElementById('settingSchoolName').value = s['school_name'] || '';
      document.getElementById('settingAdminPass').value = '';
      document.getElementById('settingAdminPassHint').textContent = '(เว้นว่างถ้าไม่ต้องการเปลี่ยน)';
    }
  } catch(e) {}
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const settings = {
    registration_open: String(document.getElementById('settingRegOpen').checked),
    school_name: document.getElementById('settingSchoolName').value.trim()
  };
  const newPass = document.getElementById('settingAdminPass').value.trim();
  if (newPass) settings['admin_password'] = newPass;

  try {
    const data = await apiPost({ action: 'updateSettings', settings });
    if (data.success) {
      showToast('บันทึกการตั้งค่าเรียบร้อย', 'success');
      if (newPass) document.getElementById('settingAdminPass').value = '';
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 บันทึกการตั้งค่า';
  }
}
