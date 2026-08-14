const prisma = require("../config/prisma")
const bcrypt = require("bcryptjs")
const { getWhatsAppStatus, resetWhatsAppSession, sendBroadcastToMembers } = require("../services/waService")

async function renderDashboard(req, res) {
  const totalMembers = await prisma.user.count({
    where: { role: "ANGGOTA" }
  })

  const totalBalance = await prisma.transaction.groupBy({
    by: ["memberId"],
    _sum: { amount: true }
  })

  const saldoTotal = totalBalance.reduce((acc, item) => acc + (item._sum.amount || 0), 0)

  const now = new Date()
  const monthLabels = []
  const depositSeries = []
  const withdrawSeries = []
  const saldoSeries = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)

    const monthName = d.toLocaleDateString("id-ID", { month: "short" })
    const yearShort = d.getFullYear().toString().slice(-2)
    monthLabels.push(monthName + " '" + yearShort)

    const depositAgg = await prisma.transaction.aggregate({
      where: {
        type: "DEPOSIT",
        status: "COMPLETED",
        createdAt: {
          gte: start,
          lt: end
        }
      },
      _sum: {
        amount: true
      }
    })

    const withdrawAgg = await prisma.transaction.aggregate({
      where: {
        type: "WITHDRAWAL",
        status: "COMPLETED",
        createdAt: {
          gte: start,
          lt: end
        }
      },
      _sum: {
        amount: true
      }
    })

    const depositValue = depositAgg._sum.amount || 0
    const withdrawValue = withdrawAgg._sum.amount || 0

    depositSeries.push(depositValue)
    withdrawSeries.push(Math.abs(withdrawValue))

    const saldoAggUntil = await prisma.transaction.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          lte: end
        }
      },
      _sum: {
        amount: true
      }
    })

    saldoSeries.push(saldoAggUntil._sum.amount || 0)
  }

  const recentTransactions = await prisma.transaction.findMany({
    take: 5,
    orderBy: {
      createdAt: "desc"
    },
    include: {
      member: true,
      cashier: true
    }
  })

  res.render("dashboards/admin", {
    totalMembers,
    saldoTotal,
    monthLabels,
    depositSeries,
    withdrawSeries,
    saldoSeries,
    recentTransactions
  })
}

async function renderSettings(req, res) {
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          "APP_NAME",
          "WA_DEPOSIT_TEMPLATE",
          "WA_WITHDRAW_TEMPLATE",
          "WA_WITHDRAW_REQUEST_TEMPLATE",
          "WA_WITHDRAW_REJECT_TEMPLATE"
        ]
      }
    }
  })

  const map = {}
  settings.forEach(s => {
    map[s.key] = s.value
  })

  res.render("admin/settings", {
    appNameSetting: map.APP_NAME || "",
    depositTemplate: map.WA_DEPOSIT_TEMPLATE ||
      "Halo [NAMA], setoran sebesar Rp [NOMINAL] telah berhasil ditambahkan oleh Kasir [KASIR]. Saldo Anda sekarang Rp [SALDO].",
    withdrawTemplate: map.WA_WITHDRAW_TEMPLATE ||
      "Halo [NAMA], penarikan sebesar Rp [NOMINAL] berhasil. Sisa saldo Anda Rp [SALDO].",
    withdrawRequestTemplate:
      map.WA_WITHDRAW_REQUEST_TEMPLATE ||
      "Pengajuan penarikan baru dari [NAMA] ([PHONE]) sebesar Rp [NOMINAL]. Saldo saat ini Rp [SALDO]. Keterangan: [KETERANGAN]",
    withdrawRejectTemplate:
      map.WA_WITHDRAW_REJECT_TEMPLATE ||
      "Halo [NAMA], pengajuan penarikan sebesar Rp [NOMINAL] telah DITOLAK. Saldo Anda saat ini Rp [SALDO]. Keterangan: [KETERANGAN]"
  })
}

