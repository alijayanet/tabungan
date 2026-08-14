const fs = require("fs")
const path = require("path")
const makeWASocket = require("@whiskeysockets/baileys").default
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const prisma = require("../config/prisma")

let sock
let lastQr = null
let connectionStatus = "disconnected"

/**
 * Ekstraksi Nomor Telepon dari JID (Mendukung PNJID @s.whatsapp.net dan LID mapping)
 */
async function resolvePhoneNumberFromJid(jid, msg) {
  if (!jid) return null

  // 1. Jika PNJID standar (@s.whatsapp.net)
  if (jid.endsWith("@s.whatsapp.net")) {
    const raw = jid.split("@")[0]
    return raw.replace(/[^0-9]/g, "")
  }

  // 2. Cek apakah di msg.key.participant ada PNJID
  if (msg && msg.key && msg.key.participant && msg.key.participant.endsWith("@s.whatsapp.net")) {
    return msg.key.participant.split("@")[0].replace(/[^0-9]/g, "")
  }

  // 3. Jika LID (@lid), coba resolve menggunakan signalRepository Baileys v7
  if (jid.endsWith("@lid") && sock && sock.signalRepository && sock.signalRepository.lidMapping) {
    try {
      const pnjid = await sock.signalRepository.lidMapping.getPNForLID(jid)
      if (pnjid && pnjid.endsWith("@s.whatsapp.net")) {
        return pnjid.split("@")[0].replace(/[^0-9]/g, "")
      }
    } catch (err) {
      // mapping belum ada di cache sesi
    }
  }

  // 4. Fallback: ambil string angka dari jid
  const raw = jid.split("@")[0]
  return raw.replace(/[^0-9]/g, "")
}

function jidFromPhone(phone) {
  if (!phone) return null
  let normalized = phone.replace(/[^0-9]/g, "")
  if (normalized.startsWith("0")) {
    normalized = "62" + normalized.slice(1)
  }
  if (!normalized) return null
  return `${normalized}@s.whatsapp.net`
}

function getTextFromMessage(message) {
  if (!message) return ""
  if (message.conversation) return message.conversation
  if (message.extendedTextMessage && message.extendedTextMessage.text) {
    return message.extendedTextMessage.text
  }
  if (message.imageMessage && message.imageMessage.caption) {
    return message.imageMessage.caption
  }
  return ""
}

async function getSettingValue(key) {
  const setting = await prisma.setting.findUnique({
    where: { key }
  })
  return setting ? setting.value : null
}

function applyTemplate(template, variables) {
  let text = template || ""
  Object.keys(variables).forEach(key => {
    const placeholder = new RegExp(`\\[${key}\\]`, "g")
    text = text.replace(placeholder, variables[key] !== undefined ? variables[key] : "")
  })
  return text
}

/**
 * Helper untuk mencari anggota berdasarkan Nama, No. Rekening, No. Telepon, atau ID
 */
async function findMemberByIdentifier(identifier) {
  if (!identifier) return null
  const raw = identifier.trim()
  const digitsOnly = raw.replace(/[^0-9]/g, "")

  // 1. Coba cari exact match accountNumber atau phone
  let member = await prisma.user.findFirst({
    where: {
      role: "ANGGOTA",
      OR: [
        { accountNumber: raw },
        { phone: raw },
        ...(digitsOnly ? [
          { phone: digitsOnly },
          { phone: digitsOnly.startsWith("0") ? "62" + digitsOnly.slice(1) : digitsOnly }
        ] : [])
      ]
    }
  })

  // 2. Coba cari exact / substring nama (case-insensitive)
  if (!member) {
    member = await prisma.user.findFirst({
      where: {
        role: "ANGGOTA",
        name: {
          contains: raw
        }
      }
    })
  }

  // 3. Jika belum ketemu dan berupa angka pendek (misal input ID atau 4 digit rekening)
  if (!member && digitsOnly) {
    const numericId = parseInt(digitsOnly, 10)
    if (!isNaN(numericId)) {
      member = await prisma.user.findFirst({
        where: {
          role: "ANGGOTA",
          OR: [
            { id: numericId },
            { accountNumber: { contains: String(numericId).padStart(4, "0") } }
          ]
        }
      })
    }
  }

  return member
}

