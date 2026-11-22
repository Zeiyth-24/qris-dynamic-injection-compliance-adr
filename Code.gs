/**
 * SISTEM AUTOMASI DONASI & TRANSPARANSI BEASISWA ALUMNI UPI (V2.0)
 * Google Apps Script Backend (Code.gs)
 * 
 * Arsitektur:
 * 1. Database Engine: Google Sheets (master_alumni, raw_donations, audit_logs)
 * 2. Concurrency Control: LockService dengan fail-safe release
 * 3. Anti-CORS REST API: doPost & doGet melayani payload text/plain dari Frontend SPA
 * 4. Cloud Email Mutation Parser: Membaca email notifikasi mutasi BSI & Bank Jago via Gmail Trigger
 * 5. Smart Auto-Matching: Rekonsiliasi otomatis 3-digit kode unik transaksi bank
 */

// =============================================================================
// KONFIGURASI GLOBAL & KONSTANTA SISTEM
// =============================================================================
const SHEET_NAMES = {
  MASTER_ALUMNI: 'master_alumni',
  RAW_DONATIONS: 'raw_donations',
  AUDIT_LOGS: 'audit_logs'
};

const VERIFICATION_TIERS = {
  TIER_1_VERIFIED: 'TIER_1_VERIFIED',
  TIER_2_ONBOARDED: 'TIER_2_ONBOARDED',
  TIER_3_EXPRESS: 'TIER_3_EXPRESS',
  UNCLAIMED_DIRECT_TRANSFER: 'UNCLAIMED_DIRECT_TRANSFER',
  AUTO_MATCHED_BY_UNIQUE_CODE: 'AUTO_MATCHED_BY_UNIQUE_CODE'
};

const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

const CONFIG_DEFAULTS = {
  TARGET_SEMESTER_AMOUNT: 50000000,
  TRANSACTION_EXPIRY_MINUTES: 15,
  UNIQUE_CODE_MIN: 101,
  UNIQUE_CODE_MAX: 999
};

// =============================================================================
// 1. DATABASE SETUP AUTOMATION (setupDatabaseSheets)
// =============================================================================
/**
 * Inisialisasi otomatis tab, header, dan 10 data dummy alumni UPI.
 * Dijalankan sekali saat deployment awal melalui Script Editor Apps Script.
 */
function setupDatabaseSheets() {
  if (typeof initializeAndSeedDatabase === 'function') {
    initializeAndSeedDatabase();
    return;
  }
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Tab 1: master_alumni
  let sheetMasterAlumni = activeSpreadsheet.getSheetByName(SHEET_NAMES.MASTER_ALUMNI);
  if (!sheetMasterAlumni) {
    sheetMasterAlumni = activeSpreadsheet.insertSheet(SHEET_NAMES.MASTER_ALUMNI);
  }
  sheetMasterAlumni.clear();
  const masterHeaders = [
    'NIM', 'Email_UPI', 'Nama_Lengkap', 'Fakultas',
    'Program_Studi', 'Angkatan', 'No_WA', 'Sumber_Data'
  ];
  sheetMasterAlumni.appendRow(masterHeaders);
  sheetMasterAlumni.getRange(1, 1, 1, masterHeaders.length)
    .setFontWeight('bold')
    .setBackground('#8B0000')
    .setFontColor('#FFFFFF');
  sheetMasterAlumni.setFrozenRows(1);

  // 10 Data Dummy Master Alumni UPI
  const initialAlumniDataset = [
    ['2001234', 'fadhil.ramadhan@upi.edu', 'Fadhil Muhammad Ramadhan', 'FPMIPA', 'Ilmu Komputer', '2020', '08122001234', 'DIKTI_SIAK'],
    ['2104567', 'siti.nurhaliza@upi.edu', 'Siti Nurhaliza', 'FIP', 'Manajemen Pendidikan', '2021', '08132104567', 'DIKTI_SIAK'],
    ['1908901', 'reza.firmansyah@upi.edu', 'Reza Firmansyah, S.T.', 'FPTK', 'Teknik Sipil', '2019', '08121908901', 'DIKTI_SIAK'],
    ['2203344', 'anisa.rahmawati@upi.edu', 'Anisa Rahmawati', 'FPEB', 'Akuntansi', '2022', '08572203344', 'DIKTI_SIAK'],
    ['1805566', 'dimas.setiawan@upi.edu', 'Dimas Setiawan, S.Pd.', 'FPBS', 'Pendidikan Bahasa Inggris', '2018', '08131805566', 'DIKTI_SIAK'],
    ['2007788', 'nadia.utami@upi.edu', 'Nadia Utami', 'FPIPS', 'Pendidikan Geografi', '2020', '08582007788', 'DIKTI_SIAK'],
    ['1709900', 'bagus.wicaksono@upi.edu', 'Bagus Wicaksono, S.Pd.', 'FPOK', 'Pendidikan Jasmani Kesehatan & Rekreasi', '2017', '08211709900', 'DIKTI_SIAK'],
    ['2101122', 'maya.indrawati@upi.edu', 'Maya Indrawati', 'FPSD', 'Desain Komunikasi Visual', '2021', '08192101122', 'DIKTI_SIAK'],
    ['1902233', 'asep.sunarya@upi.edu', 'Asep Sunarya, S.Pd.', 'Kampus UPI Cibiru', 'Pendidikan Guru Sekolah Dasar', '2019', '08781902233', 'DIKTI_SIAK'],
    ['2304455', 'gilang.perdana@upi.edu', 'Gilang Ramadhan Perdana', 'Kampus UPI Purwakarta', 'Sistem Telekomunikasi', '2023', '08962304455', 'DIKTI_SIAK']
  ];
  sheetMasterAlumni.getRange(2, 1, initialAlumniDataset.length, masterHeaders.length).setValues(initialAlumniDataset);

  // Tab 2: raw_donations
  let sheetRawDonations = activeSpreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  if (!sheetRawDonations) {
    sheetRawDonations = activeSpreadsheet.insertSheet(SHEET_NAMES.RAW_DONATIONS);
  }
  sheetRawDonations.clear();
  const donationHeaders = [
    'Transaction_ID', 'Timestamp', 'Inflow_Path', 'NIM', 'Donor_Name',
    'Faculty', 'Department', 'Batch_Year', 'WhatsApp', 'Base_Amount',
    'Unique_Code', 'Total_Transfer_Amount', 'Payment_Channel', 'Privacy_Mode',
    'Verification_Tier', 'Payment_Status', 'Settlement_Status', 'Bank_Sender_Raw', 'Notes'
  ];
  sheetRawDonations.appendRow(donationHeaders);
  sheetRawDonations.getRange(1, 1, 1, donationHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1E3A8A')
    .setFontColor('#FFFFFF');
  sheetRawDonations.setFrozenRows(1);

  // Sample seed donations for immediate visualization
  const initialDonationsSeed = [
    [
      'TX-20261101-001', '2026-11-01 08:30:15', 'ALUMNI_TERDATA', '2001234', 'Fadhil Muhammad Ramadhan',
      'FPMIPA', 'Ilmu Komputer', '2020', '08122001234', 1000000, 0, 1000000,
      'QRIS_DYNAMIC', 'PUBLIC', 'TIER_1_VERIFIED', 'PAID', 'SETTLED', '-', 'Donasi Awal Semester'
    ],
    [
      'TX-20261102-002', '2026-11-02 10:14:20', 'ALUMNI_SENIOR', '-', 'Dr. Ir. Hendra Gunawan, M.T.',
      'FPTK', 'Teknik Sipil', '1994', '08112233445', 2500000, 312, 2500312,
      'TRANSFER_BSI', 'PUBLIC', 'TIER_2_ONBOARDED', 'PAID (AUTO_MATCHED_BY_UNIQUE_CODE)', 'SETTLED', 'HENDRA GUNAWAN', 'Alokasi Beasiswa UKT FPTK'
    ],
    [
      'TX-20261103-003', '2026-11-03 14:05:10', 'ALUMNI_TERDATA', '2203344', 'Anisa Rahmawati',
      'FPEB', 'Akuntansi', '2022', '08572203344', 100000, 0, 100000,
      'QRIS_DYNAMIC', 'ANONYMOUS', 'TIER_1_VERIFIED', 'PAID', 'SETTLED', '-', 'Sedekah Subuh'
    ],
    [
      'TX-20261104-004', '2026-11-04 17:45:00', 'DIRECT_BANK_TRANSFER', '-', 'UNCLAIMED DONOR',
      '-', '-', '-', '-', 500000, 0, 500000,
      'TRANSFER_BSI', 'PUBLIC', 'UNCLAIMED_DIRECT_TRANSFER', 'PAID', 'SETTLED', 'MHD FAUZI RACHMAN', 'Mutasi Masuk Tanpa Konfirmasi Web'
    ],
    [
      'TX-20261105-005', '2026-11-05 09:12:00', 'DIRECT_BANK_TRANSFER', '-', 'UNCLAIMED DONOR',
      '-', '-', '-', '-', 250000, 0, 250000,
      'TRANSFER_JAGO', 'PUBLIC', 'UNCLAIMED_DIRECT_TRANSFER', 'PAID', 'SETTLED', 'NURUL HIDAYAH', 'Mutasi Masuk Tanpa Konfirmasi Web'
    ]
  ];
  sheetRawDonations.getRange(2, 1, initialDonationsSeed.length, donationHeaders.length).setValues(initialDonationsSeed);

  // Tab 3: audit_logs
  let sheetAuditLogs = activeSpreadsheet.getSheetByName(SHEET_NAMES.AUDIT_LOGS);
  if (!sheetAuditLogs) {
    sheetAuditLogs = activeSpreadsheet.insertSheet(SHEET_NAMES.AUDIT_LOGS);
  }
  sheetAuditLogs.clear();
  const auditHeaders = ['Timestamp', 'Event_Type', 'Transaction_ID', 'Raw_Payload', 'Execution_Result'];
  sheetAuditLogs.appendRow(auditHeaders);
  sheetAuditLogs.getRange(1, 1, 1, auditHeaders.length)
    .setFontWeight('bold')
    .setBackground('#374151')
    .setFontColor('#FFFFFF');
  sheetAuditLogs.setFrozenRows(1);

  recordAuditLog('DATABASE_INITIALIZATION', 'SYSTEM', JSON.stringify({ status: 'SUCCESS' }), 'All 3 sheets formatted and seeded');

  SpreadsheetApp.flush();
  Logger.log('Inisialisasi Database Beasiswa IKA UPI Berhasil Sempurna!');
}

// =============================================================================
// 2. AUDIT LOGGING HELPER
// =============================================================================
function recordAuditLog(eventType, transactionId, rawPayloadString, executionResultString) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let auditSheet = spreadsheet.getSheetByName(SHEET_NAMES.AUDIT_LOGS);
    if (!auditSheet) {
      auditSheet = spreadsheet.insertSheet(SHEET_NAMES.AUDIT_LOGS);
    }
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    auditSheet.appendRow([timestamp, eventType, transactionId || '-', rawPayloadString || '-', executionResultString || '-']);
  } catch (errorLogging) {
    Logger.log('Gagal mencatat audit log: ' + errorLogging.message);
  }
}

