const express = require("express")
const { isKasir } = require("../middlewares/roleMiddleware")
const {
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
} = require("../controllers/kasirController")
const {
  renderCashierQueue,
  callNextQueue,
  recallQueue,
  completeQueue,
  skipQueue
} = require("../controllers/queueController")

const router = express.Router()

router.get("/dashboard", isKasir, renderDashboard)

// Antrean Kasir & Panggilan Suara
router.get("/antrean", isKasir, renderCashierQueue)
router.post("/antrean/panggil", isKasir, callNextQueue)
router.post("/antrean/:id/recall", isKasir, recallQueue)
router.post("/antrean/:id/selesai", isKasir, completeQueue)
router.post("/antrean/:id/lewati", isKasir, skipQueue)

// Laporan & Export
router.get("/reports", isKasir, renderReports)
router.get("/reports/export", isKasir, exportReportsCSV)

// API verify QR Code for secure withdrawal
router.post("/api/verify-qr", isKasir, verifyMemberByQr)
router.get("/api/verify-qr", isKasir, verifyMemberByQr)

// API search members for fast cashier autocompletion
router.get("/api/members/search", isKasir, searchMembers)

// Receipt view (thermal receipt style)
router.get("/receipt/:id", isKasir, renderReceipt)

router.get("/setoran", isKasir, renderDepositForm)
router.post("/setoran", isKasir, handleDeposit)

router.get("/penarikan", isKasir, renderWithdrawForm)
router.post("/penarikan", isKasir, handleWithdraw)
router.get("/penarikan/requests", isKasir, listWithdrawRequests)
router.get("/penarikan/saldo/:id", isKasir, getMemberBalance)
router.post("/penarikan/:id/approve", isKasir, approveWithdraw)
router.post("/penarikan/:id/reject", isKasir, rejectWithdraw)

// Aliases English for consistency with bottom navbar label
router.get("/withdraw", isKasir, renderWithdrawForm)
router.post("/withdraw", isKasir, handleWithdraw)
router.get("/withdraw/requests", isKasir, listWithdrawRequests)
router.get("/withdraw/saldo/:id", isKasir, getMemberBalance)

router.get("/anggota", isKasir, listMembers)
router.get("/anggota/new", isKasir, renderCreateMember)
router.post("/anggota", isKasir, createMember)
router.get("/anggota/:id/edit", isKasir, renderEditMember)
router.post("/anggota/:id", isKasir, updateMember)

// Aliases untuk konsistensi dengan link di UI
router.get("/members", isKasir, listMembers)
router.get("/members/new", isKasir, renderCreateMember)
router.post("/members", isKasir, createMember)
router.get("/members/:id/edit", isKasir, renderEditMember)
router.post("/members/:id", isKasir, updateMember)

module.exports = router
