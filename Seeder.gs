/**
 * SISTEM AUTOMASI DONASI & TRANSPARANSI BEASISWA ALUMNI UPI
 * Seeder.gs - Database Schema Generator, Auto-Formula & 30 Realistic Dummy Data
 * 
 * Fungsi Utama: initializeAndSeedDatabase()
 * Membuat & mengonfigurasi 5 tab otomatis:
 * 1. master_alumni (25 data alumni UPI terverifikasi & senior)
 * 2. raw_donations (30 transaksi multi-jalur: QRIS, BSI, Jago, Silent Donors, Pending)
 * 3. public_ledger_clean (Transformasi otomatis ARRAYFORMULA/FILTER untuk Looker Studio)
 * 4. summary_per_fakultas (Rekapitulasi otomatis SUMIFS & COUNTIFS per fakultas UPI)
 * 5. reconciliation_bendahara (Pemisahan dana rekening bendahara vs gateway H+1)
 */

// =============================================================================
// KONSTANTA NAMA TAB & WARNA TEMA UPI
// =============================================================================
const SEEDER_SHEETS = {
  MASTER_ALUMNI: 'master_alumni',
  RAW_DONATIONS: 'raw_donations',
  PUBLIC_LEDGER: 'public_ledger_clean',
  SUMMARY_FAKULTAS: 'summary_per_fakultas',
  RECONCILIATION: 'reconciliation_bendahara'
};

const SEEDER_THEME = {
  UPI_RED: '#8B0000',
  UPI_GOLD: '#D97706',
  DARK_NAVY: '#1E293B',
  HEADER_TEXT: '#FFFFFF',
  BORDER_COLOR: '#E2E8F0',
  ZEBRA_BG: '#F8FAFC'
};

// =============================================================================
// FUNGSI UTAMA: INITIALIZE AND SEED DATABASE
// =============================================================================
function runCompleteDatabaseSeed() {
  return initializeAndSeedDatabase();
}

function initializeAndSeedDatabase() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Inisialisasi Tab 1: master_alumni (25 data dummy)
  const sheetMasterAlumni = prepareCleanSheet(activeSpreadsheet, SEEDER_SHEETS.MASTER_ALUMNI);
  seedMasterAlumniTable(sheetMasterAlumni);

  // 2. Inisialisasi Tab 2: raw_donations (30 data dummy + Conditional Formatting)
  const sheetRawDonations = prepareCleanSheet(activeSpreadsheet, SEEDER_SHEETS.RAW_DONATIONS);
  seedRawDonationsTable(sheetRawDonations);

  // 3. Inisialisasi Tab 3: public_ledger_clean (Rumus Filter Transformasi Looker Studio)
  const sheetPublicLedger = prepareCleanSheet(activeSpreadsheet, SEEDER_SHEETS.PUBLIC_LEDGER);
  setupPublicLedgerCleanTable(sheetPublicLedger);

  // 4. Inisialisasi Tab 4: summary_per_fakultas (Leaderboard Fakultas UPI)
  const sheetSummaryFakultas = prepareCleanSheet(activeSpreadsheet, SEEDER_SHEETS.SUMMARY_FAKULTAS);
  setupSummaryPerFakultasTable(sheetSummaryFakultas);

  // 5. Inisialisasi Tab 5: reconciliation_bendahara (Segregation of Duties)
  const sheetReconciliation = prepareCleanSheet(activeSpreadsheet, SEEDER_SHEETS.RECONCILIATION);
  setupReconciliationBendaharaTable(sheetReconciliation);

  SpreadsheetApp.flush();
  Logger.log('Inisialisasi 5 Tab & 30 Data Dummy Database Beasiswa IKA UPI Berhasil!');
}

/**
 * Membuat tab baru atau mengosongkan tab lama yang sudah ada
 */
function prepareCleanSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  } else {
    sheet.clear();
    sheet.clearConditionalFormatRules();
  }
  return sheet;
}

