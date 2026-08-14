const prisma = require("../src/config/prisma")

async function cleanAllTransactions() {
  console.log("🧹 Memulai pembersihan data transaksi dan antrean...")

  try {
    // 1. Hapus semua data transaksi
    const deletedTransactions = await prisma.transaction.deleteMany({})
    console.log(`✅ Berhasil menghapus ${deletedTransactions.count} data transaksi.`)

    // 2. Hapus semua data tiket antrean
    const deletedQueues = await prisma.queue.deleteMany({})
    console.log(`✅ Berhasil menghapus ${deletedQueues.count} data tiket antrean.`)

    // 3. Verifikasi sisa data User
    const userCount = await prisma.user.count()
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } })
    const kasirCount = await prisma.user.count({ where: { role: "KASIR" } })
    const anggotaCount = await prisma.user.count({ where: { role: "ANGGOTA" } })

    console.log("\n📊 Ringkasan Data Pengguna Saat Ini (Tetap Aman):")
    console.log(`- Total Akun Pengguna: ${userCount}`)
    console.log(`  • Super Admin: ${adminCount}`)
    console.log(`  • Petugas Kasir: ${kasirCount}`)
    console.log(`  • Anggota Tabungan: ${anggotaCount}`)
    console.log("\n✨ Database siap digunakan untuk Fresh Server / Transaksi Baru!")
  } catch (error) {
    console.error("❌ Terjadi kesalahan saat menghapus data:", error)
  } finally {
    await prisma.$disconnect()
  }
}

cleanAllTransactions()
