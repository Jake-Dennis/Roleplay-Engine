export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupGracefulShutdown } = await import('@/lib/shutdown');
    const { runStartupChecks } = await import('@/lib/startup-check');

    await runStartupChecks();
    setupGracefulShutdown();
  }
}