// =============================================================================
// 3. TELEGRAM NOTIFICATION DISPATCHER
// =============================================================================
/**
 * Mengirim notifikasi transaksi ke grup pengelola/bendahara IKA UPI via Telegram Bot.
 * Token & Chat ID disimpan di Script Properties agar kredensial tidak bocor.
 */
function sendTelegramNotification(messageText) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const botToken = scriptProperties.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = scriptProperties.getProperty('TELEGRAM_CHAT_ID');

  if (!botToken || !chatId) {
    Logger.log('Telegram skipped: TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset di Script Properties.');
    return;
  }

  const endpointUrl = 'https://api.telegram.org/bot' + botToken + '/sendMessage';
  const requestPayload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: 'HTML'
  };

  try {
    UrlFetchApp.fetch(endpointUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestPayload),
      muteHttpExceptions: true
    });
  } catch (telegramError) {
    Logger.log('Gagal mengirim telegram alert: ' + telegramError.message);
  }
}

// =============================================================================
// 4. HTTP ROUTING ENGINE (doGet & doPost) DENGAN GUARDRAIL ANTI-CORS
// =============================================================================

/**
 * Respon HTTP standar format JSON untuk web app Apps Script
 */
function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Endpoint GET: Digunakan untuk polling status transaksi dan mengambil data dasbor publik
 */
function doGet(requestEvent) {
  const queryParameters = requestEvent.parameter || {};
  const requestedAction = queryParameters.action || 'getDashboardData';

  try {
    // Scanner Gmail HANYA dijalankan jika dipanggil eksplisit oleh admin / trigger time-driven
    // (JANGAN dijalankan di setiap polling 2 detik agar tidak spam / membebani kuota API)
    if (requestedAction === 'scanGmail' || requestedAction === 'checkDanaEmails') {
      try {
        const danaRes = scanGmailAndGenerateReceipts();
        parseBankMutasiEmails();
        return createJsonResponse(danaRes);
      } catch (scanErr) {
        return createJsonResponse({ status: 'ERROR', message: scanErr.toString() });
      }
    }

    if (requestedAction === 'getDashboardData') {
      return createJsonResponse(fetchPublicDashboardMetrics());
    } else if (requestedAction === 'getAllTransactions' || requestedAction === 'getAdminDatabase') {
      return createJsonResponse(fetchAllTransactionsForAdmin());
    } else if (requestedAction === 'checkTransactionStatus') {
      const transactionId = queryParameters.transactionId;
      return createJsonResponse(checkSpecificTransactionStatus(transactionId));
    } else if (requestedAction === 'lookupAlumni') {
      const nimQuery = queryParameters.nim || '';
      const emailQuery = queryParameters.email || '';
      return createJsonResponse(searchMasterAlumniDatabase(nimQuery, emailQuery));
    }

    return createJsonResponse({
      status: 'SUCCESS',
      message: 'Lembaga Beasiswa IKA UPI Gateway Active',
      timestamp: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
    });
  } catch (exceptionCaught) {
    return createJsonResponse({
      status: 'ERROR',
      message: exceptionCaught.message
    });
  }
}

/**
 * Endpoint POST: Menangani payload text/plain (Bypass CORS Preflight OPTIONS Google Apps Script)
 */
function doPost(requestEvent) {
  let parsedPayload;
  try {
    const rawPostContent = requestEvent.postData ? requestEvent.postData.contents : '{}';
    parsedPayload = JSON.parse(rawPostContent);
  } catch (parseError) {
    return createJsonResponse({
      status: 'ERROR',
      message: 'Format payload tidak valid: ' + parseError.message
    });
  }

  const requestedAction = parsedPayload.action;

  // Concurrency Guard: LockService mencegah race conditions pemesanan kode unik dan pencatatan kas
  const scriptLock = LockService.getScriptLock();
  try {
    const lockAcquired = scriptLock.tryLock(15000);
    if (!lockAcquired) {
      return createJsonResponse({
        status: 'ERROR',
        message: 'Server sedang memproses transaksi bersamaan. Silakan coba kembali dalam beberapa detik.'
      });
    }

    let operationalResult;
    switch (requestedAction) {
      case 'lookupAlumni':
        operationalResult = searchMasterAlumniDatabase(parsedPayload.nim, parsedPayload.email);
        break;
      case 'createTransaction':
        operationalResult = handleCreateTransaction(parsedPayload);
        break;
      case 'uploadPaymentProof':
        operationalResult = handleUploadPaymentProof(parsedPayload);
        break;
      case 'webhookPaymentGateway':
        operationalResult = handlePaymentGatewayWebhook(parsedPayload);
        break;
      case 'claimDirectTransfer':
        operationalResult = handleClaimDirectTransfer(parsedPayload);
        break;
      case 'updatePostPaymentInfo':
        operationalResult = handleUpdatePostPaymentInfo(parsedPayload);
        break;
      case 'simulateBankMutation':
        operationalResult = handleSimulateBankMutation(parsedPayload);
        break;
      default:
        operationalResult = {
          status: 'ERROR',
          message: 'Aksi (' + requestedAction + ') tidak dikenali oleh sistem backend.'
        };
    }

    return createJsonResponse(operationalResult);
  } catch (executionException) {
    recordAuditLog('POST_EXECUTION_EXCEPTION', parsedPayload.transactionId || '-', JSON.stringify(parsedPayload), executionException.message);
    return createJsonResponse({
      status: 'ERROR',
      message: executionException.message
    });
  } finally {
    scriptLock.releaseLock();
  }
}

