/**
 * KONFIGURASI ENDPOINT PRODUCTION SISTEM BEASISWA IKA UPI
 * File ini dipanggil oleh index.html saat pertama kali dimuat.
 * 
 * Keuntungan:
 * Anda dapat mengganti URL Google Apps Script atau Looker Studio di file ini
 * tanpa perlu membongkar struktur kode index.html.
 */
window.APP_CONFIG = {
  // 1. Google Apps Script Web App Deployment URL (replace with your own /exec URL)
  GAS_DEPLOYMENT_URL: 'https://script.google.com/macros/s/YOUR_GAS_DEPLOYMENT_ID/exec',

  // 2. Google Looker Studio Embed Report URL
  LOOKER_STUDIO_EMBED_URL: '',

  // 3. Google Sheets Ledger URL
  GOOGLE_SHEETS_URL: '',

  // 4. Default Mode: true = local sandbox demo mode out-of-the-box; set false after deploying GAS
  DEFAULT_DEMO_MODE: true,

  // 5. Semester Scholarship Target (IDR)
  TARGET_SEMESTER_AMOUNT: 50000000,

  // 6. Demo / Sandbox Bank Accounts (replace with official organization accounts in private deployment)
  BANK_ACCOUNTS: {
    JAGO: {
      BANK_NAME: 'Bank Jago (Demo)',
      ACCOUNT_NUMBER: '500000000001',
      ACCOUNT_NUMBER_DISPLAY: '5000 0000 0001',
      ACCOUNT_HOLDER: 'Lembaga Beasiswa IKA UPI (Sandbox)'
    },
    BSI: {
      BANK_NAME: 'Bank Syariah Indonesia (Demo)',
      ACCOUNT_NUMBER: '7188000001',
      ACCOUNT_NUMBER_DISPLAY: '7188 000 001',
      ACCOUNT_HOLDER: 'Lembaga Beasiswa IKA UPI (Sandbox)'
    }
  }
};

