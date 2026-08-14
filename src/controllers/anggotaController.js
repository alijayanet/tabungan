const prisma = require("../config/prisma")
const { sendWithdrawRequestNotificationToAdmins } = require("../services/waService")
const { ensureUserAccountNumber } = require("../utils/accountHelper")

async function getMemberBalanceStats(memberId) {
  // Saldo resmi (hanya transaksi COMPLETED)
  const completedAgg = await prisma.transaction.aggregate({
    where: {
      memberId,
      status: "COMPLETED"
    },
    _sum: {
      amount: true
    }
  })

  // Total setoran masuk
  const depositAgg = await prisma.transaction.aggregate({
    where: {
      memberId,
      status: "COMPLETED",
      type: "DEPOSIT"
    },
    _sum: {
      amount: true
    }
  })

  // Total penarikan selesai
  const withdrawAgg = await prisma.transaction.aggregate({
    where: {
      memberId,
      status: "COMPLETED",
      type: "WITHDRAWAL"
    },
    _sum: {
      amount: true
    }
  })

  // Total penarikan yang sedang PENDING
  const pendingWithdrawAgg = await prisma.transaction.aggregate({
    where: {
      memberId,
      status: "PENDING",
      type: "WITHDRAWAL"
    },
    _sum: {
      amount: true
    }
  })

  const saldoAktif = completedAgg._sum.amount || 0
  const totalDeposit = depositAgg._sum.amount || 0
  const totalWithdraw = Math.abs(withdrawAgg._sum.amount || 0)
  const pendingWithdraw = Math.abs(pendingWithdrawAgg._sum.amount || 0)
  const saldoTersedia = Math.max(0, saldoAktif - pendingWithdraw)

  return {
    saldoAktif,
    saldoTersedia,
    pendingWithdraw,
    totalDeposit,
    totalWithdraw
  }
}

async function renderDashboard(req, res) {
  let user = await prisma.user.findUnique({
    where: { id: req.session.user.id }
  })

  if (user) {
    user = await ensureUserAccountNumber(user)
    req.session.user.accountNumber = user.accountNumber
  }

  const stats = await getMemberBalanceStats(req.session.user.id)

  const transaksi = await prisma.transaction.findMany({
    where: {
      memberId: req.session.user.id
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 30
  })

  // Perhitungan progress savings goal
  const goalTarget = user.savingsGoalTarget || 0
  const goalTitle = user.savingsGoalTitle || null
  const goalProgress = goalTarget > 0 ? Math.min(100, Math.round((stats.saldoAktif / goalTarget) * 100)) : 0

  res.render("dashboards/anggota", {
    user,
    saldo: stats.saldoAktif,
    saldoTersedia: stats.saldoTersedia,
    pendingWithdraw: stats.pendingWithdraw,
    totalDeposit: stats.totalDeposit,
    totalWithdraw: stats.totalWithdraw,
    transaksi,
    goalTitle,
    goalTarget,
    goalProgress
  })
}

async function updateSavingsGoal(req, res) {
  const { goalTitle, goalTarget } = req.body
  const targetNominal = parseInt((goalTarget || "").toString().replace(/[^0-9]/g, ""), 10) || null

  await prisma.user.update({
    where: { id: req.session.user.id },
    data: {
      savingsGoalTitle: goalTitle ? goalTitle.trim() : null,
      savingsGoalTarget: targetNominal
    }
  })

  res.redirect("/anggota/dashboard")
}

async function renderReceipt(req, res) {
  const id = parseInt(req.params.id, 10)

  const tx = await prisma.transaction.findFirst({
    where: {
      id,
      memberId: req.session.user.id
    },
    include: {
      member: true,
      cashier: true
    }
  })

  if (!tx) {
    return res.status(404).render("errors/404", { message: "Bukti transaksi tidak ditemukan" })
  }

  // Agregasi saldo hingga transaksi ini
  const saldoAgg = await prisma.transaction.aggregate({
    where: {
      memberId: tx.memberId,
      status: "COMPLETED",
      createdAt: { lte: tx.createdAt }
    },
    _sum: { amount: true }
  })

  const saldoAkhir = saldoAgg._sum.amount || 0
  const nominal = Math.abs(tx.amount)
  const saldoAwal = tx.type === "DEPOSIT" ? saldoAkhir - nominal : saldoAkhir + nominal

  res.render("anggota/receipt", {
    tx,
    saldoAwal,
    saldoSaatItu: saldoAkhir
  })
}

async function renderPassbook(req, res) {
  let user = await prisma.user.findUnique({
    where: { id: req.session.user.id }
  })
  if (user) {
    user = await ensureUserAccountNumber(user)
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      memberId: req.session.user.id,
      status: "COMPLETED"
    },
    include: {
      cashier: true
    },
    orderBy: {
      createdAt: "asc"
    }
  })

  // Hitung running balance untuk setiap baris mutasi
  let currentBalance = 0
  const mutasiList = transactions.map(t => {
    const debit = t.type === "DEPOSIT" ? t.amount : 0
    const kredit = t.type === "WITHDRAWAL" ? Math.abs(t.amount) : 0
    currentBalance += (debit - kredit)

    return {
      id: t.id,
      date: t.createdAt,
      type: t.type,
      debit,
      kredit,
      balance: currentBalance,
      cashierName: t.cashier ? t.cashier.name : "Sistem",
      description: t.description || "-"
    }
  })

  // Balikkan urutan jika untuk tampilan tabel layar (opsional), atau biarkan asc untuk buku tabungan
  res.render("anggota/passbook", {
    user,
    mutasiList,
    totalBalance: currentBalance
  })
}

