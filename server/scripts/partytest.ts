// Test de party + curación de aliado: A invita a B, B acepta, ambos ven el
// grupo, y A (médico) cura a B (le llega el fx de curación). Server arriba.
//   npx tsx scripts/partytest.ts
import { io, type Socket } from 'socket.io-client';
import { CONFIG } from '../src/config.js';

const base = `http://localhost:${CONFIG.port}/game`;
const mk = (userId: string, username: string, classId: string) =>
  io(base, { transports: ['websocket'] }).on('connect', function (this: Socket) {
    this.emit('join', { userId, username, classId, charId: userId });
  });

const a = mk('party-A', 'Lider', 'medico_nano');
const b = mk('party-B', 'Miembro', 'cuchilla');

let bInvited = false, aPartyN = 0, bPartyN = 0, bHealFx = false;

b.on('party_invited', (m) => { bInvited = true; console.log(`• B recibió invitación de ${m.fromUsername}`); b.emit('party_accept'); });
a.on('party', (m) => { aPartyN = m.members.length; });
b.on('party', (m) => { bPartyN = m.members.length; });
b.on('fx', (fx) => { if (fx.kind === 'heal') bHealFx = true; });

// A invita a B apenas ambos están adentro
setTimeout(() => { console.log('• A invita a B'); a.emit('party_invite', { targetUserId: 'party-B' }); }, 600);
// Una vez en party, A cura a B
setTimeout(() => { console.log('• A cura a B'); a.emit('cast', { spellId: 'nano_reparacion', allyUserId: 'party-B' }); }, 1600);

setTimeout(() => {
  console.log('\n── Resultado ──');
  console.log(`  B fue invitado:        ${bInvited ? '✓' : '✗'}`);
  console.log(`  A ve 2 en el grupo:    ${aPartyN === 2 ? '✓' : '✗'} (${aPartyN})`);
  console.log(`  B ve 2 en el grupo:    ${bPartyN === 2 ? '✓' : '✗'} (${bPartyN})`);
  console.log(`  curación llegó a B:    ${bHealFx ? '✓' : '✗'}`);
  const ok = bInvited && aPartyN === 2 && bPartyN === 2 && bHealFx;
  console.log(`\n  ${ok ? '✓ PARTY + CURACIÓN DE ALIADO OK' : '✗ FALLÓ'}`);
  a.close(); b.close();
  process.exit(ok ? 0 : 1);
}, 3000);
