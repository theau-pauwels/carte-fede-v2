import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0', // accessible depuis l’extérieur
    port: 3000,
    strictPort: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '::1',
      'frontend',
      '100.95.195.59',
      'carte-test.fede.fpms.ac.be',
      'carte.fede.fpms.ac.be',
      'fede.fpms.ac.be',
    ],
    hmr: {
      protocol: 'wss',
      clientPort: 443
    }
  }
});
