const express = require("express")
const { isAdmin } = require("../middlewares/roleMiddleware")
const {
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
} = require("../controllers/adminController")

const router = express.Router()

router.get("/dashboard", isAdmin, renderDashboard)
router.get("/settings", isAdmin, renderSettings)
router.post("/settings", isAdmin, updateSettings)

router.get("/whatsapp", isAdmin, renderWhatsAppStatus)
router.post("/whatsapp/reset", isAdmin, handleResetWhatsApp)

router.get("/broadcast", isAdmin, renderBroadcast)
router.post("/broadcast", isAdmin, handleSendBroadcast)

router.get("/reports", isAdmin, renderReports)
router.get("/reports/export", isAdmin, exportReportsCSV)

router.get("/cashiers", isAdmin, listCashiers)
router.get("/cashiers/new", isAdmin, renderCreateCashier)
router.post("/cashiers", isAdmin, createCashier)
router.get("/cashiers/:id/edit", isAdmin, renderEditCashier)
router.post("/cashiers/:id", isAdmin, updateCashier)
router.post("/cashiers/:id/delete", isAdmin, deleteCashier)

router.get("/members", isAdmin, listMembers)
router.get("/members/new", isAdmin, renderCreateMember)
router.post("/members", isAdmin, createMember)
router.get("/members/:id/edit", isAdmin, renderEditMember)
router.post("/members/:id", isAdmin, updateMember)
router.post("/members/:id/delete", isAdmin, deleteMember)

module.exports = router
