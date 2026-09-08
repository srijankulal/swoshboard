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
  return new Date(ms).toLocaleString();
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
  const [mailSelected, setMailSelected] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [modal, setModal] = useState<null | "newFolder" | "renameFolder" | "moveFiles">(null);
  const [modalFolder, setModalFolder] = useState<Folder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
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
  const isClipboardLoaded = useRef(false);
  const scratchpadSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadQueue = useRef<PendingUpload[]>([]);
  const uploadTotalBytes = useRef(0);
  const uploadDoneBytes = useRef(0);
  const folderCache = useRef<Map<string, string | null>>(new Map());

  const addToast = useCallback((type: "success" | "danger", title: string, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4800);
  }, []);

  const refresh = async () => {
    try {
      const res = await fetch("/api/files");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      const folderRes = await fetch("/api/folders");
      const folderData = await folderRes.json();
      if (res.ok) {
        setFiles(data.files);
        setUsage(data.usage);
        setMailSelected((prev) => {
          const ids = new Set(data.files.map((f: StoredFile) => f.id));
          return new Set([...prev].filter((id) => ids.has(id)));
        });
      }
      if (folderRes.ok) {
        setFolders(folderData.folders);
        folderCache.current.clear();
      }
    } catch {
      addToast("danger", "Error", "Could not load your board.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/files");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        const folderRes = await fetch("/api/folders");
        const folderData = await folderRes.json();
        if (res.ok && !cancelled) {
          setFiles(data.files);
          setUsage(data.usage);
          setMailSelected((prev) => {
            const ids = new Set(data.files.map((f: StoredFile) => f.id));
            return new Set([...prev].filter((id) => ids.has(id)));
          });
        }
        if (folderRes.ok && !cancelled) {
          setFolders(folderData.folders);
        }
      } catch {
        addToast("danger", "Error", "Could not load your board.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clipboard");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setScratchpad(data.scratchpad || "");
          setClips(data.clips || []);
          isClipboardLoaded.current = true;
        }
      } catch {
        // silent fallback
      }
    })();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setClipboardOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
          startUploads(pending);
        } catch (err) {
          addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Could not read dropped items.");
        }
      })();
    } else {
      startUploads(Array.from(e.dataTransfer.files || []).map((file) => ({ file, folderId: currentFolderId })));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      startUploads(selected.map((file) => ({ file, folderId: currentFolderId })));
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
          startUploads(pending);
        } catch (err) {
          addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Could not read folder.");
        }
      })();
    }
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const startUploads = (items: PendingUpload[]) => {
    const tooBig = items.filter((i) => i.file.size > 10 * 1024 * 1024);
    const ok = items.filter((i) => i.file.size <= 10 * 1024 * 1024);
    if (tooBig.length > 0) {
      addToast(
        "danger",
        "Skipped Oversized Files",
        `${tooBig.length} file(s) skipped: ${tooBig.map((i) => i.file.name).slice(0, 3).join(", ")}${tooBig.length > 3 ? "..." : ""} (10 MB per-file limit).`
      );
    }
    uploadQueue.current = ok;
    uploadTotalBytes.current = ok.reduce((sum, i) => sum + i.file.size, 0);
    uploadDoneBytes.current = 0;
    if (ok.length === 0) {
      setUploading(false);
      setUploadProgress(0);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    void uploadNext();
  };

  const uploadNext = async () => {
    const item = uploadQueue.current.shift();
    if (!item) {
      setUploading(false);
      setUploadProgress(0);
      folderCache.current.clear();
      await refresh();
      return;
    }
    const file = item.file;
    setUploadName(file.name);

    try {
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
            const done = uploadDoneBytes.current + event.loaded;
            const total = uploadTotalBytes.current || 1;
            setUploadProgress(Math.min(100, Math.round((done / total) * 100)));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
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
      uploadDoneBytes.current += file.size;

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
    } catch (err) {
      addToast("danger", "Upload Failed", err instanceof Error ? err.message : "Unknown error");
      uploadQueue.current = [];
      setUploading(false);
      setUploadProgress(0);
      await refresh();
      return;
    }

    void uploadNext();
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
      // Fallback
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
          await new Promise((resolve) => setTimeout(resolve, 300));
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

  const handleDeleteFolder = async (folder: Folder) => {
    if (!window.confirm(`Delete folder "${folder.name}" and everything inside it? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete folder.");
      if (currentFolderId === folder.id) {
        setCurrentFolderId(folder.parentId);
      }
      await refresh();
      addToast("success", "Folder Deleted", `"${folder.name}" and its contents were removed.`);
    } catch (err) {
      addToast("danger", "Delete Failed", err instanceof Error ? err.message : "Unknown error");
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
      setModal(null);
      setFolderNameInput("");
      await refresh();
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
      setModal(null);
      setModalFolder(null);
      await refresh();
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
      setModal(null);
      setMailSelected(new Set());
      await refresh();
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

  const handleSendMail = async () => {
    setSendingMail(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: mailTo,
          subject: mailSubject,
          body: mailBody,
          fileIds: Array.from(mailSelected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not send mail.");
      }
      addToast("success", "Mail Sent", data.message || "Email dispatched via Swoshmail.");
      setMailOpen(false);
      setMailTo("");
      setMailSubject("");
      setMailBody("");
      setMailSelected(new Set());
    } catch (err) {
      addToast("danger", "Send Failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSendingMail(false);
    }
  };

  const percent = usage && usage.limitBytes > 0 ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;
  const selectedFiles = files.filter((f) => mailSelected.has(f.id));

  const breadcrumbs: Folder[] = [];
  {
    let cursor = folders.find((f) => f.id === currentFolderId) ?? null;
    while (cursor) {
      breadcrumbs.unshift(cursor);
      cursor = folders.find((f) => f.id === cursor?.parentId) ?? null;
    }
  }

  const visibleFolders = folders
    .filter((f) => f.parentId === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleFiles = files.filter((f) => f.folderId === currentFolderId);

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

  return (
    <div className="dashboard-body">
      <header className="dashboard-header glass-panel">
        <div className="logo-group">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <span className="logo-text">Swoshboard</span>
        </div>
        <div className="header-actions">
          <button
            className={`btn-secondary clipboard-toggle-btn ${clipboardOpen ? "active" : ""}`}
            onClick={() => setClipboardOpen(!clipboardOpen)}
            title="Open Clipboard (Alt+C)"
          >
            📋 Clipboard {clips.length > 0 && <span className="header-badge">{clips.length}</span>}
          </button>
          <span className="user-chip" title={email}>{email}</span>
          <button className="btn-secondary" onClick={handleLogout}>Lock</button>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="board-panel glass-panel">
          <div className="panel-head">
            <h2 className="panel-title">My Backup Space</h2>
            <div className="usage-bar">
              <div className="usage-bar-fill" style={{ width: `${percent}%` }}></div>
            </div>
            <span className="usage-label">
              {usage ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used` : "..."}
              {usage ? ` · ${usage.fileCount} file(s)` : ""}
            </span>
          </div>

          <nav className="breadcrumb">
            <button
              className="breadcrumb-btn"
              onClick={() => setCurrentFolderId(null)}
            >
              Root
            </button>
            {breadcrumbs.map((f) => (
              <span key={f.id} className="breadcrumb-item">
                <span className="breadcrumb-sep">›</span>
                <button className="breadcrumb-btn" onClick={() => setCurrentFolderId(f.id)}>
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="board-toolbar">
            <button className="btn-secondary" onClick={() => { setModal("newFolder"); setFolderNameInput(""); }}>
              + New Folder
            </button>
            <button className="btn-secondary" onClick={() => folderInputRef.current?.click()}>
              ⬆ Upload Folder
            </button>
            <span className="toolbar-note">All file types · max {formatBytes(10 * 1024 * 1024)} per file</span>
            <input
              type="file"
              ref={folderInputRef}
              onChange={handleFolderChange}
              style={{ display: "none" }}
              multiple
              {...{ webkitdirectory: "" }}
            />
          </div>

          <div
            className={`sw-dropzone ${isDragging ? "active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
              multiple
            />
            <div className="dropzone-icon">📦</div>
            <div className="dropzone-title">{uploading ? `Uploading ${uploadName}...` : "Drop files or folders here"}</div>
            <div className="dropzone-subtitle">or click to browse · folders keep their structure</div>
            {uploading && (
              <div className="progress-container">
                <div className="progress-bar-wrapper">
                  <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <div className="progress-label">{uploadProgress}%</div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="empty-state">Loading your board...</div>
          ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div className="empty-state">
              <p>Nothing here yet. Drop files or a whole folder, or create a folder to organize your backups — anything in here can be emailed anytime with Swoshmail.</p>
            </div>
          ) : (
            <div className="file-list">
              {visibleFolders.map((folder) => (
                <div className="file-card folder-row" key={folder.id}>
                  <div className="file-info folder-open" onClick={() => setCurrentFolderId(folder.id)}>
                    <span className="file-icon">📁</span>
                    <div className="file-meta">
                      <div className="file-name" title={folder.name}>{folder.name}</div>
                      <div className="file-sub">Folder · {files.filter((f) => f.folderId === folder.id).length} file(s)</div>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      className="icon-btn"
                      title="Rename folder"
                      onClick={() => { setModalFolder(folder); setFolderNameInput(folder.name); setModal("renameFolder"); }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                      </svg>
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete folder"
                      disabled={deletingId === folder.id}
                      onClick={() => handleDeleteFolder(folder)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {visibleFiles.map((file) => (
                <div className="file-card" key={file.id}>
                  <label className="mail-check" title="Select file">
                    <input
                      type="checkbox"
                      checked={mailSelected.has(file.id)}
                      onChange={() => toggleMailSelect(file.id)}
                    />
                  </label>
                  <div className="file-info">
                    <span className="file-icon">📄</span>
                    <div className="file-meta">
                      <div className="file-name" title={file.name}>{file.name}</div>
                      <div className="file-sub">{formatBytes(file.size)} · {formatDate(file.createdAt)}</div>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button className="icon-btn" title="Download" onClick={() => handleDownload(file)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete"
                      disabled={deletingId === file.id}
                      onClick={() => handleDelete(file)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mail-launch">
            <div className="bulk-actions">
              <button
                className="btn-primary"
                disabled={mailSelected.size === 0}
                onClick={() => setMailOpen(true)}
              >
                ✉ Mail {mailSelected.size > 0 ? `${mailSelected.size} file(s)` : "files"}
              </button>
              <button
                className="btn-secondary"
                disabled={mailSelected.size === 0}
                onClick={handleBulkDownload}
              >
                ⬇ Download {mailSelected.size > 0 ? `${mailSelected.size} file(s)` : "files"}
              </button>
              <button
                className="btn-secondary"
                disabled={mailSelected.size === 0}
                onClick={() => { setMoveTarget(null); setModal("moveFiles"); }}
              >
                📁 Move {mailSelected.size > 0 ? `${mailSelected.size} file(s)` : "files"}
              </button>
            </div>
            <span className="agency-note">Select files with checkboxes • Emails sent via Swoshmail</span>
          </div>
        </section>

        {mailOpen && (
          <aside className="mail-panel glass-panel">
            <div className="panel-head">
              <h2 className="panel-title">Quick Mail</h2>
              <button className="icon-btn" onClick={() => setMailOpen(false)}>✕</button>
            </div>

            <div className="mail-attachment-list">
              {selectedFiles.map((f) => (
                <div className="mail-attachment" key={f.id}>
                  <span>📎 {f.name}</span>
                  <span className="mail-attachment-size">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">To</label>
              <input
                type="email"
                className="form-input"
                placeholder="recipient@example.com"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                placeholder="Backup files from Swoshboard"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
              />
            </div>
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Notes / Body</label>
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
                className="form-input"
                rows={4}
                placeholder="Anything you want to say with the files..."
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
              ></textarea>
            </div>

            <button className="btn-primary" disabled={sendingMail} onClick={handleSendMail}>
              {sendingMail ? <div className="spinner"></div> : "Send via Swoshmail"}
            </button>
          </aside>
        )}
      </main>

      <footer className="sw-footer">
        <span className="powered-by">Powered by <span className="powered-by-name">Swoshmail</span></span>
        <a href="https://github.com/srijankulal" target="_blank" rel="noopener noreferrer" className="github-link">GitHub</a>
      </footer>

      {(modal === "newFolder" || (modal === "renameFolder" && modalFolder)) && (
        <div className="modal-overlay" onClick={() => { setModal(null); setModalFolder(null); }}>
          <div className="modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal === "newFolder" ? "Create Folder" : "Rename Folder"}</div>
            <div className="form-group">
              <label className="form-label">Folder name</label>
              <input
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
              <button className="btn-secondary" onClick={() => { setModal(null); setModalFolder(null); }}>Cancel</button>
              <button
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

      {modal === "moveFiles" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Move {mailSelected.size} file(s) to...</div>
            <div className="folder-picker">
              <button
                className={`move-option ${moveTarget === null ? "selected" : ""}`}
                onClick={() => setMoveTarget(null)}
              >
                <span className="file-icon">📁</span> Root folder
              </button>
              {renderFolderTree(null, 0).map((folder) => (
                <button
                  key={folder.id}
                  className={`move-option ${moveTarget === folder.id ? "selected" : ""}`}
                  style={{ paddingLeft: `${16 + folderDepth(folder) * 22}px` }}
                  onClick={() => setMoveTarget(folder.id)}
                >
                  <span className="file-icon">📁</span> {folder.name}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={moving} onClick={handleMoveFiles}>
                {moving ? <div className="spinner"></div> : `Move here`}
              </button>
            </div>
          </div>
        </div>
      )}

      {clipboardOpen && (
        <div className="drawer-overlay" onClick={() => setClipboardOpen(false)}>
          <aside className="clipboard-drawer glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className="drawer-icon">📋</span>
                <h2 className="drawer-title">My Clipboard</h2>
              </div>
              <div className="drawer-header-actions">
                <span className="shortcut-hint" title="Keyboard shortcut">Alt+C</span>
                <button className="icon-btn" onClick={() => setClipboardOpen(false)} title="Close">✕</button>
              </div>
            </div>

            <div className="clipboard-tabs">
              <button
                className={`clipboard-tab ${clipboardTab === "scratchpad" ? "active" : ""}`}
                onClick={() => setClipboardTab("scratchpad")}
              >
                📝 Scratchpad
              </button>
              <button
                className={`clipboard-tab ${clipboardTab === "clips" ? "active" : ""}`}
                onClick={() => setClipboardTab("clips")}
              >
                📌 Saved Clips ({clips.length})
              </button>
            </div>

            {clipboardTab === "scratchpad" ? (
              <div className="scratchpad-view">
                <div className="scratchpad-meta">
                  <div className="scratchpad-counts">
                    {scratchpad.length} chars · {scratchpad.trim() ? scratchpad.trim().split(/\s+/).length : 0} words
                  </div>
                  <div className={`save-status status-${scratchpadStatus}`}>
                    {scratchpadStatus === "saving" && "Saving..."}
                    {scratchpadStatus === "saved" && "Saved ✓"}
                    {scratchpadStatus === "error" && "Save error"}
                    {scratchpadStatus === "idle" && "Auto-saves"}
                  </div>
                </div>

                <textarea
                  className="scratchpad-textarea form-input"
                  placeholder="Paste or type text, links, code, or snippets here... Everything you type is saved automatically to your account and accessible anytime."
                  value={scratchpad}
                  onChange={(e) => handleScratchpadChange(e.target.value)}
                  rows={14}
                />

                <div className="scratchpad-actions">
                  <button
                    className="btn-primary"
                    disabled={!scratchpad}
                    onClick={handleCopyScratchpad}
                  >
                    {copiedScratchpad ? "Copied! ✓" : "📋 Copy All"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!scratchpad.trim() || savingClip}
                    onClick={handleSaveScratchpadAsClip}
                  >
                    💾 Save as Clip
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!scratchpad}
                    onClick={handleInsertScratchpadToMail}
                    title="Insert into Quick Mail body"
                  >
                    ✉ To Mail
                  </button>
                  <button
                    className="btn-secondary danger-text"
                    disabled={!scratchpad}
                    onClick={handleClearScratchpad}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="clips-view">
                <div className="clip-add-form">
                  <input
                    type="text"
                    className="form-input clip-title-input"
                    placeholder="Clip title (optional)"
                    value={newClipTitle}
                    onChange={(e) => setNewClipTitle(e.target.value)}
                    maxLength={100}
                  />
                  <textarea
                    className="form-input clip-content-input"
                    placeholder="Clip content..."
                    rows={3}
                    value={newClipContent}
                    onChange={(e) => setNewClipContent(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    disabled={!newClipContent.trim() || savingClip}
                    onClick={handleAddClip}
                  >
                    {savingClip ? <div className="spinner"></div> : "+ Save New Clip"}
                  </button>
                </div>

                {clips.length > 0 && (
                  <div className="clip-search-bar">
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder="🔍 Search clips..."
                      value={clipSearch}
                      onChange={(e) => setClipSearch(e.target.value)}
                    />
                  </div>
                )}

                <div className="clips-list">
                  {filteredClips.length === 0 ? (
                    <div className="empty-clips">
                      {clipSearch ? "No clips match your search." : "No saved clips yet. Add one above or save from your scratchpad!"}
                    </div>
                  ) : (
                    filteredClips.map((clip) => (
                      <div className="clip-card" key={clip.id}>
                        <div className="clip-card-header">
                          <span className="clip-card-title">{clip.title || "Untitled Clip"}</span>
                          <span className="clip-card-date">{formatDate(clip.createdAt)}</span>
                        </div>
                        <div className="clip-card-body">{clip.content}</div>
                        <div className="clip-card-footer">
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => handleCopyClip(clip)}
                          >
                            {copiedClipId === clip.id ? "Copied! ✓" : "Copy"}
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => handleSendClipToScratchpad(clip)}
                            title="Append to scratchpad"
                          >
                            To Scratchpad
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => handleInsertClipToMail(clip)}
                            title="Insert into Quick Mail"
                          >
                            To Mail
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => handleDeleteClip(clip.id)}
                            title="Delete clip"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">{toast.type === "success" ? "✓" : "⚠"}</span>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}