// =============================================================================
// TAB 1: MASTER_ALUMNI (25 DATA REALISTIS UPI)
// =============================================================================
function seedMasterAlumniTable(sheet) {
  const masterHeaders = [
    'NIM', 'Email_UPI', 'Nama_Lengkap', 'Fakultas',
    'Program_Studi', 'Angkatan', 'No_WA', 'Sumber_Data'
  ];
  sheet.appendRow(masterHeaders);

  // Format Header Tab 1
  sheet.getRange(1, 1, 1, masterHeaders.length)
    .setFontWeight('bold')
    .setBackground(SEEDER_THEME.UPI_RED)
    .setFontColor(SEEDER_THEME.HEADER_TEXT)
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // 25 Baris Data Dummy Lengkap (18 Alumni 2016-2024 & 7 Alumni Senior 1988-2015)
  const masterAlumniDataset = [
    // 18 Alumni Muda Terdata (NIM 7 Digit, Email @upi.edu, SIAK_MASTER)
    ['2001234', 'fadhil.ramadhan@upi.edu', 'Fadhil Muhammad Ramadhan', 'FPMIPA', 'Ilmu Komputer', '2020', '08122001234', 'SIAK_MASTER'],
    ['2104567', 'siti.nurhaliza@upi.edu', 'Siti Nurhaliza', 'FIP', 'Manajemen Pendidikan', '2021', '08132104567', 'SIAK_MASTER'],
    ['1908901', 'reza.firmansyah@upi.edu', 'Reza Firmansyah, S.T.', 'FPTK', 'Teknik Sipil', '2019', '08121908901', 'SIAK_MASTER'],
    ['2203344', 'anisa.rahmawati@upi.edu', 'Anisa Rahmawati', 'FPEB', 'Akuntansi', '2022', '08572203344', 'SIAK_MASTER'],
    ['1805566', 'dimas.setiawan@upi.edu', 'Dimas Setiawan, S.Pd.', 'FPBS', 'Pendidikan Bahasa Inggris', '2018', '08131805566', 'SIAK_MASTER'],
    ['2007788', 'nadia.utami@upi.edu', 'Nadia Utami', 'FPIPS', 'Pendidikan Geografi', '2020', '08582007788', 'SIAK_MASTER'],
    ['1709900', 'bagus.wicaksono@upi.edu', 'Bagus Wicaksono, S.Pd.', 'FPOK', 'Pendidikan Jasmani Kesehatan & Rekreasi', '2017', '08211709900', 'SIAK_MASTER'],
    ['2101122', 'maya.indrawati@upi.edu', 'Maya Indrawati', 'FPSD', 'Desain Komunikasi Visual', '2021', '08192101122', 'SIAK_MASTER'],
    ['1902233', 'asep.sunarya@upi.edu', 'Asep Sunarya, S.Pd.', 'FIP', 'Pendidikan Guru Sekolah Dasar', '2019', '08781902233', 'SIAK_MASTER'],
    ['2304455', 'gilang.perdana@upi.edu', 'Gilang Ramadhan Perdana', 'FPTK', 'Pendidikan Teknik Elektro', '2023', '08962304455', 'SIAK_MASTER'],
    ['1806789', 'lutfi.fauzan@upi.edu', 'Lutfi Fauzan, S.Pd.', 'FPMIPA', 'Pendidikan Matematika', '2018', '08121806789', 'SIAK_MASTER'],
    ['2003456', 'dewi.lestari@upi.edu', 'Dewi Lestari, S.E.', 'FPEB', 'Manajemen', '2020', '08522003456', 'SIAK_MASTER'],
    ['1905678', 'ilham.hidayat@upi.edu', 'Ilham Hidayat, S.Pd.', 'FPIPS', 'Pendidikan Sejarah', '2019', '08771905678', 'SIAK_MASTER'],
    ['2207890', 'zahra.kamila@upi.edu', 'Zahra Kamila', 'FPBS', 'Pendidikan Bahasa Korea', '2022', '08132207890', 'SIAK_MASTER'],
    ['1601234', 'taufik.hidayat@upi.edu', 'Taufik Hidayat, S.Pd.', 'FPOK', 'Ilmu Keolahragaan', '2016', '08121601234', 'SIAK_MASTER'],
    ['2108901', 'salma.az-zahra@upi.edu', 'Salma Az-Zahra', 'FPSD', 'Pendidikan Seni Musik', '2021', '08562108901', 'SIAK_MASTER'],
    ['2306789', 'm.rizky.pratama@upi.edu', 'Muhammad Rizky Pratama', 'FPMIPA', 'Pendidikan Biologi', '2023', '08982306789', 'SIAK_MASTER'],
    ['2401123', 'aditya.saputra@upi.edu', 'Aditya Saputra', 'FPTK', 'Pendidikan Teknik Arsitektur', '2024', '08222401123', 'SIAK_MASTER'],

    // 7 Alumni Senior (< 2016, Lengkap Gelar, Hasil Registrasi Jalur 2, ONBOARDED_PATH_2)
    ['SENIOR-1994-1011', 'hendra.gunawan@alumni.upi.edu', 'Dr. Ir. Hendra Gunawan, M.T.', 'FPTK', 'Teknik Sipil', '1994', '08112233445', 'ONBOARDED_PATH_2'],
    ['SENIOR-1988-2045', 'maman.abdullah@alumni.upi.edu', 'Drs. H. Maman Abdullah, M.M.', 'FIP', 'Administrasi Pendidikan', '1988', '08122334455', 'ONBOARDED_PATH_2'],
    ['SENIOR-2002-3091', 'ratna.wulan@alumni.upi.edu', 'Dr. Ratna Wulan Suminar, M.Pd.', 'FPMIPA', 'Pendidikan Fisika', '2002', '08133445566', 'ONBOARDED_PATH_2'],
    ['SENIOR-1998-4102', 'dedi.supriadi@alumni.upi.edu', 'Dedi Supriadi, S.E., M.Si., Ak.', 'FPEB', 'Ilmu Ekonomi & Keuangan Islam', '1998', '08154556677', 'ONBOARDED_PATH_2'],
    ['SENIOR-2008-5219', 'eny.nurbaeti@alumni.upi.edu', 'Eny Nurbaeti, S.Pd., M.Hum.', 'FPBS', 'Pendidikan Bahasa & Sastra Indonesia', '2008', '08565667788', 'ONBOARDED_PATH_2'],
    ['SENIOR-1991-6330', 'agung.pribadi@alumni.upi.edu', 'Drs. Agung Pribadi, M.Pd.', 'FPOK', 'Pendidikan Kepelatihan Olahraga', '1991', '08216778899', 'ONBOARDED_PATH_2'],
    ['SENIOR-2012-7441', 'bambang.sukoco@alumni.upi.edu', 'Bambang Sukoco, S.Sn., M.Ds.', 'FPSD', 'Pendidikan Seni Rupa', '2012', '08787889900', 'ONBOARDED_PATH_2']
  ];

  sheet.getRange(2, 1, masterAlumniDataset.length, masterHeaders.length).setValues(masterAlumniDataset);

  // Auto-resize kolom untuk kerapian tampilan
  for (let colIdx = 1; colIdx <= masterHeaders.length; colIdx++) {
    sheet.autoResizeColumn(colIdx);
  }
}

