const { ensureAuthenticated } = require("./authMiddleware")

function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles]
  return (req, res, next) => {
    ensureAuthenticated(req, res, () => {
      if (!req.session.user || !allowedRoles.includes(req.session.user.role)) {
        return res.status(403).render("errors/403")
      }
      next()
    })
  }
}

const isAdmin = requireRole(["ADMIN"])
// isKasir sekarang mengizinkan KASIR dan ADMIN (Superuser)
const isKasir = requireRole(["KASIR", "ADMIN"])
const isAnggota = requireRole(["ANGGOTA"])

module.exports = {
  isAdmin,
  isKasir,
  isAnggota
}
