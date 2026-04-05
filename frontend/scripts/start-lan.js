const { networkInterfaces } = require('os');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve } = require('path');
const { spawn } = require('child_process');

const envPath = resolve(__dirname, '../.env.local');

// 1. Find the local LAN IP
let localIp = '127.0.0.1';
const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4, internal, and VirtualBox/VMware/WSL interfaces if possible
    if (net.family === 'IPv4' && !net.internal) {
      if (!name.toLowerCase().includes('vbox') && !name.toLowerCase().includes('vmware') && !name.toLowerCase().includes('wsl')) {
        localIp = net.address;
        break; // Found primary LAN IP
      }
    }
  }
}

console.log(`\n\x1b[36m[LAN DEV]\x1b[0m Detected Local IP: \x1b[32m${localIp}\x1b[0m`);

// 2. Read and update .env.local
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf-8');
} else {
  // If no .env.local exists, create basic template
  envContent = `# IntoAEC Frontend — LAN Development Environment\n`;
}

const urlRegex = /http:\/\/[0-9\.]+:5000/g;

// If the vars exist, replace them. Otherwise, append them.
const replaceOrAppend = (key, suffix = '') => {
  const fullTarget = `http://${localIp}:5000${suffix}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${fullTarget}`);
  } else {
    envContent += `\n${key}=${fullTarget}`;
  }
};

replaceOrAppend('NEXT_PUBLIC_API_URL', '/api');
replaceOrAppend('NEXT_PUBLIC_WS_URL', '');
replaceOrAppend('NEXT_PUBLIC_BACKEND_URL', '');

writeFileSync(envPath, envContent.trim() + '\n');
console.log(`\x1b[36m[LAN DEV]\x1b[0m Updated \x1b[33m.env.local\x1b[0m to point backend calls to \x1b[32m${localIp}\x1b[0m\n`);

console.log(`\x1b[36m[LAN DEV]\x1b[0m Starting Next.js Dev Server on all interfaces (0.0.0.0)...`);
console.log(`\x1b[36m[INFO]\x1b[0m Once started, you can open \x1b[32mhttp://${localIp}:3000\x1b[0m on your phone or other device.\n`);

// 3. Start Next.js bound to 0.0.0.0
const nextProcess = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..'),
  shell: true,
  env: { ...process.env, LAN_IP: localIp }
});

nextProcess.on('close', (code) => {
  process.exit(code);
});
