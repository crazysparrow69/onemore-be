import { spawn } from 'node:child_process';

const child = spawn('nest', ['start', '--watch'], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
