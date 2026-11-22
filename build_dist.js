/**
 * BUILD SCRIPT: DUAL-SITE SYNC & INTEGRITY VALIDATOR
 * Sistem Automasi Donasi & Transparansi Beasiswa Alumni UPI
 * 
 * Sesuai arsitektur Netlify Separation:
 * 1. dist_donatur/index.html -> Portal Donatur Publik (Bebas link admin)
 * 2. dist_admin/index.html   -> Portal Admin Internal (Bebas link donatur)
 * 
 * Tidak ada file .html di luar folder dist_donatur dan dist_admin.
 * Skrip ini memastikan sinkronisasi file aset bersama dan validasi pemisahan wewenang.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const DIST_DONATUR = path.join(ROOT_DIR, 'dist_donatur');
const DIST_ADMIN = path.join(ROOT_DIR, 'dist_admin');

console.log('🚀 Memulai proses sinkronisasi & validasi dual-site Netlify...\n');

// Fungsi pembantu untuk copy rekursif
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Pastikan folder distribusi ada
[DIST_DONATUR, DIST_ADMIN].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 1. Validasi keberadaan file HTML utama di masing-masing folder dist
const donaturHtmlPath = path.join(DIST_DONATUR, 'index.html');
const adminHtmlPath = path.join(DIST_ADMIN, 'index.html');

if (!fs.existsSync(donaturHtmlPath)) {
  console.error('❌ ERROR: File dist_donatur/index.html tidak ditemukan!');
  process.exit(1);
}
if (!fs.existsSync(adminHtmlPath)) {
  console.error('❌ ERROR: File dist_admin/index.html tidak ditemukan!');
  process.exit(1);
}

// 2. Validasi Segregation of Duties (Tidak boleh ada cross-link)
const donaturHtml = fs.readFileSync(donaturHtmlPath, 'utf-8');
if (donaturHtml.includes('href="admin.html"')) {
  console.error('❌ PERINGATAN: Masih ditemukan link href="admin.html" pada dist_donatur/index.html!');
  process.exit(1);
}
console.log('   ✅ dist_donatur/index.html terverifikasi aman (Bebas link Admin).');

const adminHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
if (adminHtml.includes('href="index.html"')) {
  console.error('❌ PERINGATAN: Masih ditemukan link href="index.html" pada dist_admin/index.html!');
  process.exit(1);
}
console.log('   ✅ dist_admin/index.html terverifikasi aman (Bebas link Donatur).');

// 3. Verifikasi bahwa tidak ada file .html liar di root directory
const rootFiles = fs.readdirSync(ROOT_DIR);
const rootHtmlFiles = rootFiles.filter(f => f.endsWith('.html'));
if (rootHtmlFiles.length > 0) {
  console.warn(`⚠️  PERINGATAN: Ditemukan file HTML di root: ${rootHtmlFiles.join(', ')}. Menghapus agar tidak double...`);
  rootHtmlFiles.forEach(f => {
    fs.unlinkSync(path.join(ROOT_DIR, f));
    console.log(`   🗑️ Dihapus: ${f}`);
  });
}
console.log('   ✅ Root directory bersih dari file .html (Hanya ada di dist_donatur dan dist_admin).');

// 4. File bersama yang disinkronkan ke kedua dist
const SHARED_FILES = [
  'styles.css',
  'config.js',
  'seed_data.js',
  'netlify.toml'
];

console.log('📦 Menyinkronkan aset bersama (styles.css, config.js, seed_data.js, netlify.toml)...');
SHARED_FILES.forEach(file => {
  const srcPath = path.join(ROOT_DIR, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(DIST_DONATUR, file));
    fs.copyFileSync(srcPath, path.join(DIST_ADMIN, file));
  }
});

// 5. Salin icon dan aset spesifik untuk masing-masing portal
if (fs.existsSync(path.join(ROOT_DIR, 'amal.png'))) {
  fs.copyFileSync(path.join(ROOT_DIR, 'amal.png'), path.join(DIST_DONATUR, 'amal.png'));
}
if (fs.existsSync(path.join(ROOT_DIR, 'activity.png'))) {
  fs.copyFileSync(path.join(ROOT_DIR, 'activity.png'), path.join(DIST_ADMIN, 'activity.png'));
}

// 6. Copy folder assets jika ada (real merchant QRIS images are excluded from public repo)
if (fs.existsSync(path.join(ROOT_DIR, 'assets'))) {
  copyRecursiveSync(path.join(ROOT_DIR, 'assets'), path.join(DIST_DONATUR, 'assets'));
  copyRecursiveSync(path.join(ROOT_DIR, 'assets'), path.join(DIST_ADMIN, 'assets'));
}

console.log('\n============================================================');
console.log('🎉 SINKRONISASI & VALIDASI BERHASIL!');
console.log('============================================================');
console.log('1. Portal Donatur : dist_donatur/index.html (Siap deploy Netlify)');
console.log('2. Portal Admin   : dist_admin/index.html   (Siap deploy Netlify)');
console.log('3. Root Directory : Bersih tanpa file .html duplikat.');
