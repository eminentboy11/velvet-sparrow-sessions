module.exports = {
  apps: [{
    name: "juness",
    script: "index.js",
    cwd: "/root/web/junex-session",
    env: {
      PORT: 6898,
      DATAASE_URL: ""
    }
  }]
};
