module.exports = {
  apps: [{
    name: 'backend',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV:     'production',
      PORT:         3000,
      FRONTEND_URL: 'http://YOUR_FRONTEND_VM_IP',
      DB_HOST:      'YOUR_CLOUD_SQL_PUBLIC_IP',
      DB_PORT:      '3306',
      DB_USER:      'todo_user',
      DB_PASSWORD:  'your-strong-password-here',
      DB_NAME:      'tododb',
    }
  }]
};