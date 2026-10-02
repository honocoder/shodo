import { db } from "./db";
import { orderedNodes } from "./domain";

const download = (blob: Blob, filename: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "manuscript";
export async function projectBundle(projectId: string) {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found");
  const [nodes, contents, notes, sessions, snapshots] = await Promise.all([
    db.nodes.where("projectId").equals(projectId).toArray(),
    db.contents.where("projectId").equals(projectId).toArray(),
    db.notes.where("projectId").equals(projectId).toArray(),
    db.sessions.where("projectId").equals(projectId).toArray(),
    db.snapshots.where("projectId").equals(projectId).toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    nodes,
    contents,
    notes,
    sessions,
    snapshots,
  };
}
export async function exportBackup(projectId: string) {
  const b = await projectBundle(projectId);
  download(
    new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }),
    `${slug(b.project.title)}.shodo.json`,
  );
}
export async function exportMarkdown(projectId: string) {
  const b = await projectBundle(projectId),
    nodes = orderedNodes(b.nodes),
    byScene = new Map(b.contents.map((c) => [c.sceneId, c]));
  const lines = [`# ${b.project.title}`, ""];
  for (const chapter of nodes.filter((n) => n.type === "chapter")) {
    lines.push(`## ${chapter.title}`, "");
    for (const scene of nodes.filter(
      (n) => n.type === "scene" && n.parentId === chapter.id,
    )) {
      const text = byScene.get(scene.id)?.plainText ?? "";
      if (text) lines.push(text, "");
    }
  }
  download(
    new Blob([lines.join("\n")], { type: "text/markdown" }),
    `${slug(b.project.title)}.md`,
  );
}
export async function exportDocx(projectId: string) {
  const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");
  const b = await projectBundle(projectId),
    nodes = orderedNodes(b.nodes),
    byScene = new Map(b.contents.map((c) => [c.sceneId, c]));
  const children = [
    new Paragraph({
      text: b.project.title,
      heading: HeadingLevel.TITLE,
      pageBreakBefore: false,
    }),
  ];
  for (const chapter of nodes.filter((n) => n.type === "chapter")) {
    children.push(
      new Paragraph({
        text: chapter.title,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
    );
    for (const scene of nodes.filter(
      (n) => n.type === "scene" && n.parentId === chapter.id,
    ))
      for (const para of (byScene.get(scene.id)?.plainText ?? "").split("\n"))
        children.push(
          new Paragraph({
            text: para,
            spacing: { after: 180 },
            indent: { firstLine: 360 },
          }),
        );
  }
  const blob = await Packer.toBlob(
    new Document({ sections: [{ properties: {}, children }] }),
  );
  download(blob, `${slug(b.project.title)}.docx`);
}
