const express = require("express")
const { isAnggota } = require("../middlewares/roleMiddleware")
const {
  renderDashboard,
  renderWithdrawRequest,
  handleWithdrawRequest,
  updateSavingsGoal,
  renderReceipt,
  renderPassbook
} = require("../controllers/anggotaController")
const {
  renderMemberQueue,
  takeQueueNumber
} = require("../controllers/queueController")

const router = express.Router()

router.get("/dashboard", isAnggota, renderDashboard)
router.get("/penarikan", isAnggota, renderWithdrawRequest)
router.post("/penarikan", isAnggota, handleWithdrawRequest)

// Savings Goal Target
router.post("/goal", isAnggota, updateSavingsGoal)

// Struk Transaksi Digital Anggota
router.get("/receipt/:id", isAnggota, renderReceipt)

// Buku Tabungan Digital
router.get("/buku-tabungan", isAnggota, renderPassbook)
router.get("/passbook", isAnggota, renderPassbook)

// Antrean Anggota
router.get("/antrean", isAnggota, renderMemberQueue)
router.post("/antrean/ambil", isAnggota, takeQueueNumber)

module.exports = router