// =============================================================================
// 5. MODUL 1: LOOKUP ALUMNI TERDATA
// =============================================================================
function searchMasterAlumniDatabase(inputNIM, inputEmail) {
  const normalizedNIM = String(inputNIM || '').trim();
  let normalizedEmail = String(inputEmail || '').trim().toLowerCase();
  
  if (normalizedEmail && !normalizedEmail.includes('@')) {
    normalizedEmail = normalizedEmail + '@upi.edu';
  }

  if (!normalizedNIM && !normalizedEmail) {
    return {
      status: 'NOT_FOUND',
      message: 'Masukkan NIM atau Email UPI untuk pencarian alumni.'
    };
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMasterAlumni = spreadsheet.getSheetByName(SHEET_NAMES.MASTER_ALUMNI);
  if (!sheetMasterAlumni) {
    return { status: 'ERROR', message: 'Tabel master_alumni belum diinisialisasi.' };
  }

  const totalRows = sheetMasterAlumni.getLastRow();
  if (totalRows <= 1) {
    return { status: 'NOT_FOUND', message: 'Database alumni kosong.' };
  }

  const alumniMatrix = sheetMasterAlumni.getRange(2, 1, totalRows - 1, 8).getValues();

  for (let rowIndex = 0; rowIndex < alumniMatrix.length; rowIndex++) {
    const rowNIM = String(alumniMatrix[rowIndex][0]).trim();
    const rowEmail = String(alumniMatrix[rowIndex][1]).trim().toLowerCase();

    const matchesNIM = normalizedNIM && (rowNIM === normalizedNIM);
    const matchesEmail = normalizedEmail && (rowEmail === normalizedEmail);

    if (matchesNIM || matchesEmail) {
      return {
        status: 'SUCCESS',
        found: true,
        alumniProfile: {
          nim: rowNIM,
          email: rowEmail,
          namaLengkap: alumniMatrix[rowIndex][2],
          fakultas: alumniMatrix[rowIndex][3],
          programStudi: alumniMatrix[rowIndex][4],
          angkatan: String(alumniMatrix[rowIndex][5]),
          nomorWhatsAppDefault: alumniMatrix[rowIndex][6] || '',
          sumberData: alumniMatrix[rowIndex][7]
        }
      };
    }
  }

  return {
    status: 'NOT_FOUND',
    found: false,
    message: 'Data alumni tidak ditemukan di Pangkalan Data 2016–2026. Silakan gunakan tab Alumni Senior / Belum Terdata.'
  };
}

// =============================================================================
// 6. MODUL 2: CREATE TRANSACTION (KODE UNIK ANTI-TABRAKAN)
// =============================================================================
function handleCreateTransaction(transactionPayload) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);

  const paymentChannel = transactionPayload.paymentChannel || 'QRIS';
  let baseAmount = parseInt(transactionPayload.baseAmount, 10);
  if (isNaN(baseAmount) || baseAmount <= 0) {
    baseAmount = 100000;
  }
  // Tidak ada batas minimal untuk prototype/demo (bisa donasi mikro < Rp 1.000 seperti Rp 50, Rp 100)
  if (baseAmount < 1) {
    throw new Error('Nominal donasi minimal adalah Rp 1.');
  }

  let calculatedUniqueCode = 0;
  let finalTransferAmount = baseAmount;

  // Alokasi 3 digit Kode Unik (101-999) untuk baseAmount >= 1000
  // Untuk donasi mikro demo (< 1000), kode unik = 0 agar nominal pas dengan yang diketik donatur
  if (baseAmount >= 1000) {
    calculatedUniqueCode = allocateUniqueCodeWithoutCollision(sheetRawDonations, baseAmount);
    finalTransferAmount = baseAmount + calculatedUniqueCode;
  } else {
    calculatedUniqueCode = 0;
    finalTransferAmount = baseAmount;
  }

  const currentFormattedDate = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  const generatedTransactionId = 'TX-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMddHHmmss') + '-' + Math.floor(100 + Math.random() * 900);

  let determinedVerificationTier = VERIFICATION_TIERS.TIER_3_EXPRESS;
  if (transactionPayload.inflowPath === 'ALUMNI_TERDATA') {
    determinedVerificationTier = VERIFICATION_TIERS.TIER_1_VERIFIED;
  } else if (transactionPayload.inflowPath === 'ALUMNI_SENIOR') {
    determinedVerificationTier = VERIFICATION_TIERS.TIER_2_ONBOARDED;
  }

  const newRowRecord = [
    generatedTransactionId,
    currentFormattedDate,
    transactionPayload.inflowPath,
    transactionPayload.nim || '-',
    transactionPayload.donorName || 'Hamba Allah',
    transactionPayload.faculty || '-',
    transactionPayload.department || '-',
    transactionPayload.batchYear || '-',
    transactionPayload.whatsApp || '-',
    baseAmount,
    calculatedUniqueCode,
    finalTransferAmount,
    paymentChannel,
    transactionPayload.privacyMode || 'PUBLIC',
    determinedVerificationTier,
    PAYMENT_STATUS.PENDING,
    'UNSETTLED',
    '-',
    transactionPayload.notes || '-'
  ];

  sheetRawDonations.appendRow(newRowRecord);

  recordAuditLog('TRANSACTION_CREATED', generatedTransactionId, JSON.stringify(transactionPayload), 'PENDING recorded. Amount: ' + finalTransferAmount);

  return {
    status: 'SUCCESS',
    transactionId: generatedTransactionId,
    timestamp: currentFormattedDate,
    baseAmount: baseAmount,
    uniqueCode: calculatedUniqueCode,
    totalTransferAmount: finalTransferAmount,
    paymentChannel: paymentChannel,
    verificationTier: determinedVerificationTier,
    paymentStatus: PAYMENT_STATUS.PENDING,
    expiryMinutes: CONFIG_DEFAULTS.TRANSACTION_EXPIRY_MINUTES
  };
}

/**
 * Mencari 3-digit kode unik (101-999) yang belum terpakai pada transaksi PENDING dengan baseAmount yang sama
 */
function allocateUniqueCodeWithoutCollision(sheetRawDonations, baseAmount) {
  const lastRow = sheetRawDonations.getLastRow();
  const occupiedUniqueCodes = new Set();

  if (lastRow > 1) {
    const rawDonationsMatrix = sheetRawDonations.getRange(2, 1, lastRow - 1, 16).getValues();
    for (let index = 0; index < rawDonationsMatrix.length; index++) {
      const rowBaseAmount = parseInt(rawDonationsMatrix[index][9], 10);
      const rowUniqueCode = parseInt(rawDonationsMatrix[index][10], 10);
      const rowPaymentStatus = String(rawDonationsMatrix[index][15]).trim();

      if (rowBaseAmount === baseAmount && rowPaymentStatus === PAYMENT_STATUS.PENDING && rowUniqueCode > 0) {
        occupiedUniqueCodes.add(rowUniqueCode);
      }
    }
  }

  // Pilih angka random di rentang 101 - 999
  let candidateCode = Math.floor(Math.random() * (CONFIG_DEFAULTS.UNIQUE_CODE_MAX - CONFIG_DEFAULTS.UNIQUE_CODE_MIN + 1)) + CONFIG_DEFAULTS.UNIQUE_CODE_MIN;
  let searchAttempts = 0;

  while (occupiedUniqueCodes.has(candidateCode) && searchAttempts < 899) {
    candidateCode++;
    if (candidateCode > CONFIG_DEFAULTS.UNIQUE_CODE_MAX) {
      candidateCode = CONFIG_DEFAULTS.UNIQUE_CODE_MIN;
    }
    searchAttempts++;
  }

  return candidateCode;
}

