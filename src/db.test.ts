import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ShodoDB } from "./db";
import { now, uid } from "./domain";

describe("offline persistence and outbox", () => {
  const databases: ShodoDB[] = [];
  afterEach(async () => {
    for (const db of databases) {
      db.close();
      await db.delete();
    }
    databases.length = 0;
  });
  it("persists scene content locally without a backend", async () => {
    const name = `test-${uid()}`,
      first = new ShodoDB(name);
    databases.push(first);
    const timestamp = now();
    await first.contents.add({
      id: "content",
      sceneId: "scene",
      projectId: "project",
      content: { type: "doc" },
      plainText: "Safe offline.",
      wordCount: 2,
      characterCount: 13,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncStatus: "pending",
    });
    first.close();
    const reopened = new ShodoDB(name);
    databases.push(reopened);
    expect((await reopened.contents.get("content"))?.plainText).toBe(
      "Safe offline.",
    );
  });
  it("keeps mutations durable in the outbox", async () => {
    const database = new ShodoDB(`test-${uid()}`);
    databases.push(database);
    await database.outbox.add({
      id: "q",
      entity: "notes",
      entityId: "n",
      operation: "upsert",
      createdAt: now(),
      attempts: 0,
    });
    expect(await database.outbox.count()).toBe(1);
  });
});
