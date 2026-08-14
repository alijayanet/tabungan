const dotenv = require("dotenv")
const bcrypt = require("bcryptjs")
const app = require("./app")
const prisma = require("./config/prisma")
const { startWhatsAppClient } = require("./services/waService")

dotenv.config()

async function ensureAdminUser() {
  const adminExists = await prisma.user.count({
    where: { role: "ADMIN" }
  })

  if (adminExists > 0) {
    return
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminName = process.env.ADMIN_NAME || "Administrator"
  const adminPhone = process.env.ADMIN_PHONE || null

  if (!adminEmail || !adminPassword) {
    console.log(
      "Tidak ada user ADMIN dan ADMIN_EMAIL / ADMIN_PASSWORD belum diset. Buat user ADMIN secara manual atau set env."
    )
    return
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  if (existingByEmail) {
    if (existingByEmail.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          role: "ADMIN",
          phone: adminPhone || existingByEmail.phone
        }
      })
    }
    console.log(`User ADMIN sudah ada dengan email ${adminEmail}`)
    return
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      passwordHash,
      role: "ADMIN"
    }
  })

  console.log(`User ADMIN awal berhasil dibuat dengan email ${adminEmail}`)
}

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`)

  ensureAdminUser().catch(error => {
    console.error("Gagal memastikan user ADMIN awal", error)
  })

  startWhatsAppClient().catch(error => {
    console.error("Gagal menginisialisasi WhatsApp client", error)
  })
})