/**
 * Parser cerdas untuk memisahkan Nama/Identifier, Nominal Angka, dan Catatan
 */
function parseTransactionArgs(args) {
  if (!args || args.length === 0) return { identifier: "", nominal: 0, description: "" }

  // Cari index token pertama yang merupakan angka (nominal)
  let nominalIndex = -1
  let nominalValue = 0

  for (let i = 0; i < args.length; i++) {
    const cleanNum = args[i].replace(/[^\d]/g, "")
    const num = parseInt(cleanNum, 10)
    // Angka minimal 500 rupiah untuk dianggap sebagai nominal
    if (!isNaN(num) && num >= 500 && cleanNum.length >= 3) {
      nominalIndex = i
      nominalValue = num
      break
    }
  }

  if (nominalIndex === -1) {
    return {
      identifier: args.join(" ").trim(),
      nominal: 0,
      description: ""
    }
  }

  const identifier = args.slice(0, nominalIndex).join(" ").trim()
  const description = args.slice(nominalIndex + 1).join(" ").trim()

  return {
    identifier,
    nominal: nominalValue,
    description
  }
}

/**
 * Handle Command dari WhatsApp Admin / Kasir
 */
async function handleAdminKasirCommand({ senderUser, senderJid, body }) {
  const trimmed = body.trim()
  const upper = trimmed.toUpperCase()

  if (upper === "MENU" || upper === "BANTUAN" || upper === "HELP") {
    const text =
      `🤖 *MENU BOT TABUNGAN (${senderUser.role})*\n\n` +
      `Halo *${senderUser.name}*, Anda dapat mengelola tabungan langsung via WhatsApp:\n\n` +
      `📥 *1. INPUT SETORAN*\n` +
      `Format: \`SETOR <Nama/NoRek/NoHP> <Nominal> [Catatan]\`\n` +
      `Contoh Nama: \`SETOR Budi Santoso 100000\`\n` +
      `Contoh NoRek: \`SETOR 8820-2026-0001 50000 setoran wajib\`\n\n` +
      `📤 *2. INPUT PENARIKAN*\n` +
      `Format: \`TARIK <Nama/NoRek/NoHP> <Nominal> [Catatan]\`\n` +
      `Contoh Nama: \`TARIK Siti Aminah 50000\`\n` +
      `Contoh NoRek: \`TARIK 8820-2026-0001 50000\`\n\n` +
      `🔍 *3. CEK SALDO ANGGOTA*\n` +
      `Format: \`SALDO <Nama/NoRek/NoHP>\`\n` +
      `Contoh: \`SALDO Budi Santoso\` atau \`SALDO 8820-2026-0001\`\n\n` +
      `📊 *4. REKAP TABUNGAN*\n` +
      `Ketik: \`REKAP\` (melihat total dana & anggota)\n\n` +
      `_Pesan konfirmasi otomatis akan dikirim ke WhatsApp anggota yang bersangkutan._`

    await sock.sendMessage(senderJid, { text })
    return
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 0) return

  const command = parts[0].toUpperCase()
  const args = parts.slice(1)

  // 1. REKAP TOTAL TABUNGAN
  if (command === "REKAP" || command === "INFO") {
    const totalMembers = await prisma.user.count({ where: { role: "ANGGOTA" } })
    const saldoAgg = await prisma.transaction.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true }
    })
    const totalSaldo = saldoAgg._sum.amount || 0

    const text =
      `📊 *REKAP SISTEM TABUNGAN*\n\n` +
      `• Total Anggota : ${totalMembers} Orang\n` +
      `• Total Saldo   : Rp ${totalSaldo.toLocaleString("id-ID")}\n\n` +
      `_Status: Operasional Aktif_`

    await sock.sendMessage(senderJid, { text })
    return
  }

  // 2. CEK SALDO ANGGOTA (Mendukung Nama Lengkap / NoRek / NoHP)
  if (command === "SALDO" || command === "CEK") {
    const identifier = args.join(" ").trim()
    if (!identifier) {
      await sock.sendMessage(senderJid, { text: "⚠️ Format salah. Gunakan: `SALDO <Nama/NoRek/NoHP>`\nContoh: `SALDO Budi Santoso`" })
      return
    }

    const member = await findMemberByIdentifier(identifier)
    if (!member) {
      await sock.sendMessage(senderJid, {
        text: `❌ Anggota dengan nama/identitas *${identifier}* tidak ditemukan. Pastikan nama atau nomor sudah terdaftar.`
      })
      return
    }

    const saldoAgg = await prisma.transaction.aggregate({
      where: {
        memberId: member.id,
        status: "COMPLETED"
      },
      _sum: { amount: true }
    })
    const saldo = saldoAgg._sum.amount || 0

    const text =
      `👤 *INFO TABUNGAN ANGGOTA*\n\n` +
      `• Nama    : *${member.name}*\n` +
      `• No. Rek : ${member.accountNumber || ('TBG-2026-' + String(member.id).padStart(4, '0'))}\n` +
      `• No. WA  : ${member.phone || '-'}\n` +
      `• *Saldo* : *Rp ${saldo.toLocaleString("id-ID")}*`

    await sock.sendMessage(senderJid, { text })
    return
  }

  // 3. SETOR TABUNGAN VIA WA (Mendukung Nama Anggota)
  if (command === "SETOR" || command === "NABUNG") {
    const { identifier, nominal, description: customDesc } = parseTransactionArgs(args)
    const description = customDesc || "Setoran via WhatsApp"

    if (!identifier || !nominal || nominal <= 0) {
      await sock.sendMessage(senderJid, {
        text: "⚠️ Format salah.\nContoh dengan Nama: `SETOR Budi Santoso 100000`\nContoh dengan NoRek: `SETOR 8820-2026-0001 100000 setoran wajib`"
      })
      return
    }

    const member = await findMemberByIdentifier(identifier)
    if (!member) {
      await sock.sendMessage(senderJid, {
        text: `❌ Anggota dengan nama/identitas *${identifier}* tidak ditemukan. Pastikan nama, nomor rekening, atau No. WA benar.`
      })
      return
    }

    const saldoAggBefore = await prisma.transaction.aggregate({
      where: {
        memberId: member.id,
        status: "COMPLETED"
      },
      _sum: { amount: true }
    })
    const saldoAwal = saldoAggBefore._sum.amount || 0

    const tx = await prisma.transaction.create({
      data: {
        type: "DEPOSIT",
        status: "COMPLETED",
        amount: nominal,
        description: description,
        memberId: member.id,
        cashierId: senderUser.id
      }
    })

    const saldoAkhir = saldoAwal + nominal
    const noRek = member.accountNumber || `TBG-2026-${String(member.id).padStart(4, '0')}`
    const noRef = `TRX-${String(tx.id).padStart(6, '0')}`

    // Kirim notifikasi otomatis ke WhatsApp Anggota
    const toJid = jidFromPhone(member.phone)
    if (toJid) {
      await sendDepositNotification({
        to: toJid,
        nama: member.name,
        noRek: noRek,
        noRef: noRef,
        saldoAwal: saldoAwal.toLocaleString("id-ID"),
        nominal: nominal.toLocaleString("id-ID"),
        kasir: `${senderUser.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${senderUser.name} (WA)`,
        saldoAkhir: saldoAkhir.toLocaleString("id-ID"),
        total: saldoAkhir.toLocaleString("id-ID"),
        waktu: new Date().toLocaleString("id-ID")
      })
    }

    // Balas konfirmasi ke Admin/Kasir pengirim perintah
    await sock.sendMessage(senderJid, {
      text:
        `✅ *SETORAN BERHASIL DICATAT*\n\n` +
        `• No. Ref     : ${noRef}\n` +
        `• Anggota     : *${member.name}*\n` +
        `• No. Rek     : ${noRek}\n` +
        `• Saldo Awal  : Rp ${saldoAwal.toLocaleString("id-ID")}\n` +
        `• Setoran (+) : *Rp ${nominal.toLocaleString("id-ID")}*\n` +
        `──────────────────────\n` +
        `• *Saldo Akhir* : *Rp ${saldoAkhir.toLocaleString("id-ID")}*\n\n` +
        `_Notifikasi WA otomatis telah diteruskan ke anggota._`
    })

    return
  }

  // 4. TARIK SALDO TABUNGAN VIA WA (Mendukung Nama Anggota)
  if (command === "TARIK") {
    const { identifier, nominal, description: customDesc } = parseTransactionArgs(args)
    const description = customDesc || "Penarikan via WhatsApp"

    if (!identifier || !nominal || nominal <= 0) {
      await sock.sendMessage(senderJid, {
        text: "⚠️ Format salah.\nContoh dengan Nama: `TARIK Budi Santoso 50000`\nContoh dengan NoRek: `TARIK 8820-2026-0001 50000`"
      })
      return
    }

    const member = await findMemberByIdentifier(identifier)
    if (!member) {
      await sock.sendMessage(senderJid, {
        text: `❌ Anggota dengan nama/identitas *${identifier}* tidak ditemukan.`
      })
      return
    }

    const saldoAggBefore = await prisma.transaction.aggregate({
      where: {
        memberId: member.id,
        status: "COMPLETED"
      },
      _sum: { amount: true }
    })
    const saldoAwal = saldoAggBefore._sum.amount || 0

    if (saldoAwal < nominal) {
      await sock.sendMessage(senderJid, {
        text: `❌ Saldo tidak mencukupi!\nSaldo *${member.name}* saat ini: Rp ${saldoAwal.toLocaleString("id-ID")}\nNominal penarikan: Rp ${nominal.toLocaleString("id-ID")}`
      })
      return
    }

    const tx = await prisma.transaction.create({
      data: {
        type: "WITHDRAWAL",
        status: "COMPLETED",
        amount: -nominal,
        description: description,
        memberId: member.id,
        cashierId: senderUser.id
      }
    })

    const saldoAkhir = saldoAwal - nominal
    const noRek = member.accountNumber || `TBG-2026-${String(member.id).padStart(4, '0')}`
    const noRef = `TRX-${String(tx.id).padStart(6, '0')}`

    // Kirim notifikasi otomatis ke WhatsApp Anggota
    const toJid = jidFromPhone(member.phone)
    if (toJid) {
      await sendWithdrawNotification({
        to: toJid,
        nama: member.name,
        noRek: noRek,
        noRef: noRef,
        saldoAwal: saldoAwal.toLocaleString("id-ID"),
        nominal: nominal.toLocaleString("id-ID"),
        kasir: `${senderUser.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${senderUser.name} (WA)`,
        saldoAkhir: saldoAkhir.toLocaleString("id-ID"),
        total: saldoAkhir.toLocaleString("id-ID"),
        waktu: new Date().toLocaleString("id-ID")
      })
    }

    // Balas konfirmasi ke Admin/Kasir pengirim perintah
    await sock.sendMessage(senderJid, {
      text:
        `✅ *PENARIKAN BERHASIL DICATAT*\n\n` +
        `• No. Ref      : ${noRef}\n` +
        `• Anggota      : *${member.name}*\n` +
        `• No. Rek      : ${noRek}\n` +
        `• Saldo Awal   : Rp ${saldoAwal.toLocaleString("id-ID")}\n` +
        `• Penarikan (-) : *Rp ${nominal.toLocaleString("id-ID")}*\n` +
        `──────────────────────\n` +
        `• *Sisa Saldo*  : *Rp ${saldoAkhir.toLocaleString("id-ID")}*\n\n` +
        `_Notifikasi WA otomatis telah diteruskan ke anggota._`
    })

    return
  }

  // Fallback
  await sock.sendMessage(senderJid, {
    text: "Perintah tidak dikenali. Ketik *MENU* untuk melihat format perintah yang tersedia."
  })
}

