const prisma = require("../config/prisma")

/**
 * Generate nomor antrean berikutnya berdasarkan serviceType dan tanggal hari ini
 * serviceType: "SETOR" (A), "TARIK" (B), "DAFTAR" (C), "CS" (D)
 */
async function generateNextQueueNumber(serviceType) {
  let prefix = "A"
  if (serviceType === "SETOR") prefix = "A"
  else if (serviceType === "TARIK") prefix = "B"
  else if (serviceType === "DAFTAR") prefix = "C"
  else if (serviceType === "CS") prefix = "D"

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const countToday = await prisma.queue.count({
    where: {
      serviceType: serviceType,
      createdAt: { gte: today }
    }
  })

  const seq = countToday + 1
  return `${prefix}-${String(seq).padStart(3, "0")}`
}

/**
 * Halaman Kios Antrean Mandiri Umum (Siapapun / Calon Anggota)
 */
async function renderPublicKiosk(req, res) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalWaiting = await prisma.queue.count({
    where: {
      status: "WAITING",
      createdAt: { gte: today }
    }
  })

  const currentlyServing = await prisma.queue.findFirst({
    where: {
      status: { in: ["CALLING", "SERVING"] },
      createdAt: { gte: today }
    },
    orderBy: { calledAt: "desc" }
  })

  res.render("public/queue_kiosk", {
    totalWaiting,
    currentlyServing
  })
}

/**
 * Proses Ambil Tiket Antrean Umum
 */
async function takePublicQueue(req, res) {
  const { serviceType, guestName, guestPhone, notes } = req.body

  const validTypes = ["SETOR", "TARIK", "DAFTAR", "CS"]
  const type = validTypes.includes(serviceType) ? serviceType : "DAFTAR"

  const queueNumber = await generateNextQueueNumber(type)

  const visitorInfo = [
    guestName ? `Nama: ${guestName.trim()}` : "Pengunjung Umum",
    guestPhone ? `WA: ${guestPhone.trim()}` : "",
    notes ? `Catatan: ${notes.trim()}` : ""
  ].filter(Boolean).join(" | ")

  const queue = await prisma.queue.create({
    data: {
      queueNumber,
      serviceType: type,
      status: "WAITING",
      memberId: req.session && req.session.user && req.session.user.role === "ANGGOTA" ? req.session.user.id : null,
      notes: visitorInfo
    }
  })

  res.redirect(`/antrean/tiket/${queue.id}?new=1`)
}

/**
 * Halaman Cetak Karcis Tiket Antrean
 */
async function renderPublicTicket(req, res) {
  const id = parseInt(req.params.id, 10)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const queue = await prisma.queue.findUnique({
    where: { id },
    include: { member: true }
  })

  if (!queue) {
    return res.redirect("/antrean")
  }

  // Hitung sisa antrean yang menunggu di depan
  let waitingBefore = 0
  if (queue.status === "WAITING") {
    waitingBefore = await prisma.queue.count({
      where: {
        status: "WAITING",
        createdAt: {
          gte: today,
          lt: queue.createdAt
        }
      }
    })
  }

  res.render("public/queue_ticket", {
    queue,
    waitingBefore,
    isNew: req.query.new === "1"
  })
}

/**
 * Halaman Anggota: Ambil Nomor Antrean & Cek Posisi Antrean
 */
async function renderMemberQueue(req, res) {
  const memberId = req.session.user.id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const myActiveQueue = await prisma.queue.findFirst({
    where: {
      memberId: memberId,
      status: { in: ["WAITING", "CALLING", "SERVING"] },
      createdAt: { gte: today }
    },
    orderBy: { createdAt: "desc" }
  })

  let waitingBefore = 0
  if (myActiveQueue && myActiveQueue.status === "WAITING") {
    waitingBefore = await prisma.queue.count({
      where: {
        status: "WAITING",
        createdAt: {
          gte: today,
          lt: myActiveQueue.createdAt
        }
      }
    })
  }

  const currentlyServing = await prisma.queue.findFirst({
    where: {
      status: { in: ["CALLING", "SERVING"] },
      createdAt: { gte: today }
    },
    orderBy: { calledAt: "desc" }
  })

  const totalWaiting = await prisma.queue.count({
    where: {
      status: "WAITING",
      createdAt: { gte: today }
    }
  })

  res.render("anggota/queue", {
    myActiveQueue,
    waitingBefore,
    currentlyServing,
    totalWaiting,
    success: req.query.success || null
  })
}

/**
 * Anggota Mengambil Nomor Antrean Baru
 */
