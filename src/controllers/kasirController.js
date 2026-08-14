const prisma = require("../config/prisma")
const bcrypt = require("bcryptjs")
const {
  sendDepositNotification,
  sendWithdrawNotification,
  sendWithdrawRejectedNotification
} = require("../services/waService")
const { generateAccountNumber, ensureUserAccountNumber } = require("../utils/accountHelper")

function jidFromPhone(phone) {
  if (!phone) return null
  const normalized = phone.replace(/[^0-9]/g, "")
  if (!normalized) return null
  return `${normalized}@s.whatsapp.net`
}

async function renderDashboard(req, res) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const transaksiHarian = await prisma.transaction.findMany({
    where: {
      cashierId: req.session.user.id,
      createdAt: {
        gte: today
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      member: true
    }
  })

  // Total Kas Masuk Hari Ini
  const depositToday = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "DEPOSIT",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })

  // Total Kas Keluar Hari Ini
  const withdrawToday = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })

  // Pending approval count
  const pendingRequestsCount = await prisma.transaction.count({
    where: {
      type: "WITHDRAWAL",
      status: "PENDING"
    }
  })

  const totalMembers = await prisma.user.count({
    where: { role: "ANGGOTA" }
  })

  res.render("dashboards/kasir", {
    transaksiHarian,
    todayDepositTotal: depositToday._sum.amount || 0,
    todayWithdrawTotal: Math.abs(withdrawToday._sum.amount || 0),
    pendingRequestsCount,
    totalMembers
  })
}

async function renderDepositForm(req, res) {
  const rawMembers = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { name: "asc" }
  })

  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const depositAgg = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "DEPOSIT",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })

  const todayDepositTotal = depositAgg._sum.amount || 0

  const todayTransactionCount = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  res.render("kasir/transactions/deposit", {
    members,
    error: null,
    success: null,
    lastTransaction: null,
    todayDepositTotal,
    todayTransactionCount
  })
}

async function handleDeposit(req, res) {
  const { memberId, amount, description } = req.body

  const member = await prisma.user.findFirst({
    where: {
      id: parseInt(memberId, 10),
      role: "ANGGOTA"
    }
  })

  const nominal = parseInt((amount || "").toString().replace(/[^0-9]/g, ""), 10)

  const rawMembers = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { name: "asc" }
  })
  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const depositAgg = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "DEPOSIT",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })

  const todayDepositTotal = depositAgg._sum.amount || 0

  const todayTransactionCount = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  if (!member || !nominal || nominal <= 0) {
    return res.render("kasir/transactions/deposit", {
      members,
      error: "Data anggota atau nominal tidak valid",
      success: null,
      lastTransaction: null,
      todayDepositTotal,
      todayTransactionCount
    })
  }

  // Ambil saldo sebelum setoran
  const saldoAggBefore = await prisma.transaction.aggregate({
    where: {
      memberId: member.id,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })
  const saldoAwal = saldoAggBefore._sum.amount || 0

  const tx = await prisma.transaction.create({
    data: {
      type: "DEPOSIT",
      status: "COMPLETED",
      amount: nominal,
      description: description || null,
      memberId: member.id,
      cashierId: req.session.user.id
    },
    include: {
      member: true,
      cashier: true
    }
  })

  const saldoAkhir = saldoAwal + nominal
  const noRekening = member.accountNumber || `TBG-2026-${String(member.id).padStart(4, '0')}`
  const noRef = `TRX-${String(tx.id).padStart(6, '0')}`

  const to = jidFromPhone(member.phone)
  if (to) {
    try {
      await sendDepositNotification({
        to,
        nama: member.name,
        noRek: noRekening,
        noRef: noRef,
        saldoAwal: saldoAwal.toLocaleString("id-ID"),
        nominal: nominal.toLocaleString("id-ID"),
        kasir: `${req.session.user.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${req.session.user.name}`,
        saldoAkhir: saldoAkhir.toLocaleString("id-ID"),
        total: saldoAkhir.toLocaleString("id-ID"),
        waktu: new Date().toLocaleString("id-ID")
      })
    } catch (err) {
      console.error("WA notification error:", err.message)
    }
  }

  const depositAggToday = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "DEPOSIT",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })

  const todayDepositTotalAfter = depositAggToday._sum.amount || 0

  const todayTransactionCountAfter = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  res.render("kasir/transactions/deposit", {
    members,
    error: null,
    success: `Setoran sebesar Rp ${nominal.toLocaleString("id-ID")} untuk ${member.name} berhasil disimpan.`,
    lastTransaction: {
      id: tx.id,
      type: "DEPOSIT",
      amount: nominal,
      description: tx.description,
      createdAt: tx.createdAt,
      member: member,
      cashierName: req.session.user.name,
      saldoAwal: saldoAwal,
      saldoAkhir: saldoAkhir
    },
    todayDepositTotal: todayDepositTotalAfter,
    todayTransactionCount: todayTransactionCountAfter
  })
}