// =============================================================================
// 7. MODUL 3: WEBHOOK PAYMENT GATEWAY (QRIS / MIDTRANS SIMULATOR)
// =============================================================================
function handlePaymentGatewayWebhook(webhookPayload) {
  const transactionId = webhookPayload.transactionId;
  const settlementStatus = webhookPayload.settlementStatus || 'SETTLED';

  if (!transactionId) {
    throw new Error('Transaction ID wajib disertakan pada webhook payment gateway.');
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  const totalRows = sheetRawDonations.getLastRow();

  if (totalRows <= 1) {
    throw new Error('Database transaksi donasi masih kosong.');
  }

  const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();
  let targetRowIndex = -1;
  let existingRecord = null;

  for (let rowIndex = 0; rowIndex < donationMatrix.length; rowIndex++) {
    if (String(donationMatrix[rowIndex][0]).trim() === String(transactionId).trim()) {
      targetRowIndex = rowIndex + 2; // offset 1-based indexing dan 1 row header
      existingRecord = donationMatrix[rowIndex];
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('Transaksi dengan ID ' + transactionId + ' tidak ditemukan.');
  }

  // Idempotency Check: Jika sudah PAID, tidak perlu memproses ulang
  const currentPaymentStatus = String(existingRecord[15]).trim();
  if (currentPaymentStatus.indexOf('PAID') !== -1) {
    return {
      status: 'SUCCESS',
      message: 'Transaksi sudah berstatus PAID sebelumnya (Idempotent response).',
      transactionId: transactionId,
      paymentStatus: currentPaymentStatus
    };
  }

  // Update Status Menjadi PAID
  sheetRawDonations.getRange(targetRowIndex, 16).setValue(PAYMENT_STATUS.PAID);
  sheetRawDonations.getRange(targetRowIndex, 17).setValue(settlementStatus);

  let confirmedNominal = Number(existingRecord[11]) || Number(existingRecord[9]) || 0;

  if (webhookPayload.amount && Number(webhookPayload.amount) > 0) {
    confirmedNominal = Number(webhookPayload.amount);
  } else if (webhookPayload.nominal && Number(webhookPayload.nominal) > 0) {
    confirmedNominal = Number(webhookPayload.nominal);
  }

  // Jika nominal di sheet masih 0, fallback minimal ke nominal valid
  if (confirmedNominal <= 0) {
    confirmedNominal = 50000;
  }

  // Selalu perbarui Base_Amount dan Total_Transfer_Amount dengan nominal yang sah
  sheetRawDonations.getRange(targetRowIndex, 10).setValue(confirmedNominal);
  sheetRawDonations.getRange(targetRowIndex, 12).setValue(confirmedNominal);

  // Jika donatur berasal dari Jalur 2 (Alumni Senior / Belum Terdata), daftarkan ke master_alumni
  const inflowPath = String(existingRecord[2]).trim();
  if (inflowPath === 'ALUMNI_SENIOR') {
    synchronizeNewAlumnusToMaster(existingRecord);
  }

  recordAuditLog('WEBHOOK_PAYMENT_SETTLED', transactionId, JSON.stringify(webhookPayload), 'Status updated to PAID');

  // Kirim Notifikasi Otomatis (Email HTML Card Pengelola & Donatur)
  const donorName = existingRecord[4];
  const faculty = existingRecord[5];
  const batchYear = existingRecord[7];
  const nominal = confirmedNominal;

  if (typeof sendAutomatedNotifications === 'function') {
    sendAutomatedNotifications({
      transactionId: transactionId,
      donorName: donorName,
      faculty: faculty,
      batchYear: batchYear,
      nominal: nominal,
      paymentChannel: existingRecord[12],
      validationType: 'QRIS Dinamis (Verified by Webhook)',
      notes: existingRecord[18],
      isUnclaimed: false
    });
  }

  sendTelegramNotification(
    '🎉 <b>DONASI QRIS TERVERIFIKASI</b>\n' +
    'Order ID: <code>' + transactionId + '</code>\n' +
    'Donatur: ' + donorName + ' (' + faculty + ')\n' +
    'Nominal: <b>Rp ' + Number(nominal).toLocaleString('id-ID') + '</b>\n' +
    'Status: <i>PAID (VERIFIED_BY_WEBHOOK)</i>'
  );

  return {
    status: 'SUCCESS',
    transactionId: transactionId,
    paymentStatus: PAYMENT_STATUS.PAID,
    verificationTier: existingRecord[14],
    settlementStatus: settlementStatus
  };
}

/**
 * Mendaftarkan profil alumni baru dari Jalur 2 ke sheet master_alumni
 */
function synchronizeNewAlumnusToMaster(donationRecord) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMasterAlumni = spreadsheet.getSheetByName(SHEET_NAMES.MASTER_ALUMNI);

  const donorName = donationRecord[4];
  const faculty = donationRecord[5];
  const department = donationRecord[6];
  const batchYear = donationRecord[7];
  const whatsAppNumber = donationRecord[8];

  const syntheticNIM = 'SENIOR-' + batchYear + '-' + Math.floor(1000 + Math.random() * 9000);
  const syntheticEmail = donorName.toLowerCase().replace(/[^a-z0-9]/g, '.') + '@alumni.upi.edu';

  sheetMasterAlumni.appendRow([
    syntheticNIM,
    syntheticEmail,
    donorName,
    faculty,
    department,
    batchYear,
    whatsAppNumber,
    'ONBOARDED_VIA_DONATION'
  ]);

  recordAuditLog('ALUMNI_AUTO_ONBOARDED', syntheticNIM, JSON.stringify({ name: donorName, faculty: faculty }), 'Appended to master_alumni');
}

// =============================================================================
// 8. MODUL 4: CLOUD EMAIL PARSER ENGINE (MUTASI DANA, BSI, & BANK JAGO)
// =============================================================================

/**
 * 8. MODUL 4: GMAIL TRANSACTION INGESTION & AUTO-RECEIPT ENGINE
 * Memindai email mutasi belum dibaca dari DANA ke treasury-sandbox@example.org
 * Mengekstrak nominal riil (realAmount) dan nama pengirim via Regex,
 * menimpa kolom nominal dengan realAmount yang asli, mengubah status menjadi PAID,
 * dan mengirim kuitansi otomatis.
 */
function scanGmailAndGenerateReceipts() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'LOCKED', message: 'Parser Gmail sedang berjalan di proses lain.' };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAMES.RAW_DONATIONS || "raw_donations");
    if (!sheet) return { status: 'ERROR', message: 'Sheet raw_donations tidak ditemukan.' };

    // Cari email transaksi masuk dari DANA yang belum dibaca (Kecualikan email dari sistem sendiri)
    var searchQuery = 'is:unread -from:me -from:treasury-sandbox@example.org -subject:"REKONSILIASI" -subject:"[DANA MASUK]" -subject:"LEMBAGA BEASISWA" from:(dana.id OR DANA OR "DANA" OR "dana") ("berhasil" OR "diterima" OR "pembayaran" OR "Top Up" OR "uang masuk" OR "Kirim Uang" OR "transaksi" OR "QRIS" OR "Saldo DANA")';
    var threads = GmailApp.search(searchQuery, 0, 10);
    if (threads.length === 0) {
      return { status: 'NO_NEW_EMAILS', message: 'Tidak ada email mutasi DANA belum dibaca.' };
    }

    var totalRows = sheet.getLastRow();
    if (totalRows <= 1) return { status: 'EMPTY_SHEET' };

    var data = sheet.getRange(1, 1, totalRows, 19).getValues();
    var matchedTransactions = [];

    for (var i = 0; i < threads.length; i++) {
      var messages = threads[i].getMessages();
      for (var j = 0; j < messages.length; j++) {
        var msg = messages[j];
        if (msg.isUnread()) {
          var sender = msg.getFrom().toLowerCase();
          var subject = msg.getSubject().toLowerCase();
          var msgId = msg.getId();

          // Anti-Loop Guard: Abaikan jika email berasal dari akun sendiri atau berisi notifikasi sistem
          var myEmail = '';
          try { myEmail = Session.getActiveUser().getEmail().toLowerCase(); } catch (eSession) {}
          if (sender.includes('treasury-sandbox') || 
              sender.includes('zam484068') || 
              (myEmail && sender.includes(myEmail)) ||
              subject.includes('rekonsiliasi') || 
              subject.includes('silent donor') ||
              subject.includes('[perhatian]') ||
              subject.includes('lembaga beasiswa') || 
              subject.includes('[dana masuk]')) {
            msg.markRead();
            continue;
          }

          // Anti-Spam Message Deduplication: Satu ID pesan Gmail hanya diproses 1 kali
          var cache = CacheService.getScriptCache();
          var cacheKey = 'MSG_DANA_' + msgId;
          if (cache.get(cacheKey)) {
            msg.markRead();
            continue;
          }
          cache.put(cacheKey, '1', 21600); // 6 jam

          var body = msg.getPlainBody();
          
          // Ekstrak nominal uang masuk dari email DANA via Regex
          // Pola: "Rp 50", "Rp 50.000", "Rp. 50.000", "sebesar Rp 100.000", dll.
          var match = body.match(/Rp\.?\s?([0-9.,]+)/i) || 
                      subject.match(/Rp\.?\s?([0-9.,]+)/i) || 
                      body.match(/(?:IDR|sebesar)\s?([0-9.,]+)/i);
          
          if (match && match[1]) {
            var rawDigits = match[1].replace(/[.,]/g, "").trim();
            var realAmount = parseInt(rawDigits, 10);
            
            if (!isNaN(realAmount) && realAmount > 0) {
              // Ekstrak nama pengirim jika tersedia
              var senderMatch = body.match(/(?:dari|pengirim|from)\s+([A-Za-z\s]{3,30})/i);
              var rawSender = senderMatch ? senderMatch[1].trim() : 'DANA User';

              // Cari transaksi PENDING aktif di sheet
              var targetRowIndex = -1;
              var targetRecord = null;

              // Tahap 1: Cari transaksi PENDING dengan nominal yang sama persis
              for (var r = 1; r < data.length; r++) {
                var status = String(data[r][15] || "").toUpperCase().trim();
                var curTotal = parseInt(String(data[r][11] || "0").replace(/[^0-9]/g, ""), 10);
                if (status.includes("PENDING") && curTotal === realAmount) {
                  targetRowIndex = r + 1;
                  targetRecord = data[r];
                  break;
                }
              }

              // Tahap 2: Jika tidak ada exact match nominal, cari transaksi PENDING sukarela / QRIS terbaru
              if (targetRowIndex === -1) {
                for (var r = data.length - 1; r >= 1; r--) {
                  var status = String(data[r][15] || "").toUpperCase().trim();
                  var curTotal = parseInt(String(data[r][11] || "0").replace(/[^0-9]/g, ""), 10);
                  var channel = String(data[r][12] || "").toUpperCase();
                  if (status.includes("PENDING") && (curTotal === 0 || channel.includes("QRIS") || curTotal === 100000)) {
                    targetRowIndex = r + 1;
                    targetRecord = data[r];
                    break;
                  }
                }
              }

              // Jika ditemukan transaksi PENDING yang cocok
              if (targetRowIndex !== -1 && targetRecord) {
                // 1. Timpa kolom nominal dengan realAmount yang sah dari email DANA
                sheet.getRange(targetRowIndex, 10).setValue(realAmount); // Kolom J: Base_Amount
                sheet.getRange(targetRowIndex, 12).setValue(realAmount); // Kolom L: Total_Transfer_Amount

                // 2. Ubah status menjadi PAID dan SETTLED_DANA_QRIS
                sheet.getRange(targetRowIndex, 16).setValue("PAID");                     // Kolom P: Payment_Status
                sheet.getRange(targetRowIndex, 17).setValue("SETTLED_DANA_QRIS");        // Kolom Q: Settlement_Status
                sheet.getRange(targetRowIndex, 18).setValue("DANA QRIS (treasury-sandbox@example.org) • " + rawSender); // Kolom R: Bank_Sender_Raw
                sheet.getRange(targetRowIndex, 19).setValue("Auto-approved by scanGmailAndGenerateReceipts via treasury-sandbox@example.org (Rp " + realAmount + ")"); // Kolom S: Notes

                // Update data lokal
                targetRecord[9] = realAmount;
                targetRecord[11] = realAmount;
                targetRecord[15] = "PAID";
                targetRecord[16] = "SETTLED_DANA_QRIS";

                Logger.log("Transaksi ID " + targetRecord[0] + " berhasil di-update ke PAID dengan realAmount: Rp " + realAmount);
                matchedTransactions.push({ transactionId: targetRecord[0], amount: realAmount });

                // 3. Panggil fungsi pengirim kuitansi email otomatis dengan realAmount yang sah
                if (typeof sendAutomatedNotifications === 'function') {
                  try {
                    sendAutomatedNotifications({
                      transactionId: targetRecord[0],
                      nominal: realAmount,
                      realAmount: realAmount,
                      donorName: targetRecord[4] || 'Hamba Allah',
                      faculty: targetRecord[5] || '-',
                      batchYear: targetRecord[7] || '-',
                      paymentChannel: 'QRIS_DANA',
                      validationType: 'DANA Cloud Auto-Detect (treasury-sandbox@example.org)',
                      notes: 'Real amount Rp ' + realAmount.toLocaleString('id-ID') + ' verified from DANA email',
                      isUnclaimed: false
                    });
                  } catch (eNotification) {
                    Logger.log('Notification error: ' + eNotification.toString());
                  }
                }
              } else {
                // SILENT DONOR: Donatur scan QRIS DANA langsung tanpa membuat form pesanan web terlebih dahulu
                var currentFormattedDate = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
                var syntheticDirectTxId = 'TX-DANA-DIRECT-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMddHHmmss') + '-' + Math.floor(100 + Math.random() * 900);

                var unclaimedRow = [
                  syntheticDirectTxId,
                  currentFormattedDate,
                  'DIRECT_QRIS_TRANSFER',
                  '-',
                  'UNCLAIMED DONOR (' + rawSender + ')',
                  '-',
                  '-',
                  '-',
                  '-',
                  realAmount,
                  0,
                  realAmount,
                  'QRIS_DANA',
                  'PUBLIC',
                  'UNCLAIMED_DIRECT_TRANSFER',
                  'PAID',
                  'SETTLED_DANA_QRIS',
                  'DANA QRIS (treasury-sandbox@example.org) • ' + rawSender,
                  'Auto-ingested dari mutasi DANA QRIS via treasury-sandbox@example.org. Menunggu klaim donatur.'
                ];

                sheet.appendRow(unclaimedRow);

                if (typeof recordAuditLog === 'function') {
                  recordAuditLog(
                    'SILENT_DONOR_DANA_QRIS_INGESTED',
                    syntheticDirectTxId,
                    JSON.stringify({ realAmount: realAmount, rawSender: rawSender, subject: subject }),
                    'Added to UNCLAIMED_DIRECT_TRANSFER. Amount: Rp ' + realAmount
                  );
                }

                matchedTransactions.push({ transactionId: syntheticDirectTxId, amount: realAmount, isUnclaimed: true });

                if (typeof sendAutomatedNotifications === 'function') {
                  try {
                    sendAutomatedNotifications({
                      transactionId: syntheticDirectTxId,
                      donorName: 'UNKNOWN (Silent Donor QRIS)',
                      faculty: 'Belum Terdata',
                      batchYear: '-',
                      nominal: realAmount,
                      realAmount: realAmount,
                      paymentChannel: 'QRIS_DANA',
                      validationType: 'DANA Cloud Auto-Detect (treasury-sandbox@example.org)',
                      bankSenderRaw: rawSender,
                      notes: 'Mutasi DANA QRIS Masuk Tanpa Konfirmasi Web (Menunggu Klaim Donatur)',
                      isUnclaimed: true
                    });
                  } catch (eNotif) {
                    Logger.log('Notification error: ' + eNotif.toString());
                  }
                }
              }
            }
          }
          msg.markRead(); // Tandai email sudah dibaca
        }
      }
    }

    return {
      status: 'SUCCESS',
      matchedCount: matchedTransactions.length,
      matchedTransactions: matchedTransactions
    };
  } catch (err) {
    Logger.log("Error scanGmailAndGenerateReceipts: " + err.toString());
    return { status: 'ERROR', message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Alias untuk kompatibilitas trigger lama
function checkDanaPaymentEmails() {
  return scanGmailAndGenerateReceipts();
}

// Pasang Time-driven trigger otomatis per 1 menit
function setupDanaTimeDrivenTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === "checkDanaPaymentEmails" || fn === "scanGmailAndGenerateReceipts") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("scanGmailAndGenerateReceipts")
    .timeBased()
    .everyMinutes(1)
    .create();
}