// =============================================================================
// TAB 2: RAW_DONATIONS (5 KASUS REPRESENTATIF - TEPAT 1 TRANSAKSI PER SKENARIO)
// =============================================================================
function seedRawDonationsTable(sheet) {
  const donationHeaders = [
    "Transaction_ID", "Timestamp", "Inflow_Path", "NIM", "Donor_Name",
    "Faculty", "Department", "Batch_Year", "WhatsApp", "Base_Amount",
    "Unique_Code", "Total_Transfer_Amount", "Payment_Channel", "Privacy_Mode",
    "Verification_Tier", "Payment_Status", "Settlement_Status", "Bank_Sender_Raw", "Notes", "Proof_Image_Url"
  ];
  sheet.appendRow(donationHeaders);

  // Format Header Tab 2
  sheet.getRange(1, 1, 1, donationHeaders.length)
    .setFontWeight("bold")
    .setBackground(SEEDER_THEME.DARK_NAVY)
    .setFontColor(SEEDER_THEME.HEADER_TEXT)
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);

  // 5 Transaksi Representatif (Tepat 1 per Skenario / Kasus)
  const fiveRepresentativeCases = [
    // Case 1: Jalur 1 - Alumni Terdata SIAK (TIER_1_VERIFIED, PAID, QRIS)
    ["TX-CASE1-TERDATA", "2026-11-10 09:15:00", "PATH_1_VERIFIED", "2001234", "Fadhil Muhammad Ramadhan", "FPMIPA", "Ilmu Komputer", "2020", "08122001234", 250000, 114, 250114, "QRIS", "PUBLIC", "TIER_1_VERIFIED", "PAID", "SETTLED_DANA_QRIS", "DANA QRIS (Fadhil M R)", "Case 1: Alumni Terdata SIAK (Lunas via QRIS)", ""],
    // Case 2: Jalur 2 - Alumni Senior Onboarded (TIER_2_ONBOARDED, PAID, BSI)
    ["TX-CASE2-SENIOR", "2026-11-10 10:30:00", "PATH_2_SENIOR", "SENIOR-1994-1011", "Dr. Ir. Hendra Gunawan, M.T.", "FPTK", "Teknik Sipil", "1994", "08112233445", 1000000, 312, 1000312, "BSI_TRANSFER", "PUBLIC", "TIER_2_ONBOARDED", "PAID", "SETTLED", "CR DARI HENDRA GUNAWAN", "Case 2: Alumni Senior (Lunas via Transfer Bank BSI)", ""],
    // Case 3: Jalur 3 - Donatur Cepat / Anonim (TIER_3_EXPRESS, PAID, QRIS, ANONYMOUS)
    ["TX-CASE3-EXPRESS", "2026-11-10 13:45:00", "PATH_3_EXPRESS", "-", "Hamba Allah", "FPEB", "-", "2018", "-", 100000, 205, 100205, "QRIS", "ANONYMOUS", "TIER_3_EXPRESS", "PAID", "SETTLED_DANA_QRIS", "DANA QRIS (treasury-sandbox@example.org)", "Case 3: Donatur Spontan Anonim (Lunas via QRIS)", ""],
    // Case 4: Silent Donor Liar / Belum Terklaim (UNCLAIMED_DIRECT_TRANSFER, PAID, Bank Jago)
    ["TX-DIRECT-CASE4-SILENT", "2026-11-10 15:20:00", "DIRECT_BANK_MUTATION", "-", "UNKNOWN", "Belum Terdata", "-", "-", "-", 500000, 0, 500000, "JAGO_TRANSFER", "PUBLIC", "UNCLAIMED_DIRECT_TRANSFER", "PAID", "SETTLED", "TRSF E-BANKING CR DARI SITI AMINAH", "Case 4: Silent Donor (Transfer Bank Masuk Tanpa Konfirmasi Web)", ""],
    // Case 5: Transaksi Menunggu Pembayaran (PENDING, UNSETTLED, QRIS)
    ["TX-CASE5-PENDING", "2026-11-10 16:00:00", "PATH_1_VERIFIED", "2400001", "Zufar Ahmad Maulidy", "FPMIPA", "Ilmu Komputer", "2024", "08122001234", 50000, 422, 50422, "QRIS", "PUBLIC", "TIER_1_VERIFIED", "PENDING", "UNSETTLED", "-", "Case 5: Transaksi Aktif Menunggu Scan QRIS / Mutasi Masuk", ""]
  ];

  sheet.getRange(2, 1, fiveRepresentativeCases.length, donationHeaders.length).setValues(fiveRepresentativeCases);

  // Format Angka Nominal (Kolom J, K, L) ke format Rupiah
  sheet.getRange(2, 10, 1000, 3).setNumberFormat('"Rp"#,##0');

  // Pasang Conditional Formatting Berwarna
  applyConditionalFormattingToRawDonations(sheet, fiveRepresentativeCases.length + 1);

  // Auto-resize kolom
  for (let col = 1; col <= donationHeaders.length; col++) {
    sheet.autoResizeColumn(col);
  }
}

