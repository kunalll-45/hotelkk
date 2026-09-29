module.exports = {
  apps: [{
    name: 'kks-food-house',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      // All other config (PORT, HOST, PUBLIC_IP, etc.) is read from .env by dotenv
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    error_file: './logs/error.log',
    out_file: './logs/output.log'
  }]
};
