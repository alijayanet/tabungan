module.exports = {
  apps: [
    {
      name: "tabungan-app",
      script: "src/server.js",
      instances: 1, // Single instance karena Baileys WhatsApp bot & SQLite
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4001
      }
    }
  ]
};
