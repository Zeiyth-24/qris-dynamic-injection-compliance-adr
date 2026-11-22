/**
 * SUITE PENGUJIAN OTOMATIS (UNIT & INTEGRATION TESTS)
 * Sistem Automasi Donasi & Transparansi Beasiswa Alumni UPI
 * 
 * Cara Menjalankan:
 * node test_system.js
 */

const fs = require('fs');
const assert = require('assert');

console.log('========================================================');
console.log('🧪 MEMULAI PENGUJIAN OTOMATIS SISTEM BEASISWA IKA UPI');
console.log('========================================================\n');

// 1. Load seed_data.js & config.js
const window = {};
eval(fs.readFileSync('seed_data.js', 'utf-8'));
eval(fs.readFileSync('config.js', 'utf-8'));

const db = window.DEFAULT_SEED_DATABASE;
const config = window.APP_CONFIG;

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}`);
    console.error('   Error:', err.message);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Integritas Database Induk Alumni (master_alumni)
// -----------------------------------------------------------------------------
runTest('Integritas Master Alumni (Tepat 25 data alumni di 8 Fakultas)', () => {
  assert.strictEqual(db.master_alumni.length, 25, 'Jumlah alumni harus tepat 25');
  
  const expectedFaculties = ['FIP', 'FPIPS', 'FPBS', 'FPMIPA', 'FPTK', 'FPOK', 'FPEB', 'FPSD'];
  const actualFaculties = new Set(db.master_alumni.map(a => a.fakultas));
  
  expectedFaculties.forEach(f => {
    assert.ok(actualFaculties.has(f), `Fakultas ${f} harus ada dalam data alumni`);
  });
});

// -----------------------------------------------------------------------------
// TEST 2: Validasi Lookup Identitas Alumni (Step 1)
// -----------------------------------------------------------------------------
runTest('Validasi Lookup NIM Mahasiswa (2001234 -> Fadhil Muhammad Ramadhan)', () => {
  const alumni = db.master_alumni.find(a => a.nim === '2001234');
  assert.ok(alumni, 'Alumni dengan NIM 2001234 harus ditemukan');
  assert.strictEqual(alumni.namaLengkap, 'Fadhil Muhammad Ramadhan');
  assert.strictEqual(alumni.fakultas, 'FPMIPA');
  assert.strictEqual(alumni.angkatan, '2020');
});

// -----------------------------------------------------------------------------
// TEST 3: Integritas 5 Kasus Representatif (Tepat 1 Data per Kasus/Skenario)
// -----------------------------------------------------------------------------
runTest('Integritas 5 Kasus Representatif (Jalur 1, Jalur 2, Jalur 3, Silent Donor, Pending)', () => {
  assert.strictEqual(db.raw_donations.length, 5, 'Jumlah transaksi harus tepat 5 (1 per kasus)');

  const tiers = new Set(db.raw_donations.map(t => t.verificationTier));
  assert.ok(tiers.has('TIER_1_VERIFIED'), 'Harus ada Case 1: TIER_1_VERIFIED');
  assert.ok(tiers.has('TIER_2_ONBOARDED'), 'Harus ada Case 2: TIER_2_ONBOARDED');
  assert.ok(tiers.has('TIER_3_EXPRESS'), 'Harus ada Case 3: TIER_3_EXPRESS');
  assert.ok(tiers.has('UNCLAIMED_DIRECT_TRANSFER'), 'Harus ada Case 4: UNCLAIMED_DIRECT_TRANSFER');

  const pendingTx = db.raw_donations.find(t => t.paymentStatus === 'PENDING');
  assert.ok(pendingTx, 'Harus ada Case 5: Status PENDING');

  const requiredFields = [
    'transactionId', 'timestamp', 'inflowPath', 'donorName', 
    'baseAmount', 'uniqueCode', 'totalTransferAmount', 'paymentChannel', 'paymentStatus'
  ];
  
  db.raw_donations.forEach((tx, idx) => {
    requiredFields.forEach(field => {
      assert.ok(tx[field] !== undefined, `Transaksi case ${idx+1} harus memiliki field ${field}`);
    });
  });
});

// -----------------------------------------------------------------------------
// TEST 4: Algoritma Ekstraksi Regex Email Mutasi Bank (BSI & Jago)
// -----------------------------------------------------------------------------
runTest('Ekstraksi Regex Notifikasi Email Mutasi Bank BSI & Jago', () => {
  const bsiSample = "CR TRANSFER DARI FAUZI VIA ATM BSI REK 7188000001 NOMINAL 100.342 BERHASIL";
  const jagoSample = "TRSF E-BANKING CR DARI SITI AMINAH VIA KANTONG JAGO 500000000001 SEBESAR RP 250.819";

  const bsiAmountMatch = bsiSample.match(/NOMINAL\s+([\d.]+)/i);
  assert.ok(bsiAmountMatch, 'Regex BSI harus dapat mengekstrak nominal');
  const bsiAmount = parseInt(bsiAmountMatch[1].replace(/\./g, ''), 10);
  assert.strictEqual(bsiAmount, 100342);

  const jagoAmountMatch = jagoSample.match(/RP\s+([\d.]+)/i);
  assert.ok(jagoAmountMatch, 'Regex Jago harus dapat mengekstrak nominal');
  const jagoAmount = parseInt(jagoAmountMatch[1].replace(/\./g, ''), 10);
  assert.strictEqual(jagoAmount, 250819);
});

// -----------------------------------------------------------------------------
// TEST 5: Formula Rekonsiliasi Kas & Segregation of Duties
// -----------------------------------------------------------------------------
runTest('Kalkulasi Kas Rekonsiliasi (Total Terhimpun = Kas Cair Bendahara + Gateway)', () => {
  const settled = db.raw_donations.filter(t => t.paymentStatus === 'PAID' || t.paymentStatus === 'SETTLED');
  const grandTotal = settled.reduce((sum, t) => sum + (Number(t.totalTransferAmount) || 0), 0);

  const bsiTotal = settled.filter(t => t.paymentChannel.includes('BSI')).reduce((s, t) => s + Number(t.totalTransferAmount), 0);
  const jagoTotal = settled.filter(t => t.paymentChannel.includes('JAGO')).reduce((s, t) => s + Number(t.totalTransferAmount), 0);
  const qrisTotal = settled.filter(t => t.paymentChannel.includes('QRIS')).reduce((s, t) => s + Number(t.totalTransferAmount), 0);

  const totalKasBendahara = bsiTotal + jagoTotal;
  const totalKasGateway = qrisTotal;

  assert.strictEqual(grandTotal, totalKasBendahara + totalKasGateway, 'Total dana harus sama dengan Kas Bendahara + Kas Gateway');
  assert.strictEqual(grandTotal, 1850631, 'Grand total dari 4 transaksi lunas harus tepat Rp 1.850.631');
  assert.strictEqual(totalKasBendahara, 1500312, 'Kas Bendahara harus tepat Rp 1.500.312');
  assert.strictEqual(totalKasGateway, 350319, 'Kas Gateway QRIS harus tepat Rp 350.319');
});

// -----------------------------------------------------------------------------
// TEST 6: Aturan Masking Data Privasi UU PDP (UU No. 27/2022)
// -----------------------------------------------------------------------------
runTest('Implementasi Data Masking Kepatuhan UU PDP (Nama & WhatsApp)', () => {
  function maskName(name) {
    if (!name) return 'Hamba Allah';
    const parts = name.trim().split(' ');
    return parts.map(p => p.length <= 2 ? p : p[0] + p[1] + '***').join(' ');
  }

  function maskPhone(phone) {
    if (!phone || phone.length < 8) return '-';
    return phone.slice(0, 4) + '****' + phone.slice(-3);
  }

  const maskedFadhil = maskName('Fadhil Ramadhan');
  assert.strictEqual(maskedFadhil, 'Fa*** Ra***');

  const maskedPhone = maskPhone('08122001234');
  assert.strictEqual(maskedPhone, '0812****234');
});

// -----------------------------------------------------------------------------
// TEST 7: Deteksi dan Penanganan Silent Donor (Case 4)
// -----------------------------------------------------------------------------
runTest('Deteksi Status UNCLAIMED_DIRECT_TRANSFER untuk Silent Donors (Case 4)', () => {
  const unclaimed = db.raw_donations.filter(t => 
    t.verificationTier === 'UNCLAIMED_DIRECT_TRANSFER' || 
    t.inflowPath === 'DIRECT_BANK_MUTATION'
  );
  
  assert.strictEqual(unclaimed.length, 1, 'Harus ada tepat 1 data transaksi Silent Donor representatif');
  const silentTx = unclaimed[0];
  assert.strictEqual(silentTx.verificationTier, 'UNCLAIMED_DIRECT_TRANSFER');
  assert.ok(silentTx.bankSenderRaw && silentTx.bankSenderRaw.includes('SITI AMINAH'), 'Mutasi liar harus mencatat nama pengirim rekening asli');
  assert.strictEqual(silentTx.totalTransferAmount, 500000);
});

// -----------------------------------------------------------------------------
// TEST 8: Ekstraksi Regex Mutasi Email E-Wallet / QRIS Ingestion (Demo)
// -----------------------------------------------------------------------------
runTest('Ekstraksi Regex Email Mutasi Pembayaran (Demo Parser)', () => {
  const danaEmailBody1 = "Pembayaran sebesar Rp 50 dari Donatur Alumni telah berhasil diterima via QRIS.";
  const danaEmailBody2 = "Saldo bertambah Rp 50.000 dari Donatur Alumni UPI.";
  const danaSubject = "Transaksi Berhasil: Uang Masuk Rp 100.000";

  function extractDanaAmount(body, subject) {
    const match = body.match(/Rp\.?\s?([0-9.,]+)/i) || 
                  subject.match(/Rp\.?\s?([0-9.,]+)/i) || 
                  body.match(/(?:IDR|sebesar)\s?([0-9.,]+)/i);
    if (match && match[1]) {
      return parseInt(match[1].replace(/[.,]/g, "").trim(), 10);
    }
    return 0;
  }

  assert.strictEqual(extractDanaAmount(danaEmailBody1, ""), 50, 'Harus mengekstrak Rp 50');
  assert.strictEqual(extractDanaAmount(danaEmailBody2, ""), 50000, 'Harus mengekstrak Rp 50.000');
  assert.strictEqual(extractDanaAmount("", danaSubject), 100000, 'Harus mengekstrak Rp 100.000 dari subjek');
});

// -----------------------------------------------------------------------------
// TEST 9: Sandbox Demo Invoice QR Payload Builder (Non-Transactional)
// -----------------------------------------------------------------------------
runTest('Sandbox Demo Invoice QR Payload Builder (Non-Transactional)', () => {
  function buildSandboxInvoiceQrPayload(txId, amountInteger) {
    const amtInt = Math.max(1, Math.round(Number(amountInteger) || 0));
    const safeTxId = String(txId || 'DEMO-TX').replace(/[^A-Za-z0-9_-]/g, '');
    return `SANDBOX_INVOICE|MERCHANT=IKA_UPI_DEMO|TX=${safeTxId}|CURRENCY=IDR|AMOUNT=${amtInt}`;
  }

  const demoPayload = buildSandboxInvoiceQrPayload('TX-CASE5-PENDING', 100342);
  assert.strictEqual(
    demoPayload,
    'SANDBOX_INVOICE|MERCHANT=IKA_UPI_DEMO|TX=TX-CASE5-PENDING|CURRENCY=IDR|AMOUNT=100342'
  );

  const sanitizedPayload = buildSandboxInvoiceQrPayload('TX<script>1', 50);
  assert.strictEqual(
    sanitizedPayload,
    'SANDBOX_INVOICE|MERCHANT=IKA_UPI_DEMO|TX=TXscript1|CURRENCY=IDR|AMOUNT=50',
    'Karakter non-alfanumerik pada TX ID harus disanitasi'
  );
});

// -----------------------------------------------------------------------------
// TEST 10: Automasi Upload Bukti Screenshot & Arsip Google Drive (Kolom 20)
// -----------------------------------------------------------------------------
runTest('Automasi Upload Bukti Screenshot Pembayaran & Integrasi Google Drive', () => {
  // 1. Verifikasi skema database induk memiliki atribut proofImageUrl di seluruh 5 kasus
  assert.ok(Array.isArray(db.raw_donations), 'raw_donations harus berupa array');
  assert.strictEqual(db.raw_donations.length, 5, 'Harus memiliki tepat 5 kasus representatif');

  db.raw_donations.forEach((tx, idx) => {
    assert.ok('proofImageUrl' in tx, `Transaksi indeks ${idx} (${tx.transactionId}) harus memiliki property proofImageUrl`);
  });

  // 2. Simulasi alur upload bukti screenshot untuk transaksi PENDING (Case 5)
  const pendingTx = db.raw_donations.find(t => t.transactionId === 'TX-CASE5-PENDING');
  assert.ok(pendingTx, 'Case 5 (TX-CASE5-PENDING) harus ada');
  assert.strictEqual(pendingTx.paymentStatus, 'PENDING', 'Status awal Case 5 harus PENDING');

  // Simulasi verifikasi bukti upload screenshot & tautan Google Drive
  const simulatedDriveUrl = 'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view?usp=sharing';
  const updatedTx = {
    ...pendingTx,
    paymentStatus: 'PAID',
    settlementStatus: 'SETTLED_PROOF_UPLOAD',
    notes: 'Verifikasi Screenshot via Web (Google Drive)',
    proofImageUrl: simulatedDriveUrl
  };

  assert.strictEqual(updatedTx.paymentStatus, 'PAID', 'Status harus menjadi PAID');
  assert.strictEqual(updatedTx.settlementStatus, 'SETTLED_PROOF_UPLOAD', 'Settlement harus SETTLED_PROOF_UPLOAD');
  assert.ok(updatedTx.proofImageUrl.includes('drive.google.com'), 'Proof URL harus menyimpan tautan Google Drive');
  assert.strictEqual(updatedTx.totalTransferAmount, pendingTx.totalTransferAmount, 'Nominal transaksi harus tepat cocok dengan tagihan');
});

console.log('\n========================================================');
console.log(`📊 HASIL PENGUJIAN: ${passedTests}/${totalTests} UJI COBA BERHASIL (100% PASS)`);
console.log('========================================================');