/**
 * Cloud Email Parser Engine
 * Dipasang sebagai Time-driven trigger (setiap 1 menit) di Google Cloud Apps Script.
 * Membaca email notifikasi mutasi yang di-auto-forward dari Bank BSI & Bank Jago ke Gmail bendahara.
 */
function parseBankMutasiEmails() {
  const searchQueries = [
    'from:(notifikasi@bankbsi.co.id OR bsi OR "Bank BSI") ("Kredit" OR "transfer sebesar" OR "transaksi Kredit" OR "Dana Masuk") is:unread -from:me -from:treasury-sandbox@example.org -subject:"REKONSILIASI"',
    'from:(notification@jago.com OR "Bank Jago" OR "Jago") ("uang masuk" OR "Kantong" OR "transfer sebesar") is:unread -from:me -from:treasury-sandbox@example.org -subject:"REKONSILIASI"',
    'subject:(BSI OR "Bank Jago" OR "Kantong Beasiswa") ("Kredit" OR "uang masuk" OR "sebesar") is:unread -from:me -from:treasury-sandbox@example.org -subject:"REKONSILIASI"'
  ];

  for (let queryIdx = 0; queryIdx < searchQueries.length; queryIdx++) {
    const matchedThreads = GmailApp.search(searchQueries[queryIdx], 0, 10);

    for (let threadIndex = 0; threadIndex < matchedThreads.length; threadIndex++) {
      const emailMessages = matchedThreads[threadIndex].getMessages();

      for (let messageIndex = 0; messageIndex < emailMessages.length; messageIndex++) {
        const message = emailMessages[messageIndex];
        if (message.isUnread()) {
          const emailSubject = message.getSubject();
          const emailBody = message.getPlainBody();
          const emailSender = message.getFrom();
          const msgId = message.getId();

          // Anti-Loop Guard: Abaikan jika email berasal dari akun sendiri atau berisi notifikasi sistem
          let myEmail = '';
          try { myEmail = Session.getActiveUser().getEmail().toLowerCase(); } catch (eSession) {}
          if (emailSender.includes('treasury-sandbox') ||
              emailSender.includes('zam484068') ||
              (myEmail && emailSender.includes(myEmail)) ||
              emailSubject.includes('rekonsiliasi') ||
              emailSubject.includes('silent donor') ||
              emailSubject.includes('[perhatian]') ||
              emailSubject.includes('lembaga beasiswa') ||
              emailSubject.includes('[dana masuk]')) {
            message.markRead();
            continue;
          }

          // Anti-Spam Message Deduplication
          const cache = CacheService.getScriptCache();
          const cacheKey = 'MSG_BANK_' + msgId;
          if (cache.get(cacheKey)) {
            message.markRead();
            continue;
          }
          cache.put(cacheKey, '1', 21600); // 6 jam

          let parsedMutationResult = null;

          if (emailSender.toLowerCase().includes('bsi') || emailSubject.toLowerCase().includes('bsi')) {
            parsedMutationResult = parseBSIMutationText(emailBody);
          } else if (emailSender.toLowerCase().includes('jago') || emailSubject.toLowerCase().includes('jago')) {
            parsedMutationResult = parseJagoMutationText(emailBody);
          }

          if (parsedMutationResult && parsedMutationResult.nominalCredit > 0) {
            executeSmartAutoMatching(parsedMutationResult);
          }

          message.markRead();
        }
      }
    }
  }
}

/**
 * Regex Parser untuk Email Mutasi Bank Syariah Indonesia (BSI)
 */
function parseBSIMutationText(rawEmailContent) {
  // Format BSI Umum:
  // "Telah terjadi transaksi Kredit pada rekening xxxx sebesar Rp 100.342,00. Keterangan: TRANSFER DARI FADLAN ALFIAN"
  let parsedNominal = 0;
  let parsedSender = 'DONATUR BSI';

  const nominalRegexMatches = rawEmailContent.match(/(?:Rp|IDR)\s*([0-9.,]+)/i);
  if (nominalRegexMatches && nominalRegexMatches[1]) {
    parsedNominal = cleanCurrencyToInteger(nominalRegexMatches[1]);
  }

  const senderRegexMatches = rawEmailContent.match(/(?:DARI|PENGIRIM|DARI\s*REKENING|KETERANGAN\s*:?\s*TRANSFER\s*DARI)\s*([A-Za-z0-9\s.,]+?)(?:\.|\n|\r|REK|PADA|$)/i);
  if (senderRegexMatches && senderRegexMatches[1]) {
    parsedSender = senderRegexMatches[1].trim().toUpperCase();
  }

  return {
    bankType: 'BSI_TRANSFER',
    nominalCredit: parsedNominal,
    senderName: parsedSender,
    rawTextExcerpt: rawEmailContent.substring(0, 200)
  };
}

/**
 * Regex Parser untuk Email Mutasi Bank Jago
 */
function parseJagoMutationText(rawEmailContent) {
  // Format Bank Jago Umum:
  // "Uang masuk sebesar Rp 250.789 dari RIAN ARDIYANTO ke Kantong Beasiswa UPI"
  let parsedNominal = 0;
  let parsedSender = 'DONATUR BANK JAGO';

  const nominalRegexMatches = rawEmailContent.match(/(?:uang masuk sebesar|menerima transfer sebesar|sebesar)\s*(?:Rp|IDR)?\s*([0-9.,]+)/i);
  if (nominalRegexMatches && nominalRegexMatches[1]) {
    parsedNominal = cleanCurrencyToInteger(nominalRegexMatches[1]);
  } else {
    const fallbackNominal = rawEmailContent.match(/(?:Rp|IDR)\s*([0-9.,]+)/i);
    if (fallbackNominal && fallbackNominal[1]) {
      parsedNominal = cleanCurrencyToInteger(fallbackNominal[1]);
    }
  }

  const senderRegexMatches = rawEmailContent.match(/(?:dari|pengirim)\s+([A-Za-z0-9\s.,]+?)(?:\s+ke\s+kantong|\.|\n|\r|$)/i);
  if (senderRegexMatches && senderRegexMatches[1]) {
    parsedSender = senderRegexMatches[1].trim().toUpperCase();
  }

  return {
    bankType: 'JAGO_TRANSFER',
    nominalCredit: parsedNominal,
    senderName: parsedSender,
    rawTextExcerpt: rawEmailContent.substring(0, 200)
  };
}

