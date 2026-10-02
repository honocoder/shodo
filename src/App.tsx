import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  Compass,
  Download,
  Focus,
  GripVertical,
  Home,
  Italic,
  Bold,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  PanelRightClose,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Type,
  WifiOff,
  X,
} from "lucide-react";
import { format, formatDistanceToNow, isThisWeek, isToday } from "date-fns";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db, createProject, queue, recalculateProject } from "./db";
import {
  countWords,
  defaultPreferences,
  emptyDoc,
  now,
  orderedNodes,
  progress,
  sessionDelta,
  uid,
  type ManuscriptNode,
  type Note,
  type NoteType,
  type Preferences,
  type Project,
  type SceneContent,
  type Snapshot,
  type WritingSession,
} from "./domain";
import { exportBackup, exportDocx, exportMarkdown } from "./export";
import {
  pocketbase,
  signIn,
  signOut,
  syncOutbox,
  type ConnectionState,
} from "./sync";

type View = "home" | "manuscript" | "notes" | "progress" | "settings";
type Modal =
  | "project"
  | "session"
  | "sessionSummary"
  | "quick"
  | "palette"
  | "search"
  | "history"
  | "export"
  | "shortcuts"
  | "auth"
  | null;
const noteTypes: NoteType[] = [
  "Character",
  "Plot",
  "Research",
  "Idea",
  "To review",
  "General",
];
const statusLabel: Record<Project["status"], string> = {
  planning: "Planning",
  draft: "First draft",
  revision: "Revision",
  complete: "Complete",
};

