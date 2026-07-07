module.exports = {
  apps: [
    {
      name: "todo-backend",
      script: "src/index.js",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        // Set this to your frontend VM's IP to lock down CORS
        FRONTEND_URL: process.env.FRONTEND_URL || "*",
      },
    },
  ],
};