async function updateSettings(req, res) {
  const {
    appName,
    depositTemplate,
    withdrawTemplate,
    withdrawRequestTemplate,
    withdrawRejectTemplate
  } = req.body

  const updates = []

  if (typeof appName === "string") {
    updates.push(
      prisma.setting.upsert({
        where: { key: "APP_NAME" },
        update: { value: appName },
        create: { key: "APP_NAME", value: appName }
      })
    )
  }

  if (typeof depositTemplate === "string") {
    updates.push(
      prisma.setting.upsert({
        where: { key: "WA_DEPOSIT_TEMPLATE" },
        update: { value: depositTemplate },
        create: { key: "WA_DEPOSIT_TEMPLATE", value: depositTemplate }
      })
    )
  }

  if (typeof withdrawTemplate === "string") {
    updates.push(
      prisma.setting.upsert({
        where: { key: "WA_WITHDRAW_TEMPLATE" },
        update: { value: withdrawTemplate },
        create: { key: "WA_WITHDRAW_TEMPLATE", value: withdrawTemplate }
      })
    )
  }

  if (typeof withdrawRequestTemplate === "string") {
    updates.push(
      prisma.setting.upsert({
        where: { key: "WA_WITHDRAW_REQUEST_TEMPLATE" },
        update: { value: withdrawRequestTemplate },
        create: { key: "WA_WITHDRAW_REQUEST_TEMPLATE", value: withdrawRequestTemplate }
      })
    )
  }

  if (typeof withdrawRejectTemplate === "string") {
    updates.push(
      prisma.setting.upsert({
        where: { key: "WA_WITHDRAW_REJECT_TEMPLATE" },
        update: { value: withdrawRejectTemplate },
        create: { key: "WA_WITHDRAW_REJECT_TEMPLATE", value: withdrawRejectTemplate }
      })
    )
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  res.redirect("/admin/settings")
}

async function renderWhatsAppStatus(req, res) {
  const status = getWhatsAppStatus()

  res.render("admin/whatsapp", {
    status
  })
}

async function handleResetWhatsApp(req, res) {
  await resetWhatsAppSession()
  res.redirect("/admin/whatsapp")
}

async function listCashiers(req, res) {
  const cashiers = await prisma.user.findMany({
    where: { role: "KASIR" },
    orderBy: { createdAt: "desc" }
  })

  res.render("admin/cashiers/index", {
    cashiers
  })
}

async function renderCreateCashier(req, res) {
  res.render("admin/cashiers/form", {
    mode: "create",
    cashier: {
      name: "",
      email: "",
      phone: ""
    }
  })
}

async function createCashier(req, res) {
  const { name, email, phone, password } = req.body

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role: "KASIR"
    }
  })

  res.redirect("/admin/cashiers")
}

async function renderEditCashier(req, res) {
  const id = parseInt(req.params.id, 10)

  const cashier = await prisma.user.findFirst({
    where: {
      id,
      role: "KASIR"
    }
  })

  if (!cashier) {
    return res.redirect("/admin/cashiers")
  }

  res.render("admin/cashiers/form", {
    mode: "edit",
    cashier
  })
}

async function updateCashier(req, res) {
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
      role: "KASIR"
    },
    data
  })

  res.redirect("/admin/cashiers")
}

async function deleteCashier(req, res) {
  const id = parseInt(req.params.id, 10)

  await prisma.user.deleteMany({
    where: {
      id,
      role: "KASIR"
    }
  })

  res.redirect("/admin/cashiers")
}

async function listMembers(req, res) {
  const members = await prisma.user.findMany({
    where: { role: "ANGGOTA" },
    orderBy: { createdAt: "desc" }
  })

  res.render("admin/members/index", {
    members
  })
}

