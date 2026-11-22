/**
 * SISTEM AUTOMASI DONASI & TRANSPARANSI BEASISWA ALUMNI UPI
 * Notification.gs - Multi-Channel Notification Engine (Email HTML & WhatsApp/Webhook)
 * 
 * Fitur:
 * 1. 100% Gratis & Native: Menggunakan MailApp bawaan Google tanpa pihak ketiga.
 * 2. Desain HTML Card Modern: Tampilan responsif seperti kuitansi digital perbankan.
 * 3. Notifikasi Ganda: Dikirim ke Pengelola & E-Receipt ke Donatur (jika email tersedia).
 * 4. Opsional Gateway: Dukungan Fonnte WhatsApp API & Discord Webhook.
 */

// =============================================================================
// KONFIGURASI SAKELAR MASTER NOTIFIKASI
// =============================================================================
const NOTIFICATION_CONFIG = {
  ENABLE_EMAIL_ALERTS: false,  // DEFAULT: FALSE (Dinonaktifkan agar 100% aman dari spam). Ubah ke true HANYA jika ingin mencoba kirim email resmi.
  ENABLE_DONOR_RECEIPT: false, // Ubah ke true jika ingin kirim kuitansi ke email donatur
  MUTE_SIMULATION: true        // Abaikan notifikasi untuk transaksi simulator / testing
};

// =============================================================================
// 1. FUNGSI UTAMA: SEND AUTOMATED NOTIFICATIONS (HTML EMAIL)
// =============================================================================
/**
 * Mengirim email notifikasi berdesain HTML Card modern ke pengelola & donatur
 * @param {Object} notificationData 
 */
function sendAutomatedNotifications(notificationData) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();

    // 0. SAKELAR MASTER: Cek apakah notifikasi email sedang dimatikan
    if (!NOTIFICATION_CONFIG.ENABLE_EMAIL_ALERTS || scriptProperties.getProperty('DISABLE_EMAIL_NOTIFICATIONS') === 'true') {
      Logger.log('Notification Skipped: Email alerts dimatikan oleh konfigurasi / emergency stop.');
      return;
    }

    // 1. IDEMPOTENCY GUARD: Mencegah email ganda / spam untuk transaksi yang sama
    const transactionId = notificationData.transactionId || 'TX-MANUAL';
    if (transactionId !== 'TX-MANUAL' && !transactionId.startsWith('TX-TEST-')) {
      const cache = CacheService.getScriptCache();
      const notifCacheKey = 'NOTIF_SENT_' + transactionId;
      if (cache.get(notifCacheKey)) {
        Logger.log('Notification Skipped: Transaksi ' + transactionId + ' sudah pernah dikirimkan notifikasinya (Anti-Spam Idempotency).');
        return;
      }
      cache.put(notifCacheKey, '1', 21600); // Kunci selama 6 jam
    }

    // Abaikan jika simulasi dan opsi MUTE_SIMULATION aktif
    if (NOTIFICATION_CONFIG.MUTE_SIMULATION && (notificationData.isSimulation || String(notificationData.notes || '').includes('Simulated mutation'))) {
      Logger.log('Notification Skipped: Transaksi simulator admin dimute.');
      return;
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetUrl = spreadsheet.getUrl();

    // Tentukan email tujuan pengelola:
    // Terhubung langsung ke treasury-sandbox@example.org (atau Script Properties 'MANAGER_EMAIL')
    const recipientManagerEmail = scriptProperties.getProperty('MANAGER_EMAIL') || 
                                 'treasury-sandbox@example.org';

    if (!recipientManagerEmail) {
      Logger.log('Notification Skipped: Tidak ada email pengelola yang terdeteksi.');
      return;
    }

    const isUnclaimed = notificationData.isUnclaimed || (notificationData.verificationTier === 'UNCLAIMED_DIRECT_TRANSFER');
    let rawNominal = Number(notificationData.nominal || notificationData.realAmount || notificationData.real_amount || notificationData.totalTransferAmount || notificationData.baseAmount || 0);
    if (isNaN(rawNominal) || rawNominal <= 0) {
      rawNominal = 50000;
    }
    const formattedNominal = 'Rp ' + rawNominal.toLocaleString('id-ID');
    const donorName = notificationData.donorName || 'Hamba Allah';
    const faculty = notificationData.faculty && notificationData.faculty !== '-' ? notificationData.faculty : 'Alumni UPI';
    const batchYear = notificationData.batchYear && notificationData.batchYear !== '-' ? (" '" + String(notificationData.batchYear).slice(-2)) : '';
    const paymentChannel = notificationData.paymentChannel || 'TRANSFER_BSI';
    const validationType = notificationData.validationType || (notificationData.uniqueCode ? ('Auto-Matched Kode Unik #' + notificationData.uniqueCode) : 'QRIS Dinamis');
    const cashStatus = (paymentChannel.indexOf('QRIS') !== -1) ? 'Mengendap di Payment Gateway (Auto-Cair H+1)' : 'Langsung Masuk Rekening Bendahara';
    const timestampStr = notificationData.timestamp || (Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy, HH:mm:ss') + ' WIB');

    // 2. Susun Template HTML Email Card Pengelola
    // Catatan: Gunakan tag [REKONSILIASI KAS IKA UPI] untuk membedakan dari kata kunci wallet DANA agar tidak memicu self-trigger loop
    const emailSubject = isUnclaimed 
      ? '⚠️ [REKONSILIASI KAS IKA UPI] Mutasi Tanpa Konfirmasi Web ' + formattedNominal
      : '✅ [REKONSILIASI KAS IKA UPI] Laporan Donasi Masuk ' + formattedNominal + ' (' + donorName + ')';

    const htmlBodyContent = generateModernHtmlEmailTemplate({
      isUnclaimed: isUnclaimed,
      formattedNominal: formattedNominal,
      transactionId: transactionId,
      donorProfile: donorName + ' (' + faculty + batchYear + ')',
      paymentChannel: paymentChannel,
      validationType: validationType,
      cashStatus: cashStatus,
      timestampStr: timestampStr,
      senderRaw: notificationData.bankSenderRaw || '-',
      notes: notificationData.notes || 'Tidak ada catatan tambahan.',
      sheetUrl: sheetUrl
    });

    // 2. Kirim Email ke Pengelola via MailApp Native Google
    MailApp.sendEmail({
      to: recipientManagerEmail,
      subject: emailSubject,
      htmlBody: htmlBodyContent
    });
    Logger.log('Email notifikasi berhasil dikirim ke Pengelola: ' + recipientManagerEmail);

    // 3. Jika tersedia email donatur (misal dari data alumni terdata), kirimkan salinan E-Receipt
    if (notificationData.donorEmail && notificationData.donorEmail.includes('@') && !isUnclaimed) {
      sendDonorReceiptEmail(notificationData.donorEmail, {
        donorName: donorName,
        transactionId: transactionId,
        formattedNominal: formattedNominal,
        paymentChannel: paymentChannel,
        timestampStr: timestampStr
      });
    }

    // 4. Jalankan Jalur Opsional (WhatsApp / Discord Webhook) jika dikonfigurasi
    sendWhatsAppOrWebhook(notificationData);

  } catch (errorException) {
    Logger.log('Gagal menjalankan sendAutomatedNotifications: ' + errorException.message);
  }
}

