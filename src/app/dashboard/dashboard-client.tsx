"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  createdAt: number;
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

interface Usage {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
}

interface Toast {
  id: number;
  type: "success" | "danger";
  title: string;
  message: string;
}

interface ClipboardClip {
  id: string;
  title: string | null;
  content: string;
  createdAt: number;
}

interface PendingUpload {
  file: File;
  folderId: string | null;
}

interface CollectEntry {
  file: File;
  dirs: string[];
}

type SortBy = "date-desc" | "date-asc" | "name-asc" | "size-desc" | "size-asc";
type ThemeMode = "system" | "light" | "dark";
type ViewMode = "list" | "grid";

const CLOUDINARY_UPLOAD_URL = (cloudName: string) =>
  `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileVisual(name: string, mime: string): { icon: string; badge: string; tone: string } {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
    return { icon: "🖼️", badge: "IMG", tone: "tone-indigo" };
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return { icon: "📕", badge: "PDF", tone: "tone-rose" };
  }
  if (["zip", "rar", "7z", "tar", "gz", "tgz"].includes(ext) || mime.includes("zip") || mime.includes("compressed")) {
    return { icon: "🗜️", badge: "ZIP", tone: "tone-amber" };
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
    return { icon: "🎵", badge: "AUD", tone: "tone-violet" };
  }
  if (mime.startsWith("video/") || ["mp4", "mkv", "mov", "webm"].includes(ext)) {
    return { icon: "🎬", badge: "VID", tone: "tone-violet" };
  }
  if (["js", "ts", "tsx", "jsx", "py", "json", "html", "css", "sql", "md", "sh", "yml", "yaml"].includes(ext)) {
    return { icon: "💻", badge: ext.toUpperCase().slice(0, 4), tone: "tone-cyan" };
  }
  if (["csv", "xls", "xlsx"].includes(ext)) {
    return { icon: "📊", badge: "DATA", tone: "tone-emerald" };
  }
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) {
    return { icon: "📝", badge: "DOC", tone: "tone-blue" };
  }
  return { icon: "📄", badge: ext ? ext.toUpperCase().slice(0, 4) : "FILE", tone: "tone-slate" };
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.includes("@")) return `${trimmed}@gmail.com`;
  if (trimmed.endsWith("@")) return `${trimmed}gmail.com`;
  return trimmed;
}

function walkEntry(entry: FileSystemEntry, dirs: string[], out: CollectEntry[]): Promise<void> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => {
          out.push({ file, dirs });
          resolve();
        },
        () => resolve()
      );
    });
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            void (async () => {
              for (const e of all) {
                await walkEntry(e, [...dirs, entry.name], out);
              }
              resolve();
            })();
          } else {
            all.push(...entries);
            readBatch();
          }
        },
        () => resolve()
      );
    };
    readBatch();
  });
}

export default function DashboardClient({ email }: { email: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("swosh_theme");
        if (saved === "light" || saved === "dark" || saved === "system") {
          return saved;
        }
      } catch {
        // ignore
      }
    }
    return "system";
  });

  const [mailSelected, setMailSelected] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [recentRecipients, setRecentRecipients] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("swosh_recent_recipients");
        if (raw) return JSON.parse(raw) as string[];
      } catch {
        // ignore
      }
    }
    return [];
  });

  const [modal, setModal] = useState<
    null | "newFolder" | "renameFolder" | "moveFiles" | "deleteFolder" | "bulkDelete"
  >(null);
  const [modalFolder, setModalFolder] = useState<Folder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [deletingFolderBusy, setDeletingFolderBusy] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Clipboard state
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [clipboardTab, setClipboardTab] = useState<"scratchpad" | "clips">("scratchpad");
  const [scratchpad, setScratchpad] = useState("");
  const [scratchpadStatus, setScratchpadStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [clips, setClips] = useState<ClipboardClip[]>([]);
  const [newClipTitle, setNewClipTitle] = useState("");
  const [newClipContent, setNewClipContent] = useState("");
  const [clipSearch, setClipSearch] = useState("");
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [copiedScratchpad, setCopiedScratchpad] = useState(false);
  const [savingClip, setSavingClip] = useState(false);
  const scratchpadSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const folderCache = useRef<Map<string, string | null>>(new Map());

  const addToast = useCallback((type: "success" | "danger", title: string, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem("swosh_theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => (prev === "system" ? "light" : prev === "light" ? "dark" : "system"));
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/files?include=folders");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
        setUsage(data.usage);
        if (Array.isArray(data.folders)) {
          setFolders(data.folders);
          folderCache.current.clear();
        }
        setMailSelected((prev) => {
          const ids = new Set(data.files.map((f: StoredFile) => f.id));
          return new Set([...prev].filter((id) => ids.has(id)));
        });
      }
    } catch {
      addToast("danger", "Error", "Could not load your board.");
    } finally {
      setLoading(false);
    }
  }, [addToast, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, clipRes] = await Promise.all([
          fetch("/api/files?include=folders"),
          fetch("/api/clipboard").catch(() => null),
        ]);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (res.ok && !cancelled) {
          setFiles(data.files);
          setUsage(data.usage);
          if (Array.isArray(data.folders)) {
            setFolders(data.folders);
          }
        }
        if (clipRes && clipRes.ok && !cancelled) {
          const clipData = await clipRes.json();
          setScratchpad(clipData.scratchpad || "");
          setClips(clipData.clips || []);
        }
      } catch {
        if (!cancelled) addToast("danger", "Error", "Could not load your board.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast, router]);

  const handleScratchpadChange = (newVal: string) => {
    setScratchpad(newVal);
    setScratchpadStatus("saving");
    if (scratchpadSaveTimer.current) {
      clearTimeout(scratchpadSaveTimer.current);
    }
    scratchpadSaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/clipboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newVal }),
        });
        if (res.ok) {
          setScratchpadStatus("saved");
          setTimeout(() => {
            setScratchpadStatus((prev) => (prev === "saved" ? "idle" : prev));
          }, 2000);
        } else {
          setScratchpadStatus("error");
        }
      } catch {
        setScratchpadStatus("error");
      }
    }, 700);
  };

  const handleCopyScratchpad = async () => {
    if (!scratchpad) return;
    try {
      await navigator.clipboard.writeText(scratchpad);
      setCopiedScratchpad(true);
      setTimeout(() => setCopiedScratchpad(false), 2000);
      addToast("success", "Copied", "Scratchpad copied to clipboard.");
    } catch {
      addToast("danger", "Copy failed", "Could not copy to system clipboard.");
    }
  };

  const handleClearScratchpad = () => {
    if (!scratchpad) return;
    handleScratchpadChange("");
  };

  const handleSaveScratchpadAsClip = async () => {
    const content = scratchpad.trim();
    if (!content) return;
    setSavingClip(true);
    try {
      const firstLine = content.split("\n")[0].trim();
      const title = firstLine.slice(0, 32) || "Scratchpad Clip";
      const res = await fetch("/api/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json();
      if (res.ok && data.clip) {
        setClips((prev) => [data.clip, ...prev]);
        addToast("success", "Saved Clip", "Scratchpad saved as a new clip.");
      } else {
        throw new Error(data.error || "Could not save clip.");
      }
    } catch (err) {
      addToast("danger", "Failed", err instanceof Error ? err.message : "Could not save clip.");
    } finally {
      setSavingClip(false);
    }
  };

  const handleAddClip = async () => {
    const content = newClipContent.trim();
    if (!content) return;
    setSavingClip(true);
    try {
      const res = await fetch("/api/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title: newClipTitle.trim() || null }),
      });
      const data = await res.json();
      if (res.ok && data.clip) {
        setClips((prev) => [data.clip, ...prev]);
        setNewClipTitle("");
        setNewClipContent("");
        addToast("success", "Clip Saved", "Added to your saved clips.");
      } else {
        throw new Error(data.error || "Could not save clip.");
      }
    } catch (err) {
      addToast("danger", "Failed", err instanceof Error ? err.message : "Could not save clip.");
    } finally {
      setSavingClip(false);
    }
  };

  const handleCopyClip = async (clip: ClipboardClip) => {
    try {
      await navigator.clipboard.writeText(clip.content);
      setCopiedClipId(clip.id);
      setTimeout(() => setCopiedClipId((id) => (id === clip.id ? null : id)), 2000);
      addToast("success", "Copied", `"${clip.title || "Clip"}" copied to clipboard.`);
    } catch {
      addToast("danger", "Copy failed", "Could not copy to system clipboard.");
    }
  };

  const handleDeleteClip = async (id: string) => {
    try {
      const res = await fetch(`/api/clipboard/${id}`, { method: "DELETE" });
      if (res.ok) {
        setClips((prev) => prev.filter((c) => c.id !== id));
        addToast("success", "Deleted", "Clip removed.");
      } else {
        const data = await res.json();
        throw new Error(data.error || "Could not delete clip.");
      }
    } catch (err) {
      addToast("danger", "Delete failed", err instanceof Error ? err.message : "Could not delete clip.");
    }
  };

  const handleSendClipToScratchpad = (clip: ClipboardClip) => {
    const separator = scratchpad.trim() ? "\n\n" : "";
    const updated = scratchpad + separator + clip.content;
    handleScratchpadChange(updated);
    setClipboardTab("scratchpad");
    addToast("success", "Appended", "Appended clip to scratchpad.");
  };

  const handleInsertClipToMail = (clip: ClipboardClip) => {
    const separator = mailBody.trim() ? "\n\n" : "";
    setMailBody((prev) => prev + separator + clip.content);
    setMailOpen(true);
    addToast("success", "Inserted", "Inserted clip into Quick Mail body.");
  };

  const handleInsertScratchpadToMail = () => {
    if (!scratchpad.trim()) return;
    const separator = mailBody.trim() ? "\n\n" : "";
    setMailBody((prev) => prev + separator + scratchpad);
    setMailOpen(true);
    addToast("success", "Inserted", "Inserted scratchpad into Quick Mail body.");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const ensureFolderChain = async (dirs: string[], topFolderId: string | null): Promise<string | null> => {
    let parentId: string | null = topFolderId;
    const chain: string[] = [];
    for (const name of dirs) {
      chain.push(name);
      const key = `${parentId ?? "root"}/${chain.join("/")}`;
      const cached = folderCache.current.get(key);
      if (cached !== undefined) {
        parentId = cached;
        continue;
      }
      let folderId: string | null = null;
      const existing = folders.find(
        (f) => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        folderId = existing.id;
      } else {
        const res = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, parentId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Could not create folder "${name}".`);
        }
        folderId = data.folder?.id ?? null;
        if (data.folder) {
          setFolders((prev) => [...prev, data.folder]);
        }
      }
      folderCache.current.set(key, folderId);
      parentId = folderId;
    }
    return parentId;
  };

  const buildPendingUploads = async (
    collected: CollectEntry[],
    topFolderId: string | null
  ): Promise<PendingUpload[]> => {
    const pending: PendingUpload[] = [];
    for (const item of collected) {
      const folderId = await ensureFolderChain(item.dirs, topFolderId);
      pending.push({ file: item.file, folderId });
    }
    return pending;
  };

  // Concurrent upload pipeline (up to 3 parallel uploads)
  const startUploads = useCallback(
    async (items: PendingUpload[]) => {
      const tooBig = items.filter((i) => i.file.size > 10 * 1024 * 1024);
      const ok = items.filter((i) => i.file.size <= 10 * 1024 * 1024);
      if (tooBig.length > 0) {
        addToast(
          "danger",
          "Skipped Oversized Files",
          `${tooBig.length} file(s) skipped: ${tooBig
            .map((i) => i.file.name)
            .slice(0, 3)
            .join(", ")}${tooBig.length > 3 ? "..." : ""} (10 MB per-file limit).`
        );
      }
      if (ok.length === 0) return;

      setUploading(true);
      setUploadProgress(0);
      setUploadName(ok.length === 1 ? ok[0].file.name : `${ok.length} files`);

      const totalBytes = ok.reduce((sum, i) => sum + i.file.size, 0) || 1;
      const loadedByIndex = new Array<number>(ok.length).fill(0);
      let cursor = 0;
      let failed = false;

      const updateProgress = () => {
        const sum = loadedByIndex.reduce((a, b) => a + b, 0);
        setUploadProgress(Math.min(100, Math.round((sum / totalBytes) * 100)));
      };

      const uploadSingle = async (idx: number, item: PendingUpload) => {
        const file = item.file;
        setUploadName(ok.length === 1 ? file.name : `${file.name} (${idx + 1}/${ok.length})`);

        const signRes = await fetch("/api/files/upload-sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            mime: file.type || "application/octet-stream",
            folderId: item.folderId,
          }),
        });
        const signData = await signRes.json();
        if (!signRes.ok) {
          throw new Error(signData.error || "Could not prepare upload.");
        }
        const upload = signData.upload as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          publicId: string;
          resourceType: string;
          deliveryType: string;
        };

        await new Promise<void>((resolve, reject) => {
          const form = new FormData();
          form.append("file", file);
          form.append("public_id", upload.publicId);
          form.append("api_key", upload.apiKey);
          form.append("timestamp", String(upload.timestamp));
          form.append("signature", upload.signature);
          form.append("type", upload.deliveryType);
          form.append("resource_type", upload.resourceType);

          const xhr = new XMLHttpRequest();
          xhr.open("POST", CLOUDINARY_UPLOAD_URL(upload.cloudName));
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              loadedByIndex[idx] = event.loaded;
              updateProgress();
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              loadedByIndex[idx] = file.size;
              updateProgress();
              resolve();
            } else {
              let msg = `Storage upload returned ${xhr.status}.`;
              try {
                const data = JSON.parse(xhr.responseText);
                if (data?.error?.message) msg = data.error.message;
              } catch {
                /* ignore */
              }
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => reject(new Error("Storage upload failed (network)."));
          xhr.send(form);
        });

        const confirmRes = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicId: upload.publicId,
            name: file.name,
            size: file.size,
            mime: file.type || "application/octet-stream",
            folderId: item.folderId,
          }),
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) {
          throw new Error(confirmData.error || "Could not register file.");
        }
        if (confirmData.file) {
          const created = confirmData.file as StoredFile;
          setFiles((prev) => [created, ...prev]);
          setUsage((prev) =>
            prev
              ? {
                  ...prev,
                  usedBytes: prev.usedBytes + created.size,
                  fileCount: prev.fileCount + 1,
                }
              : prev
          );
        }
      };

      const worker = async () => {
        while (!failed && cursor < ok.length) {
          const idx = cursor++;
          try {
            await uploadSingle(idx, ok[idx]);
          } catch (err) {
            failed = true;
            addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Unknown error");
          }
        }
      };

      const concurrency = Math.min(3, ok.length);
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      setUploading(false);
      setUploadProgress(0);
      folderCache.current.clear();
      if (!failed) {
        addToast(
          "success",
          "Upload Complete",
          `${ok.length} ${ok.length === 1 ? "file" : "files"} backed up.`
        );
      } else {
        await refresh();
      }
    },
    [addToast, refresh]
  );

  // Global keyboard shortcuts & paste-to-upload
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setClipboardOpen((prev) => !prev);
        return;
      }
      if (e.altKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        setMailOpen((prev) => !prev);
        return;
      }
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setFolderNameInput("");
        setModal("newFolder");
        return;
      }
      if (e.key === "/" && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (modal !== null) {
          setModal(null);
          setModalFolder(null);
        } else if (clipboardOpen) {
          setClipboardOpen(false);
        } else if (mailOpen) {
          setMailOpen(false);
        } else if (mailSelected.size > 0) {
          setMailSelected(new Set());
        }
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      const pastedFiles = Array.from(e.clipboardData?.files || []);
      if (pastedFiles.length > 0) {
        e.preventDefault();
        void startUploads(
          pastedFiles.map((file) => ({ file, folderId: currentFolderId }))
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, [modal, clipboardOpen, mailOpen, mailSelected.size, currentFolderId, startUploads]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.items || []);
    const entries = items
      .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
      .filter((x): x is FileSystemEntry => x !== null);
    if (entries.length > 0) {
      const collected: CollectEntry[] = [];
      void (async () => {
        for (const entry of entries) {
          await walkEntry(entry, [], collected);
        }
        try {
          const pending = await buildPendingUploads(collected, currentFolderId);
          void startUploads(pending);
        } catch (err) {
          addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Could not read dropped items.");
        }
      })();
    } else {
      void startUploads(
        Array.from(e.dataTransfer.files || []).map((file) => ({ file, folderId: currentFolderId }))
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      void startUploads(selected.map((file) => ({ file, folderId: currentFolderId })));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      const collected: CollectEntry[] = selected.map((file) => {
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = relPath.split("/").filter(Boolean);
        return { file, dirs: parts.slice(0, -1) };
      });
      void (async () => {
        try {
          const pending = await buildPendingUploads(collected, currentFolderId);
          void startUploads(pending);
        } catch (err) {
          addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Could not read folder.");
        }
      })();
    }
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const triggerBrowserDownload = async (url: string, filename: string) => {
    try {
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        const cldErr = fileRes.headers.get("x-cld-error");
        if (fileRes.status === 401 && (cldErr?.includes("ACL") || cldErr?.includes("deny"))) {
          throw new Error(
            'Cloudinary security block: Enable "Allow delivery of PDF and ZIP files" in Cloudinary Console > Settings > Security.'
          );
        }
        throw new Error(cldErr || `Storage returned ${fileRes.status}`);
      }
      const blob = await fileRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Cloudinary security block")) {
        throw err;
      }
      window.open(url, "_blank");
    }
  };

  const handleDownload = async (file: StoredFile) => {
    try {
      const res = await fetch(`/api/files/${file.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not prepare download.");
      if (data.success && data.url) {
        await triggerBrowserDownload(data.url, file.name);
      } else {
        throw new Error("Invalid download URL in response");
      }
    } catch (err) {
      addToast("danger", "Download Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleBulkDownload = async () => {
    const selectedFilesList = files.filter((f) => mailSelected.has(f.id));
    if (selectedFilesList.length === 0) return;

    for (const file of selectedFilesList) {
      try {
        const res = await fetch(`/api/files/${file.id}`);
        const data = await res.json();
        if (res.ok && data.success && data.url) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          await triggerBrowserDownload(data.url, file.name);
        }
      } catch (err) {
        addToast(
          "danger",
          "Download Failed",
          err instanceof Error ? err.message : `Failed to download ${file.name}`
        );
      }
    }
  };

  const handleDelete = async (file: StoredFile) => {
    setDeletingId(file.id);
    try {
      const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete file.");
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setUsage((prev) =>
        prev
          ? {
              ...prev,
              usedBytes: Math.max(0, prev.usedBytes - file.size),
              fileCount: Math.max(0, prev.fileCount - 1),
            }
          : prev
      );
      setMailSelected((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      addToast("success", "Deleted", `"${file.name}" removed from your board.`);
    } catch (err) {
      addToast("danger", "Delete Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(mailSelected);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      let deletedCount = 0;
      let freedBytes = 0;
      const deletedSet = new Set<string>();
      await Promise.all(
        ids.map(async (id) => {
          const target = files.find((f) => f.id === id);
          const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
          if (res.ok) {
            deletedCount += 1;
            freedBytes += target?.size || 0;
            deletedSet.add(id);
          }
        })
      );
      setFiles((prev) => prev.filter((f) => !deletedSet.has(f.id)));
      setUsage((prev) =>
        prev
          ? {
              ...prev,
              usedBytes: Math.max(0, prev.usedBytes - freedBytes),
              fileCount: Math.max(0, prev.fileCount - deletedCount),
            }
          : prev
      );
      setMailSelected(new Set());
      setModal(null);
      addToast("success", "Deleted", `Removed ${deletedCount} file(s).`);
    } catch {
      addToast("danger", "Delete Failed", "Could not delete some selected files.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!modalFolder) return;
    const folder = modalFolder;
    setDeletingFolderBusy(true);
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete folder.");
      if (currentFolderId === folder.id) {
        setCurrentFolderId(folder.parentId);
      }
      setModal(null);
      setModalFolder(null);
      await refresh();
      addToast("success", "Folder Deleted", `"${folder.name}" and its contents were removed.`);
    } catch (err) {
      addToast("danger", "Delete Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingFolderBusy(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = folderNameInput.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create folder.");
      if (data.folder) {
        setFolders((prev) => [...prev, data.folder]);
      } else {
        await refresh();
      }
      setModal(null);
      setFolderNameInput("");
      addToast("success", "Folder Created", `"${name}" is ready.`);
    } catch (err) {
      addToast("danger", "Create Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRenameFolder = async () => {
    const name = folderNameInput.trim();
    if (!name || !modalFolder) return;
    try {
      const res = await fetch(`/api/folders/${modalFolder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not rename folder.");
      setFolders((prev) =>
        prev.map((f) => (f.id === modalFolder.id ? { ...f, name } : f))
      );
      setModal(null);
      setModalFolder(null);
      addToast("success", "Renamed", `Folder is now "${name}".`);
    } catch (err) {
      addToast("danger", "Rename Failed", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleMoveFiles = async () => {
    const fileIds = Array.from(mailSelected);
    if (fileIds.length === 0) return;
    setMoving(true);
    try {
      const res = await fetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderId: moveTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not move files.");
      const movedSet = new Set(fileIds);
      setFiles((prev) =>
        prev.map((f) => (movedSet.has(f.id) ? { ...f, folderId: moveTarget } : f))
      );
      setModal(null);
      setMailSelected(new Set());
      addToast("success", "Moved", `${data.moved} file(s) moved.`);
    } catch (err) {
      addToast("danger", "Move Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMoving(false);
    }
  };

  const toggleMailSelect = (id: string) => {
    setMailSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleQuickMailSingle = (file: StoredFile) => {
    setMailSelected((prev) => {
      const next = new Set(prev);
      next.add(file.id);
      return next;
    });
    if (!mailTo) {
      setMailTo(email);
    }
    setMailOpen(true);
  };

  const handleQuickMoveSingle = (file: StoredFile) => {
    setMailSelected(new Set([file.id]));
    setMoveTarget(file.folderId);
    setModal("moveFiles");
  };

  const handleSendMail = async () => {
    const finalTo = normalizeEmail(mailTo);
    setMailTo(finalTo);
    if (!finalTo) {
      addToast("danger", "Recipient Required", "Please enter a recipient email address.");
      return;
    }
    setSendingMail(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: finalTo,
          subject: mailSubject,
          body: mailBody,
          fileIds: Array.from(mailSelected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not send mail.");
      }
      // Save to recent recipients
      const updatedRecents = [
        finalTo,
        ...recentRecipients.filter((r) => r.toLowerCase() !== finalTo.toLowerCase()),
      ].slice(0, 4);
      setRecentRecipients(updatedRecents);
      try {
        localStorage.setItem("swosh_recent_recipients", JSON.stringify(updatedRecents));
      } catch {
        // ignore
      }

      addToast("success", "Mail Sent", data.message || "Email dispatched via Swoshmail.");
      setMailOpen(false);
      setMailSubject("");
      setMailBody("");
      setMailSelected(new Set());
    } catch (err) {
      addToast("danger", "Send Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSendingMail(false);
    }
  };

  const percent =
    usage && usage.limitBytes > 0 ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;
  const selectedFiles = files.filter((f) => mailSelected.has(f.id));
  const selectedTotalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  // Precompute file counts per folder in O(N)
  const folderFileCounts = new Map<string | null, number>();
  for (const f of files) {
    folderFileCounts.set(f.folderId, (folderFileCounts.get(f.folderId) || 0) + 1);
  }

  const breadcrumbs: Folder[] = [];
  {
    let cursor = folders.find((f) => f.id === currentFolderId) ?? null;
    while (cursor) {
      breadcrumbs.unshift(cursor);
      cursor = folders.find((f) => f.id === cursor?.parentId) ?? null;
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleFolders = folders
    .filter((f) =>
      normalizedSearch
        ? f.name.toLowerCase().includes(normalizedSearch)
        : f.parentId === currentFolderId
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const visibleFiles = files
    .filter((f) =>
      normalizedSearch
        ? f.name.toLowerCase().includes(normalizedSearch)
        : f.folderId === currentFolderId
    )
    .sort((a, b) => {
      if (sortBy === "date-desc") return b.createdAt - a.createdAt;
      if (sortBy === "date-asc") return a.createdAt - b.createdAt;
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "size-desc") return b.size - a.size;
      if (sortBy === "size-asc") return a.size - b.size;
      return 0;
    });

  const allVisibleSelected =
    visibleFiles.length > 0 && visibleFiles.every((f) => mailSelected.has(f.id));

  const toggleSelectAllVisible = () => {
    setMailSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const f of visibleFiles) next.delete(f.id);
      } else {
        for (const f of visibleFiles) next.add(f.id);
      }
      return next;
    });
  };

  const renderFolderTree = (parentId: string | null, depth: number): Folder[] => {
    return folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((f) => [f, ...renderFolderTree(f.id, depth + 1)]);
  };

  const folderDepth = (folder: Folder): number => {
    let depth = 0;
    let cursor = folder.parentId;
    while (cursor) {
      depth += 1;
      cursor = folders.find((f) => f.id === cursor)?.parentId ?? null;
    }
    return depth;
  };

  const filteredClips = clips.filter((c) => {
    if (!clipSearch.trim()) return true;
    const q = clipSearch.toLowerCase();
    return (
      (c.title && c.title.toLowerCase().includes(q)) ||
      c.content.toLowerCase().includes(q)
    );
  });

  const currentFolderName =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "Root";

  return (
    <div
      className="dashboard-body"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <a href="#board-main" className="skip-link">
        Skip to files and folders
      </a>

      <header className="dashboard-header glass-panel">
        <div className="logo-group">
          <div className="logo-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <div>
            <span className="logo-text">Swoshboard</span>
            <span className="logo-badge">PERSONAL CLOUD &amp; MAIL</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary theme-toggle-btn"
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Click to switch theme`}
            title={`Theme: ${theme} (click to switch)`}
          >
            <span aria-hidden="true">
              {theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🖥️"}
            </span>
            <span className="theme-label">
              {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"}
            </span>
          </button>

          <button
            type="button"
            className={`btn-secondary ${mailOpen ? "active-pill" : ""}`}
            onClick={() => {
              if (!mailOpen && !mailTo) setMailTo(email);
              setMailOpen(!mailOpen);
            }}
            aria-expanded={mailOpen}
            title="Quick Mail (Alt+M)"
          >
            <span aria-hidden="true">✉️</span> Quick Mail
            {mailSelected.size > 0 && (
              <span className="header-badge">{mailSelected.size}</span>
            )}
          </button>

          <button
            type="button"
            className={`btn-secondary clipboard-toggle-btn ${clipboardOpen ? "active" : ""}`}
            onClick={() => setClipboardOpen(!clipboardOpen)}
            aria-expanded={clipboardOpen}
            aria-controls="clipboard-drawer"
            title="Open Clipboard (Alt+C)"
          >
            <span aria-hidden="true">📋</span> Clipboard
            {clips.length > 0 && (
              <span className="header-badge" aria-label={`${clips.length} saved clips`}>
                {clips.length}
              </span>
            )}
          </button>

          <span className="user-chip" title={email} aria-label={`Signed in as ${email}`}>
            {email}
          </span>
          <button type="button" className="btn-secondary" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Overview Stats Strip */}
      <section className="stats-strip" aria-label="Account overview">
        <div className="stat-card glass-panel">
          <div className="stat-card-top">
            <span className="stat-label">Storage Quota</span>
            <span className="stat-pill">{Math.round(percent)}%</span>
          </div>
          <div className="stat-value">
            {usage ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.limitBytes)}` : "—"}
          </div>
          <div
            className="usage-bar"
            role="progressbar"
            aria-label="Storage quota usage"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`usage-bar-fill ${percent > 85 ? "usage-high" : ""}`}
              style={{ width: `${percent}%` }}
            ></div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card-top">
            <span className="stat-label">Backed Up Files</span>
            <span className="stat-emoji" aria-hidden="true">📦</span>
          </div>
          <div className="stat-value">{usage ? usage.fileCount : files.length}</div>
          <div className="stat-sub">{folders.length} folder(s) organized</div>
        </div>

        <div
          className="stat-card glass-panel stat-card-interactive"
          role="button"
          tabIndex={0}
          onClick={() => setClipboardOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setClipboardOpen(true);
            }
          }}
        >
          <div className="stat-card-top">
            <span className="stat-label">Cloud Clipboard</span>
            <span className="shortcut-hint">Alt+C</span>
          </div>
          <div className="stat-value">{clips.length} Clips</div>
          <div className="stat-sub">
            {scratchpad.trim()
              ? `Scratchpad: ${scratchpad.trim().split(/\s+/).length} words`
              : "Click to open scratchpad & clips"}
          </div>
        </div>
      </section>

      <main id="board-main" className="dashboard-grid">
        <section className="board-panel glass-panel" aria-labelledby="board-heading">
          <div className="panel-head">
            <div className="panel-title-wrap">
              <h1 id="board-heading" className="panel-title">My Backup Space</h1>
              <span className="usage-label">
                Viewing <strong>{currentFolderName}</strong> · Drop or paste files anywhere to upload
              </span>
            </div>

            <div className="board-toolbar">
              <button
                type="button"
                className="btn-primary btn-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                <span aria-hidden="true">＋</span> Upload Files
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => folderInputRef.current?.click()}
              >
                <span aria-hidden="true">📂</span> Upload Folder
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setModal("newFolder");
                  setFolderNameInput("");
                }}
                title="Create new folder (Alt+N)"
              >
                <span aria-hidden="true">📁</span> New Folder
              </button>
              <input
                type="file"
                ref={folderInputRef}
                onChange={handleFolderChange}
                style={{ display: "none" }}
                multiple
                aria-hidden="true"
                tabIndex={-1}
                {...{ webkitdirectory: "" }}
              />
            </div>
          </div>

          <nav className="breadcrumb" aria-label="Folder breadcrumb">
            <button
              type="button"
              className={`breadcrumb-btn ${currentFolderId === null ? "active" : ""}`}
              aria-current={currentFolderId === null ? "location" : undefined}
              onClick={() => {
                setCurrentFolderId(null);
                setSearchQuery("");
              }}
            >
              🏠 Root
            </button>
            {breadcrumbs.map((f, idx) => {
              const isCurrent = idx === breadcrumbs.length - 1;
              return (
                <span key={f.id} className="breadcrumb-item">
                  <span className="breadcrumb-sep" aria-hidden="true">/</span>
                  <button
                    type="button"
                    className={`breadcrumb-btn ${isCurrent ? "active" : ""}`}
                    aria-current={isCurrent ? "location" : undefined}
                    onClick={() => {
                      setCurrentFolderId(f.id);
                      setSearchQuery("");
                    }}
                  >
                    {f.name}
                  </button>
                </span>
              );
            })}
          </nav>

          <div
            role="button"
            tabIndex={0}
            aria-label={
              uploading
                ? `Uploading ${uploadName}, ${uploadProgress}% complete`
                : "Drop files or folders here, or press Enter to browse files to upload"
            }
            className={`sw-dropzone ${isDragging ? "active" : ""} ${uploading ? "uploading" : ""}`}
            onClick={() => {
              if (!uploading) fileInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !uploading) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
              multiple
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className="dropzone-content">
              <div className="dropzone-icon" aria-hidden="true">
                {uploading ? "⏳" : isDragging ? "📥" : "☁️"}
              </div>
              <div className="dropzone-text">
                <div className="dropzone-title">
                  {uploading
                    ? `Uploading ${uploadName}...`
                    : isDragging
                      ? `Drop to upload into "${currentFolderName}"`
                      : "Drag & drop files or folders here, or click to browse"}
                </div>
                <div className="dropzone-subtitle">
                  Supports any file type up to 10 MB · Press <kbd>Ctrl+V</kbd> anywhere to paste files
                </div>
              </div>
            </div>
            {uploading && (
              <div
                className="progress-container"
                role="progressbar"
                aria-label={`Uploading ${uploadName}`}
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="progress-bar-wrapper">
                  <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <div className="progress-label" aria-live="polite">{uploadProgress}%</div>
              </div>
            )}
          </div>

          {(files.length > 0 || folders.length > 0) && (
            <div className="filter-bar" role="search" aria-label="Filter and sort files">
              <div className="search-field-wrap">
                <label htmlFor="board-search" className="sr-only">
                  Search files and folders
                </label>
                <input
                  id="board-search"
                  ref={searchInputRef}
                  type="search"
                  className="form-input filter-search-input"
                  placeholder="Search files & folders... (Press /)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="filter-controls">
                <label htmlFor="board-sort" className="sr-only">
                  Sort files by
                </label>
                <select
                  id="board-sort"
                  className="form-input filter-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                >
                  <option value="date-desc">Newest first</option>
                  <option value="date-asc">Oldest first</option>
                  <option value="name-asc">Name (A–Z)</option>
                  <option value="size-desc">Size (Largest)</option>
                  <option value="size-asc">Size (Smallest)</option>
                </select>

                <div className="view-toggle" role="group" aria-label="View layout">
                  <button
                    type="button"
                    className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    title="List view"
                  >
                    ☰
                  </button>
                  <button
                    type="button"
                    className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
                    onClick={() => setViewMode("grid")}
                    aria-pressed={viewMode === "grid"}
                    title="Grid view"
                  >
                    ⊞
                  </button>
                </div>

                {visibleFiles.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    onClick={toggleSelectAllVisible}
                    aria-pressed={allVisibleSelected}
                  >
                    {allVisibleSelected ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="skeleton-list" role="status" aria-live="polite" aria-label="Loading your files">
              <div className="skeleton-row"></div>
              <div className="skeleton-row"></div>
              <div className="skeleton-row"></div>
            </div>
          ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div className="empty-state" role="status">
              {normalizedSearch ? (
                <p>No files or folders match &ldquo;{searchQuery}&rdquo;.</p>
              ) : (
                <p>
                  This folder is empty. Drop files above, paste from your clipboard (<kbd>Ctrl+V</kbd>), or create a folder to organize your backups.
                </p>
              )}
            </div>
          ) : (
            <div
              className={`file-list ${viewMode === "grid" ? "file-grid" : ""}`}
              role="list"
              aria-label="Folders and files"
            >
              {visibleFolders.map((folder) => {
                const count = folderFileCounts.get(folder.id) || 0;
                return (
                  <div className="file-card folder-row" role="listitem" key={folder.id}>
                    <button
                      type="button"
                      className="file-info folder-open-btn"
                      onClick={() => {
                        setCurrentFolderId(folder.id);
                        setSearchQuery("");
                      }}
                      aria-label={`Open folder ${folder.name}, contains ${count} file(s)`}
                    >
                      <span className="file-icon-tile tone-amber" aria-hidden="true">📁</span>
                      <div className="file-meta">
                        <div className="file-name" title={folder.name}>{folder.name}</div>
                        <div className="file-sub">
                          Folder · {count} {count === 1 ? "file" : "files"}
                        </div>
                      </div>
                    </button>
                    <div className="file-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Rename folder ${folder.name}`}
                        title="Rename folder"
                        onClick={() => {
                          setModalFolder(folder);
                          setFolderNameInput(folder.name);
                          setModal("renameFolder");
                        }}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Delete folder ${folder.name}`}
                        title="Delete folder"
                        disabled={deletingId === folder.id}
                        onClick={() => {
                          setModalFolder(folder);
                          setModal("deleteFolder");
                        }}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {visibleFiles.map((file) => {
                const isSelected = mailSelected.has(file.id);
                const visual = getFileVisual(file.name, file.mime);
                return (
                  <div
                    className={`file-card ${isSelected ? "selected" : ""}`}
                    role="listitem"
                    key={file.id}
                  >
                    <label className="mail-check" title={`Select ${file.name}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMailSelect(file.id)}
                        aria-label={`Select ${file.name}`}
                      />
                    </label>
                    <div
                      className="file-info file-select-trigger"
                      onClick={() => toggleMailSelect(file.id)}
                    >
                      <span className={`file-icon-tile ${visual.tone}`} aria-hidden="true">
                        {visual.icon}
                      </span>
                      <div className="file-meta">
                        <div className="file-name-row">
                          <span className="file-name" title={file.name}>{file.name}</span>
                          <span className="file-badge" aria-hidden="true">{visual.badge}</span>
                        </div>
                        <div className="file-sub">
                          {formatBytes(file.size)} · {formatDate(file.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="file-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Email ${file.name}`}
                        title="Quick Mail this file"
                        onClick={() => handleQuickMailSingle(file)}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                          <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move ${file.name}`}
                        title="Move to folder"
                        onClick={() => handleQuickMoveSingle(file)}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Download ${file.name}`}
                        title="Download"
                        onClick={() => handleDownload(file)}
                      >
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Delete ${file.name}`}
                        title="Delete"
                        disabled={deletingId === file.id}
                        onClick={() => handleDelete(file)}
                      >
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {mailOpen && (
          <aside className="mail-panel glass-panel" aria-labelledby="quick-mail-heading">
            <div className="panel-head">
              <div>
                <h2 id="quick-mail-heading" className="panel-title">Quick Mail</h2>
                <span className="usage-label">Dispatched securely via Swoshmail</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close Quick Mail panel"
                onClick={() => setMailOpen(false)}
              >
                ✕
              </button>
            </div>

            {selectedFiles.length > 0 ? (
              <div className="mail-attachment-list" aria-label="Selected attachments">
                <div className="mail-attachment-head">
                  <span>{selectedFiles.length} Attachment(s)</span>
                  <span>{formatBytes(selectedTotalBytes)}</span>
                </div>
                {selectedFiles.map((f) => (
                  <div className="mail-attachment" key={f.id}>
                    <span className="mail-attachment-name" title={f.name}>📎 {f.name}</span>
                    <button
                      type="button"
                      className="attachment-remove-btn"
                      onClick={() => toggleMailSelect(f.id)}
                      aria-label={`Remove ${f.name} from email`}
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mail-empty-attachments">
                No file attachments selected — you can send a text note directly or check files on the left to attach them.
              </div>
            )}

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="mail-to" className="form-label" style={{ marginBottom: 0 }}>
                  To
                </label>
                {mailTo.toLowerCase() !== email.toLowerCase() && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: "12px" }}
                    onClick={() => setMailTo(email)}
                  >
                    + Send to myself
                  </button>
                )}
              </div>
              <div className="input-wrapper">
                <input
                  id="mail-to"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="form-input"
                  placeholder="username or recipient@example.com"
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                  onBlur={() => setMailTo((prev) => normalizeEmail(prev))}
                  required
                />
                {mailTo.trim().length > 0 && !mailTo.includes("@") && (
                  <span className="email-domain-hint" aria-hidden="true">@gmail.com</span>
                )}
              </div>

              {recentRecipients.length > 0 && (
                <div className="recipient-pills" aria-label="Recent recipients">
                  {recentRecipients.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`recipient-pill ${mailTo === r ? "active" : ""}`}
                      onClick={() => setMailTo(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="mail-subject" className="form-label">Subject</label>
              <input
                id="mail-subject"
                type="text"
                className="form-input"
                placeholder={
                  selectedFiles.length > 0
                    ? `Swoshboard: ${selectedFiles[0].name}${selectedFiles.length > 1 ? ` (+${selectedFiles.length - 1} more)` : ""}`
                    : "Note from Swoshboard"
                }
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="mail-body" className="form-label" style={{ marginBottom: 0 }}>
                  Notes / Body
                </label>
                {scratchpad.trim() && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: "12px" }}
                    onClick={handleInsertScratchpadToMail}
                  >
                    + Paste Scratchpad
                  </button>
                )}
              </div>
              <textarea
                id="mail-body"
                className="form-input"
                rows={4}
                placeholder="Write a message or paste notes..."
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
              ></textarea>
            </div>

            <button
              type="button"
              className="btn-primary"
              disabled={sendingMail || (!mailBody.trim() && selectedFiles.length === 0)}
              aria-busy={sendingMail}
              onClick={handleSendMail}
            >
              {sendingMail ? <div className="spinner" aria-hidden="true"></div> : "Send via Swoshmail"}
            </button>
          </aside>
        )}
      </main>

      {/* Floating Bulk Action Bar */}
      {mailSelected.size > 0 && (
        <div className="floating-action-bar glass-panel" role="region" aria-label="Selected files actions">
          <div className="floating-bar-info">
            <span className="selection-count-badge">{mailSelected.size}</span>
            <span>
              selected ({formatBytes(selectedTotalBytes)})
            </span>
          </div>
          <div className="floating-bar-buttons">
            <button
              type="button"
              className="btn-primary btn-auto"
              onClick={() => {
                if (!mailTo) setMailTo(email);
                setMailOpen(true);
              }}
            >
              <span aria-hidden="true">✉️</span> Mail
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBulkDownload}
            >
              <span aria-hidden="true">⬇️</span> Download
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setMoveTarget(null);
                setModal("moveFiles");
              }}
            >
              <span aria-hidden="true">📁</span> Move
            </button>
            <button
              type="button"
              className="btn-secondary danger-text"
              onClick={() => setModal("bulkDelete")}
            >
              <span aria-hidden="true">🗑️</span> Delete
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMailSelected(new Set())}
              aria-label="Clear selection"
              title="Clear selection (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <footer className="sw-footer">
        <span className="powered-by">
          Powered by <span className="powered-by-name">Swoshmail</span>
        </span>
        <a
          href="https://github.com/srijankulal"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          GitHub
        </a>
      </footer>

      {(modal === "newFolder" || (modal === "renameFolder" && modalFolder)) && (
        <div
          className="modal-overlay"
          onClick={() => {
            setModal(null);
            setModalFolder(null);
          }}
        >
          <div
            className="modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="folder-modal-title" className="modal-title">
              {modal === "newFolder" ? "Create Folder" : "Rename Folder"}
            </h2>
            <div className="form-group">
              <label htmlFor="folder-name-input" className="form-label">Folder name</label>
              <input
                id="folder-name-input"
                type="text"
                className="form-input"
                placeholder="e.g. Projects"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (modal === "newFolder") void handleCreateFolder();
                    else void handleRenameFolder();
                  }
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setModal(null);
                  setModalFolder(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!folderNameInput.trim()}
                onClick={modal === "newFolder" ? handleCreateFolder : handleRenameFolder}
              >
                {modal === "newFolder" ? "Create" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "deleteFolder" && modalFolder && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!deletingFolderBusy) {
              setModal(null);
              setModalFolder(null);
            }
          }}
        >
          <div
            className="modal glass-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-folder-title"
            aria-describedby="delete-folder-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-folder-title" className="modal-title">
              Delete &ldquo;{modalFolder.name}&rdquo;?
            </h2>
            <p id="delete-folder-desc" className="modal-desc">
              This will permanently delete the folder <strong>{modalFolder.name}</strong> and all files or subfolders inside it. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingFolderBusy}
                onClick={() => {
                  setModal(null);
                  setModalFolder(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-danger"
                disabled={deletingFolderBusy}
                aria-busy={deletingFolderBusy}
                onClick={confirmDeleteFolder}
              >
                {deletingFolderBusy ? <div className="spinner" aria-hidden="true"></div> : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "bulkDelete" && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!bulkDeleting) setModal(null);
          }}
        >
          <div
            className="modal glass-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
            aria-describedby="bulk-delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bulk-delete-title" className="modal-title">
              Delete {mailSelected.size} selected file(s)?
            </h2>
            <p id="bulk-delete-desc" className="modal-desc">
              This will permanently remove {mailSelected.size} file(s) ({formatBytes(selectedTotalBytes)}) from your Swoshboard storage. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={bulkDeleting}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-danger"
                disabled={bulkDeleting}
                aria-busy={bulkDeleting}
                onClick={handleBulkDelete}
              >
                {bulkDeleting ? <div className="spinner" aria-hidden="true"></div> : "Delete Files"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "moveFiles" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div
            className="modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="move-modal-title" className="modal-title">
              Move {mailSelected.size} file(s) to...
            </h2>
            <div className="folder-picker" role="listbox" aria-label="Target folder">
              <button
                type="button"
                role="option"
                aria-selected={moveTarget === null}
                className={`move-option ${moveTarget === null ? "selected" : ""}`}
                onClick={() => setMoveTarget(null)}
              >
                <span className="file-icon" aria-hidden="true">🏠</span> Root folder
              </button>
              {renderFolderTree(null, 0).map((folder) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={moveTarget === folder.id}
                  key={folder.id}
                  className={`move-option ${moveTarget === folder.id ? "selected" : ""}`}
                  style={{ paddingLeft: `${16 + folderDepth(folder) * 22}px` }}
                  onClick={() => setMoveTarget(folder.id)}
                >
                  <span className="file-icon" aria-hidden="true">📁</span> {folder.name}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={moving}
                aria-busy={moving}
                onClick={handleMoveFiles}
              >
                {moving ? <div className="spinner" aria-hidden="true"></div> : "Move here"}
              </button>
            </div>
          </div>
        </div>
      )}

      {clipboardOpen && (
        <div className="drawer-overlay" onClick={() => setClipboardOpen(false)}>
          <aside
            id="clipboard-drawer"
            className="clipboard-drawer glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clipboard-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className="drawer-icon" aria-hidden="true">📋</span>
                <h2 id="clipboard-drawer-title" className="drawer-title">My Clipboard</h2>
              </div>
              <div className="drawer-header-actions">
                <span className="shortcut-hint" title="Keyboard shortcut">Alt+C</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setClipboardOpen(false)}
                  aria-label="Close Clipboard drawer"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="clipboard-tabs" role="tablist" aria-label="Clipboard sections">
              <button
                type="button"
                role="tab"
                id="tab-scratchpad"
                aria-selected={clipboardTab === "scratchpad"}
                aria-controls="panel-scratchpad"
                className={`clipboard-tab ${clipboardTab === "scratchpad" ? "active" : ""}`}
                onClick={() => setClipboardTab("scratchpad")}
              >
                <span aria-hidden="true">📝</span> Scratchpad
              </button>
              <button
                type="button"
                role="tab"
                id="tab-clips"
                aria-selected={clipboardTab === "clips"}
                aria-controls="panel-clips"
                className={`clipboard-tab ${clipboardTab === "clips" ? "active" : ""}`}
                onClick={() => setClipboardTab("clips")}
              >
                <span aria-hidden="true">📌</span> Saved Clips ({clips.length})
              </button>
            </div>

            {clipboardTab === "scratchpad" ? (
              <div
                id="panel-scratchpad"
                role="tabpanel"
                aria-labelledby="tab-scratchpad"
                className="scratchpad-view"
              >
                <div className="scratchpad-meta">
                  <div className="scratchpad-counts" aria-live="polite">
                    {scratchpad.length} chars · {scratchpad.trim() ? scratchpad.trim().split(/\s+/).length : 0} words
                  </div>
                  <div className={`save-status status-${scratchpadStatus}`} role="status" aria-live="polite">
                    {scratchpadStatus === "saving" && "Saving..."}
                    {scratchpadStatus === "saved" && "Saved ✓"}
                    {scratchpadStatus === "error" && "Save error"}
                    {scratchpadStatus === "idle" && "Auto-saves"}
                  </div>
                </div>

                <label htmlFor="scratchpad-input" className="sr-only">
                  Scratchpad content
                </label>
                <textarea
                  id="scratchpad-input"
                  className="scratchpad-textarea form-input"
                  placeholder="Paste or type text, links, code, or snippets here... Everything you type is saved automatically to your account and accessible anytime."
                  value={scratchpad}
                  onChange={(e) => handleScratchpadChange(e.target.value)}
                  rows={14}
                />

                <div className="scratchpad-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!scratchpad}
                    onClick={handleCopyScratchpad}
                  >
                    {copiedScratchpad ? "Copied! ✓" : "📋 Copy All"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!scratchpad.trim() || savingClip}
                    onClick={handleSaveScratchpadAsClip}
                  >
                    💾 Save as Clip
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!scratchpad}
                    onClick={handleInsertScratchpadToMail}
                    title="Insert into Quick Mail body"
                  >
                    ✉️ To Mail
                  </button>
                  <button
                    type="button"
                    className="btn-secondary danger-text"
                    disabled={!scratchpad}
                    onClick={handleClearScratchpad}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div
                id="panel-clips"
                role="tabpanel"
                aria-labelledby="tab-clips"
                className="clips-view"
              >
                <div className="clip-add-form">
                  <label htmlFor="new-clip-title" className="sr-only">
                    Clip title (optional)
                  </label>
                  <input
                    id="new-clip-title"
                    type="text"
                    className="form-input clip-title-input"
                    placeholder="Clip title (optional)"
                    value={newClipTitle}
                    onChange={(e) => setNewClipTitle(e.target.value)}
                    maxLength={100}
                  />
                  <label htmlFor="new-clip-content" className="sr-only">
                    Clip content
                  </label>
                  <textarea
                    id="new-clip-content"
                    className="form-input clip-content-input"
                    placeholder="Clip content..."
                    rows={3}
                    value={newClipContent}
                    onChange={(e) => setNewClipContent(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!newClipContent.trim() || savingClip}
                    aria-busy={savingClip}
                    onClick={handleAddClip}
                  >
                    {savingClip ? <div className="spinner" aria-hidden="true"></div> : "+ Save New Clip"}
                  </button>
                </div>

                {clips.length > 0 && (
                  <div className="clip-search-bar">
                    <label htmlFor="clip-search-input" className="sr-only">
                      Search saved clips
                    </label>
                    <input
                      id="clip-search-input"
                      type="search"
                      className="form-input search-input"
                      placeholder="🔍 Search clips..."
                      value={clipSearch}
                      onChange={(e) => setClipSearch(e.target.value)}
                    />
                  </div>
                )}

                <div className="clips-list" role="list" aria-label="Saved clips">
                  {filteredClips.length === 0 ? (
                    <div className="empty-clips" role="status">
                      {clipSearch
                        ? "No clips match your search."
                        : "No saved clips yet. Add one above or save from your scratchpad!"}
                    </div>
                  ) : (
                    filteredClips.map((clip) => (
                      <div className="clip-card" role="listitem" key={clip.id}>
                        <div className="clip-card-header">
                          <span className="clip-card-title">{clip.title || "Untitled Clip"}</span>
                          <span className="clip-card-date">{formatDate(clip.createdAt)}</span>
                        </div>
                        <div className="clip-card-body">{clip.content}</div>
                        <div className="clip-card-footer">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleCopyClip(clip)}
                          >
                            {copiedClipId === clip.id ? "Copied! ✓" : "Copy"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleSendClipToScratchpad(clip)}
                            title="Append to scratchpad"
                          >
                            To Scratchpad
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleInsertClipToMail(clip)}
                            title="Insert into Quick Mail"
                          >
                            To Mail
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => handleDeleteClip(clip.id)}
                            aria-label={`Delete clip ${clip.title || "Untitled Clip"}`}
                            title="Delete clip"
                          >
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <span className="toast-icon" aria-hidden="true">
              {toast.type === "success" ? "✓" : "⚠"}
            </span>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}