async function takeQueueNumber(req, res) {
  const memberId = req.session.user.id
  const { serviceType, notes } = req.body

  const validTypes = ["SETOR", "TARIK", "DAFTAR", "CS"]
  const type = validTypes.includes(serviceType) ? serviceType : "SETOR"

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.queue.findFirst({
    where: {
      memberId: memberId,
      status: { in: ["WAITING", "CALLING", "SERVING"] },
      createdAt: { gte: today }
    }
  })

  if (existing) {
    return res.redirect("/anggota/antrean?error=Anda+sudah+memiliki+tiket+antrean+aktif")
  }

  const queueNumber = await generateNextQueueNumber(type)

  await prisma.queue.create({
    data: {
      queueNumber,
      serviceType: type,
      status: "WAITING",
      memberId,
      notes: notes || null
    }
  })

  res.redirect("/anggota/antrean?success=Nomor+antrean+berhasil+diambil")
}

/**
 * Halaman Kasir: Manajemen & Pemanggilan Antrean
 */
async function renderCashierQueue(req, res) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const currentCalling = await prisma.queue.findFirst({
    where: {
      status: { in: ["CALLING", "SERVING"] },
      createdAt: { gte: today }
    },
    include: { member: true },
    orderBy: { calledAt: "desc" }
  })

  const waitingList = await prisma.queue.findMany({
    where: {
      status: "WAITING",
      createdAt: { gte: today }
    },
    include: { member: true },
    orderBy: { createdAt: "asc" }
  })

  const completedList = await prisma.queue.findMany({
    where: {
      status: { in: ["COMPLETED", "SKIPPED"] },
      createdAt: { gte: today }
    },
    include: { member: true },
    take: 10,
    orderBy: { completedAt: "desc" }
  })

  res.render("kasir/queue", {
    currentCalling,
    waitingList,
    completedList,
    cashierName: req.session.user.name
  })
}

/**
 * Kasir: Panggil Antrean Berikutnya
 */
async function callNextQueue(req, res) {
  const { serviceType, counterName } = req.body
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const where = {
    status: "WAITING",
    createdAt: { gte: today }
  }

  if (serviceType && serviceType !== "ALL") {
    where.serviceType = serviceType
  }

  const nextQueue = await prisma.queue.findFirst({
    where,
    orderBy: { createdAt: "asc" }
  })

  if (!nextQueue) {
    return res.redirect("/kasir/antrean?msg=Tidak+ada+antrean+menunggu")
  }

  await prisma.queue.updateMany({
    where: {
      status: "CALLING",
      createdAt: { gte: today }
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date()
    }
  })

  await prisma.queue.update({
    where: { id: nextQueue.id },
    data: {
      status: "CALLING",
      counterName: counterName || "Loket Kasir",
      calledAt: new Date()
    }
  })

  res.redirect("/kasir/antrean?called=" + nextQueue.queueNumber)
}

/**
 * Kasir: Panggil Ulang Nomor yang Sedang Aktif
 */
async function recallQueue(req, res) {
  const id = parseInt(req.params.id, 10)

  const queue = await prisma.queue.findUnique({
    where: { id }
  })

  if (queue) {
    await prisma.queue.update({
      where: { id },
      data: {
        calledAt: new Date(),
        status: "CALLING"
      }
    })
  }

  res.redirect("/kasir/antrean?called=" + (queue ? queue.queueNumber : ""))
}

/**
 * Kasir: Selesaikan Antrean
 */
async function completeQueue(req, res) {
  const id = parseInt(req.params.id, 10)

  await prisma.queue.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date()
    }
  })

  res.redirect("/kasir/antrean")
}

/**
 * Kasir: Lewati Antrean
 */
async function skipQueue(req, res) {
  const id = parseInt(req.params.id, 10)

  await prisma.queue.update({
    where: { id },
    data: {
      status: "SKIPPED",
      completedAt: new Date()
    }
  })

  res.redirect("/kasir/antrean")
}

/**
 * Layar Display TV Antrean Publik
 */
async function renderPublicDisplay(req, res) {
  res.render("public/queue_display")
}

/**
 * API Realtime State Antrean
 */
async function getQueueStateApi(req, res) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const currentlyServing = await prisma.queue.findFirst({
    where: {
      status: { in: ["CALLING", "SERVING"] },
      createdAt: { gte: today }
    },
    include: { member: true },
    orderBy: { calledAt: "desc" }
  })

  const waitingList = await prisma.queue.findMany({
    where: {
      status: "WAITING",
      createdAt: { gte: today }
    },
    take: 8,
    orderBy: { createdAt: "asc" }
  })

  const totalWaiting = await prisma.queue.count({
    where: {
      status: "WAITING",
      createdAt: { gte: today }
    }
  })

  res.json({
    currentlyServing,
    waitingList,
    totalWaiting,
    timestamp: new Date().toISOString()
  })
}

module.exports = {
  renderPublicKiosk,
  takePublicQueue,
  renderPublicTicket,
  renderMemberQueue,
  takeQueueNumber,
  renderCashierQueue,
  callNextQueue,
  recallQueue,
  completeQueue,
  skipQueue,
  renderPublicDisplay,
  getQueueStateApi
}