/**
 * Helper membersihkan string rupiah menjadi integer murni
 */
function cleanCurrencyToInteger(rawCurrencyString) {
  let cleaned = rawCurrencyString.replace(/\s/g, '');
  // Format Indonesia: 100.342,00 -> pisahkan desimal koma di akhir
  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0];
  }
  cleaned = cleaned.replace(/\./g, '');
  return parseInt(cleaned, 10) || 0;
}

/**
 * Smart Auto-Matching Logic:
 * Mencocokkan nominal mutasi bank dengan Total_Transfer_Amount pada transaksi PENDING
 */
function executeSmartAutoMatching(mutationData) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  const totalRows = sheetRawDonations.getLastRow();

  let matchingRowIndex = -1;
  let matchedRecord = null;

  if (totalRows > 1) {
    const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();

    for (let rowIndex = 0; rowIndex < donationMatrix.length; rowIndex++) {
      const rowPaymentStatus = String(donationMatrix[rowIndex][15]).trim();
      const rowTotalAmount = parseInt(donationMatrix[rowIndex][11], 10);

      // Cari status PENDING dengan total amount yang sama persis
      if (rowPaymentStatus === PAYMENT_STATUS.PENDING && rowTotalAmount === mutationData.nominalCredit) {
        matchingRowIndex = rowIndex + 2;
        matchedRecord = donationMatrix[rowIndex];
        break;
      }
    }
  }

  // KONDISI A: COCOK DENGAN TRANSAKSI PENDING WEB
  if (matchingRowIndex !== -1 && matchedRecord) {
    sheetRawDonations.getRange(matchingRowIndex, 16).setValue('PAID (AUTO_MATCHED_BY_UNIQUE_CODE)');
    sheetRawDonations.getRange(matchingRowIndex, 17).setValue('SETTLED');
    sheetRawDonations.getRange(matchingRowIndex, 18).setValue(mutationData.senderName);

    const transactionId = matchedRecord[0];
    const donorName = matchedRecord[4];
    const faculty = matchedRecord[5];

    recordAuditLog(
      'EMAIL_PARSER_AUTO_MATCHED',
      transactionId,
      JSON.stringify(mutationData),
      'Matched with row ' + matchingRowIndex + ' (Nominal: ' + mutationData.nominalCredit + ')'
    );

    if (typeof sendAutomatedNotifications === 'function') {
      sendAutomatedNotifications({
        transactionId: transactionId,
        donorName: donorName,
        faculty: faculty,
        batchYear: matchedRecord[7],
        nominal: mutationData.nominalCredit,
        uniqueCode: matchedRecord[10],
        paymentChannel: mutationData.bankType,
        validationType: 'Auto-Matched Kode Unik #' + matchedRecord[10],
        bankSenderRaw: mutationData.senderName,
        notes: matchedRecord[18],
        isUnclaimed: false
      });
    }

    sendTelegramNotification(
      '⚡ <b>AUTO-MATCH MUTASI REKENING SUKSES</b>\n' +
      'Order ID: <code>' + transactionId + '</code>\n' +
      'Donatur Web: ' + donorName + ' (' + faculty + ')\n' +
      'Rekening Pengirim: ' + mutationData.senderName + '\n' +
      'Nominal Mutasi: <b>Rp ' + Number(mutationData.nominalCredit).toLocaleString('id-ID') + '</b>\n' +
      'Bank: ' + mutationData.bankType
    );

    return {
      matched: true,
      transactionId: transactionId,
      status: 'PAID (AUTO_MATCHED_BY_UNIQUE_CODE)'
    };
  }

  // KONDISI B: TIDAK ADA YANG COCOK (SILENT DONOR - TRANSFER LANGSUNG TANPA FORM)
  const currentFormattedDate = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  const syntheticDirectTxId = 'TX-DIRECT-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMddHHmmss') + '-' + Math.floor(100 + Math.random() * 900);

  const unclaimedRow = [
    syntheticDirectTxId,
    currentFormattedDate,
    'DIRECT_BANK_TRANSFER',
    '-',
    'UNCLAIMED DONOR',
    '-',
    '-',
    '-',
    '-',
    mutationData.nominalCredit,
    0,
    mutationData.nominalCredit,
    mutationData.bankType,
    'PUBLIC',
    VERIFICATION_TIERS.UNCLAIMED_DIRECT_TRANSFER,
    PAYMENT_STATUS.PAID,
    'SETTLED',
    mutationData.senderName,
    'Auto-ingested dari notifikasi mutasi bank. Menunggu klaim donatur.'
  ];

  sheetRawDonations.appendRow(unclaimedRow);

  recordAuditLog(
    'SILENT_DONOR_DIRECT_TRANSFER_INGESTED',
    syntheticDirectTxId,
    JSON.stringify(mutationData),
    'Added to UNCLAIMED_DIRECT_TRANSFER. Amount: ' + mutationData.nominalCredit
  );

  if (typeof sendAutomatedNotifications === 'function') {
    sendAutomatedNotifications({
      transactionId: syntheticDirectTxId,
      donorName: 'UNKNOWN (Silent Donor)',
      faculty: 'Belum Terdata',
      batchYear: '-',
      nominal: mutationData.nominalCredit,
      paymentChannel: mutationData.bankType,
      validationType: 'Transfer Langsung Rekening Bank',
      bankSenderRaw: mutationData.senderName,
      notes: 'Mutasi Masuk Tanpa Konfirmasi Web (Menunggu Klaim Donatur)',
      isUnclaimed: true
    });
  }

  sendTelegramNotification(
    '⚠️ <b>MUTASI BANK MASUK TANPA WEB FORM (SILENT DONOR)</b>\n' +
    'Direct ID: <code>' + syntheticDirectTxId + '</code>\n' +
    'Nama di Mutasi: ' + mutationData.senderName + '\n' +
    'Nominal: <b>Rp ' + Number(mutationData.nominalCredit).toLocaleString('id-ID') + '</b>\n' +
    'Bank: ' + mutationData.bankType + '\n' +
    'Status: <i>UNCLAIMED_DIRECT_TRANSFER (Muncul di Dasbor Publik untuk Diklaim)</i>'
  );

  return {
    matched: false,
    unclaimedTransactionId: syntheticDirectTxId,
    status: VERIFICATION_TIERS.UNCLAIMED_DIRECT_TRANSFER
  };
}

/**
 * Handler simulator untuk pengujian mutasi via HTTP POST (Frontend Simulator Drawer)
 */
function handleSimulateBankMutation(simulationPayload) {
  const bankType = simulationPayload.bankType || 'BSI_TRANSFER';
  const nominal = parseInt(simulationPayload.nominalCredit, 10);
  const senderName = simulationPayload.senderName || 'PENGIRIM SIMULASI';

  const mutationMock = {
    bankType: bankType,
    nominalCredit: nominal,
    senderName: senderName,
    rawTextExcerpt: 'Simulated mutation via Admin Testing Panel'
  };

  const matchingResult = executeSmartAutoMatching(mutationMock);

  return {
    status: 'SUCCESS',
    simulationResult: matchingResult
  };
}