async function startWhatsAppClient() {
  const { state, saveCreds } = await useMultiFileAuthState("whatsapp_auth")
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", update => {
    const connection = update.connection
    const qr = update.qr

    if (qr) {
      lastQr = qr
      connectionStatus = "qr"
      console.log("QR WhatsApp diterima, scan menggunakan aplikasi WhatsApp di HP")
    }

    if (connection === "open") {
      connectionStatus = "open"
      lastQr = null
      console.log("Terhubung ke WhatsApp")
    }

    if (connection === "close") {
      connectionStatus = "disconnected"
      startWhatsAppClient().catch(error => {
        console.error("Koneksi WhatsApp terputus", error)
      })
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages && messages[0]
    if (!msg || !msg.message) return
    if (msg.key.fromMe) return

    const senderJid = msg.key.remoteJid
    if (!senderJid) return

    // Resolusi nomor telepon baik dari PNJID maupun LIDJID
    const phone = await resolvePhoneNumberFromJid(senderJid, msg)
    const body = getTextFromMessage(msg.message)

    if (!phone || !body) return

    // Normalisasi format nomor (628xxx atau 08xxx)
    const normalizedPhone = phone.startsWith("0") ? "62" + phone.slice(1) : phone
    const localPhone = phone.startsWith("62") ? "0" + phone.slice(2) : phone

    const senderUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: phone },
          { phone: normalizedPhone },
          { phone: localPhone }
        ]
      }
    })

    if (!senderUser) return

    // Jika pengirim adalah Admin atau Kasir, eksekusi perintah
    if (senderUser.role === "ADMIN" || senderUser.role === "KASIR") {
      await handleAdminKasirCommand({
        senderUser,
        senderJid,
        body
      })
    }
  })
}