async function renderWithdrawForm(req, res) {
  const rawMembers = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { name: "asc" }
  })
  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const withdrawAgg = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })
  const todayWithdrawTotal = Math.abs(withdrawAgg._sum.amount || 0)
  const todayTransactionCount = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  res.render("kasir/transactions/withdraw", {
    members,
    error: null,
    success: null,
    lastTransaction: null,
    todayWithdrawTotal,
    todayTransactionCount
  })
}

async function handleWithdraw(req, res) {
  const { memberId, amount, description } = req.body

  const member = await prisma.user.findFirst({
    where: {
      id: parseInt(memberId, 10),
      role: "ANGGOTA"
    }
  })

  const nominal = parseInt((amount || "").toString().replace(/[^0-9]/g, ""), 10)

  const rawMembers = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { name: "asc" }
  })
  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const withdrawAgg = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })
  const todayWithdrawTotal = Math.abs(withdrawAgg._sum.amount || 0)
  const todayTransactionCount = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  if (!member || !nominal || nominal <= 0) {
    return res.render("kasir/transactions/withdraw", {
      members,
      error: "Data anggota atau nominal tidak valid",
      success: null,
      lastTransaction: null,
      todayWithdrawTotal,
      todayTransactionCount
    })
  }

  // Ambil saldo sebelum penarikan
  const saldoAggBefore = await prisma.transaction.aggregate({
    where: {
      memberId: member.id,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })
  const saldoAwal = saldoAggBefore._sum.amount || 0

  if (saldoAwal < nominal) {
    return res.render("kasir/transactions/withdraw", {
      members,
      error: `Saldo anggota tidak mencukupi (Saldo saat ini: Rp ${saldoAwal.toLocaleString("id-ID")})`,
      success: null,
      lastTransaction: null,
      todayWithdrawTotal,
      todayTransactionCount
    })
  }

  const tx = await prisma.transaction.create({
    data: {
      type: "WITHDRAWAL",
      status: "COMPLETED",
      amount: -nominal,
      description: description || null,
      memberId: member.id,
      cashierId: req.session.user.id
    },
    include: {
      member: true,
      cashier: true
    }
  })

  const saldoAkhir = saldoAwal - nominal
  const noRekening = member.accountNumber || `TBG-2026-${String(member.id).padStart(4, '0')}`
  const noRef = `TRX-${String(tx.id).padStart(6, '0')}`

  const to = jidFromPhone(member.phone)
  if (to) {
    try {
      await sendWithdrawNotification({
        to,
        nama: member.name,
        noRek: noRekening,
        noRef: noRef,
        saldoAwal: saldoAwal.toLocaleString("id-ID"),
        nominal: nominal.toLocaleString("id-ID"),
        kasir: `${req.session.user.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${req.session.user.name}`,
        saldoAkhir: saldoAkhir.toLocaleString("id-ID"),
        total: saldoAkhir.toLocaleString("id-ID"),
        waktu: new Date().toLocaleString("id-ID")
      })
    } catch (err) {
      console.error("WA notification error:", err.message)
    }
  }

  const withdrawAggToday = await prisma.transaction.aggregate({
    where: {
      cashierId: req.session.user.id,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      createdAt: { gte: today }
    },
    _sum: { amount: true }
  })
  const todayWithdrawTotalAfter = Math.abs(withdrawAggToday._sum.amount || 0)
  const todayTransactionCountAfter = await prisma.transaction.count({
    where: {
      cashierId: req.session.user.id,
      status: "COMPLETED",
      createdAt: { gte: today }
    }
  })

  return res.render("kasir/transactions/withdraw", {
    members,
    error: null,
    success: `Penarikan saldo sebesar Rp ${nominal.toLocaleString("id-ID")} untuk ${member.name} berhasil diproses.`,
    lastTransaction: {
      id: tx.id,
      type: "WITHDRAWAL",
      amount: nominal,
      description: tx.description,
      createdAt: tx.createdAt,
      member: member,
      cashierName: `${req.session.user.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${req.session.user.name}`,
      saldoAwal: saldoAwal,
      saldoAkhir: saldoAkhir
    },
    todayWithdrawTotal: todayWithdrawTotalAfter,
    todayTransactionCount: todayTransactionCountAfter
  })
}

