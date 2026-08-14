const express = require("express")
const { ensureAuthenticated } = require("../middlewares/authMiddleware")
const {
  renderMemberLogin,
  handleMemberLogin,
  renderStaffLogin,
  handleStaffLogin,
  handleLogout,
  renderChangePassword,
  handleChangePassword
} = require("../controllers/authController")

const router = express.Router()

// Login Khusus Anggota (Default Landing)
router.get("/login", renderMemberLogin)
router.post("/login", handleMemberLogin)
router.get("/anggota/login", renderMemberLogin)

// Login Khusus Petugas (Admin & Kasir)
router.get("/portal", renderStaffLogin)
router.post("/portal", handleStaffLogin)
router.get("/petugas/login", renderStaffLogin)
router.post("/petugas/login", handleStaffLogin)
router.get("/admin/login", renderStaffLogin)

// Logout
router.post("/logout", handleLogout)
router.get("/logout", handleLogout)

// Ubah Password
router.get("/password", ensureAuthenticated, renderChangePassword)
router.post("/password", ensureAuthenticated, handleChangePassword)

module.exports = router