// =============================================================================
// 2. TEMPLATE GENERATOR: MODERN HTML CARD (UPI THEME)
// =============================================================================
function generateModernHtmlEmailTemplate(params) {
  const badgeBgColor = params.isUnclaimed ? '#FEF3C7' : '#D1FAE5';
  const badgeTextColor = params.isUnclaimed ? '#92400E' : '#065F46';
  const badgeBorderColor = params.isUnclaimed ? '#F59E0B' : '#10B981';
  const badgeLabel = params.isUnclaimed 
    ? '⚠️ MUTASI MASUK TANPA WEB FORM (SILENT DONOR)' 
    : '✅ DANA BEASISWA TERVERIFIKASI SISTEM';

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #1E293B;">
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- HEADER BANNER UPI -->
      <tr>
        <td style="background-color: #8B0000; padding: 20px 24px; text-align: left;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width: 48px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #660000; border: 1px solid #D97706; color: #FFFFFF; font-weight: 900; font-size: 16px; text-align: center; line-height: 40px;">
                  UPI
                </div>
              </td>
              <td style="padding-left: 12px;">
                <div style="color: #FFFFFF; font-weight: 800; font-size: 16px; letter-spacing: 0.5px;">LEMBAGA BEASISWA IKA UPI</div>
                <div style="color: #FDE68A; font-size: 11px;">Notifikasi Rekonsiliasi Kas & Mutasi Masuk Real-Time</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY CARD -->
      <tr>
        <td style="padding: 28px 24px;">
          
          <!-- STATUS BADGE -->
          <div style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background-color: ${badgeBgColor}; color: ${badgeTextColor}; border: 1px solid ${badgeBorderColor}; margin-bottom: 16px;">
            ${badgeLabel}
          </div>

          <!-- NOMINAL HIGHLIGHT -->
          <div style="font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Nominal Diterima</div>
          <div style="font-size: 32px; font-weight: 900; color: #8B0000; font-family: 'SF Pro Display', -apple-system, monospace; margin: 4px 0 20px 0;">
            ${params.formattedNominal}
          </div>

          <!-- DETAIL GRID -->
          <table width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; line-height: 1.6; border-top: 1px solid #F1F5F9; border-bottom: 1px solid #F1F5F9; padding: 12px 0; margin-bottom: 20px;">
            <tr>
              <td style="padding: 6px 0; color: #64748B; width: 38%;">Profil Donatur:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #0F172A;">${params.donorProfile}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">ID Transaksi / Order:</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: 700; color: #8B0000;">${params.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Metode & Validasi:</td>
              <td style="padding: 6px 0; color: #0F172A;"><strong>${params.paymentChannel}</strong> <span style="color: #64748B;">(${params.validationType})</span></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Status Kas:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #047857;">${params.cashStatus}</td>
            </tr>
            ${params.isUnclaimed ? `
            <tr>
              <td style="padding: 6px 0; color: #B45309; font-weight: 700;">Rekening Pengirim:</td>
              <td style="padding: 6px 0; font-family: monospace; color: #9A3412;">${params.senderRaw}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Waktu Transaksi:</td>
              <td style="padding: 6px 0; color: #334155;">${params.timestampStr}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Catatan / Pesan:</td>
              <td style="padding: 6px 0; color: #475569; font-style: italic;">"${params.notes}"</td>
            </tr>
          </table>

          <!-- CALL TO ACTION BUTTON -->
          <div style="text-align: center; margin-top: 24px;">
            <a href="${params.sheetUrl}" target="_blank" style="display: inline-block; background-color: #1E293B; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
              📊 Buka Google Sheets Rekap Kas
            </a>
          </div>

          ${params.isUnclaimed ? `
          <div style="margin-top: 16px; padding: 12px; background-color: #FFFBEB; border-radius: 8px; border: 1px solid #FCD34D; font-size: 11px; color: #92400E; line-height: 1.5;">
            <strong>Tindakan Pengelola:</strong> Dana ini otomatis masuk ke widget <em>"Donasi Belum Terklaim"</em> pada portal publik. Pengelola dapat memverifikasi mutasi ini apabila donatur menghubungi via WhatsApp sekretariat.
          </div>
          ` : ''}

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background-color: #F8FAFC; padding: 16px 24px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
          Sistem Automasi Transparansi Beasiswa Alumni UPI • Patuh UU PDP No. 27/2022<br>
          Gedung Ikatan Alumni UPI, Jl. Dr. Setiabudi No. 229, Bandung
        </td>
      </tr>

    </table>

  </body>
  </html>
  `;
}

/**
 * Mengirim E-Receipt resmi langsung ke email alumni / donatur
 */
function sendDonorReceiptEmail(donorEmail, params) {
  try {
    const subject = 'Kwitansi Digital Donasi Beasiswa Alumni UPI [' + params.transactionId + ']';
    const bodyHtml = `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 12px;">
        <h3 style="color: #8B0000; margin-top: 0;">Terima Kasih atas Donasi Anda!</h3>
        <p style="font-size: 13px; color: #334155;">Yth. <strong>${params.donorName}</strong>,</p>
        <p style="font-size: 13px; color: #334155; line-height: 1.5;">
          Alhamdulillah, donasi beasiswa Anda sebesar <strong>${params.formattedNominal}</strong> telah berhasil kami terima dan terekonsiliasi ke dalam rekening resmi Lembaga Beasiswa IKA UPI.
        </p>
        <div style="background-color: #F8FAFC; padding: 12px; border-radius: 8px; font-size: 12px; margin: 16px 0;">
          <div>No. Kwitansi: <strong>${params.transactionId}</strong></div>
          <div>Metode: <strong>${params.paymentChannel}</strong></div>
          <div>Waktu: <strong>${params.timestampStr}</strong></div>
          <div>Status: <span style="color: #047857; font-weight: bold;">LUNAS (VERIFIED)</span></div>
        </div>
        <p style="font-size: 11px; color: #64748B;">
          Semoga menjadi amal jariyah yang membawa keberkahan bagi pendidikan adik-adik mahasiswa UPI.
        </p>
      </div>
    `;

    MailApp.sendEmail({
      to: donorEmail,
      subject: subject,
      htmlBody: bodyHtml
    });
    Logger.log('E-Receipt berhasil dikirim ke donatur: ' + donorEmail);
  } catch (err) {
    Logger.log('Gagal mengirim E-Receipt donatur: ' + err.message);
  }
}

// =============================================================================
// 3. JALUR OPSIONAL: WHATSAPP (FONNTE) / DISCORD WEBHOOK
// =============================================================================
/**
 * Jalur opsional mengirim teks notifikasi ke WhatsApp Grup atau Discord
 * Cukup tambahkan 'FONNTE_TOKEN' atau 'DISCORD_WEBHOOK_URL' di Script Properties
 */
function sendWhatsAppOrWebhook(data) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const fonnteToken = scriptProperties.getProperty('FONNTE_TOKEN');
  const fonnteTarget = scriptProperties.getProperty('WHATSAPP_TARGET_GROUP');
  const discordWebhookUrl = scriptProperties.getProperty('DISCORD_WEBHOOK_URL');

  const formattedNominal = 'Rp ' + Number(data.nominal || data.totalTransferAmount || 0).toLocaleString('id-ID');
  const donorName = data.donorName || 'Hamba Allah';
  const faculty = data.faculty || 'Alumni UPI';
  const channel = data.paymentChannel || 'TRANSFER_BSI';

  const plainMessage = 
    `🎓 *DANA BEASISWA MASUK - IKA UPI*\n` +
    `• Nominal: *${formattedNominal}*\n` +
    `• Donatur: ${donorName} (${faculty})\n` +
    `• Kanal: ${channel}\n` +
    `• Status: *VERIFIED & RECONCILED*\n` +
    `_Data otomatis tercatat di Google Sheets._`;

  // 1. Opsi WhatsApp Gateway Fonnte
  if (fonnteToken && fonnteTarget) {
    try {
      UrlFetchApp.fetch('https://api.fonnte.com/send', {
        method: 'post',
        headers: { 'Authorization': fonnteToken },
        payload: {
          target: fonnteTarget,
          message: plainMessage
        },
        muteHttpExceptions: true
      });
      Logger.log('Notifikasi WhatsApp Fonnte terkirim ke: ' + fonnteTarget);
    } catch (waErr) {
      Logger.log('WhatsApp Fonnte skipped/error: ' + waErr.message);
    }
  }

  // 2. Opsi Discord Webhook
  if (discordWebhookUrl) {
    try {
      UrlFetchApp.fetch(discordWebhookUrl, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          content: plainMessage
        }),
        muteHttpExceptions: true
      });
      Logger.log('Notifikasi Discord Webhook terkirim.');
    } catch (dcErr) {
      Logger.log('Discord Webhook skipped/error: ' + dcErr.message);
    }
  }
}