async function listWithdrawRequests(req, res) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1. Pengajuan Penarikan Mandiri Online
  const requests = await prisma.transaction.findMany({
    where: {
      type: "WITHDRAWAL",
      status: "PENDING"
    },
    include: {
      member: true
    },
    orderBy: {
      createdAt: "asc"
    }
  })

  // 2. Antrean Loket Fisik / Kios Hari Ini
  const loketQueues = await prisma.queue.findMany({
    where: {
      status: { in: ["WAITING", "CALLING"] },
      createdAt: { gte: today }
    },
    include: { member: true },
    orderBy: { createdAt: "asc" }
  })

  const currentCalling = await prisma.queue.findFirst({
    where: {
      status: "CALLING",
      createdAt: { gte: today }
    },
    include: { member: true },
    orderBy: { calledAt: "desc" }
  })

  res.render("kasir/transactions/withdraw_requests", {
    requests,
    loketQueues,
    currentCalling
  })
}

async function approveWithdraw(req, res) {
  const id = parseInt(req.params.id, 10)

  const tx = await prisma.transaction.findFirst({
    where: {
      id,
      type: "WITHDRAWAL",
      status: "PENDING"
    },
    include: {
      member: true
    }
  })

  if (!tx || !tx.member) {
    return res.redirect("/kasir/penarikan/requests")
  }

  const nominal = Math.abs(tx.amount)

  const saldoAggBefore = await prisma.transaction.aggregate({
    where: {
      memberId: tx.memberId,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })

  const saldoAwal = saldoAggBefore._sum.amount || 0

  if (saldoAwal < nominal) {
    return res.redirect("/kasir/penarikan/requests")
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      status: "COMPLETED",
      cashierId: req.session.user.id
    }
  })

  const saldoAkhir = saldoAwal - nominal
  const noRekening = tx.member.accountNumber || `TBG-2026-${String(tx.member.id).padStart(4, '0')}`
  const noRef = `TRX-${String(tx.id).padStart(6, '0')}`

  const to = jidFromPhone(tx.member.phone)
  if (to) {
    try {
      await sendWithdrawNotification({
        to,
        nama: tx.member.name,
        noRek: noRekening,
        noRef: noRef,
        saldoAwal: saldoAwal.toLocaleString("id-ID"),
        nominal: nominal.toLocaleString("id-ID"),
        kasir: `${req.session.user.role === 'ADMIN' ? 'Admin' : 'Kasir'} ${req.session.user.name}`,
        saldoAkhir: saldoAkhir.toLocaleString("id-ID"),
        total: saldoAkhir.toLocaleString("id-ID"),
        waktu: new Date().toLocaleString("id-ID")
      })
    } catch (err) {
      console.error("WA notification error:", err.message)
    }
  }

  res.redirect("/kasir/penarikan/requests")
}

async function rejectWithdraw(req, res) {
  const id = parseInt(req.params.id, 10)

  const tx = await prisma.transaction.findFirst({
    where: {
      id,
      type: "WITHDRAWAL",
      status: "PENDING"
    },
    include: {
      member: true
    }
  })

  if (!tx || !tx.member) {
    return res.redirect("/kasir/penarikan/requests")
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      status: "REJECTED",
      cashierId: req.session.user.id
    }
  })

  const saldoAgg = await prisma.transaction.aggregate({
    where: {
      memberId: tx.memberId,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })

  const saldo = saldoAgg._sum.amount || 0

  const to = jidFromPhone(tx.member.phone)
  if (to) {
    try {
      await sendWithdrawRejectedNotification({
        to,
        nama: tx.member.name,
        nominal: Math.abs(tx.amount).toLocaleString("id-ID"),
        saldo: saldo.toLocaleString("id-ID"),
        description: tx.description
      })
    } catch (err) {
      console.error("WA notification error:", err.message)
    }
  }

  res.redirect("/kasir/penarikan/requests")
}