function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qr: lastQr
  }
}

async function resetWhatsAppSession() {
  if (sock && typeof sock.logout === "function") {
    try {
      await sock.logout()
    } catch (e) {}
  }

  const authDir = path.join(process.cwd(), "whatsapp_auth")

  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true })
    }
  } catch (e) {}

  lastQr = null
  connectionStatus = "disconnected"

  await startWhatsAppClient()
}

/**
 * Notifikasi Setoran Tabungan Lengkap dengan Saldo Awal, Setoran, dan Saldo Akhir
 */
async function sendDepositNotification({ to, nama, noRek, noRef, saldoAwal, nominal, kasir, saldoAkhir, total, waktu }) {
  if (!sock) return

  const defaultTemplate =
    `*BUKTI SETORAN TABUNGAN*\n` +
    `Halo *[NAMA]*, setoran Anda telah berhasil diproses oleh Kasir [KASIR].\n\n` +
    `📋 *Rincian Transaksi:*\n` +
    `• No. Ref: [NO_REF]\n` +
    `• No. Rekening: [NO_REK]\n` +
    `• Waktu: [WAKTU]\n\n` +
    `💰 *Rincian Saldo:*\n` +
    `• Saldo Awal : Rp [SALDO_AWAL]\n` +
    `• Setoran (+) : Rp [NOMINAL]\n` +
    `─────────────────────\n` +
    `• *Saldo Akhir* : *Rp [SALDO_AKHIR]*\n\n` +
    `Terima kasih telah menabung bersama kami.`

  const template = (await getSettingValue("WA_DEPOSIT_TEMPLATE")) || defaultTemplate
  const finalSaldo = saldoAkhir || total

  const text = applyTemplate(template, {
    NAMA: nama,
    NO_REK: noRek || "-",
    NO_REF: noRef || "-",
    SALDO_AWAL: saldoAwal || "0",
    NOMINAL: nominal,
    KASIR: kasir || "Kasir",
    SALDO_AKHIR: finalSaldo,
    SALDO: finalSaldo,
    WAKTU: waktu || new Date().toLocaleString("id-ID")
  })

  try {
    await sock.sendMessage(to, { text })
  } catch (err) {
    console.error("Gagal mengirim WA Setoran:", err.message)
  }
}