function applyConditionalFormattingToRawDonations(sheet, lastRow) {
  const rangePaymentStatus = sheet.getRange(2, 16, lastRow - 1, 1); // Kolom P
  const rangeVerificationTier = sheet.getRange(2, 15, lastRow - 1, 1); // Kolom O

  const rulePaid = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('PAID')
    .setBackground('#D1FAE5')
    .setFontColor('#065F46')
    .setRanges([rangePaymentStatus])
    .build();

  const rulePending = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('PENDING')
    .setBackground('#FEF3C7')
    .setFontColor('#92400E')
    .setRanges([rangePaymentStatus])
    .build();

  const ruleUnclaimed = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('UNCLAIMED_DIRECT_TRANSFER')
    .setBackground('#FFEDD5')
    .setFontColor('#9A3412')
    .setRanges([rangeVerificationTier])
    .build();

  sheet.setConditionalFormatRules([rulePaid, rulePending, ruleUnclaimed]);
}

// =============================================================================
// TAB 3: PUBLIC_LEDGER_CLEAN (RUMUS FILTER & TRANSFORMASI LOOKER STUDIO)
// =============================================================================
function setupPublicLedgerCleanTable(sheet) {
  const ledgerHeaders = [
    'Transaction_ID', 'Timestamp', 'Public_Display_Name', 'Faculty',
    'Department', 'Batch_Year', 'Nominal_Bersih', 'Payment_Channel', 'Verification_Tier'
  ];
  sheet.appendRow(ledgerHeaders);

  sheet.getRange(1, 1, 1, ledgerHeaders.length)
    .setFontWeight('bold')
    .setBackground('#047857') // Hijau Emerald Khas Transparansi
    .setFontColor(SEEDER_THEME.HEADER_TEXT)
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // Pasang Rumus Dinamis yang Menarik Seluruh Transaksi PAID dari raw_donations
  // Menggunakan fungsi FILTER() agar tidak menghasilkan baris kosong untuk PENDING
  sheet.getRange('A2').setFormula('=FILTER(raw_donations!A2:A, raw_donations!P2:P="PAID")');
  sheet.getRange('B2').setFormula('=FILTER(raw_donations!B2:B, raw_donations!P2:P="PAID")');
  
  // Transformasi Kolom Nama Publik Sesuai UU PDP No. 27/2022:
  // 1. Jika Privacy_Mode = "ANONYMOUS" -> Hamba Allah (Fakultas 'Angkatan)
  // 2. Jika UNCLAIMED_DIRECT_TRANSFER -> Sensor string rekening [CR DARI HE...] [Belum Diklaim]
  // 3. Selain itu -> Nama Asli
  sheet.getRange('C2').setFormula(
    '=FILTER(' +
      'IF(raw_donations!N2:N="ANONYMOUS", "Hamba Allah (" & raw_donations!F2:F & " \'" & RIGHT(raw_donations!H2:H, 2) & ")", ' +
      'IF(raw_donations!O2:O="UNCLAIMED_DIRECT_TRANSFER", "[" & LEFT(raw_donations!R2:R, 14) & "...] [Belum Diklaim]", ' +
      'raw_donations!E2:E)), ' +
      'raw_donations!P2:P="PAID"' +
    ')'
  );

  sheet.getRange('D2').setFormula('=FILTER(raw_donations!F2:F, raw_donations!P2:P="PAID")');
  sheet.getRange('E2').setFormula('=FILTER(raw_donations!G2:G, raw_donations!P2:P="PAID")');
  sheet.getRange('F2').setFormula('=FILTER(raw_donations!H2:H, raw_donations!P2:P="PAID")');
  sheet.getRange('G2').setFormula('=FILTER(raw_donations!L2:L, raw_donations!P2:P="PAID")');
  sheet.getRange('H2').setFormula('=FILTER(raw_donations!M2:M, raw_donations!P2:P="PAID")');
  sheet.getRange('I2').setFormula('=FILTER(raw_donations!O2:O, raw_donations!P2:P="PAID")');

  // Format Rupiah untuk Nominal Bersih
  sheet.getRange('G2:G100').setNumberFormat('"Rp"#,##0');

  for (let col = 1; col <= ledgerHeaders.length; col++) {
    sheet.autoResizeColumn(col);
  }
}