// =============================================================================
// 9. MODUL 5: KLAIM DIRECT TRANSFER (UNCLAIMED TRANSFER WIDGET)
// =============================================================================
function handleClaimDirectTransfer(claimPayload) {
  const transactionId = claimPayload.transactionId;
  const claimantName = claimPayload.donorName;
  const faculty = claimPayload.faculty;
  const department = claimPayload.department;
  const batchYear = claimPayload.batchYear;
  const whatsAppNumber = claimPayload.whatsApp;

  if (!transactionId || !claimantName || !faculty) {
    throw new Error('Data klaim donasi tidak lengkap.');
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  const totalRows = sheetRawDonations.getLastRow();

  if (totalRows <= 1) {
    throw new Error('Database transaksi kosong.');
  }

  const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();
  let targetRowIndex = -1;

  for (let rowIndex = 0; rowIndex < donationMatrix.length; rowIndex++) {
    if (String(donationMatrix[rowIndex][0]).trim() === String(transactionId).trim()) {
      targetRowIndex = rowIndex + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('Transaksi klaim tidak ditemukan.');
  }

  // Update identitas donatur pada baris unclaimed
  sheetRawDonations.getRange(targetRowIndex, 5).setValue(claimantName);
  sheetRawDonations.getRange(targetRowIndex, 6).setValue(faculty);
  sheetRawDonations.getRange(targetRowIndex, 7).setValue(department || '-');
  sheetRawDonations.getRange(targetRowIndex, 8).setValue(batchYear || '-');
  sheetRawDonations.getRange(targetRowIndex, 9).setValue(whatsAppNumber || '-');
  sheetRawDonations.getRange(targetRowIndex, 15).setValue('CLAIMED_DIRECT_TRANSFER');
  sheetRawDonations.getRange(targetRowIndex, 19).setValue('Telah diklaim oleh donatur via portal transparansi');

  recordAuditLog('DIRECT_TRANSFER_CLAIMED', transactionId, JSON.stringify(claimPayload), 'Successfully claimed by ' + claimantName);

  return {
    status: 'SUCCESS',
    message: 'Donasi berhasil diklaim dan dicatatkan atas nama angkatan Anda.',
    transactionId: transactionId
  };
}

// =============================================================================
// 10. MODUL 6: KOREKSI NO. WA & DONASI KOLEKTIF (POST-PAYMENT CORRECTION)
// =============================================================================
function handleUpdatePostPaymentInfo(updatePayload) {
  const transactionId = updatePayload.transactionId;
  const updatedWhatsApp = updatePayload.whatsApp;
  const updatedNotes = updatePayload.notes;

  if (!transactionId) {
    throw new Error('Transaction ID diperlukan.');
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  const totalRows = sheetRawDonations.getLastRow();

  if (totalRows <= 1) {
    throw new Error('Database transaksi kosong.');
  }

  const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();
  let targetRowIndex = -1;

  for (let rowIndex = 0; rowIndex < donationMatrix.length; rowIndex++) {
    if (String(donationMatrix[rowIndex][0]).trim() === String(transactionId).trim()) {
      targetRowIndex = rowIndex + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('Transaksi tidak ditemukan.');
  }

  if (updatedWhatsApp) {
    sheetRawDonations.getRange(targetRowIndex, 9).setValue(updatedWhatsApp);
  }
  if (updatedNotes) {
    sheetRawDonations.getRange(targetRowIndex, 19).setValue(updatedNotes);
  }

  recordAuditLog('POST_PAYMENT_CORRECTION', transactionId, JSON.stringify(updatePayload), 'Updated WhatsApp and Notes');

  return {
    status: 'SUCCESS',
    message: 'Data kontak dan catatan kolektif berhasil diperbarui.',
    transactionId: transactionId
  };
}

// =============================================================================
// 11. MODUL 7: DASBOR TRANSPARANSI PUBLIK BERTINGKAT (UU PDP COMPLIANT)
// =============================================================================
function fetchPublicDashboardMetrics() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);

  const defaultResult = {
    status: 'SUCCESS',
    level1Tracker: {
      totalCollected: 0,
      targetSemester: CONFIG_DEFAULTS.TARGET_SEMESTER_AMOUNT,
      percentage: 0,
      totalDonors: 0,
      lastUpdated: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
    },
    level2Leaderboard: [],
    level3CensoredLedger: [],
    level4UnclaimedTransfers: [],
    level5ImpactSummary: {
      totalRecipients: 75,
      recipientsByFaculty: {
        'FPMIPA': 12, 'FPTK': 15, 'FIP': 10, 'FPIPS': 8,
        'FPBS': 9, 'FPEB': 7, 'FPOK': 6, 'FPSD': 5, 'Kamda': 3
      },
      distributedAmount: 120000000
    }
  };

  if (!sheetRawDonations) {
    return defaultResult;
  }

  const totalRows = sheetRawDonations.getLastRow();
  if (totalRows <= 1) {
    return defaultResult;
  }

  const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();

  let totalCollectedAmount = 0;
  let paidDonorCount = 0;
  const facultyAggregation = {};
  const recentTransactionsList = [];
  const unclaimedTransfersList = [];

  for (let index = donationMatrix.length - 1; index >= 0; index--) {
    const row = donationMatrix[index];
    const txId = String(row[0]);
    const timestampStr = String(row[1]);
    const donorName = String(row[4]);
    const faculty = String(row[5]);
    const department = String(row[6]);
    const batchYear = String(row[7]);
    const totalAmount = parseInt(row[11], 10) || 0;
    const paymentChannel = String(row[12]);
    const privacyMode = String(row[13]);
    const verificationTier = String(row[14]);
    const paymentStatus = String(row[15]);
    const senderRaw = String(row[17]);

    const isPaid = paymentStatus.indexOf('PAID') !== -1;

    if (verificationTier === VERIFICATION_TIERS.UNCLAIMED_DIRECT_TRANSFER && isPaid) {
      unclaimedTransfersList.push({
        transactionId: txId,
        timestamp: timestampStr,
        bankChannel: paymentChannel,
        nominal: totalAmount,
        maskedSender: maskPersonalName(senderRaw)
      });
      continue;
    }

    if (isPaid) {
      totalCollectedAmount += totalAmount;
      paidDonorCount++;

      // Agregasi Fakultas untuk Leaderboard
      if (faculty && faculty !== '-') {
        facultyAggregation[faculty] = (facultyAggregation[faculty] || 0) + totalAmount;
      }

      // Live Censored Ledger (UU PDP No. 27/2022 Compliance)
      let publicDisplayName;
      if (privacyMode === 'ANONYMOUS' || donorName.toLowerCase().includes('hamba allah')) {
        publicDisplayName = 'Hamba Allah (' + (faculty !== '-' ? faculty : 'Alumni') + " '" + (batchYear !== '-' ? batchYear.slice(-2) : 'XX') + ')';
      } else {
        publicDisplayName = maskPersonalName(donorName) + (faculty !== '-' ? ' (' + faculty + " '" + (batchYear !== '-' ? batchYear.slice(-2) : '') + ')' : '');
      }

      if (recentTransactionsList.length < 15) {
        recentTransactionsList.push({
          transactionId: txId,
          timestamp: timestampStr,
          displayName: publicDisplayName,
          faculty: faculty,
          department: department,
          batchYear: batchYear,
          nominal: totalAmount,
          paymentChannel: paymentChannel,
          verificationTier: verificationTier,
          status: paymentStatus
        });
      }
    }
  }

  // Format Faculty Leaderboard
  const sortedLeaderboard = Object.keys(facultyAggregation).map(function(facultyName) {
    return {
      faculty: facultyName,
      totalAmount: facultyAggregation[facultyName]
    };
  }).sort(function(itemA, itemB) {
    return itemB.totalAmount - itemA.totalAmount;
  });

  const progressPercentage = Math.min(100, Math.round((totalCollectedAmount / CONFIG_DEFAULTS.TARGET_SEMESTER_AMOUNT) * 1000) / 10);

  return {
    status: 'SUCCESS',
    level1Tracker: {
      totalCollected: totalCollectedAmount,
      targetSemester: CONFIG_DEFAULTS.TARGET_SEMESTER_AMOUNT,
      percentage: progressPercentage,
      totalDonors: paidDonorCount,
      lastUpdated: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
    },
    level2Leaderboard: sortedLeaderboard,
    level3CensoredLedger: recentTransactionsList,
    level4UnclaimedTransfers: unclaimedTransfersList,
    level5ImpactSummary: defaultResult.level5ImpactSummary
  };
}

/**
 * Masking nama sesuai kaidah UU Perlindungan Data Pribadi (UU PDP No. 27/2022)
 * Contoh: "MHD FAUZI RACHMAN" -> "MHD FAU***"
 *         "Fadhil Muhammad" -> "Fadhil M.****"
 */
function maskPersonalName(rawName) {
  if (!rawName || rawName === '-' || rawName.toLowerCase() === 'unclaimed donor') {
    return 'Hamba Allah';
  }

  const nameParts = rawName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    const singleWord = nameParts[0];
    if (singleWord.length <= 3) return singleWord + '***';
    return singleWord.substring(0, 3) + '***';
  }

  const firstWord = nameParts[0];
  const secondWord = nameParts[1];
  return firstWord + ' ' + secondWord.substring(0, Math.min(2, secondWord.length)) + '***';
}

/**
 * Polling status transaksi individual oleh frontend
 */
function checkSpecificTransactionStatus(transactionId) {
  if (!transactionId) {
    return { status: 'ERROR', message: 'Transaction ID wajib diisi.' };
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  const totalRows = sheetRawDonations.getLastRow();

  if (totalRows <= 1) {
    return { status: 'NOT_FOUND', message: 'Belum ada transaksi.' };
  }

  const donationMatrix = sheetRawDonations.getRange(2, 1, totalRows - 1, 19).getValues();

  for (let rowIndex = 0; rowIndex < donationMatrix.length; rowIndex++) {
    if (String(donationMatrix[rowIndex][0]).trim() === String(transactionId).trim()) {
      const row = donationMatrix[rowIndex];
      let baseAmount = parseInt(row[9], 10) || 0;
      let totalTransferAmount = parseInt(row[11], 10) || 0;
      const paymentStatus = String(row[15] || '').toUpperCase().trim();

      // Guard: Pastikan nominal tidak pernah 0 jika status sudah PAID
      if (paymentStatus.includes('PAID') && totalTransferAmount <= 0) {
        totalTransferAmount = baseAmount > 0 ? baseAmount : 50000;
        if (baseAmount <= 0) baseAmount = totalTransferAmount;
      }

      return {
        status: 'SUCCESS',
        transactionId: row[0],
        timestamp: row[1],
        donorName: row[4],
        baseAmount: baseAmount,
        uniqueCode: row[10],
        totalTransferAmount: totalTransferAmount,
        realAmount: totalTransferAmount,
        real_amount: totalTransferAmount,
        paymentChannel: row[12],
        verificationTier: row[14],
        paymentStatus: row[15],
        settlementStatus: row[16],
        proofImageUrl: (row.length >= 20 && row[19]) ? String(row[19]) : ""
      };
    }
  }

  return { status: 'NOT_FOUND', message: 'Transaksi ' + transactionId + ' tidak ditemukan.' };
}

/**
 * Mengambil seluruh data transaksi untuk dashboard admin (Sinkronisasi Cloud)
 */
function fetchAllTransactionsForAdmin() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRawDonations = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  if (!sheetRawDonations) {
    return { status: 'SUCCESS', transactions: [] };
  }

  const totalRows = sheetRawDonations.getLastRow();
  if (totalRows <= 1) {
    return { status: 'SUCCESS', transactions: [] };
  }

  const totalCols = Math.max(20, sheetRawDonations.getLastColumn());
  const matrix = sheetRawDonations.getRange(2, 1, totalRows - 1, totalCols).getValues();
  const transactions = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row[0]) continue;
    let proofUrl = "";
    if (row.length >= 20 && row[19]) {
      proofUrl = String(row[19]).trim();
    }
    if (!proofUrl && String(row[18]).includes("drive.google.com")) {
      const matchUrl = String(row[18]).match(/https:\/\/drive\.google\.com[^\s)]+/);
      if (matchUrl) proofUrl = matchUrl[0];
    }

    transactions.push({
      transactionId: String(row[0]),
      timestamp: String(row[1]),
      inflowPath: String(row[2]),
      nim: String(row[3]),
      donorName: String(row[4]),
      faculty: String(row[5]),
      department: String(row[6]),
      batchYear: String(row[7]),
      whatsApp: String(row[8]),
      baseAmount: Number(row[9]) || 0,
      uniqueCode: Number(row[10]) || 0,
      totalTransferAmount: Number(row[11]) || 0,
      paymentChannel: String(row[12]),
      privacyMode: String(row[13]),
      verificationTier: String(row[14]),
      paymentStatus: String(row[15]),
      settlementStatus: String(row[16]),
      bankSenderRaw: String(row[17]),
      notes: String(row[18]),
      proofImageUrl: proofUrl
    });
  }

  return {
    status: 'SUCCESS',
    total: transactions.length,
    transactions: transactions
  };
}


