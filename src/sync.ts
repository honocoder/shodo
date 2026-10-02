import PocketBase from "pocketbase";
import { db } from "./db";
import { now, uid, type Snapshot } from "./domain";

const url = import.meta.env.VITE_POCKETBASE_URL as string | undefined;
export const pocketbase = url ? new PocketBase(url) : null;
export type ConnectionState =
  "local" | "offline" | "syncing" | "synced" | "error";
const tableMap: Record<string, keyof typeof db> = {
  projects: "projects",
  manuscript_nodes: "nodes",
  scene_contents: "contents",
  notes: "notes",
  writing_sessions: "sessions",
  snapshots: "snapshots",
};

export async function syncOutbox(onState?: (s: ConnectionState) => void) {
  if (!pocketbase) {
    onState?.("local");
    return;
  }
  if (!navigator.onLine) {
    onState?.("offline");
    return;
  }
  if (!pocketbase.authStore.isValid) {
    onState?.("local");
    return;
  }
  onState?.("syncing");
  const items = await db.outbox.orderBy("createdAt").toArray();
  for (const item of items) {
    try {
      const table = db[tableMap[item.entity]] as any;
      const local = await table.get(item.entityId);
      if (!local) {
        await db.outbox.delete(item.id);
        continue;
      }
      const collection = pocketbase.collection(item.entity);
      if (item.operation === "delete" && local.remoteId)
        await collection.delete(local.remoteId);
      else {
        const payload = {
          ...local,
          clientId: local.id,
          owner: pocketbase.authStore.record?.id,
        };
        delete payload.id;
        delete payload.remoteId;
        delete payload.syncStatus;
        delete payload.lastSyncedAt;
        const remote = local.remoteId
          ? await collection.update(local.remoteId, payload)
          : await collection.create(payload);
        await table.update(local.id, {
          remoteId: remote.id,
          syncStatus: "synced",
          lastSyncedAt: now(),
        });
      }
      await db.outbox.delete(item.id);
    } catch (error) {
      await db.outbox.update(item.id, {
        attempts: item.attempts + 1,
        error: error instanceof Error ? error.message : "Sync failed",
      });
      onState?.("error");
      return;
    }
  }
  await reconcileRemote();
  onState?.("synced");
}

async function reconcileRemote() {
  if (!pocketbase?.authStore.isValid) return;
  for (const [collectionName, tableName] of Object.entries(tableMap)) {
    const table = db[tableName] as any;
    const records = await pocketbase.collection(collectionName).getFullList({
      filter: `owner = "${pocketbase.authStore.record?.id}"`,
    });
    for (const remote of records) {
      const clientId = String(remote.clientId || "");
      if (!clientId) continue;
      const local = await table.get(clientId);
      const remoteUpdated = Date.parse(
        String(remote.updatedAt || remote.updated),
      );
      const localUpdated = local ? Date.parse(local.updatedAt) : 0;
      if (local?.syncStatus === "pending" && remoteUpdated > localUpdated) {
        if (collectionName === "scene_contents") {
          const timestamp = now();
          const conflict: Snapshot = {
            id: uid(),
            projectId: String(remote.projectId),
            manuscriptNodeId: String(remote.sceneId),
            name: `Conflict copy · ${new Date(remoteUpdated).toLocaleString()}`,
            content: remote.content,
            plainText: String(remote.plainText || ""),
            wordCount: Number(remote.wordCount || 0),
            reason: "automatic",
            createdAt: timestamp,
            updatedAt: timestamp,
            syncStatus: "pending",
          };
          await db.snapshots.put(conflict);
        }
        continue;
      }
      if (!local || remoteUpdated > localUpdated) {
        const data = { ...remote } as Record<string, unknown>;
        for (const key of [
          "collectionId",
          "collectionName",
          "expand",
          "owner",
          "clientId",
          "created",
          "updated",
        ])
          delete data[key];
        data.id = clientId;
        data.remoteId = remote.id;
        data.syncStatus = "synced";
        data.lastSyncedAt = now();
        await table.put(data);
      }
    }
  }
}

export async function signIn(email: string, password: string) {
  if (!pocketbase) throw new Error("PocketBase is not configured.");
  return pocketbase.collection("users").authWithPassword(email, password);
}
export function signOut() {
  pocketbase?.authStore.clear();
}