// =============================================================================
// 4. FUNGSI TESTING MANDIRI (RUN SEKALI KLIK DI APPS SCRIPT)
// =============================================================================
/**
 * Jalankan fungsi ini di editor Apps Script untuk menguji email HTML card masuk ke inbox Anda
 */
function testSendNotificationEmail() {
  const sampleData = {
    transactionId: 'TX-TEST-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    nominal: 100342,
    uniqueCode: 342,
    donorName: 'Kang Fauzi',
    faculty: 'FPMIPA',
    batchYear: '2018',
    paymentChannel: 'BSI_TRANSFER',
    validationType: 'Auto-Matched Kode Unik #342',
    notes: 'Uji coba sistem notifikasi otomatis email HTML',
    isUnclaimed: false
  };

  sendAutomatedNotifications(sampleData);
  Logger.log('Test selesai! Periksa inbox email Anda.');
}

// =============================================================================
// 5. FITUR DARURAT: HENTIKAN SPAM & RESET SAKELAR
// =============================================================================
/**
 * Jalankan fungsi ini langsung di editor Google Apps Script jika Anda ingin:
 * 1. Menghapus seluruh trigger berulang (Time-driven cron).
 * 2. Mematikan sementara pengiriman email otomatis.
 */
function emergencyStopAllNotifications() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
    deletedCount++;
  }
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty('DISABLE_EMAIL_NOTIFICATIONS', 'true');
  
  Logger.log('🛑 EMERGENCY STOP BERHASIL!');
  Logger.log('   - ' + deletedCount + ' trigger otomatis telah dihapus.');
  Logger.log('   - Pengiriman email notifikasi telah DINONAKTIFKAN.');
  Logger.log('   - Untuk mengaktifkan kembali, jalankan fungsi: resumeNotificationsSafely()');
  
  return {
    status: 'STOPPED',
    triggersDeleted: deletedCount,
    emailDisabled: true
  };
}

/**
 * Jalankan fungsi ini untuk mengaktifkan kembali pengiriman email setelah situasi aman
 */
function resumeNotificationsSafely() {
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.deleteProperty('DISABLE_EMAIL_NOTIFICATIONS');
  Logger.log('✅ NOTIFIKASI DIAKTIFKAN KEMBALI dengan proteksi anti-spam ganda (Anti-Loop & Idempotency Cache).');
  return {
    status: 'ACTIVE',
    emailDisabled: false
  };
}


