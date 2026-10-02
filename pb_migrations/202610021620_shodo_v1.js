/// <reference path="../pb_data/types.d.ts" />

// Shodo V1 collections. Copy this directory next to the PocketBase executable;
// migrations are applied automatically on `serve` or with `migrate up`.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const ownerRule = "owner = @request.auth.id";
    const createRule =
      "@request.auth.id != '' && @request.body.owner = @request.auth.id";

    const shared = () => [
      {
        name: "owner",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: true,
      },
      { name: "clientId", type: "text", required: true, max: 80 },
      { name: "createdAt", type: "date" },
      { name: "updatedAt", type: "date" },
      { name: "deletedAt", type: "date" },
    ];

    const save = (name, fields, indexes = []) => {
      const collection = new Collection({
        type: "base",
        name,
        listRule: ownerRule,
        viewRule: ownerRule,
        createRule,
        updateRule: `${ownerRule} && @request.body.owner = @request.auth.id`,
        deleteRule: ownerRule,
        fields: [...shared(), ...fields],
        indexes: [
          `CREATE UNIQUE INDEX idx_${name}_clientId ON ${name} (clientId)`,
          ...indexes,
        ],
      });
      app.save(collection);
    };

    save("projects", [
      { name: "title", type: "text", required: true, max: 300 },
      { name: "subtitle", type: "text", max: 500 },
      { name: "description", type: "text", max: 10000 },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["novel", "novella", "short_story", "other"],
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["planning", "draft", "revision", "complete"],
      },
      { name: "targetWords", type: "number", min: 0 },
      { name: "dailyWordGoal", type: "number", min: 0 },
      { name: "currentWords", type: "number", min: 0 },
      { name: "lastOpenedAt", type: "date" },
      { name: "archivedAt", type: "date" },
      { name: "accent", type: "text", max: 32 },
    ]);

    save(
      "manuscript_nodes",
      [
        { name: "projectId", type: "text", required: true, max: 80 },
        { name: "parentId", type: "text", max: 80 },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["chapter", "scene"],
        },
        { name: "title", type: "text", required: true, max: 500 },
        { name: "order", type: "number", min: 0 },
        { name: "status", type: "text", max: 100 },
        { name: "synopsis", type: "text", max: 20000 },
        { name: "collapsed", type: "bool" },
      ],
      [
        "CREATE INDEX idx_manuscript_nodes_project ON manuscript_nodes (projectId)",
        "CREATE INDEX idx_manuscript_nodes_parent ON manuscript_nodes (parentId)",
      ],
    );

    save(
      "scene_contents",
      [
        { name: "sceneId", type: "text", required: true, max: 80 },
        { name: "projectId", type: "text", required: true, max: 80 },
        { name: "content", type: "json", required: true },
        { name: "plainText", type: "text", max: 10000000 },
        { name: "wordCount", type: "number", min: 0 },
        { name: "characterCount", type: "number", min: 0 },
      ],
      [
        "CREATE UNIQUE INDEX idx_scene_contents_scene ON scene_contents (sceneId)",
        "CREATE INDEX idx_scene_contents_project ON scene_contents (projectId)",
      ],
    );

    save(
      "notes",
      [
        { name: "projectId", type: "text", required: true, max: 80 },
        { name: "title", type: "text", required: true, max: 1000 },
        { name: "content", type: "text", max: 1000000 },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "Character",
            "Plot",
            "Research",
            "Idea",
            "To review",
            "General",
          ],
        },
        { name: "tags", type: "json" },
        { name: "pinned", type: "bool" },
        { name: "attachedNodeId", type: "text", max: 80 },
      ],
      [
        "CREATE INDEX idx_notes_project ON notes (projectId)",
        "CREATE INDEX idx_notes_attached ON notes (attachedNodeId)",
      ],
    );

    save(
      "writing_sessions",
      [
        { name: "projectId", type: "text", required: true, max: 80 },
        { name: "manuscriptNodeId", type: "text", max: 80 },
        { name: "startedAt", type: "date", required: true },
        { name: "endedAt", type: "date" },
        { name: "initialWordCount", type: "number", min: 0 },
        { name: "finalWordCount", type: "number", min: 0 },
        { name: "wordsWritten", type: "number", min: 0 },
        { name: "durationSeconds", type: "number", min: 0 },
        {
          name: "goalType",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["none", "duration", "words"],
        },
        { name: "goalValue", type: "number", min: 0 },
        { name: "intention", type: "text", max: 5000 },
      ],
      [
        "CREATE INDEX idx_writing_sessions_project ON writing_sessions (projectId)",
      ],
    );

    save(
      "snapshots",
      [
        { name: "projectId", type: "text", required: true, max: 80 },
        { name: "manuscriptNodeId", type: "text", required: true, max: 80 },
        { name: "name", type: "text", required: true, max: 1000 },
        { name: "content", type: "json", required: true },
        { name: "plainText", type: "text", max: 10000000 },
        { name: "wordCount", type: "number", min: 0 },
        {
          name: "reason",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["manual", "session_start", "automatic"],
        },
      ],
      [
        "CREATE INDEX idx_snapshots_project ON snapshots (projectId)",
        "CREATE INDEX idx_snapshots_node ON snapshots (manuscriptNodeId)",
      ],
    );
  },
  (app) => {
    for (const name of [
      "snapshots",
      "writing_sessions",
      "notes",
      "scene_contents",
      "manuscript_nodes",
      "projects",
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // Already absent.
      }
    }
  },
);