/**
 * Notifikasi Penarikan Saldo Lengkap dengan Saldo Awal, Penarikan, dan Sisa Saldo Akhir
 */
async function sendWithdrawNotification({ to, nama, noRek, noRef, saldoAwal, nominal, kasir, saldoAkhir, total, waktu }) {
  if (!sock) return

  const defaultTemplate =
    `*BUKTI PENARIKAN TABUNGAN*\n` +
    `Halo *[NAMA]*, penarikan saldo Anda telah berhasil diproses.\n\n` +
    `📋 *Rincian Transaksi:*\n` +
    `• No. Ref: [NO_REF]\n` +
    `• No. Rekening: [NO_REK]\n` +
    `• Waktu: [WAKTU]\n\n` +
    `💰 *Rincian Saldo:*\n` +
    `• Saldo Awal : Rp [SALDO_AWAL]\n` +
    `• Penarikan (-) : Rp [NOMINAL]\n` +
    `─────────────────────\n` +
    `• *Sisa Saldo* : *Rp [SALDO_AKHIR]*\n\n` +
    `Terima kasih telah menabung bersama kami.`

  const template = (await getSettingValue("WA_WITHDRAW_TEMPLATE")) || defaultTemplate
  const finalSaldo = saldoAkhir || total

  const text = applyTemplate(template, {
    NAMA: nama,
    NO_REK: noRek || "-",
    NO_REF: noRef || "-",
    SALDO_AWAL: saldoAwal || "0",
    NOMINAL: nominal,
    KASIR: kasir || "Kasir",
    SALDO_AKHIR: finalSaldo,
    SALDO: finalSaldo,
    WAKTU: waktu || new Date().toLocaleString("id-ID")
  })

  try {
    await sock.sendMessage(to, { text })
  } catch (err) {
    console.error("Gagal mengirim WA Penarikan:", err.message)
  }
}

