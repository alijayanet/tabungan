const prisma = require("../config/prisma")

/**
 * Generate account number format: 8820-YYYY-XXXX (e.g. 8820-2026-0001)
 */
async function generateAccountNumber(userId) {
  const currentYear = new Date().getFullYear()
  const paddedId = String(userId).padStart(4, "0")
  return `8820-${currentYear}-${paddedId}`
}

/**
 * Ensures user has an account number, if missing, generate and update it
 */
async function ensureUserAccountNumber(user) {
  if (!user || user.role !== "ANGGOTA") return user
  if (user.accountNumber) return user

  const accountNumber = await generateAccountNumber(user.id)
  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { accountNumber }
    })
    return updated
  } catch (err) {
    return { ...user, accountNumber }
  }
}

module.exports = {
  generateAccountNumber,
  ensureUserAccountNumber
}