async function renderCreateMember(req, res) {
  res.render("admin/members/form", {
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

  const { generateAccountNumber } = require("../utils/accountHelper")
  const accountNumber = await generateAccountNumber(newMember.id)
  await prisma.user.update({
    where: { id: newMember.id },
    data: { accountNumber }
  })

  res.redirect("/admin/members")
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
    return res.redirect("/admin/members")
  }

  res.render("admin/members/form", {
    mode: "edit",
    member
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

  res.redirect("/admin/members")
}

async function deleteMember(req, res) {
  const id = parseInt(req.params.id, 10)

  await prisma.user.deleteMany({
    where: {
      id,
      role: "ANGGOTA"
    }
  })

  res.redirect("/admin/members")
}

async function renderReports(req, res) {
  const { startDate, endDate, type, memberId, cashierId } = req.query

  const where = { status: "COMPLETED" }

  if (type && (type === "DEPOSIT" || type === "WITHDRAWAL")) {
    where.type = type
  }

  if (memberId) {
    where.memberId = parseInt(memberId, 10)
  }

  if (cashierId) {
    where.cashierId = parseInt(cashierId, 10)
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

  const staffList = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "KASIR"] }
    },
    orderBy: { name: "asc" }
  })

  // Kalkulasi agregasi rekap
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

  res.render("admin/reports", {
    transactions,
    members,
    staffList,
    totalDeposit,
    totalWithdraw,
    netCash,
    query: {
      startDate: startDate || "",
      endDate: endDate || "",
      type: type || "",
      memberId: memberId || "",
      cashierId: cashierId || ""
    }
  })
}

async function exportReportsCSV(req, res) {
  const { startDate, endDate, type, memberId, cashierId } = req.query

  const where = { status: "COMPLETED" }

  if (type && (type === "DEPOSIT" || type === "WITHDRAWAL")) {
    where.type = type
  }

  if (memberId) {
    where.memberId = parseInt(memberId, 10)
  }

  if (cashierId) {
    where.cashierId = parseInt(cashierId, 10)
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

  let csv = "ID Transaksi,Tanggal,No Rekening,Nama Anggota,Jenis,Nominal (Rp),Petugas Loket,Role Petugas,Catatan\n"

  transactions.forEach(t => {
    const id = `TRX-${String(t.id).padStart(6, "0")}`
    const date = new Date(t.createdAt).toLocaleString("id-ID")
    const acc = t.member.accountNumber || `TBG-2026-${String(t.member.id).padStart(4, "0")}`
    const name = `"${(t.member.name || "").replace(/"/g, '""')}"`
    const typeLabel = t.type === "DEPOSIT" ? "Setoran" : "Penarikan"
    const amount = Math.abs(t.amount)
    const cashierName = `"${(t.cashier ? t.cashier.name : "Admin/Sistem").replace(/"/g, '""')}"`
    const cashierRole = t.cashier ? t.cashier.role : "ADMIN"
    const desc = `"${(t.description || "").replace(/"/g, '""')}"`

    csv += `${id},${date},${acc},${name},${typeLabel},${amount},${cashierName},${cashierRole},${desc}\n`
  })

  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="Laporan_Tabungan_${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send("\uFEFF" + csv)
}

async function renderBroadcast(req, res) {
  const members = await prisma.user.findMany({
    where: {
      role: "ANGGOTA",
      phone: { not: null }
    }
  })

  const waStatus = getWhatsAppStatus()

  res.render("admin/broadcast", {
    membersCount: members.length,
    waStatus,
    success: req.session.broadcastSuccess || null,
    error: req.session.broadcastError || null
  })

  req.session.broadcastSuccess = null
  req.session.broadcastError = null
}

async function handleSendBroadcast(req, res) {
  const { message } = req.body

  if (!message || message.trim() === "") {
    req.session.broadcastError = "Pesan pengumuman tidak boleh kosong."
    return res.redirect("/admin/broadcast")
  }

  const result = await sendBroadcastToMembers(message.trim())

  if (!result.success) {
    req.session.broadcastError = result.message || "Gagal mengirim broadcast WhatsApp."
  } else {
    req.session.broadcastSuccess = `Berhasil mengirimkan pengumuman ke ${result.sentCount} dari ${result.totalMembers} nomor WhatsApp anggota.`
  }

  res.redirect("/admin/broadcast")
}

module.exports = {
  renderDashboard,
  renderSettings,
  updateSettings,
  renderWhatsAppStatus,
  handleResetWhatsApp,
  listCashiers,
  renderCreateCashier,
  createCashier,
  renderEditCashier,
  updateCashier,
  deleteCashier,
  listMembers,
  renderCreateMember,
  createMember,
  renderEditMember,
  updateMember,
  deleteMember,
  renderReports,
  exportReportsCSV,
  renderBroadcast,
  handleSendBroadcast
}