async function sendWithdrawRequestNotificationToAdmins({ memberName, memberPhone, nominal, saldo, description }) {
  if (!sock) return

  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      phone: {
        not: null
      }
    }
  })

  if (!admins || admins.length === 0) return

  const defaultTemplate =
    `*PENGAJUAN PENARIKAN BARU*\n` +
    `Dari: *[NAMA]* ([PHONE])\n` +
    `Nominal: Rp [NOMINAL]\n` +
    `Saldo Saat Ini: Rp [SALDO]\n` +
    `Keterangan: [KETERANGAN]\n\n` +
    `Silakan buka aplikasi kasir untuk memproses.`

  const template = (await getSettingValue("WA_WITHDRAW_REQUEST_TEMPLATE")) || defaultTemplate

  const text = applyTemplate(template, {
    NAMA: memberName,
    PHONE: memberPhone || "-",
    NOMINAL: nominal,
    SALDO: saldo,
    KETERANGAN: description || "-"
  })

  for (const admin of admins) {
    const to = jidFromPhone(admin.phone)
    if (to) {
      try {
        await sock.sendMessage(to, { text })
      } catch (err) {}
    }
  }
}

async function sendWithdrawRejectedNotification({ to, nama, nominal, saldo, description }) {
  if (!sock) return

  const defaultTemplate =
    `*PEMBERITAHUAN PENARIKAN*\n` +
    `Halo *[NAMA]*, mohon maaf pengajuan penarikan sebesar Rp [NOMINAL] telah *DITOLAK*.\n` +
    `Saldo Anda saat ini: Rp [SALDO]\n` +
    `Alasan / Keterangan: [KETERANGAN]`

  const template = (await getSettingValue("WA_WITHDRAW_REJECT_TEMPLATE")) || defaultTemplate

  const text = applyTemplate(template, {
    NAMA: nama,
    NOMINAL: nominal,
    SALDO: saldo,
    KETERANGAN: description || "-"
  })

  try {
    await sock.sendMessage(to, { text })
  } catch (err) {}
}

async function sendBroadcastToMembers(messageText) {
  if (!sock) return { success: false, message: "WhatsApp belum terhubung" }

  const members = await prisma.user.findMany({
    where: {
      role: "ANGGOTA",
      phone: { not: null }
    }
  })

  let sentCount = 0
  for (const m of members) {
    const to = jidFromPhone(m.phone)
    if (to) {
      try {
        const text = `📢 *PENGUMUMAN TABUNGAN*\n\nHalo *${m.name}*,\n\n${messageText}\n\n_Pesan resmi dari Pengurus Tabungan._`
        await sock.sendMessage(to, { text })
        sentCount++
        // Delay 800ms agar aman dan tidak dicurigai spam
        await new Promise(resolve => setTimeout(resolve, 800))
      } catch (err) {
        console.error(`Gagal kirim broadcast ke ${m.phone}:`, err.message)
      }
    }
  }

  return { success: true, sentCount, totalMembers: members.length }
}

module.exports = {
  startWhatsAppClient,
  getWhatsAppStatus,
  resetWhatsAppSession,
  sendDepositNotification,
  sendWithdrawNotification,
  sendWithdrawRequestNotificationToAdmins,
  sendWithdrawRejectedNotification,
  sendBroadcastToMembers
}
