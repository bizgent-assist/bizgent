import { AuditLog } from '../models/index.js';

/** Append-only audit record for every financial or permission-relevant action. */
export async function audit({ businessId, actorType, actorId, action, entityType, entityId, details, ip }) {
  try {
    await AuditLog.create({
      businessId, actorType, actorId: actorId ? String(actorId) : undefined, action,
      entityType, entityId: entityId ? String(entityId) : undefined, details, ip,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', action, err.message);
  }
}
