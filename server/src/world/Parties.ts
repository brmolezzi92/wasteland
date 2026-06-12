import { randomUUID } from 'node:crypto';
import type { World, WorldNet } from './World.js';

interface Party {
  id: string;
  leaderId: string;
  members: string[];   // userIds, en orden (el primero suele ser el líder)
}

// Grupos (party): invitaciones, miembros, líder. Autoritativo en el servidor.
// Habilita curaciones de aliado (ver World.handleCast).
export class PartyManager {
  private parties = new Map<string, Party>();
  private invites = new Map<string, string>();   // targetUserId → fromUserId (invitación pendiente)

  constructor(private world: World, private net: WorldNet) {}

  private partyOf(userId: string): Party | null {
    const p = this.world.getByUser(userId);
    return p?.partyId ? this.parties.get(p.partyId) ?? null : null;
  }

  // userIds de los compañeros de party de un jugador (incluyéndolo).
  coMembers(userId: string): string[] {
    const party = this.partyOf(userId);
    return party ? party.members.slice() : [userId];
  }

  invite(fromId: string, targetId: string) {
    const from = this.world.getByUser(fromId);
    const target = this.world.getByUser(targetId);
    if (!from || !target || fromId === targetId) return;
    if (target.partyId) { this.net.emitToUser(fromId, 'log', { msg: `${target.username} ya está en un grupo.`, color: '#c8a050' }); return; }

    // Si el que invita no tiene party, se crea con él como líder.
    let party = this.partyOf(fromId);
    if (!party) {
      const id = randomUUID().slice(0, 8);
      party = { id, leaderId: fromId, members: [fromId] };
      this.parties.set(id, party);
      from.partyId = id;
    } else if (party.leaderId !== fromId) {
      // Solo el líder invita (simplificación).
      this.net.emitToUser(fromId, 'log', { msg: 'Solo el líder puede invitar.', color: '#c8a050' });
      return;
    }

    this.invites.set(targetId, fromId);
    this.net.emitToUser(targetId, 'party_invited', { fromUserId: fromId, fromUsername: from.username });
    this.net.emitToUser(fromId, 'log', { msg: `Invitaste a ${target.username} al grupo.`, color: '#66e0c0' });
    this.broadcast(party);
  }

  accept(targetId: string) {
    const fromId = this.invites.get(targetId);
    if (!fromId) return;
    this.invites.delete(targetId);
    const target = this.world.getByUser(targetId);
    const party = this.partyOf(fromId);
    if (!target || !party || target.partyId) return;
    party.members.push(targetId);
    target.partyId = party.id;
    this.net.emitToUser(targetId, 'log', { msg: 'Te uniste al grupo.', color: '#66e0c0' });
    this.broadcast(party);
  }

  decline(targetId: string) {
    const fromId = this.invites.get(targetId);
    if (!fromId) return;
    this.invites.delete(targetId);
    this.net.emitToUser(fromId, 'log', { msg: 'Rechazaron la invitación al grupo.', color: '#c8a050' });
  }

  kick(leaderId: string, targetId: string) {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId || leaderId === targetId) return;
    this.removeMember(party, targetId);
    this.net.emitToUser(targetId, 'party', { leaderId: '', members: [] });
    this.net.emitToUser(targetId, 'log', { msg: 'Te sacaron del grupo.', color: '#ff6060' });
  }

  leave(userId: string) {
    const party = this.partyOf(userId);
    if (!party) return;
    this.removeMember(party, userId);
    this.net.emitToUser(userId, 'party', { leaderId: '', members: [] });
  }

  private removeMember(party: Party, userId: string) {
    party.members = party.members.filter(id => id !== userId);
    const p = this.world.getByUser(userId);
    if (p) p.partyId = null;

    if (party.members.length <= 1) {
      // El grupo se disuelve si queda 1 (o 0).
      for (const id of party.members) {
        const m = this.world.getByUser(id);
        if (m) m.partyId = null;
        this.net.emitToUser(id, 'party', { leaderId: '', members: [] });
        this.net.emitToUser(id, 'log', { msg: 'El grupo se disolvió.', color: '#c8a050' });
      }
      this.parties.delete(party.id);
      return;
    }
    // Si se fue el líder, el siguiente miembro pasa a líder.
    if (party.leaderId === userId) party.leaderId = party.members[0];
    this.broadcast(party);
  }

  handleDisconnect(userId: string) {
    this.invites.delete(userId);
    this.leave(userId);
  }

  private broadcast(party: Party) {
    const members = party.members
      .map(id => { const p = this.world.getByUser(id); return p ? { userId: id, username: p.username } : null; })
      .filter(Boolean) as { userId: string; username: string }[];
    for (const id of party.members)
      this.net.emitToUser(id, 'party', { leaderId: party.leaderId, members });
  }
}