// =============================================================================
// TAB 4: SUMMARY_PER_FAKULTAS (RUMUS LEADERBOARD REKAPITULASI UPI)
// =============================================================================
function setupSummaryPerFakultasTable(sheet) {
  const summaryHeaders = [
    'Kode_Fakultas', 'Nama_Fakultas_Lengkap', 'Total_Donatur',
    'Total_Dana_Terkumpul', 'Persentase_Kontribusi', 'Rata_Rata_Donasi'
  ];
  sheet.appendRow(summaryHeaders);

  sheet.getRange(1, 1, 1, summaryHeaders.length)
    .setFontWeight('bold')
    .setBackground(SEEDER_THEME.UPI_RED)
    .setFontColor(SEEDER_THEME.HEADER_TEXT)
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // 9 Fakultas / Kategori UPI
  const fakultasList = [
    ['FPMIPA', 'Fakultas Pendidikan Matematika dan Ilmu Pengetahuan Alam'],
    ['FPIPS', 'Fakultas Pendidikan Ilmu Pengetahuan Sosial'],
    ['FIP', 'Fakultas Ilmu Pendidikan'],
    ['FPBS', 'Fakultas Pendidikan Bahasa dan Sastra'],
    ['FPTK', 'Fakultas Pendidikan Teknologi dan Kejuruan'],
    ['FPEB', 'Fakultas Pendidikan Ekonomi dan Bisnis'],
    ['FPOK', 'Fakultas Pendidikan Olahraga dan Kesehatan'],
    ['FPSD', 'Fakultas Pendidikan Seni dan Desain'],
    ['Belum Terdata', 'Donatur Spontan / Silent Donors Belum Terklaim']
  ];

  const facultyRowOffset = 2;
  const facultyRowCount = fakultasList.length;

  for (let idx = 0; idx < facultyRowCount; idx++) {
    const currentRow = facultyRowOffset + idx;
    const kodeFakultas = fakultasList[idx][0];
    const namaFakultas = fakultasList[idx][1];

    sheet.getRange(currentRow, 1).setValue(kodeFakultas).setFontWeight('bold');
    sheet.getRange(currentRow, 2).setValue(namaFakultas);

    // Rumus COUNTIFS: Jumlah Donatur Berstatus PAID per Fakultas
    sheet.getRange(currentRow, 3).setFormula(
      '=COUNTIFS(raw_donations!$F$2:$F$100, A' + currentRow + ', raw_donations!$P$2:$P$100, "PAID")'
    );

    // Rumus SUMIFS: Total Nominal Dana Terkumpul per Fakultas
    sheet.getRange(currentRow, 4).setFormula(
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$F$2:$F$100, A' + currentRow + ', raw_donations!$P$2:$P$100, "PAID")'
    );

    // Rumus Persentase: Total Fakultas Dibagi Total Baris Akumulasi (Baris 11)
    sheet.getRange(currentRow, 5).setFormula(
      '=IFERROR(D' + currentRow + ' / $D$11, 0)'
    );

    // Rumus Rata-Rata: Total Dana Dibagi Jumlah Donatur
    sheet.getRange(currentRow, 6).setFormula(
      '=IFERROR(D' + currentRow + ' / C' + currentRow + ', 0)'
    );
  }

  // Baris Akumulasi Total (Baris 11)
  const totalRow = facultyRowOffset + facultyRowCount;
  sheet.getRange(totalRow, 1).setValue('TOTAL_AKUMULASI').setFontWeight('bold');
  sheet.getRange(totalRow, 2).setValue('Seluruh Fakultas & Silent Donors').setFontWeight('bold');
  sheet.getRange(totalRow, 3).setFormula('=SUM(C2:C10)').setFontWeight('bold');
  sheet.getRange(totalRow, 4).setFormula('=SUM(D2:D10)').setFontWeight('bold');
  sheet.getRange(totalRow, 5).setFormula('=SUM(E2:E10)').setFontWeight('bold');
  sheet.getRange(totalRow, 6).setFormula('=IFERROR(D11 / C11, 0)').setFontWeight('bold');

  // Format Angka & Tampilan Baris Total
  sheet.getRange(totalRow, 1, 1, summaryHeaders.length)
    .setBackground('#FEF3C7')
    .setFontColor('#78350F');

  sheet.getRange('C2:C11').setNumberFormat('#,##0" Donatur"');
  sheet.getRange('D2:D11').setNumberFormat('"Rp"#,##0');
  sheet.getRange('E2:E11').setNumberFormat('0.0%');
  sheet.getRange('F2:F11').setNumberFormat('"Rp"#,##0');

  for (let col = 1; col <= summaryHeaders.length; col++) {
    sheet.autoResizeColumn(col);
  }
}