async function listMembers(req, res) {
  const rawMembers = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { createdAt: "desc" }
  })

  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))

  res.render("kasir/members/index", {
    members
  })
}

async function renderCreateMember(req, res) {
  res.render("kasir/members/form", {
    mode: "create",
    member: {
      name: "",
      email: "",
      phone: ""
    }
  })
}

async function createMember(req, res) {
  const { name, email, phone, password } = req.body

  const passwordHash = await bcrypt.hash(password, 10)

  const newMember = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role: "ANGGOTA"
    }
  })

  const accountNumber = await generateAccountNumber(newMember.id)
  await prisma.user.update({
    where: { id: newMember.id },
    data: { accountNumber }
  })

  res.redirect("/kasir/anggota")
}

async function renderEditMember(req, res) {
  const id = parseInt(req.params.id, 10)

  const member = await prisma.user.findFirst({
    where: {
      id,
      role: "ANGGOTA"
    }
  })

  if (!member) {
    return res.redirect("/kasir/anggota")
  }

  const updatedMember = await ensureUserAccountNumber(member)

  res.render("kasir/members/form", {
    mode: "edit",
    member: updatedMember
  })
}

async function updateMember(req, res) {
  const id = parseInt(req.params.id, 10)
  const { name, email, phone, password } = req.body

  const data = {
    name,
    email,
    phone
  }

  if (password && password.trim() !== "") {
    data.passwordHash = await bcrypt.hash(password, 10)
  }

  await prisma.user.updateMany({
    where: {
      id,
      role: "ANGGOTA"
    },
    data
  })

  res.redirect("/kasir/anggota")
}

async function getMemberBalance(req, res) {
  const id = parseInt(req.params.id, 10)
  if (!id) {
    return res.json({ saldo: 0 })
  }
  const agg = await prisma.transaction.aggregate({
    where: {
      memberId: id,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })
  const saldo = agg._sum.amount || 0
  res.json({ saldo })
}

// Endpoint Verifikasi Keamanan QR ID Anggota untuk Tarik Tunai
async function verifyMemberByQr(req, res) {
  const rawQr = (req.body.qrCode || req.query.qrCode || "").trim()
  if (!rawQr) {
    return res.status(400).json({ success: false, message: "QR Code kosong." })
  }

  // Coba cari exact match no rekening, no hp, atau ID
  let member = await prisma.user.findFirst({
    where: {
      role: "ANGGOTA",
      OR: [
        { accountNumber: rawQr },
        { phone: rawQr }
      ]
    }
  })

  // Jika belum ketemu dan berupa angka numerik ID
  if (!member && !isNaN(parseInt(rawQr, 10))) {
    const numId = parseInt(rawQr, 10)
    member = await prisma.user.findFirst({
      where: {
        role: "ANGGOTA",
        OR: [
          { id: numId },
          { accountNumber: { contains: String(numId).padStart(4, "0") } }
        ]
      }
    })
  }

  if (!member) {
    return res.status(404).json({
      success: false,
      message: `QR ID "${rawQr}" tidak valid atau anggota tidak ditemukan.`
    })
  }

  const securedMember = await ensureUserAccountNumber(member)

  const saldoAgg = await prisma.transaction.aggregate({
    where: {
      memberId: member.id,
      status: "COMPLETED"
    },
    _sum: { amount: true }
  })
  const saldo = saldoAgg._sum.amount || 0

  return res.json({
    success: true,
    member: {
      id: securedMember.id,
      name: securedMember.name,
      accountNumber: securedMember.accountNumber,
      phone: securedMember.phone || "-",
      saldo: saldo
    }
  })
}

// Real-time member search API for cashier (Search by name, phone, or accountNumber)
async function searchMembers(req, res) {
  const query = (req.query.q || "").trim().toLowerCase()
  if (!query) {
    const rawMembers = await prisma.user.findMany({
      where: { role: "ANGGOTA" },
      take: 10,
      orderBy: { name: "asc" }
    })
    const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))
    return res.json({ members })
  }

  const rawMembers = await prisma.user.findMany({
    where: {
      role: "ANGGOTA",
      OR: [
        { name: { contains: query } },
        { phone: { contains: query } },
        { email: { contains: query } },
        { accountNumber: { contains: query } }
      ]
    },
    take: 15,
    orderBy: { name: "asc" }
  })

  const members = await Promise.all(rawMembers.map(m => ensureUserAccountNumber(m)))
  res.json({ members })
}