function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "icon" | "danger";
}) {
  return (
    <button className={`button ${variant}`} {...props}>
      {children}
    </button>
  );
}
function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function ModalShell({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title?: string;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.section
        className={`modal-card ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6 }}
      >
        <header>
          {title && <h2>{title}</h2>}
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </motion.section>
    </motion.div>
  );
}
function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`wordmark ${compact ? "compact" : ""}`}>
      <span>shodo</span>
      <i aria-hidden="true" />
    </div>
  );
}

function ProjectForm({
  onDone,
  onClose,
}: {
  onDone: (id: string, sceneId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(""),
    [type, setType] = useState<Project["type"]>("novel"),
    [target, setTarget] = useState(""),
    [daily, setDaily] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { project, sceneId } = await createProject({
      title: title.trim(),
      type,
      targetWords: target ? +target : undefined,
      dailyWordGoal: daily ? +daily : undefined,
    });
    onDone(project.id, sceneId);
  };
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Title
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled novel"
          required
        />
      </label>
      <div className="field-row">
        <label>
          Form
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Project["type"])}
          >
            <option value="novel">Novel</option>
            <option value="novella">Novella</option>
            <option value="short_story">Short story</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Target words <small>Optional</small>
          <input
            type="number"
            min="1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="45,000"
          />
        </label>
      </div>
      <label>
        Daily intention <small>Optional, never enforced</small>
        <input
          type="number"
          min="1"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          placeholder="500 words"
        />
      </label>
      <div className="form-actions">
        <Button type="button" variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Begin writing</Button>
      </div>
    </form>
  );
}

function HomeScreen({
  projects,
  onOpen,
  onNew,
  onSettings,
}: {
  projects: Project[];
  onOpen: (p: Project) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const recent = [...projects].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  )[0];
  return (
    <main className="home-screen">
      <header className="home-header">
        <Wordmark />
        <div>
          <Button variant="quiet" onClick={onSettings}>
            <Settings size={16} /> Settings
          </Button>
          <Button onClick={onNew}>
            <Plus size={16} /> New project
          </Button>
        </div>
      </header>
      {!recent ? (
        <section className="empty-home">
          <div className="seal">一</div>
          <p className="eyebrow">A quiet place for long-form work</p>
          <h1>
            Every book starts
            <br />
            somewhere.
          </h1>
          <p>Begin with a title. Shodo will keep the rest safe.</p>
          <Button onClick={onNew}>Start a project</Button>
          <button
            className="text-action"
            onClick={async () => {
              const r = await createProject({
                title: "Page 43",
                type: "novel",
                targetWords: 45000,
                dailyWordGoal: 500,
              });
              onOpen(r.project);
            }}
          >
            Or prepare Page 43
          </button>
        </section>
      ) : (
        <div className="home-content">
          <p className="eyebrow">Continue writing</p>
          <section className="continue-card" onClick={() => onOpen(recent)}>
            <div>
              <span className="project-kind">
                {recent.type.replace("_", " ")} · {statusLabel[recent.status]}
              </span>
              <h1>{recent.title}</h1>
              <p className="continue-meta">
                {recent.currentWords.toLocaleString()}{" "}
                {recent.targetWords
                  ? `/ ${recent.targetWords.toLocaleString()} words`
                  : "words"}{" "}
                <span>·</span> Opened{" "}
                {formatDistanceToNow(new Date(recent.lastOpenedAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            <div
              className="progress-ring"
              style={
                {
                  "--p": `${progress(recent.currentWords, recent.targetWords) * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <span>{progress(recent.currentWords, recent.targetWords)}%</span>
            </div>
            <Button>
              Continue writing <ChevronRight size={16} />
            </Button>
          </section>
          {projects.length > 1 && (
            <section className="project-list">
              <h2>Other work</h2>
              {projects
                .filter((p) => p.id !== recent.id)
                .map((p) => (
                  <button key={p.id} onClick={() => onOpen(p)}>
                    <span>
                      <b>{p.title}</b>
                      <small>
                        {p.type.replace("_", " ")} · {statusLabel[p.status]}
                      </small>
                    </span>
                    <span>{p.currentWords.toLocaleString()} words</span>
                  </button>
                ))}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function SortableNode({
  node,
  selected,
  onOpen,
  onRename,
  onDelete,
  children,
}: {
  node: ManuscriptNode;
  selected: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(node.title);
  const finish = () => {
    if (name.trim() && name !== node.title) onRename(name.trim());
    else setName(node.title);
    setEditing(false);
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`tree-wrap ${isDragging ? "dragging" : ""}`}
    >
      <div
        className={`tree-row ${node.type} ${selected ? "selected" : ""}`}
        onDoubleClick={() => setEditing(true)}
      >
        <button
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${node.title}`}
        >
          <GripVertical size={13} />
        </button>
        {node.type === "chapter" && <ChevronDown size={13} />}{" "}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={finish}
            onKeyDown={(e) => e.key === "Enter" && finish()}
          />
        ) : (
          <button className="node-name" onClick={onOpen}>
            {node.title}
          </button>
        )}
        <div className="tree-actions">
          <IconButton label="Rename" onClick={() => setEditing(true)}>
            <MoreHorizontal size={14} />
          </IconButton>
          <IconButton label="Delete" onClick={onDelete}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      {children}
    </div>
  );
}

function Sidebar({
  project,
  nodes,
  sceneId,
  onScene,
  onView,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  onHome,
  activeView,
}: {
  project: Project;
  nodes: ManuscriptNode[];
  sceneId?: string;
  onScene: (id: string) => void;
  onView: (v: View) => void;
  onAdd: (type: "chapter" | "scene", parent?: string) => void;
  onRename: (n: ManuscriptNode, name: string) => void;
  onDelete: (n: ManuscriptNode) => void;
  onReorder: (e: DragEndEvent) => void;
  onHome: () => void;
  activeView: View;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const sorted = orderedNodes(nodes);
  const chapters = sorted.filter((n) => n.type === "chapter");
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <IconButton label="Home" onClick={onHome}>
          <Home size={17} />
        </IconButton>
        <Wordmark compact />
        <span className="sidebar-balance" />
      </div>
      <div className="project-label">
        <strong>{project.title}</strong>
        <span>{statusLabel[project.status]}</span>
      </div>
      <nav className="section-nav">
        <button
          className={activeView === "manuscript" ? "active" : ""}
          onClick={() => onView("manuscript")}
        >
          <BookOpen size={15} /> Manuscript
        </button>
        <button
          className={activeView === "notes" ? "active" : ""}
          onClick={() => onView("notes")}
        >
          <NotebookPen size={15} /> Notes
        </button>
        <button
          className={activeView === "progress" ? "active" : ""}
          onClick={() => onView("progress")}
        >
          <Target size={15} /> Project
        </button>
      </nav>
      {activeView === "manuscript" && (
        <div className="tree">
          <div className="tree-heading">
            <span>Structure</span>
            <div>
              <IconButton label="New chapter" onClick={() => onAdd("chapter")}>
                <Plus size={14} />
              </IconButton>
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onReorder}
          >
            <SortableContext
              items={sorted.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              {chapters.map((chapter) => (
                <SortableNode
                  key={chapter.id}
                  node={chapter}
                  selected={false}
                  onOpen={() => {}}
                  onRename={(n) => onRename(chapter, n)}
                  onDelete={() => onDelete(chapter)}
                >
                  <div className="scene-list">
                    {sorted
                      .filter(
                        (n) => n.type === "scene" && n.parentId === chapter.id,
                      )
                      .map((scene) => (
                        <SortableNode
                          key={scene.id}
                          node={scene}
                          selected={scene.id === sceneId}
                          onOpen={() => onScene(scene.id)}
                          onRename={(n) => onRename(scene, n)}
                          onDelete={() => onDelete(scene)}
                        />
                      ))}
                    <button
                      className="add-scene"
                      onClick={() => onAdd("scene", chapter.id)}
                    >
                      <Plus size={13} /> Scene
                    </button>
                  </div>
                </SortableNode>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div className="sidebar-bottom">
        <div className="mini-progress">
          <span>
            {project.currentWords.toLocaleString()}{" "}
            {project.targetWords
              ? `/ ${project.targetWords.toLocaleString()}`
              : ""}{" "}
            words
          </span>
          <i>
            <b
              style={{
                width: `${progress(project.currentWords, project.targetWords)}%`,
              }}
            />
          </i>
        </div>
      </div>
    </aside>
  );
}

function WritingEditor({
  scene,
  content,
  chapterTitle,
  preferences,
  typewriter,
  focusMode,
  onChange,
  onReady,
}: {
  scene?: ManuscriptNode;
  content?: SceneContent;
  chapterTitle?: string;
  preferences: Preferences;
  typewriter: boolean;
  focusMode: boolean;
  onChange: (json: JSONContent, text: string) => void;
  onReady: (focus: () => void) => void;
}) {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          horizontalRule: { HTMLAttributes: { class: "scene-break" } },
        }),
        Placeholder.configure({ placeholder: "Start writing…" }),
        CharacterCount,
      ],
      content: content?.content ?? emptyDoc,
      editorProps: {
        attributes: {
          class: "prose-editor",
          spellcheck: "true",
          "aria-label": "Manuscript editor",
        },
      },
      onUpdate: ({ editor: ed }) =>
        latest.current(ed.getJSON(), ed.getText({ blockSeparator: "\n" })),
    },
    [scene?.id],
  );
  useEffect(() => {
    if (editor) onReady(() => editor.commands.focus());
  }, [editor, onReady]);
  useEffect(() => {
    if (!editor || !content || editor.isFocused) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content.content))
      editor.commands.setContent(content.content);
  }, [content, editor]);
  useEffect(() => {
    if (!editor || !typewriter) return;
    const fn = () =>
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        sel?.anchorNode?.parentElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    editor.on("selectionUpdate", fn);
    return () => {
      editor.off("selectionUpdate", fn);
    };
  }, [editor, typewriter]);
  if (!scene)
    return (
      <div className="no-scene">
        <BookOpen />
        <p>Select a scene to begin.</p>
      </div>
    );
  return (
    <div
      className={`editor-shell ${focusMode ? "focus-editor" : ""}`}
      style={
        {
          "--editor-width": `${preferences.editorWidth}px`,
          "--text-size": `${preferences.textSize}px`,
          "--line-height": preferences.lineHeight,
          "--writing-font":
            preferences.writingFont === "serif"
              ? "var(--serif)"
              : preferences.writingFont === "mono"
                ? "var(--mono)"
                : "var(--sans)",
        } as React.CSSProperties
      }
    >
      <div className="editor-title">
        <span>
          {chapterTitle && <small>{chapterTitle}</small>}
          {scene.title}
        </span>
        <em>{content?.wordCount.toLocaleString() ?? 0} words</em>
      </div>
      <EditorContent editor={editor} />
      <div className="format-popover" aria-label="Formatting">
        <IconButton
          label="Bold"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
        >
          <Bold size={15} />
        </IconButton>
        <IconButton
          label="Italic"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
        >
          <Italic size={15} />
        </IconButton>
        <IconButton
          label="Scene break"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().setHorizontalRule().run();
          }}
        >
          ⁂
        </IconButton>
      </div>
    </div>
  );
}

function CompassPanel({
  notes,
  sceneId,
  onClose,
  onCreate,
  onDetach,
}: {
  notes: Note[];
  sceneId?: string;
  onClose: () => void;
  onCreate: (text: string) => void;
  onDetach: (n: Note) => void;
}) {
  const [text, setText] = useState("");
  const relevant = notes.filter(
    (n) => n.pinned || n.attachedNodeId === sceneId,
  );
  return (
    <motion.aside
      className="compass"
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 30, opacity: 0 }}
    >
      <header>
        <div>
          <p className="eyebrow">For this scene</p>
          <h2>Compass</h2>
        </div>
        <IconButton label="Close Compass" onClick={onClose}>
          <PanelRightClose size={18} />
        </IconButton>
      </header>
      <div className="compass-notes">
        {relevant.length ? (
          relevant.map((n) => (
            <article key={n.id}>
              <span>{n.type}</span>
              <p>{n.content || n.title}</p>
              {n.attachedNodeId === sceneId && (
                <button onClick={() => onDetach(n)}>Detach</button>
              )}
            </article>
          ))
        ) : (
          <div className="empty-small">
            Keep the details that matter close at hand.
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            onCreate(text.trim());
            setText("");
          }
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A detail to remember…"
        />
        <Button type="submit" variant="quiet">
          Add to this scene
        </Button>
      </form>
    </motion.aside>
  );
}

function NotesView({
  projectId,
  nodes,
}: {
  projectId: string;
  nodes: ManuscriptNode[];
}) {
  const notes =
    useLiveQuery(
      () => db.notes.where("projectId").equals(projectId).toArray(),
      [projectId],
      [],
    ) ?? [];
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState<NoteType | "All">("All");
  const [query, setQuery] = useState("");
  const current = notes.find((n) => n.id === selected);
  const shown = notes
    .filter(
      (n) =>
        (filter === "All" || n.type === filter) &&
        `${n.title} ${n.content} ${n.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const add = async () => {
    const t = now(),
      n: Note = {
        id: uid(),
        projectId,
        title: "Untitled note",
        content: "",
        type: "General",
        tags: [],
        pinned: false,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
    await db.notes.add(n);
    await queue("notes", n.id);
    setSelected(n.id);
  };
  const patch = async (p: Partial<Note>) => {
    if (!current) return;
    await db.notes.update(current.id, {
      ...p,
      updatedAt: now(),
      syncStatus: "pending",
    });
    await queue("notes", current.id);
  };
  return (
    <div className="notes-view">
      <section className="notes-list">
        <header>
          <h1>Notes</h1>
          <Button onClick={add}>
            <Plus size={15} /> New
          </Button>
        </header>
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
          />
        </div>
        <div className="filter-row">
          {(["All", ...noteTypes] as const).map((t) => (
            <button
              className={filter === t ? "active" : ""}
              key={t}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {shown.map((n) => (
          <button
            key={n.id}
            className={`note-item ${selected === n.id ? "active" : ""}`}
            onClick={() => setSelected(n.id)}
          >
            <span>
              {n.type}
              {n.pinned ? " · Pinned" : ""}
            </span>
            <b>{n.title}</b>
            <p>{n.content || "Empty note"}</p>
          </button>
        ))}
      </section>
      <section className="note-editor">
        {current ? (
          <>
            <div className="note-toolbar">
              <select
                value={current.type}
                onChange={(e) => patch({ type: e.target.value as NoteType })}
              >
                {noteTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select
                value={current.attachedNodeId ?? ""}
                onChange={(e) =>
                  patch({ attachedNodeId: e.target.value || undefined })
                }
              >
                <option value="">Whole project</option>
                {orderedNodes(nodes).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.type === "scene" ? "— " : ""}
                    {n.title}
                  </option>
                ))}
              </select>
              <button onClick={() => patch({ pinned: !current.pinned })}>
                {current.pinned ? "Unpin" : "Pin"}
              </button>
              <IconButton
                label="Delete note"
                onClick={async () => {
                  if (confirm("Delete this note?")) {
                    await db.notes.delete(current.id);
                    await queue("notes", current.id, "delete");
                    setSelected(undefined);
                  }
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
            <input
              className="note-title"
              value={current.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <textarea
              className="note-body"
              autoFocus
              value={current.content}
              onChange={(e) => patch({ content: e.target.value })}
              placeholder="Write without arranging everything yet…"
            />
            <label className="tags-input">
              Tags
              <input
                value={current.tags.join(", ")}
                onChange={(e) =>
                  patch({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="motif, ending, question"
              />
            </label>
          </>
        ) : (
          <div className="notes-empty">
            <NotebookPen />
            <h2>A place for what surrounds the story.</h2>
            <p>
              Characters, questions, scraps, research—close to the manuscript,
              never in its way.
            </p>
            <Button onClick={add}>Create a note</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressView({
  project,
  sessions,
  nodes,
  contents,
}: {
  project: Project;
  sessions: WritingSession[];
  nodes: ManuscriptNode[];
  contents: SceneContent[];
}) {
  const completed = sessions.filter((s) => s.endedAt);
  const today = completed
    .filter((s) => isToday(new Date(s.startedAt)))
    .reduce((a, s) => a + s.wordsWritten, 0);
  const week = completed
    .filter((s) => isThisWeek(new Date(s.startedAt), { weekStartsOn: 1 }))
    .reduce((a, s) => a + s.wordsWritten, 0);
  const seconds = completed.reduce((a, s) => a + s.durationSeconds, 0);
  const average = completed.length
    ? Math.round(
        completed.reduce((a, s) => a + s.wordsWritten, 0) / completed.length,
      )
    : 0;
  const chapters = orderedNodes(nodes).filter((n) => n.type === "chapter");
  const byScene = new Map(contents.map((c) => [c.sceneId, c.wordCount]));
  return (
    <div className="progress-view">
      <header>
        <p className="eyebrow">Project journal</p>
        <h1>{project.title}</h1>
        <p>
          {statusLabel[project.status]} · begun{" "}
          {format(new Date(project.createdAt), "d MMMM yyyy")}
        </p>
      </header>
      <section className="hero-progress">
        <div>
          <strong>{project.currentWords.toLocaleString()}</strong>
          <span>words written</span>
        </div>
        {project.targetWords && (
          <div className="target-line">
            <i>
              <b
                style={{
                  width: `${progress(project.currentWords, project.targetWords)}%`,
                }}
              />
            </i>
            <span>
              {progress(project.currentWords, project.targetWords)}% of{" "}
              {project.targetWords.toLocaleString()}
            </span>
          </div>
        )}
      </section>
      <section className="stat-grid">
        <div>
          <span>Today</span>
          <strong>{today.toLocaleString()}</strong>
          <small>
            {project.dailyWordGoal
              ? `of ${project.dailyWordGoal.toLocaleString()} words`
              : "words"}
          </small>
        </div>
        <div>
          <span>This week</span>
          <strong>{week.toLocaleString()}</strong>
          <small>words</small>
        </div>
        <div>
          <span>Writing time</span>
          <strong>
            {Math.floor(seconds / 3600)}h {Math.floor((seconds % 3600) / 60)}m
          </strong>
          <small>{completed.length} sessions</small>
        </div>
        <div>
          <span>Average session</span>
          <strong>{average.toLocaleString()}</strong>
          <small>words</small>
        </div>
      </section>
      <section className="chapter-progress">
        <h2>Manuscript</h2>
        {chapters.map((c, i) => {
          const words = nodes
            .filter((n) => n.parentId === c.id)
            .reduce((a, n) => a + (byScene.get(n.id) || 0), 0);
          return (
            <div key={c.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <b>{c.title}</b>
              <i>
                <em style={{ width: `${Math.min(100, words / 30)}%` }} />
              </i>
              <small>{words.toLocaleString()} words</small>
            </div>
          );
        })}
      </section>
      <section className="recent-sessions">
        <h2>Recent sessions</h2>
        {completed.length ? (
          completed
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, 8)
            .map((s) => (
              <div key={s.id}>
                <span>{format(new Date(s.startedAt), "d MMM · HH:mm")}</span>
                <b>+{s.wordsWritten.toLocaleString()} words</b>
                <small>{Math.floor(s.durationSeconds / 60)} min</small>
              </div>
            ))
        ) : (
          <p>
            No sessions yet. A session is simply a deliberate stretch of
            writing.
          </p>
        )}
      </section>
    </div>
  );
}

function SettingsView({
  preferences,
  onPreferences,
  connection,
  onModal,
  onHome,
}: {
  preferences: Preferences;
  onPreferences: (p: Preferences) => void;
  connection: ConnectionState;
  onModal: (m: Modal) => void;
  onHome: () => void;
}) {
  const set = (p: Partial<Preferences>) =>
    onPreferences({ ...preferences, ...p });
  return (
    <div className="settings-view">
      <header>
        <IconButton label="Home" onClick={onHome}>
          <ChevronRight style={{ transform: "rotate(180deg)" }} />
        </IconButton>
        <Wordmark />
      </header>
      <main>
        <p className="eyebrow">Preferences</p>
        <h1>Settings</h1>
        <section>
          <h2>Writing</h2>
          <div className="setting">
            <div>
              <b>Typeface</b>
              <p>The voice of the writing page.</p>
            </div>
            <div className="segmented">
              {(["serif", "sans", "mono"] as const).map((f) => (
                <button
                  className={preferences.writingFont === f ? "active" : ""}
                  onClick={() => set({ writingFont: f })}
                  key={f}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <div>
              <b>Text size</b>
              <p>{preferences.textSize}px</p>
            </div>
            <input
              type="range"
              min="17"
              max="28"
              value={preferences.textSize}
              onChange={(e) => set({ textSize: +e.target.value })}
            />
          </div>
          <div className="setting">
            <div>
              <b>Line spacing</b>
              <p>{preferences.lineHeight.toFixed(1)}</p>
            </div>
            <input
              type="range"
              min="1.4"
              max="2.2"
              step=".1"
              value={preferences.lineHeight}
              onChange={(e) => set({ lineHeight: +e.target.value })}
            />
          </div>
          <div className="setting">
            <div>
              <b>Writing width</b>
              <p>{preferences.editorWidth}px</p>
            </div>
            <input
              type="range"
              min="560"
              max="850"
              step="10"
              value={preferences.editorWidth}
              onChange={(e) => set({ editorWidth: +e.target.value })}
            />
          </div>
        </section>
        <section>
          <h2>Focus</h2>
          <div className="setting">
            <div>
              <b>Focus HUD</b>
              <p>What remains visible in focus mode.</p>
            </div>
            <select
              value={preferences.focusHud}
              onChange={(e) =>
                set({ focusHud: e.target.value as Preferences["focusHud"] })
              }
            >
              <option value="nothing">Nothing</option>
              <option value="timer">Timer only</option>
              <option value="progress">Timer + progress</option>
            </select>
          </div>
          <div className="setting">
            <div>
              <b>Typewriter mode by default</b>
              <p>Keep the current paragraph near the center.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.typewriterDefault}
              onChange={(e) => set({ typewriterDefault: e.target.checked })}
            />
          </div>
        </section>
        <section>
          <h2>Data</h2>
          <div className="setting">
            <div>
              <b>Storage & synchronization</b>
              <p>
                {pocketbase
                  ? `PocketBase · ${connection}`
                  : "Local-only · everything stays in this browser"}
              </p>
            </div>
            {pocketbase ? (
              <Button variant="quiet" onClick={() => onModal("auth")}>
                {pocketbase.authStore.isValid ? "Account" : "Sign in"}
              </Button>
            ) : (
              <span className="status-dot">
                <WifiOff size={14} /> Local
              </span>
            )}
          </div>
        </section>
        <Button variant="quiet" onClick={() => onModal("shortcuts")}>
          <Command size={15} /> Keyboard shortcuts
        </Button>
      </main>
    </div>
  );
}

function SessionDialog({
  onStart,
  onClose,
}: {
  onStart: (
    goalType: WritingSession["goalType"],
    goalValue?: number,
    intention?: string,
  ) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [customType, setCustomType] = useState<"words" | "duration">("words");
  const [intention, setIntention] = useState("");
  return (
    <div className="form-stack">
      <p className="modal-intro">Choose a gentle boundary, or simply begin.</p>
      <div className="session-presets">
        <button onClick={() => onStart("none", undefined, intention)}>
          Free writing<span>No target</span>
        </button>
        <button onClick={() => onStart("duration", 30, intention)}>
          30 minutes<span>Time</span>
        </button>
        <button onClick={() => onStart("words", 500, intention)}>
          500 words<span>Words</span>
        </button>
        <button onClick={() => onStart("words", 1000, intention)}>
          1,000 words<span>Words</span>
        </button>
      </div>
      <div className="field-row">
        <label>
          Custom target
          <input
            type="number"
            min="1"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="750"
          />
        </label>
        <label>
          Measure
          <select
            value={customType}
            onChange={(e) =>
              setCustomType(e.target.value as "words" | "duration")
            }
          >
            <option value="words">Words</option>
            <option value="duration">Minutes</option>
          </select>
        </label>
      </div>
      <label>
        What do you want to accomplish? <small>Optional</small>
        <input
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="Finish the argument in the kitchen."
        />
      </label>
      <div className="form-actions">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        {custom && (
          <Button onClick={() => onStart(customType, +custom, intention)}>
            Begin
          </Button>
        )}
      </div>
    </div>
  );
}

function App() {
  const projects =
    useLiveQuery(
      () => db.projects.filter((p) => !p.archivedAt).toArray(),
      [],
      [],
    ) ?? [];
  const [view, setView] = useState<View>("home"),
    [projectId, setProjectId] = useState<string>(),
    [sceneId, setSceneId] = useState<string>(),
    [modal, setModal] = useState<Modal>(null),
    [compass, setCompass] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [typewriter, setTypewriter] = useState(false),
    [saveState, setSaveState] = useState<"Saved" | "Saving…">("Saved"),
    [connection, setConnection] = useState<ConnectionState>(
      pocketbase ? "offline" : "local",
    ),
    [sessionTick, setSessionTick] = useState(() => new Date().getTime()),
    [summaryId, setSummaryId] = useState<string>();
  const focusEditor = useRef<() => void>(() => {});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pending = useRef<{ json: JSONContent; text: string } | null>(null);
  const project = projects.find((p) => p.id === projectId);
  const nodes =
    useLiveQuery(
      () =>
        projectId
          ? db.nodes
              .where("projectId")
              .equals(projectId)
              .filter((n) => !n.deletedAt)
              .toArray()
          : [],
      [projectId],
      [],
    ) ?? [];
  const contents =
    useLiveQuery(
      () =>
        projectId
          ? db.contents.where("projectId").equals(projectId).toArray()
          : [],
      [projectId],
      [],
    ) ?? [];
  const notes =
    useLiveQuery(
      () =>
        projectId
          ? db.notes
              .where("projectId")
              .equals(projectId)
              .filter((n) => !n.deletedAt)
              .toArray()
          : [],
      [projectId],
      [],
    ) ?? [];
  const sessions =
    useLiveQuery(
      () =>
        projectId
          ? db.sessions.where("projectId").equals(projectId).toArray()
          : [],
      [projectId],
      [],
    ) ?? [];
  const snapshots =
    useLiveQuery(
      () =>
        sceneId
          ? db.snapshots
              .where("manuscriptNodeId")
              .equals(sceneId)
              .reverse()
              .sortBy("createdAt")
          : [],
      [sceneId],
      [],
    ) ?? [];
  const activeSession = sessions.find((s) => !s.endedAt);
  const scene = nodes.find((n) => n.id === sceneId);
  const content = contents.find((c) => c.sceneId === sceneId);
  const chapter = nodes.find((n) => n.id === scene?.parentId);
  const summary = summaryId
    ? sessions.find((s) => s.id === summaryId)
    : undefined;
  const prefRecord = useLiveQuery(
    () => db.preferences.get("main"),
    [],
    undefined,
  );
  const preferences = prefRecord?.value ?? defaultPreferences;
  const openProject = useCallback(
    async (p: Project, sid?: string) => {
      const available = await db.nodes
        .where({ projectId: p.id, type: "scene" })
        .sortBy("order");
      const target = sid || available[0]?.id;
      setProjectId(p.id);
      setSceneId(target);
      setView("manuscript");
      setTypewriter(preferences.typewriterDefault);
      await db.projects.update(p.id, { lastOpenedAt: now() });
      await db.meta.put({
        key: "lastLocation",
        value: JSON.stringify({ projectId: p.id, sceneId: target }),
      });
    },
    [preferences.typewriterDefault],
  );
  useEffect(() => {
    db.meta.get("lastLocation").then(async (m) => {
      if (m) {
        const loc = JSON.parse(m.value);
        const p = await db.projects.get(loc.projectId);
        if (p) openProject(p, loc.sceneId);
      }
    });
  }, []); // intentional one-time restoration
  useEffect(() => {
    const sync = () => syncOutbox(setConnection);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const id = setInterval(sync, 30000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setSessionTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);
  const flush = useCallback(async () => {
    if (!pending.current || !content || !projectId) return;
    const { json, text } = pending.current;
    pending.current = null;
    const timestamp = now(),
      words = countWords(text);
    const last = await db.snapshots
      .where("manuscriptNodeId")
      .equals(content.sceneId)
      .last();
    if (
      content.plainText &&
      content.plainText !== text &&
      (!last ||
        Date.parse(timestamp) - Date.parse(last.createdAt) > 15 * 60 * 1000)
    ) {
      const s: Snapshot = {
        id: uid(),
        projectId,
        manuscriptNodeId: content.sceneId,
        name: `Automatic · ${format(new Date(content.updatedAt), "d MMM, HH:mm")}`,
        content: content.content,
        plainText: content.plainText,
        wordCount: content.wordCount,
        reason: "automatic",
        createdAt: timestamp,
        updatedAt: timestamp,
        syncStatus: "pending",
      };
      await db.snapshots.add(s);
      await queue("snapshots", s.id);
    }
    await db.contents.update(content.id, {
      content: json,
      plainText: text,
      wordCount: words,
      characterCount: text.length,
      updatedAt: timestamp,
      syncStatus: "pending",
    });
    await queue("scene_contents", content.id);
    await recalculateProject(projectId);
    setSaveState("Saved");
    syncOutbox(setConnection);
  }, [content, projectId]);
  const editorChange = useCallback(
    (json: JSONContent, text: string) => {
      pending.current = { json, text };
      setSaveState("Saving…");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 350);
    },
    [flush],
  );
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const unload = () => void flush();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", unload);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", unload);
      void flush();
    };
  }, [flush]);
  const switchScene = async (id: string) => {
    await flush();
    setSceneId(id);
    await db.meta.put({
      key: "lastLocation",
      value: JSON.stringify({ projectId, sceneId: id }),
    });
    setTimeout(() => focusEditor.current(), 30);
  };
  const addNode = async (type: "chapter" | "scene", parent?: string) => {
    if (!projectId) return;
    const related = nodes.filter((n) =>
        type === "chapter" ? n.type === "chapter" : n.parentId === parent,
      ),
      t = now(),
      id = uid();
    const n: ManuscriptNode = {
      id,
      projectId,
      parentId: parent,
      type,
      title:
        type === "chapter"
          ? `Chapter ${nodes.filter((x) => x.type === "chapter").length + 1}`
          : `Scene ${related.length + 1}`,
      order: related.length,
      createdAt: t,
      updatedAt: t,
      syncStatus: "pending",
    };
    await db.nodes.add(n);
    await queue("manuscript_nodes", id);
    if (type === "scene") {
      const c: SceneContent = {
        id: uid(),
        sceneId: id,
        projectId,
        content: emptyDoc,
        plainText: "",
        wordCount: 0,
        characterCount: 0,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
      await db.contents.add(c);
      await queue("scene_contents", c.id);
      await switchScene(id);
    }
  };
  const rename = async (n: ManuscriptNode, title: string) => {
    await db.nodes.update(n.id, {
      title,
      updatedAt: now(),
      syncStatus: "pending",
    });
    await queue("manuscript_nodes", n.id);
  };
  const removeNode = async (n: ManuscriptNode) => {
    if (
      !confirm(
        `Delete “${n.title}”? A recoverable copy remains in local history.`,
      )
    )
      return;
    const t = now();
    if (n.type === "scene") {
      const c = contents.find((c) => c.sceneId === n.id);
      if (c && c.wordCount)
        await db.snapshots.add({
          id: uid(),
          projectId: n.projectId,
          manuscriptNodeId: n.id,
          name: `Before deleting ${n.title}`,
          content: c.content,
          plainText: c.plainText,
          wordCount: c.wordCount,
          reason: "automatic",
          createdAt: t,
          updatedAt: t,
          syncStatus: "pending",
        });
      await db.nodes.update(n.id, { deletedAt: t, syncStatus: "pending" });
      await queue("manuscript_nodes", n.id, "delete");
      if (sceneId === n.id)
        setSceneId(nodes.find((x) => x.type === "scene" && x.id !== n.id)?.id);
    } else {
      const children = nodes.filter((x) => x.parentId === n.id);
      if (children.length) {
        alert("Move or delete this chapter’s scenes first.");
        return;
      }
      await db.nodes.update(n.id, { deletedAt: t, syncStatus: "pending" });
      await queue("manuscript_nodes", n.id, "delete");
    }
  };
  const reorder = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = nodes.find((n) => n.id === e.active.id),
      to = nodes.find((n) => n.id === e.over?.id);
    if (!from || !to || from.type !== to.type || from.parentId !== to.parentId)
      return;
    const peers = orderedNodes(
      nodes.filter((n) => n.type === from.type && n.parentId === from.parentId),
    );
    const old = peers.findIndex((n) => n.id === from.id),
      next = peers.findIndex((n) => n.id === to.id);
    peers.splice(next, 0, peers.splice(old, 1)[0]);
    await Promise.all(
      peers.map((n, i) =>
        db.nodes.update(n.id, {
          order: i,
          updatedAt: now(),
          syncStatus: "pending",
        }),
      ),
    );
    await Promise.all(peers.map((n) => queue("manuscript_nodes", n.id)));
  };
  const createSnapshot = async (
    reason: Snapshot["reason"] = "manual",
    name?: string,
  ) => {
    await flush();
    const c = await db.contents
      .where("sceneId")
      .equals(sceneId || "")
      .first();
    if (!c || !projectId || !sceneId) return;
    const t = now(),
      s: Snapshot = {
        id: uid(),
        projectId,
        manuscriptNodeId: sceneId,
        name:
          name ||
          `${scene?.title ?? "Scene"} · ${format(new Date(), "d MMM, HH:mm")}`,
        content: c.content,
        plainText: c.plainText,
        wordCount: c.wordCount,
        reason,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
    await db.snapshots.add(s);
    await queue("snapshots", s.id);
  };
  const startSession = async (
    goalType: WritingSession["goalType"],
    goalValue?: number,
    intention?: string,
  ) => {
    await flush();
    if (!projectId) return;
    await createSnapshot("session_start", "Start of writing session");
    const p = await db.projects.get(projectId);
    const t = now(),
      s: WritingSession = {
        id: uid(),
        projectId,
        manuscriptNodeId: sceneId,
        startedAt: t,
        initialWordCount: p?.currentWords ?? 0,
        wordsWritten: 0,
        durationSeconds: 0,
        goalType,
        goalValue,
        intention,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
    await db.sessions.add(s);
    await queue("writing_sessions", s.id);
    setModal(null);
    setTimeout(() => focusEditor.current(), 20);
  };
  const endSession = async () => {
    if (!activeSession || !projectId) return;
    await flush();
    const endedAt = now(),
      total = await recalculateProject(projectId),
      seconds = Math.round(
        (Date.parse(endedAt) - new Date(activeSession.startedAt).getTime()) /
          1000,
      ),
      words = sessionDelta(activeSession.initialWordCount, total);
    await db.sessions.update(activeSession.id, {
      endedAt,
      finalWordCount: total,
      wordsWritten: words,
      durationSeconds: seconds,
      updatedAt: endedAt,
      syncStatus: "pending",
    });
    await queue("writing_sessions", activeSession.id);
    setSummaryId(activeSession.id);
    setModal("sessionSummary");
  };
  const quickNote = async (text: string, type: NoteType = "Idea") => {
    if (!projectId) return;
    const t = now(),
      n: Note = {
        id: uid(),
        projectId,
        title: text.length > 56 ? `${text.slice(0, 53)}…` : text,
        content: text,
        type,
        tags: [],
        pinned: false,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
    await db.notes.add(n);
    await queue("notes", n.id);
    setModal(null);
    setTimeout(() => focusEditor.current(), 20);
  };
  const setPrefs = async (p: Preferences) =>
    db.preferences.put({ id: "main", value: p });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("palette");
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal("quick");
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
        setSaveState("Saved");
      }
      if (e.key === "Escape") {
        if (focusMode) setFocusMode(false);
        else if (modal) setModal(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focusMode, flush, modal]);
  const elapsed = activeSession
    ? Math.round(
        (sessionTick - new Date(activeSession.startedAt).getTime()) / 1000,
      )
    : 0;
  const sessionWords =
    activeSession && project
      ? sessionDelta(activeSession.initialWordCount, project.currentWords)
      : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  if (view === "home")
    return (
      <>
        <HomeScreen
          projects={projects}
          onOpen={openProject}
          onNew={() => setModal("project")}
          onSettings={() => setView("settings")}
        />
        <AnimatePresence>
          {modal === "project" && (
            <ModalShell title="Start a project" onClose={() => setModal(null)}>
              <ProjectForm
                onClose={() => setModal(null)}
                onDone={async (id, sid) => {
                  setModal(null);
                  const p = await db.projects.get(id);
                  if (p) openProject(p, sid);
                }}
              />
            </ModalShell>
          )}
        </AnimatePresence>
      </>
    );
  if (view === "settings" && !project)
    return (
      <SettingsView
        preferences={preferences}
        onPreferences={setPrefs}
        connection={connection}
        onModal={setModal}
        onHome={() => setView("home")}
      />
    );
  if (!project) return <div className="loading">Preparing your desk…</div>;
  const addCompassNote = async (text: string) => {
    const t = now(),
      n: Note = {
        id: uid(),
        projectId: project.id,
        title: text.length > 56 ? `${text.slice(0, 53)}…` : text,
        content: text,
        type: "General",
        tags: [],
        pinned: false,
        attachedNodeId: sceneId,
        createdAt: t,
        updatedAt: t,
        syncStatus: "pending",
      };
    await db.notes.add(n);
    await queue("notes", n.id);
  };
  return (
    <div className={`app-shell ${focusMode ? "focus-mode" : ""}`}>
      <AnimatePresence>
        {!focusMode && (
          <motion.div
            initial={{ x: -15, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
          >
            <Sidebar
              project={project}
              nodes={nodes}
              sceneId={sceneId}
              onScene={switchScene}
              onView={setView}
              onAdd={addNode}
              onRename={rename}
              onDelete={removeNode}
              onReorder={reorder}
              onHome={() => setView("home")}
              activeView={view}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="workspace">
        {view === "manuscript" && (
          <>
            <header className="workspace-bar">
              <div>
                {focusMode && <Wordmark compact />}
                <span
                  className={`save-state ${connection === "offline" || connection === "local" ? "local" : ""}`}
                >
                  {saveState === "Saving…"
                    ? saveState
                    : connection === "syncing"
                      ? "Syncing…"
                      : connection === "error"
                        ? "Sync issue"
                        : connection === "synced"
                          ? "Synced"
                          : navigator.onLine
                            ? "Saved locally"
                            : "Saved locally · Offline"}
                </span>
              </div>
              <div>
                {activeSession ? (
                  <button className="session-live" onClick={endSession}>
                    <Clock3 size={14} />
                    {clock}
                    {activeSession.goalType === "words" &&
                      ` · ${sessionWords} / ${activeSession.goalValue}`}{" "}
                    <span>End</span>
                  </button>
                ) : (
                  <Button variant="quiet" onClick={() => setModal("session")}>
                    <Clock3 size={15} /> Start session
                  </Button>
                )}
                <IconButton
                  label="Typewriter mode"
                  className={typewriter ? "active" : ""}
                  onClick={() => setTypewriter((v) => !v)}
                >
                  <Type size={17} />
                </IconButton>
                <IconButton
                  label="Open Compass"
                  className={compass ? "active" : ""}
                  onClick={() => setCompass((v) => !v)}
                >
                  <Compass size={17} />
                </IconButton>
                <IconButton
                  label="Focus mode"
                  onClick={() => setFocusMode(true)}
                >
                  <Focus size={17} />
                </IconButton>
                <IconButton
                  label="Command palette"
                  onClick={() => setModal("palette")}
                >
                  <Command size={17} />
                </IconButton>
              </div>
            </header>
            <WritingEditor
              scene={scene}
              content={content}
              chapterTitle={chapter?.title}
              preferences={preferences}
              typewriter={typewriter}
              focusMode={focusMode}
              onChange={editorChange}
              onReady={(fn) => {
                focusEditor.current = fn;
              }}
            />
            <AnimatePresence>
              {compass && !focusMode && (
                <CompassPanel
                  notes={notes}
                  sceneId={sceneId}
                  onClose={() => setCompass(false)}
                  onCreate={addCompassNote}
                  onDetach={(n) =>
                    db.notes.update(n.id, { attachedNodeId: undefined })
                  }
                />
              )}
            </AnimatePresence>
            {focusMode && preferences.focusHud !== "nothing" && (
              <div className="focus-hud">
                {activeSession ? (
                  <>
                    {clock}
                    {preferences.focusHud === "progress" &&
                      activeSession.goalType === "words" &&
                      ` · +${sessionWords} / ${activeSession.goalValue} words`}
                  </>
                ) : (
                  <span>Focus</span>
                )}
              </div>
            )}
          </>
        )}
        {view === "notes" && <NotesView projectId={project.id} nodes={nodes} />}{" "}
        {view === "progress" && (
          <ProgressView
            project={project}
            sessions={sessions}
            nodes={nodes}
            contents={contents}
          />
        )}{" "}
        {view === "settings" && (
          <SettingsView
            preferences={preferences}
            onPreferences={setPrefs}
            connection={connection}
            onModal={setModal}
            onHome={() => setView("manuscript")}
          />
        )}
      </main>
      {!focusMode && (
        <nav className="mobile-nav" aria-label="Project navigation">
          <button onClick={() => setView("manuscript")}>
            <BookOpen />
            Write
          </button>
          <button onClick={() => setView("notes")}>
            <NotebookPen />
            Notes
          </button>
          <button onClick={() => setView("progress")}>
            <Target />
            Project
          </button>
          <button onClick={() => setView("home")}>
            <Home />
            Home
          </button>
        </nav>
      )}
      <AnimatePresence>
        {modal === "project" && (
          <ModalShell title="Start a project" onClose={() => setModal(null)}>
            <ProjectForm
              onClose={() => setModal(null)}
              onDone={() => setModal(null)}
            />
          </ModalShell>
        )}
        {modal === "session" && (
          <ModalShell title="A writing session" onClose={() => setModal(null)}>
            <SessionDialog
              onStart={startSession}
              onClose={() => setModal(null)}
            />
          </ModalShell>
        )}
        {modal === "quick" && (
          <QuickCapture onSave={quickNote} onClose={() => setModal(null)} />
        )}{" "}
        {modal === "palette" && (
          <CommandPalette
            nodes={nodes}
            activeSession={!!activeSession}
            action={(a) => {
              setModal(null);
              if (a === "focus") setFocusMode(true);
              if (a === "typewriter") setTypewriter((v) => !v);
              if (a === "compass") setCompass(true);
              if (a === "session") setModal("session");
              if (a === "end") void endSession();
              if (a === "quick") setModal("quick");
              if (a === "search") setModal("search");
              if (a === "snapshot") void createSnapshot();
              if (a === "history") setModal("history");
              if (a === "export") setModal("export");
              if (a === "settings") setView("settings");
              if (a.startsWith("scene:")) void switchScene(a.slice(6));
              if (a === "chapter") void addNode("chapter");
              if (a === "note") setView("notes");
            }}
            onClose={() => setModal(null)}
          />
        )}{" "}
        {modal === "search" && (
          <SearchModal
            nodes={nodes}
            contents={contents}
            notes={notes}
            onOpen={(id) => {
              setModal(null);
              if (nodes.some((n) => n.id === id)) void switchScene(id);
              else setView("notes");
            }}
            onClose={() => setModal(null)}
          />
        )}{" "}
        {modal === "history" && (
          <HistoryModal
            snapshots={snapshots}
            current={content}
            onRestore={async (s) => {
              if (!content) return;
              await createSnapshot("automatic", "Before restoring history");
              await db.contents.update(content.id, {
                content: s.content,
                plainText: s.plainText,
                wordCount: s.wordCount,
                updatedAt: now(),
                syncStatus: "pending",
              });
              await recalculateProject(project.id);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        )}{" "}
        {modal === "export" && (
          <ExportModal project={project} onClose={() => setModal(null)} />
        )}{" "}
        {modal === "shortcuts" && <Shortcuts onClose={() => setModal(null)} />}{" "}
        {modal === "sessionSummary" && summary && (
          <SessionSummary
            session={summary}
            project={project}
            onClose={() => {
              setModal(null);
              setSummaryId(undefined);
              setTimeout(() => focusEditor.current(), 20);
            }}
          />
        )}
        {modal === "auth" && (
          <AuthModal
            onClose={() => setModal(null)}
            onSigned={() => {
              setModal(null);
              void syncOutbox(setConnection);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickCapture({
  onSave,
  onClose,
}: {
  onSave: (s: string, t: NoteType) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(""),
    [type, setType] = useState<NoteType>("Idea");
  return (
    <ModalShell onClose={onClose}>
      <form
        className="quick-capture"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSave(text.trim(), type);
        }}
      >
        <p className="eyebrow">Quick capture</p>
        <h2>An idea?</h2>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim())
              onSave(text.trim(), type);
          }}
          placeholder="Catch it before it disappears."
        />
        <div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as NoteType)}
          >
            {noteTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <span>⌘ Enter to save</span>
        </div>
      </form>
    </ModalShell>
  );
}
function CommandPalette({
  nodes,
  activeSession,
  action,
  onClose,
}: {
  nodes: ManuscriptNode[];
  activeSession: boolean;
  action: (a: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const actions = [
    ["Continue writing", "scene:" + nodes.find((n) => n.type === "scene")?.id],
    ["Search manuscript", "search"],
    ["Quick capture", "quick"],
    [
      activeSession ? "End writing session" : "Start writing session",
      activeSession ? "end" : "session",
    ],
    ["Toggle focus mode", "focus"],
    ["Toggle typewriter mode", "typewriter"],
    ["Open Compass", "compass"],
    ["Create snapshot", "snapshot"],
    ["Scene history", "history"],
    ["New chapter", "chapter"],
    ["New note", "note"],
    ["Export project", "export"],
    ["Settings", "settings"],
    ...nodes
      .filter((n) => n.type === "scene")
      .map((n) => [`Go to ${n.title}`, "scene:" + n.id]),
  ] as [string, string][];
  const shown = actions.filter((a) =>
    a[0].toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <ModalShell onClose={onClose}>
      <div className="palette-search">
        <Search size={18} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a command…"
        />
      </div>
      <div className="palette-list">
        {shown.map(([label, id], i) => (
          <button key={id + i} onClick={() => action(id)}>
            <span>{label}</span>
            <small>↵</small>
          </button>
        ))}
      </div>
      <footer className="palette-footer">
        <span>↑↓ navigate</span>
        <span>esc close</span>
      </footer>
    </ModalShell>
  );
}
function SearchModal({
  nodes,
  contents,
  notes,
  onOpen,
  onClose,
}: {
  nodes: ManuscriptNode[];
  contents: SceneContent[];
  notes: Note[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const s = q.toLowerCase();
    return [
      ...nodes
        .filter((n) => n.title.toLowerCase().includes(s))
        .map((n) => ({
          id: n.id,
          title: n.title,
          kind: n.type,
          text: n.synopsis || "",
        })),
      ...contents
        .filter((c) => c.plainText.toLowerCase().includes(s))
        .map((c) => ({
          id: c.sceneId,
          title: nodes.find((n) => n.id === c.sceneId)?.title || "Scene",
          kind: "manuscript",
          text: snippet(c.plainText, s),
        })),
      ...notes
        .filter((n) => (n.title + n.content).toLowerCase().includes(s))
        .map((n) => ({
          id: n.id,
          title: n.title,
          kind: "note",
          text: snippet(n.content, s),
        })),
    ];
  }, [q, nodes, contents, notes]);
  return (
    <ModalShell title="Search this project" onClose={onClose} wide>
      <div className="search-field large">
        <Search />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A name, a phrase, a detail…"
        />
      </div>
      <div className="search-results">
        {q.length < 2 ? (
          <p>Search manuscript titles, prose, and notes—all offline.</p>
        ) : results.length ? (
          results.map((r, i) => (
            <button key={r.id + i} onClick={() => onOpen(r.id)}>
              <span>{r.kind}</span>
              <b>{r.title}</b>
              <p>{r.text}</p>
            </button>
          ))
        ) : (
          <p>No trace of “{q}”.</p>
        )}
      </div>
    </ModalShell>
  );
}
function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q);
  return i < 0
    ? text.slice(0, 120)
    : `…${text.slice(Math.max(0, i - 45), i + q.length + 75)}…`;
}
function HistoryModal({
  snapshots,
  current,
  onRestore,
  onClose,
}: {
  snapshots: Snapshot[];
  current?: SceneContent;
  onRestore: (s: Snapshot) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Snapshot>();
  return (
    <ModalShell title="Scene history" onClose={onClose} wide>
      <div className="history">
        <aside>
          <button
            className={!selected ? "active" : ""}
            onClick={() => setSelected(undefined)}
          >
            <b>Now</b>
            <span>{current?.wordCount || 0} words</span>
          </button>
          {snapshots.map((s) => (
            <button
              key={s.id}
              className={selected?.id === s.id ? "active" : ""}
              onClick={() => setSelected(s)}
            >
              <b>{s.name}</b>
              <span>
                {format(new Date(s.createdAt), "d MMM · HH:mm")} · {s.wordCount}{" "}
                words
              </span>
            </button>
          ))}
        </aside>
        <article>
          <p>
            {selected?.plainText ??
              current?.plainText ??
              "This scene is empty."}
          </p>
          {selected && (
            <Button
              onClick={() =>
                confirm(
                  "Restore this version? The current version will be preserved first.",
                ) && onRestore(selected)
              }
            >
              Restore this version
            </Button>
          )}
        </article>
      </div>
    </ModalShell>
  );
}
function ExportModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const items = [
    [
      "Markdown",
      "A clean, portable plain-text manuscript.",
      () => exportMarkdown(project.id),
    ],
    [
      "DOCX",
      "A formatted manuscript for Word or Pages.",
      () => exportDocx(project.id),
    ],
    [
      "Shodo backup",
      "Structure, prose, notes, sessions, and history.",
      () => exportBackup(project.id),
    ],
  ] as const;
  return (
    <ModalShell title="Your words are yours" onClose={onClose}>
      {items.map(([name, desc, fn]) => (
        <button className="export-row" key={name} onClick={() => void fn()}>
          <Download size={18} />
          <span>
            <b>{name}</b>
            <small>{desc}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      <p className="security-note">
        Exports are created entirely on this device. No manuscript text is sent
        elsewhere.
      </p>
    </ModalShell>
  );
}
function SessionSummary({
  session,
  project,
  onClose,
}: {
  session: WritingSession;
  project: Project;
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="session-summary">
        <div className="seal small">✓</div>
        <p className="eyebrow">Belle session.</p>
        <h2>{session.wordsWritten.toLocaleString()} words</h2>
        <p className="summary-time">
          {Math.floor(session.durationSeconds / 60)} minutes
        </p>
        <div>
          <span>{project.title} now contains</span>
          <b>{project.currentWords.toLocaleString()} words</b>
          {project.targetWords && (
            <small>
              {progress(project.currentWords, project.targetWords)}% of the
              first draft
            </small>
          )}
        </div>
        <Button onClick={onClose}>Continue writing</Button>
      </div>
    </ModalShell>
  );
}
function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcuts">
        {[
          ["Command palette", "⌘ K"],
          ["Focus mode", "⌘ ⇧ F"],
          ["Quick capture", "⌘ ⇧ N"],
          ["Autosave now", "⌘ S"],
          ["Bold", "⌘ B"],
          ["Italic", "⌘ I"],
          ["Leave focus mode", "Esc"],
        ].map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <kbd>{b}</kbd>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
function AuthModal({
  onClose,
  onSigned,
}: {
  onClose: () => void;
  onSigned: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  if (pocketbase?.authStore.isValid)
    return (
      <ModalShell title="PocketBase account" onClose={onClose}>
        <p>Signed in as {pocketbase.authStore.record?.email}.</p>
        <div className="form-actions">
          <Button
            variant="quiet"
            onClick={() => {
              signOut();
              onClose();
            }}
          >
            <LogOut size={15} /> Sign out
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </ModalShell>
    );
  return (
    <ModalShell title="Connect your library" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await signIn(email, password);
            onSigned();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to sign in");
          }
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <Button type="submit">Sign in & sync</Button>
      </form>
    </ModalShell>
  );
}

export default App;
