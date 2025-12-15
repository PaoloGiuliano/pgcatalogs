module.exports = {
  apps: [
    {
      name: "addon-server",
      script: "server.js",

      // Watch & reload on changes (DEV ONLY)
      watch: false,

      // Do NOT watch these folders
      ignore_watch: ["node_modules", "generated", "data", ".git"],

      // Environment variables
      env: {
        NODE_ENV: "production",
        PORT: 7001,
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
