module.exports = {
  apps: [
    {
      name: "poster-server",
      script: "server.js",

      // Watch & reload on changes (DEV ONLY)
      watch: false,

      // Environment variables
      env: {
        NODE_ENV: "production",
        PORT: 7000,
      },

      // Restart behavior
      autorestart: true,
      max_restarts: 10,

      // Logs
      error_file: "logs/error.log",
      out_file: "logs/output.log",
      time: true,
    },
  ],
};
