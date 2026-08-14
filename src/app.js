const path = require("path")
const express = require("express")
const session = require("express-session")
const dotenv = require("dotenv")
const prisma = require("./config/prisma")

dotenv.config()

const authRoutes = require("./routes/authRoutes")
const adminRoutes = require("./routes/adminRoutes")
const kasirRoutes = require("./routes/kasirRoutes")
const anggotaRoutes = require("./routes/anggotaRoutes")

const app = express()

app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.use(express.static(path.join(__dirname, "..", "public")))

app.use(
  session({
    secret: process.env.SESSION_SECRET || "tabungan_masyarakat_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 4
    }
  })
)

app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "APP_NAME" }
    })
    res.locals.appName = (setting && setting.value) || process.env.APP_NAME || "Aplikasi Tabungan Masyarakat"
  } catch (error) {
    res.locals.appName = process.env.APP_NAME || "Aplikasi Tabungan Masyarakat"
  }

  next()
})

const {
  renderPublicKiosk,
  takePublicQueue,
  renderPublicTicket,
  renderPublicDisplay,
  getQueueStateApi
} = require("./controllers/queueController")

app.use("/", authRoutes)
app.use("/admin", adminRoutes)
app.use("/kasir", kasirRoutes)
app.use("/anggota", anggotaRoutes)

// Kiosk Antrean Mandiri Umum (Siapapun / Calon Anggota)
app.get("/antrean", renderPublicKiosk)
app.get("/antrean/kios", renderPublicKiosk)
app.post("/antrean/ambil", takePublicQueue)
app.get("/antrean/tiket/:id", renderPublicTicket)

// Display TV Layar Antrean Publik & Realtime API
app.get("/antrean/display", renderPublicDisplay)
app.get("/api/queue/state", getQueueStateApi)

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login")
  }
  if (req.session.user.role === "ADMIN") {
    return res.redirect("/admin/dashboard")
  }
  if (req.session.user.role === "KASIR") {
    return res.redirect("/kasir/dashboard")
  }
  return res.redirect("/anggota/dashboard")
})

module.exports = app
