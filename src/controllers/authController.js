const bcrypt = require("bcryptjs")
const prisma = require("../config/prisma")

// Render Halaman Login Khusus Anggota
async function renderMemberLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/")
  }
  res.render("auth/member_login", { error: null })
}

// Proses Login Khusus Anggota
async function handleMemberLogin(req, res) {
  const { identifier, password } = req.body
  const trimmed = (identifier || "").trim()

  if (!trimmed || !password) {
    return res.render("auth/member_login", { error: "Silakan masukkan email/no. rekening dan kata sandi" })
  }

  // Cari user berdasarkan email, no. rekening, atau no. telepon
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: trimmed.toLowerCase() },
        { accountNumber: trimmed },
        { phone: trimmed }
      ]
    }
  })

  if (!user) {
    return res.render("auth/member_login", { error: "Akun tidak ditemukan. Periksa kembali email / nomor rekening Anda." })
  }

  // Jika akun adalah Admin atau Kasir, tolak login di halaman anggota
  if (user.role !== "ANGGOTA") {
    return res.render("auth/member_login", {
      error: `Akun ini terdaftar sebagai ${user.role}. Silakan masuk melalui Portal Petugas di bawah.`
    })
  }

  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) {
    return res.render("auth/member_login", { error: "Kata sandi / PIN yang Anda masukkan salah" })
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    accountNumber: user.accountNumber
  }

  res.redirect("/anggota/dashboard")
}

// Render Halaman Login Khusus Petugas (Admin & Kasir)
async function renderStaffLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/")
  }
  res.render("auth/staff_login", { error: null })
}

// Proses Login Khusus Petugas (Admin & Kasir)
async function handleStaffLogin(req, res) {
  const { email, password, role } = req.body
  const trimmedEmail = (email || "").trim().toLowerCase()

  if (!trimmedEmail || !password) {
    return res.render("auth/staff_login", { error: "Silakan lengkapi email dan kata sandi" })
  }

  const user = await prisma.user.findUnique({
    where: { email: trimmedEmail }
  })

  if (!user) {
    return res.render("auth/staff_login", { error: "Akun petugas tidak ditemukan" })
  }

  // Jika yang login adalah Anggota, tolak akses ke portal petugas
  if (user.role === "ANGGOTA") {
    return res.render("auth/staff_login", {
      error: "Akses ditolak. Portal ini khusus untuk Petugas (Kasir & Admin). Silakan login melalui Login Anggota."
    })
  }

  // Validasi role jika dipilih
  if (role && user.role !== role) {
    return res.render("auth/staff_login", {
      error: `Akun ini tidak memiliki hak akses sebagai ${role}`
    })
  }

  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) {
    return res.render("auth/staff_login", { error: "Kata sandi salah" })
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    accountNumber: user.accountNumber
  }

  if (user.role === "ADMIN") {
    return res.redirect("/admin/dashboard")
  }
  return res.redirect("/kasir/dashboard")
}

function handleLogout(req, res) {
  const userRole = req.session.user ? req.session.user.role : null
  req.session.destroy(() => {
    if (userRole === "ADMIN" || userRole === "KASIR") {
      res.redirect("/portal")
    } else {
      res.redirect("/login")
    }
  })
}

async function renderChangePassword(req, res) {
  res.render("auth/change_password", {
    error: null,
    success: null
  })
}

async function handleChangePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body
  const userId = req.session.user && req.session.user.id

  if (!userId) {
    return res.redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    return res.redirect("/login")
  }

  const match = await bcrypt.compare(currentPassword || "", user.passwordHash)
  if (!match) {
    return res.render("auth/change_password", {
      error: "Kata sandi saat ini tidak sesuai",
      success: null
    })
  }

  if (!newPassword || newPassword.length < 6) {
    return res.render("auth/change_password", {
      error: "Kata sandi baru minimal 6 karakter",
      success: null
    })
  }

  if (newPassword !== confirmPassword) {
    return res.render("auth/change_password", {
      error: "Konfirmasi kata sandi baru tidak cocok",
      success: null
    })
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  })

  res.render("auth/change_password", {
    error: null,
    success: "Kata sandi berhasil diubah"
  })
}

module.exports = {
  renderMemberLogin,
  handleMemberLogin,
  renderStaffLogin,
  handleStaffLogin,
  handleLogout,
  renderChangePassword,
  handleChangePassword
}
