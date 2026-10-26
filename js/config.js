// ============================================================
// config.js — ค่า Configuration หลักของระบบ
// *** แก้ไข APPS_SCRIPT_URL หลังจาก Deploy Google Apps Script ***
// ============================================================

const CONFIG = {
  // URL ของ Google Apps Script Web App
  // หลัง Deploy แล้ว ให้นำ URL มาวางที่นี่
  // ตัวอย่าง: 'https://script.google.com/macros/s/AKfy.../exec'
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',

  // ชื่อโรงเรียน (จะถูก override โดยข้อมูลจาก Google Sheet)
  SCHOOL_NAME: 'ระบบลงทะเบียนวิชาเลือก',

  // เวลา polling ดึงข้อมูลที่นั่งคงเหลือ (มิลลิวินาที)
  POLL_INTERVAL: 30000, // 30 วินาที

  // Session storage key
  SESSION_KEY: 'student_session',
  ADMIN_SESSION_KEY: 'admin_session'
};