async function renderWithdrawRequest(req, res) {
  let user = await prisma.user.findUnique({
    where: { id: req.session.user.id }
  })
  if (user) {
    user = await ensureUserAccountNumber(user)
  }

  const stats = await getMemberBalanceStats(req.session.user.id)

  res.render("anggota/withdraw_request", {
    user,
    saldo: stats.saldoAktif,
    saldoTersedia: stats.saldoTersedia,
    pendingWithdraw: stats.pendingWithdraw,
    error: null,
    success: null
  })
}

async function handleWithdrawRequest(req, res) {
  const { amount, description } = req.body
  const nominal = parseInt((amount || "").toString().replace(/[^0-9]/g, ""), 10)

  let user = await prisma.user.findUnique({
    where: { id: req.session.user.id }
  })
  if (user) {
    user = await ensureUserAccountNumber(user)
  }

  const statsBefore = await getMemberBalanceStats(req.session.user.id)

  if (!nominal || nominal <= 0) {
    return res.render("anggota/withdraw_request", {
      user,
      saldo: statsBefore.saldoAktif,
      saldoTersedia: statsBefore.saldoTersedia,
      pendingWithdraw: statsBefore.pendingWithdraw,
      error: "Nominal penarikan tidak valid",
      success: null
    })
  }

  if (nominal > statsBefore.saldoTersedia) {
    const errorMsg =
      statsBefore.pendingWithdraw > 0
        ? `Saldo tersedia Rp ${statsBefore.saldoTersedia.toLocaleString("id-ID")} (ada Rp ${statsBefore.pendingWithdraw.toLocaleString("id-ID")} sedang menunggu persetujuan)`
        : "Nominal penarikan melebihi saldo tabungan Anda"

    return res.render("anggota/withdraw_request", {
      user,
      saldo: statsBefore.saldoAktif,
      saldoTersedia: statsBefore.saldoTersedia,
      pendingWithdraw: statsBefore.pendingWithdraw,
      error: errorMsg,
      success: null
    })
  }

  await prisma.transaction.create({
    data: {
      type: "WITHDRAWAL",
      status: "PENDING",
      amount: -nominal,
      memberId: req.session.user.id,
      description: description || null
    }
  })

  if (user) {
    try {
      await sendWithdrawRequestNotificationToAdmins({
        memberName: user.name,
        memberPhone: user.phone,
        nominal: nominal.toLocaleString("id-ID"),
        saldo: statsBefore.saldoAktif.toLocaleString("id-ID"),
        description
      })
    } catch (waErr) {
      console.error("WA notification error:", waErr.message)
    }
  }

  const statsAfter = await getMemberBalanceStats(req.session.user.id)

  res.render("anggota/withdraw_request", {
    user,
    saldo: statsAfter.saldoAktif,
    saldoTersedia: statsAfter.saldoTersedia,
    pendingWithdraw: statsAfter.pendingWithdraw,
    error: null,
    success: `Pengajuan penarikan sebesar Rp ${nominal.toLocaleString("id-ID")} berhasil dikirim dan menunggu persetujuan kasir.`
  })
}

module.exports = {
  renderDashboard,
  renderWithdrawRequest,
  handleWithdrawRequest,
  updateSavingsGoal,
  renderReceipt,
  renderPassbook
}
