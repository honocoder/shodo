# PocketBase schema

Shodo is fully usable without PocketBase. When remote sync is wanted, create the
collections below in PocketBase. Every collection is private: list, view, create,
update, and delete rules must be restricted to the authenticated owner.

Use this rule for `projects`:

```text
owner = @request.auth.id
```

Use this rule for every child collection:

```text
owner = @request.auth.id
```

Never put a PocketBase administrator token in the browser application.

## Collections

All dates below are PocketBase `date` fields. `data` is a PocketBase `json` field.
`clientId` is Shodo's UUID and remains independent from PocketBase's built-in
record `id`.

| Collection         | Fields                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`         | `owner` relation(users, required), `clientId` text(unique), `title` text(required), `subtitle` text, `description` text, `type` select(novel/novella/short_story/other), `status` select(planning/draft/revision/complete), `targetWords` number, `dailyWordGoal` number, `currentWords` number, `lastOpenedAt` date, `archivedAt` date, `accent` text, `createdAt` date, `updatedAt` date, `deletedAt` date |
| `manuscript_nodes` | `owner` relation(users, required), `clientId` text(unique), `projectId` text(index), `parentId` text(index), `type` select(chapter/scene), `title` text, `order` number, `status` text, `synopsis` text, `collapsed` bool, `createdAt` date, `updatedAt` date, `deletedAt` date                                                                                                                              |
| `scene_contents`   | `owner` relation(users, required), `clientId` text(unique), `sceneId` text(unique), `projectId` text(index), `content` json, `plainText` text, `wordCount` number, `characterCount` number, `createdAt` date, `updatedAt` date, `deletedAt` date                                                                                                                                                             |
| `notes`            | `owner` relation(users, required), `clientId` text(unique), `projectId` text(index), `title` text, `content` text, `type` select(Character/Plot/Research/Idea/To review/General), `tags` json, `pinned` bool, `attachedNodeId` text(index), `createdAt` date, `updatedAt` date, `deletedAt` date                                                                                                             |
| `writing_sessions` | `owner` relation(users, required), `clientId` text(unique), `projectId` text(index), `manuscriptNodeId` text, `startedAt` date, `endedAt` date, `initialWordCount` number, `finalWordCount` number, `wordsWritten` number, `durationSeconds` number, `goalType` select(none/duration/words), `goalValue` number, `intention` text, `createdAt` date, `updatedAt` date, `deletedAt` date                      |
| `snapshots`        | `owner` relation(users, required), `clientId` text(unique), `projectId` text(index), `manuscriptNodeId` text(index), `name` text, `content` json, `plainText` text, `wordCount` number, `reason` select(manual/session_start/automatic), `createdAt` date, `updatedAt` date, `deletedAt` date                                                                                                                |

Enable email/password authentication on the built-in `users` auth collection.
Shodo uses PocketBase's normal user auth store and never needs administrator
credentials.