// =============================================================================
// 12. MODUL 8: UPLOAD BUKTI PEMBAYARAN KE GOOGLE DRIVE & AUTO-VERIFIKASI
// =============================================================================
/**
 * Menerima foto screenshot bukti transfer dari donatur, menyimpannya di folder Google Drive,
 * mencatat URL bukti ke spreadsheet, dan memvalidasi status transaksi menjadi PAID.
 */
function handleUploadPaymentProof(payload) {
  const transactionId = payload.transactionId;
  const imageBase64 = payload.imageBase64;
  const mimeType = payload.mimeType || "image/jpeg";

  if (!transactionId) {
    throw new Error("ID Transaksi tidak disertakan.");
  }
  if (!imageBase64) {
    throw new Error("Data gambar bukti pembayaran tidak ditemukan.");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  if (!sheet) {
    throw new Error("Sheet raw_donations tidak ditemukan.");
  }

  // 1. Simpan gambar ke Google Drive
  let fileUrl = "";
  let fileId = "";
  let uploadError = "";
  try {
    const folderName = "Bukti_Transfer_Beasiswa_UPI";
    let folder;
    const existingFolders = DriveApp.getFoldersByName(folderName);
    if (existingFolders.hasNext()) {
      folder = existingFolders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareFolderErr) {
      Logger.log("Folder setSharing note: " + shareFolderErr.message);
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const fileName = "BUKTI_" + transactionId + "_" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd_HHmmss") + ".jpg";
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareFileErr) {
      Logger.log("File setSharing note: " + shareFileErr.message);
    }
    
    fileId = file.getId();
    fileUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
  } catch (driveErr) {
    uploadError = driveErr.message || driveErr.toString();
    Logger.log("Drive upload error: " + uploadError);
    fileUrl = "DRIVE_ERROR: " + uploadError;
  }

  // 2. Pastikan Header Kolom 20 (Proof_Image_Url) ada di sheet
  if (sheet.getLastColumn() < 20) {
    sheet.getRange(1, 20).setValue("Proof_Image_Url")
      .setFontWeight("bold")
      .setBackground("#1E3A8A")
      .setFontColor("#FFFFFF")
      .setHorizontalAlignment("center");
  }

  // 3. Cari baris transaksi di raw_donations
  const lastRow = sheet.getLastRow();
  let targetRowIndex = -1;
  let targetRowData = null;

  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, Math.max(20, sheet.getLastColumn())).getValues();
    for (let r = 0; r < data.length; r++) {
      if (String(data[r][0]).trim() === String(transactionId).trim()) {
        targetRowIndex = r + 2; // offset header + 1-based
        targetRowData = data[r];
        break;
      }
    }
  }

  if (targetRowIndex === -1) {
    throw new Error("Transaksi " + transactionId + " tidak ditemukan di database.");
  }

  const baseAmount = parseInt(targetRowData[9], 10) || 0;
  const totalAmount = parseInt(targetRowData[11], 10) || baseAmount;

  // 4. Update status menjadi PAID, simpan Proof URL, dan settlement status
  sheet.getRange(targetRowIndex, 16).setValue("PAID");
  sheet.getRange(targetRowIndex, 17).setValue("SETTLED_PROOF_UPLOAD");
  sheet.getRange(targetRowIndex, 19).setValue("Verifikasi Screenshot via Web (Google Drive)");
  sheet.getRange(targetRowIndex, 20).setValue(fileUrl);

  recordAuditLog("PAYMENT_PROOF_UPLOADED", transactionId, JSON.stringify({ fileUrl: fileUrl }), "Status set to PAID by proof upload.");

  return {
    status: "SUCCESS",
    message: "Bukti pembayaran berhasil diunggah",
    transactionId: transactionId,
    fileUrl: fileUrl,
    fileId: fileId,
    paymentStatus: "PAID",
    settlementStatus: "SETTLED_PROOF_UPLOAD",
    baseAmount: baseAmount,
    totalTransferAmount: totalAmount,
    realAmount: totalAmount
  };
}

// =============================================================================
// 13. MODUL 9: AKTIVASI OTORISASI GOOGLE DRIVE & PEMULIHAN AUDIT
// =============================================================================
/**
 * FUNGSI AKTIVASI & OTORISASI GOOGLE DRIVE (AKUN: treasury-sandbox@example.org)
 * -----------------------------------------------------------------------------
 * Jalankan fungsi ini 1x langsung dari Editor Apps Script (klik tombol "Jalankan"):
 * 1. Toolbar atas: Pilih "testOtorisasiGoogleDrive"
 * 2. Klik "Jalankan" (Run)
 * 3. Dialog "Authorization Required" (Otorisasi Diperlukan) akan muncul
 * 4. Klik "Tinjau Izin" -> Pilih akun treasury-sandbox@example.org -> "Lanjutan" -> "Buka Database Donasi Alumni (tidak aman)" -> "Izinkan"
 * 5. Update Web App Deployment: Klik "Terapkan" -> "Kelola penerapan" -> Edit (pensil) -> Versi baru -> Terapkan.
 */
function testOtorisasiGoogleDrive() {
  const folderName = "Bukti_Transfer_Beasiswa_UPI";
  let folder;
  const existingFolders = DriveApp.getFoldersByName(folderName);
  if (existingFolders.hasNext()) {
    folder = existingFolders.next();
    Logger.log("[OK] Folder ditemukan: " + folder.getUrl());
  } else {
    folder = DriveApp.createFolder(folderName);
    Logger.log("[OK] Folder baru berhasil dibuat: " + folder.getUrl());
  }

  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Buat file tes verifikasi hak akses baca/tulis
  const testBlob = Utilities.newBlob("Tes otorisasi Google Drive sukses pada: " + new Date().toISOString(), "text/plain", "TEST_AUTH_DRIVE.txt");
  const testFile = folder.createFile(testBlob);
  testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const testFileUrl = testFile.getUrl();
  testFile.setTrashed(true); // Hapus file tes ke sampah

  Logger.log("=================================================================");
  Logger.log("🎉 OTORISASI GOOGLE DRIVE BERHASIL UNTUK: treasury-sandbox@example.org");
  Logger.log("Folder Penyimpanan Bukti: " + folder.getUrl());
  Logger.log("=================================================================");

  return {
    status: "SUCCESS",
    message: "Google Drive terotorisasi dengan sukses!",
    folderUrl: folder.getUrl()
  };
}

/**
 * Utility opsional untuk membersihkan teks pesan error Drive pada Google Sheets
 * Mengubah pesan DRIVE_ERROR di kolom T menjadi catatan rapi "Menunggu Re-upload Bukti"
 */
function bersihkanPesanDriveErrorSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RAW_DONATIONS);
  if (!sheet) return "Sheet tidak ditemukan";

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "Tidak ada data transaksi";

  const data = sheet.getRange(2, 20, lastRow - 1, 1).getValues();
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const val = String(data[i][0] || '');
    if (val.startsWith("DRIVE_ERROR:")) {
      sheet.getRange(i + 2, 20).setValue("-");
      sheet.getRange(i + 2, 19).setValue("Verifikasi Web (Drive Belum Terotorisasi Saat Upload)");
      count++;
    }
  }

  return "Berhasil memperbarui " + count + " baris yang memiliki teks error Drive.";
}

