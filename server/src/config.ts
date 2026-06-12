import 'dotenv/config';

export const CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  adminToken: process.env.ADMIN_TOKEN ?? 'cambiame',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  tickRate: 20,            // simulaciones por segundo (IA, combate)
  snapshotRate: 15,        // snapshots de zona por segundo enviados a clientes
  adminRate: 4,            // refresco de métricas de consola por segundo
};

export const TICK_MS = 1000 / CONFIG.tickRate;
export const SNAPSHOT_MS = 1000 / CONFIG.snapshotRate;
export const ADMIN_MS = 1000 / CONFIG.adminRate;
