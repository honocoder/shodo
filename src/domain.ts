import type { JSONContent } from "@tiptap/react";

export type SyncStatus = "synced" | "pending" | "error";
export type NodeType = "chapter" | "scene";
export type NoteType =
  "Character" | "Plot" | "Research" | "Idea" | "To review" | "General";
export type ProjectStatus = "planning" | "draft" | "revision" | "complete";
export interface Syncable {
  id: string;
  remoteId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
}
export interface Project extends Syncable {
  title: string;
  subtitle?: string;
  description?: string;
  type: "novel" | "novella" | "short_story" | "other";
  status: ProjectStatus;
  targetWords?: number;
  dailyWordGoal?: number;
  currentWords: number;
  lastOpenedAt: string;
  archivedAt?: string;
  accent?: string;
}
export interface ManuscriptNode extends Syncable {
  projectId: string;
  parentId?: string;
  type: NodeType;
  title: string;
  order: number;
  status?: string;
  synopsis?: string;
  collapsed?: boolean;
}
export interface SceneContent extends Syncable {
  sceneId: string;
  projectId: string;
  content: JSONContent;
  plainText: string;
  wordCount: number;
  characterCount: number;
}
export interface Note extends Syncable {
  projectId: string;
  title: string;
  content: string;
  type: NoteType;
  tags: string[];
  pinned: boolean;
  attachedNodeId?: string;
}
export interface WritingSession extends Syncable {
  projectId: string;
  manuscriptNodeId?: string;
  startedAt: string;
  endedAt?: string;
  initialWordCount: number;
  finalWordCount?: number;
  wordsWritten: number;
  durationSeconds: number;
  goalType: "none" | "duration" | "words";
  goalValue?: number;
  intention?: string;
}
export interface Snapshot extends Syncable {
  projectId: string;
  manuscriptNodeId: string;
  name: string;
  content: JSONContent;
  plainText: string;
  wordCount: number;
  reason: "manual" | "session_start" | "automatic";
}
export interface OutboxItem {
  id: string;
  entity: string;
  entityId: string;
  operation: "upsert" | "delete";
  createdAt: string;
  attempts: number;
  error?: string;
}
export interface Preferences {
  writingFont: "serif" | "sans" | "mono";
  textSize: number;
  lineHeight: number;
  editorWidth: number;
  typewriterDefault: boolean;
  focusHud: "nothing" | "timer" | "progress";
}
export const defaultPreferences: Preferences = {
  writingFont: "serif",
  textSize: 21,
  lineHeight: 1.82,
  editorWidth: 700,
  typewriterDefault: false,
  focusHud: "progress",
};

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const emptyDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export function countWords(text: string) {
  return text.trim()
    ? (text.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length
    : 0;
}
export function progress(current: number, target?: number) {
  return target && target > 0
    ? Math.min(100, Math.round((current / target) * 100))
    : 0;
}
export function sessionDelta(initial: number, final: number) {
  return Math.max(0, final - initial);
}
export function orderedNodes(nodes: ManuscriptNode[]) {
  return [...nodes].sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );
}