// =============================================================================
// TAB 5: RECONCILIATION_BENDAHARA (SEGREGATION OF DUTIES & KAS REKENING)
// =============================================================================
function setupReconciliationBendaharaTable(sheet) {
  // Title & Header Banner
  sheet.getRange('A1:E1').merge()
    .setValue('LEMBAGA BEASISWA IKATAN ALUMNI UPI - REKONSILIASI KAS & SEGREGATION OF DUTIES')
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground(SEEDER_THEME.DARK_NAVY)
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  const reconHeaders = [
    'Komponen Rekonsiliasi Kas', 'Kanal / Rekening Tujuan', 'Jumlah Transaksi',
    'Total Nominal Rupiah', 'Keterangan Pemisahan Wewenang (SOP)'
  ];
  sheet.getRange(3, 1, 1, reconHeaders.length).setValues([reconHeaders])
    .setFontWeight('bold')
    .setBackground('#334155')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(3);

  // Matriks Rekonsiliasi
  const reconRows = [
    // 1. Kas Riil Bank BSI
    [
      'Dana Rekening Bank BSI',
      'Bank Syariah Indonesia (7188-000-123)',
      '=COUNTIFS(raw_donations!$M$2:$M$100, "BSI_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$M$2:$M$100, "BSI_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      'Dipegang eksklusif oleh Bendahara. Mutasi kredit masuk dibaca via Cloud Email Parser.'
    ],
    // 2. Kas Riil Bank Jago
    [
      'Dana Rekening Bank Jago',
      'Bank Jago (5000-7062-9743)',
      '=COUNTIFS(raw_donations!$M$2:$M$100, "JAGO_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$M$2:$M$100, "JAGO_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      'Kantong khusus beasiswa. Otomatis terverifikasi via notifikasi mutasi masuk.'
    ],
    // 3. Subtotal Kas di Bank Bendahara
    [
      'SUBTOTAL DANA BANK BENDAHARA',
      'SETTLED_IN_BANK (BSI + Jago)',
      '=C4 + C5',
      '=D4 + D5',
      'Dana sah yang telah 100% cair dan berada dalam rekening resmi yayasan.'
    ],
    // 4. Kas Mengendap di Payment Gateway (QRIS)
    [
      'Dana Mengendap di Payment Gateway',
      'QRIS Dinamis (Midtrans / Xendit)',
      '=COUNTIFS(raw_donations!$M$2:$M$100, "QRIS", raw_donations!$P$2:$P$100, "PAID")',
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$M$2:$M$100, "QRIS", raw_donations!$P$2:$P$100, "PAID")',
      'Telah sukses dibayar donatur via QRIS, menunggu proses auto-pencairan H+1 ke rekening bendahara.'
    ],
    // 5. Total Akumulasi Kas Sah
    [
      'TOTAL AKUMULASI DANA SAH',
      'KAS RESMI (Bank + Gateway)',
      '=C6 + C7',
      '=D6 + D7',
      'Total dana donasi lunas yang siap diagendakan untuk penyaluran beasiswa UKT.'
    ],
    // 6. Dana Menggantung (Silent Donors / Belum Diklaim)
    [
      'Dana Masuk Belum Terklaim',
      'Silent Donors (Mutasi Tanpa Web)',
      '=COUNTIFS(raw_donations!$O$2:$O$100, "UNCLAIMED_DIRECT_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$O$2:$O$100, "UNCLAIMED_DIRECT_TRANSFER", raw_donations!$P$2:$P$100, "PAID")',
      'Uang fisik sudah masuk rekening bendahara, namun identitas donatur belum melengkapi data jurusan.'
    ],
    // 7. Transaksi Pending / Menunggu Pembayaran
    [
      'Tagihan Menunggu Pembayaran',
      'Invoice Aktif (Belum Lunas)',
      '=COUNTIFS(raw_donations!$P$2:$P$100, "PENDING")',
      '=SUMIFS(raw_donations!$L$2:$L$100, raw_donations!$P$2:$P$100, "PENDING")',
      'Donatur telah mengisi form, sedang menunggu scan QRIS atau transfer hingga kode unik.'
    ]
  ];

  for (let r = 0; r < reconRows.length; r++) {
    const rowNumber = 4 + r;
    sheet.getRange(rowNumber, 1).setValue(reconRows[r][0]);
    sheet.getRange(rowNumber, 2).setValue(reconRows[r][1]);
    sheet.getRange(rowNumber, 3).setFormula(reconRows[r][2]);
    sheet.getRange(rowNumber, 4).setFormula(reconRows[r][3]);
    sheet.getRange(rowNumber, 5).setValue(reconRows[r][4]);
  }

  // Styling Baris Spesifik
  // Baris 6: Subtotal Kas Bank (Biru Muda)
  sheet.getRange('A6:E6').setBackground('#E0F2FE').setFontWeight('bold').setFontColor('#0369A1');

  // Baris 8: Total Akumulasi Kas Sah (Hijau Emerald)
  sheet.getRange('A8:E8').setBackground('#D1FAE5').setFontWeight('bold').setFontColor('#065F46');

  // Baris 9: Unclaimed Deposits (Oranye Muda)
  sheet.getRange('A9:E9').setBackground('#FFEDD5').setFontColor('#9A3412');

  // Baris 10: Pending (Kuning Muda)
  sheet.getRange('A10:E10').setBackground('#FEF3C7').setFontColor('#92400E');

  // Formatting Angka
  sheet.getRange('C4:C10').setNumberFormat('#,##0" Transaksi"');
  sheet.getRange('D4:D10').setNumberFormat('"Rp"#,##0');

  for (let c = 1; c <= reconHeaders.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

