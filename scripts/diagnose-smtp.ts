import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import * as tls from 'node:tls';

interface DiagnosticStep {
  name: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  details?: Record<string, any>;
  error?: string;
}

async function diagnoseSmtp(): Promise<void> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const isSecure = port === 465 || process.env.SMTP_SECURE === 'true';

  console.log('================================================================');
  console.log(` AI Career OS — Standalone SMTP & Egress Diagnostics`);
  console.log(` Target Host: ${host}:${port} (Secure SMTPS: ${isSecure})`);
  console.log(` Timestamp:   ${new Date().toISOString()}`);
  console.log('================================================================\n');

  const steps: DiagnosticStep[] = [];

  // Step 1: IPv4 DNS Resolution
  let ipv4Addresses: string[] = [];
  const startDns4 = Date.now();
  try {
    ipv4Addresses = await dns.resolve4(host);
    steps.push({
      name: 'DNS Resolution (IPv4)',
      status: 'SUCCESS',
      durationMs: Date.now() - startDns4,
      details: { addresses: ipv4Addresses },
    });
  } catch (err: any) {
    steps.push({
      name: 'DNS Resolution (IPv4)',
      status: 'FAILED',
      durationMs: Date.now() - startDns4,
      error: err.message,
    });
  }

  // Step 2: IPv6 DNS Resolution
  let ipv6Addresses: string[] = [];
  const startDns6 = Date.now();
  try {
    ipv6Addresses = await dns.resolve6(host);
    steps.push({
      name: 'DNS Resolution (IPv6)',
      status: 'SUCCESS',
      durationMs: Date.now() - startDns6,
      details: { addresses: ipv6Addresses },
    });
  } catch (err: any) {
    steps.push({
      name: 'DNS Resolution (IPv6)',
      status: 'FAILED',
      durationMs: Date.now() - startDns6,
      error: err.message,
    });
  }

  // Step 3: Raw TCP Connection (IPv4 Forced)
  let targetIp = ipv4Addresses[0];
  if (targetIp) {
    const startTcp = Date.now();
    await new Promise<void>((resolve) => {
      const socket = net.connect({ host: targetIp, port, family: 4, timeout: 5000 }, () => {
        steps.push({
          name: 'Raw TCP Connection (IPv4)',
          status: 'SUCCESS',
          durationMs: Date.now() - startTcp,
          details: { targetIp, port, family: 4 },
        });
        socket.destroy();
        resolve();
      });

      socket.on('error', (err) => {
        steps.push({
          name: 'Raw TCP Connection (IPv4)',
          status: 'FAILED',
          durationMs: Date.now() - startTcp,
          error: err.message,
        });
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        steps.push({
          name: 'Raw TCP Connection (IPv4)',
          status: 'FAILED',
          durationMs: Date.now() - startTcp,
          error: 'Connection timed out after 5000ms',
        });
        socket.destroy();
        resolve();
      });
    });
  }

  // Step 4: Raw TCP Connection (IPv6 Diagnostic Check)
  if (ipv6Addresses.length > 0) {
    const startTcp6 = Date.now();
    await new Promise<void>((resolve) => {
      const socket = net.connect({ host: ipv6Addresses[0], port, family: 6, timeout: 5000 }, () => {
        steps.push({
          name: 'Raw TCP Connection (IPv6 Egress Test)',
          status: 'SUCCESS',
          durationMs: Date.now() - startTcp6,
          details: { targetIp: ipv6Addresses[0], port, family: 6 },
        });
        socket.destroy();
        resolve();
      });

      socket.on('error', (err) => {
        steps.push({
          name: 'Raw TCP Connection (IPv6 Egress Test)',
          status: 'FAILED',
          durationMs: Date.now() - startTcp6,
          error: `${err.message} (Expected on platforms like Render lacking outbound IPv6 routing)`,
        });
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        steps.push({
          name: 'Raw TCP Connection (IPv6 Egress Test)',
          status: 'FAILED',
          durationMs: Date.now() - startTcp6,
          error: 'IPv6 Connection timed out (Egress unroutable)',
        });
        socket.destroy();
        resolve();
      });
    });
  }

  // Step 5: TLS Handshake & SMTP Greeting (IPv4)
  if (targetIp) {
    const startTls = Date.now();
    await new Promise<void>((resolve) => {
      const tlsSocket = tls.connect(
        {
          host: targetIp,
          port,
          servername: host,
          family: 4,
          rejectUnauthorized: false,
          timeout: 7000,
        },
        () => {
          let bannerReceived = false;
          tlsSocket.on('data', (data) => {
            if (!bannerReceived) {
              bannerReceived = true;
              const greeting = data.toString('utf8').trim();
              steps.push({
                name: 'TLS Handshake & SMTP Greeting (IPv4 SMTPS)',
                status: 'SUCCESS',
                durationMs: Date.now() - startTls,
                details: {
                  cipher: tlsSocket.getCipher(),
                  protocol: tlsSocket.getProtocol(),
                  smtpGreetingBanner: greeting,
                },
              });
              tlsSocket.write('EHLO client.ai-career-os.local\r\n');
              setTimeout(() => {
                tlsSocket.destroy();
                resolve();
              }, 500);
            }
          });
        },
      );

      tlsSocket.on('error', (err) => {
        steps.push({
          name: 'TLS Handshake & SMTP Greeting (IPv4 SMTPS)',
          status: 'FAILED',
          durationMs: Date.now() - startTls,
          error: err.message,
        });
        tlsSocket.destroy();
        resolve();
      });

      tlsSocket.on('timeout', () => {
        steps.push({
          name: 'TLS Handshake & SMTP Greeting (IPv4 SMTPS)',
          status: 'FAILED',
          durationMs: Date.now() - startTls,
          error: 'TLS handshake / SMTP greeting timed out after 7000ms',
        });
        tlsSocket.destroy();
        resolve();
      });
    });
  }

  // Print Summary Table
  console.log('DIAGNOSTIC RESULTS:\n');
  steps.forEach((step, index) => {
    const icon = step.status === 'SUCCESS' ? '✅' : step.status === 'FAILED' ? '❌' : '⚠️';
    console.log(`${index + 1}. ${icon} [${step.status}] ${step.name} (${step.durationMs}ms)`);
    if (step.details) {
      console.log('   Details:', JSON.stringify(step.details, null, 2));
    }
    if (step.error) {
      console.log('   Error Details:', step.error);
    }
    console.log('');
  });

  console.log('================================================================');
  const allPassed = steps.filter((s) => !s.name.includes('IPv6')).every((s) => s.status === 'SUCCESS');
  if (allPassed) {
    console.log('✅ SUMMARY: SMTP IPv4 Egress & TLS Handshake fully functional!');
  } else {
    console.log('❌ SUMMARY: Egress network or authentication issues detected.');
  }
  console.log('================================================================\n');
}

void diagnoseSmtp();