// Render receipt view for printing / sharing
async function renderReceipt(req, res) {
  const id = parseInt(req.params.id, 10)
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      member: true,
      cashier: true
    }
  })

  if (!tx) {
    return res.status(404).render("errors/404", { message: "Struk transaksi tidak ditemukan" })
  }

  const saldoAgg = await prisma.transaction.aggregate({
    where: {
      memberId: tx.memberId,
      status: "COMPLETED",
      createdAt: { lte: tx.createdAt }
    },
    _sum: {
      amount: true
    }
  })

  const saldoAkhir = saldoAgg._sum.amount || 0
  const nominal = Math.abs(tx.amount)
  const saldoAwal = tx.type === "DEPOSIT" ? saldoAkhir - nominal : saldoAkhir + nominal

  res.render("kasir/transactions/receipt", {
    tx,
    saldoAwal,
    saldoSaatItu: saldoAkhir
  })
}

async function renderReports(req, res) {
  const { startDate, endDate, type, memberId } = req.query

  const where = {
    status: "COMPLETED"
  }

  if (type && (type === "DEPOSIT" || type === "WITHDRAWAL")) {
    where.type = type
  }

  if (memberId) {
    where.memberId = parseInt(memberId, 10)
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate + "T00:00:00.000Z")
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate + "T23:59:59.999Z")
    }
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      member: true,
      cashier: true
    },
    orderBy: { createdAt: "desc" }
  })

  const members = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { name: "asc" }
  })

  let totalDeposit = 0
  let totalWithdraw = 0

  transactions.forEach(t => {
    if (t.type === "DEPOSIT") {
      totalDeposit += t.amount
    } else {
      totalWithdraw += Math.abs(t.amount)
    }
  })

  const netCash = totalDeposit - totalWithdraw

  res.render("kasir/reports", {
    transactions,
    members,
    totalDeposit,
    totalWithdraw,
    netCash,
    query: {
      startDate: startDate || "",
      endDate: endDate || "",
      type: type || "",
      memberId: memberId || ""
    }
  })
}

async function exportReportsCSV(req, res) {
  const { startDate, endDate, type, memberId } = req.query

  const where = { status: "COMPLETED" }

  if (type && (type === "DEPOSIT" || type === "WITHDRAWAL")) {
    where.type = type
  }

  if (memberId) {
    where.memberId = parseInt(memberId, 10)
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate + "T00:00:00.000Z")
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate + "T23:59:59.999Z")
    }
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      member: true,
      cashier: true
    },
    orderBy: { createdAt: "asc" }
  })

  let csv = "ID Transaksi,Tanggal,No Rekening,Nama Anggota,Jenis,Nominal (Rp),Petugas Kasir,Catatan\n"

  transactions.forEach(t => {
    const id = `TRX-${String(t.id).padStart(6, "0")}`
    const date = new Date(t.createdAt).toLocaleString("id-ID")
    const acc = t.member.accountNumber || `TBG-2026-${String(t.member.id).padStart(4, "0")}`
    const name = `"${(t.member.name || "").replace(/"/g, '""')}"`
    const typeLabel = t.type === "DEPOSIT" ? "Setoran" : "Penarikan"
    const amount = Math.abs(t.amount)
    const cashier = `"${(t.cashier ? t.cashier.name : "Kasir").replace(/"/g, '""')}"`
    const desc = `"${(t.description || "").replace(/"/g, '""')}"`

    csv += `${id},${date},${acc},${name},${typeLabel},${amount},${cashier},${desc}\n`
  })

  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="Laporan_Kasir_${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send("\uFEFF" + csv)
}

module.exports = {
  renderDashboard,
  renderDepositForm,
  handleDeposit,
  renderWithdrawForm,
  handleWithdraw,
  listWithdrawRequests,
  approveWithdraw,
  rejectWithdraw,
  listMembers,
  renderCreateMember,
  createMember,
  renderEditMember,
  updateMember,
  getMemberBalance,
  verifyMemberByQr,
  searchMembers,
  renderReceipt,
  renderReports,
  exportReportsCSV
}
