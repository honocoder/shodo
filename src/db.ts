import Dexie, { type EntityTable } from "dexie";
import type {
  ManuscriptNode,
  Note,
  OutboxItem,
  Preferences,
  Project,
  SceneContent,
  Snapshot,
  WritingSession,
} from "./domain";
import { emptyDoc, now, uid } from "./domain";

export class ShodoDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  nodes!: EntityTable<ManuscriptNode, "id">;
  contents!: EntityTable<SceneContent, "id">;
  notes!: EntityTable<Note, "id">;
  sessions!: EntityTable<WritingSession, "id">;
  snapshots!: EntityTable<Snapshot, "id">;
  outbox!: EntityTable<OutboxItem, "id">;
  preferences!: EntityTable<{ id: string; value: Preferences }, "id">;
  meta!: EntityTable<{ key: string; value: string }, "key">;
  constructor(name = "shodo") {
    super(name);
    this.version(1).stores({
      projects: "id,updatedAt,lastOpenedAt,syncStatus",
      nodes: "id,projectId,parentId,type,order,updatedAt",
      contents: "id,&sceneId,projectId,updatedAt",
      notes: "id,projectId,type,attachedNodeId,pinned,updatedAt",
      sessions: "id,projectId,startedAt,endedAt",
      snapshots: "id,projectId,manuscriptNodeId,createdAt",
      outbox: "id,entity,entityId,createdAt",
      preferences: "id",
      meta: "key",
    });
  }
}
export const db = new ShodoDB();

export async function queue(
  entity: string,
  entityId: string,
  operation: "upsert" | "delete" = "upsert",
) {
  const existing = await db.outbox.where({ entity, entityId }).first();
  if (existing)
    return db.outbox.update(existing.id, {
      operation,
      createdAt: now(),
      error: undefined,
    });
  return db.outbox.add({
    id: uid(),
    entity,
    entityId,
    operation,
    createdAt: now(),
    attempts: 0,
  });
}
export async function createProject(input: {
  title: string;
  type: Project["type"];
  targetWords?: number;
  dailyWordGoal?: number;
}) {
  const timestamp = now(),
    projectId = uid(),
    chapterId = uid(),
    sceneId = uid();
  const project: Project = {
    id: projectId,
    ...input,
    status: "draft",
    currentWords: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    syncStatus: "pending",
    accent: "#a33b2b",
  };
  const chapter: ManuscriptNode = {
    id: chapterId,
    projectId,
    type: "chapter",
    title: "Chapter 1",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  const scene: ManuscriptNode = {
    id: sceneId,
    projectId,
    parentId: chapterId,
    type: "scene",
    title: "Scene 1",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  const content: SceneContent = {
    id: uid(),
    sceneId,
    projectId,
    content: emptyDoc,
    plainText: "",
    wordCount: 0,
    characterCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  await db.transaction(
    "rw",
    [db.projects, db.nodes, db.contents, db.outbox, db.meta],
    async () => {
      await db.projects.add(project);
      await db.nodes.bulkAdd([chapter, scene]);
      await db.contents.add(content);
      await Promise.all([
        queue("projects", projectId),
        queue("manuscript_nodes", chapterId),
        queue("manuscript_nodes", sceneId),
        queue("scene_contents", content.id),
      ]);
      await db.meta.put({
        key: "lastLocation",
        value: JSON.stringify({ projectId, sceneId }),
      });
    },
  );
  return { project, sceneId };
}

export async function recalculateProject(projectId: string) {
  const contents = await db.contents
    .where("projectId")
    .equals(projectId)
    .toArray();
  const currentWords = contents.reduce((sum, item) => sum + item.wordCount, 0);
  await db.projects.update(projectId, {
    currentWords,
    updatedAt: now(),
    syncStatus: "pending",
  });
  await queue("projects", projectId);
  return currentWords;
}
