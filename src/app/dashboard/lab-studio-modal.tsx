"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { simulateOracleSqlExecution } from "@/lib/sqlplus-emulator";

export interface StoredFileSummary {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface LabStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: StoredFileSummary[];
  initialFile?: StoredFileSummary | null;
  initialMode?: "compiler" | "assistant";
  onToast: (type: "success" | "danger", title: string, message: string) => void;
}

export type LabSubject = "oop" | "dbms" | "wdu" | "general";

interface TestCase {
  id: number;
  title: string;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  status?: "pass" | "fail" | "error" | "pending";
  executionTimeMs?: number;
}

interface StructuredLabRecord {
  subject: LabSubject;
  questionNumber: string;
  questionTitle: string;
  simplifiedQuestion: string;
  code: string;
  output: string;
  testCases?: TestCase[];
  explanation?: string;
  vivaQuestions?: Array<{ question: string; answer: string }>;
  webFlow?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  structured?: StructuredLabRecord;
}

export function LabStudioModal({
  isOpen,
  onClose,
  files,
  initialFile,
  initialMode = "compiler",
  onToast,
}: LabStudioModalProps) {
  const [activeTab, setActiveTab] = useState<"compiler" | "assistant">(initialMode);
  const [selectedFileId, setSelectedFileId] = useState<string>(initialFile?.id || "");
  const [code, setCode] = useState<string>("");
  const [fileName, setFileName] = useState<string>(initialFile?.name || "program.cpp");
  const [subject, setSubject] = useState<LabSubject>("oop");
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  // Settings with lazy initializers from localStorage
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("swosh_gemini_key") || "";
    } catch {
      return "";
    }
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === "undefined") return "gemini-2.5-flash";
    try {
      return localStorage.getItem("swosh_gemini_model") || "gemini-2.5-flash";
    } catch {
      return "gemini-2.5-flash";
    }
  });

  // Lab Manual drawer with lazy initializer
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("swosh_lab_manual") || "";
    } catch {
      return "";
    }
  });

  // Compiler state
  const [stdin, setStdin] = useState<string>("");
  const [terminalOutput, setTerminalOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [runningTestCases, setRunningTestCases] = useState<boolean>(false);
  const [activeTestTab, setActiveTestTab] = useState<number | "all">("all");
  const [compilerEngine, setCompilerEngine] = useState<string>("");

  // Web Dev (WDU) preview state
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string }>>([]);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Assistant state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [assistantLoading, setAssistantLoading] = useState<boolean>(false);
  const [structuredRecord, setStructuredRecord] = useState<StructuredLabRecord | null>(null);

  const saveSettings = () => {
    try {
      localStorage.setItem("swosh_gemini_key", apiKey.trim());
      localStorage.setItem("swosh_gemini_model", selectedModel);
      setSettingsOpen(false);
      onToast("success", "Settings Saved", "Gemini API key and model updated.");
    } catch {
      /* ignore */
    }
  };

  const saveManual = (text: string) => {
    setManualText(text);
    try {
      localStorage.setItem("swosh_lab_manual", text);
    } catch {
      /* ignore */
    }
  };

  // Language auto-detection
  const detectSubjectFromFileName = useCallback((name: string, content: string): LabSubject => {
    const lower = name.toLowerCase();
    const cLower = content.toLowerCase();

    if (
      lower.endsWith(".sql") ||
      lower.includes("dbms") ||
      lower.includes("oracle") ||
      cLower.includes("create table") ||
      cLower.includes("select ") ||
      cLower.includes("varchar2")
    ) {
      return "dbms";
    }

    if (
      lower.endsWith(".html") ||
      lower.endsWith(".htm") ||
      lower.endsWith(".css") ||
      lower.endsWith(".js") ||
      lower.includes("wdu") ||
      lower.includes("web") ||
      cLower.includes("<!doctype html") ||
      cLower.includes("<html")
    ) {
      return "wdu";
    }

    if (
      lower.endsWith(".cpp") ||
      lower.endsWith(".cc") ||
      lower.endsWith(".cxx") ||
      lower.endsWith(".c") ||
      lower.endsWith(".h") ||
      lower.includes("oop") ||
      cLower.includes("#include") ||
      cLower.includes("cout")
    ) {
      return "oop";
    }

    return "general";
  }, []);

  // Fetch file content when selected
  const loadFileContent = useCallback(
    async (fileId: string) => {
      if (!fileId) return;
      setSelectedFileId(fileId);
      const target = files.find((f) => f.id === fileId);
      if (!target) return;

      setLoadingFile(true);
      setFileName(target.name);
      try {
        const res = await fetch(`/api/files/${fileId}/content`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not read file content.");

        if (data.file?.content) {
          const loadedCode = data.file.content;
          setCode(loadedCode);
          const detected = detectSubjectFromFileName(target.name, loadedCode);
          setSubject(detected);

          // Default initial terminal output
          if (detected === "dbms") {
            setTerminalOutput(simulateOracleSqlExecution(loadedCode));
          } else if (detected === "wdu") {
            setTerminalOutput("Web Dev Preview initialized. Switch to Live Preview tab to test.");
          } else {
            setTerminalOutput("C++ / OOP Program loaded. Click 'Run Code' or 'Run 3 Test Cases'.");
          }
        }
      } catch (err) {
        onToast("danger", "Failed to Load File", err instanceof Error ? err.message : "Error reading file");
      } finally {
        setLoadingFile(false);
      }
    },
    [files, detectSubjectFromFileName, onToast]
  );

  const prevIsOpenRef = useRef(false);

  // Sync initial file and mode on open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      prevIsOpenRef.current = true;
      const targetId =
        initialFile?.id ||
        (files.length > 0
          ? (files.find((f) => {
              const l = f.name.toLowerCase();
              return (
                l.endsWith(".cpp") ||
                l.endsWith(".sql") ||
                l.endsWith(".html") ||
                l.endsWith(".js") ||
                l.endsWith(".c")
              );
            }) || files[0]).id
          : "");

      queueMicrotask(() => {
        setActiveTab(initialMode);
        if (targetId) {
          void loadFileContent(targetId);
        }
      });
    } else if (!isOpen) {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, initialFile, files, initialMode, loadFileContent]);

  // Handle Web Dev live preview updates
  useEffect(() => {
    if (subject === "wdu" && activeTab === "compiler" && previewIframeRef.current) {
      const iframe = previewIframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const scriptInjection = `
          <script>
            (function() {
              const origLog = console.log;
              const origErr = console.error;
              const origWarn = console.warn;
              console.log = function(...args) {
                window.parent.postMessage({ type: 'console', level: 'log', message: args.join(' ') }, '*');
                origLog.apply(console, args);
              };
              console.error = function(...args) {
                window.parent.postMessage({ type: 'console', level: 'error', message: args.join(' ') }, '*');
                origErr.apply(console, args);
              };
              console.warn = function(...args) {
                window.parent.postMessage({ type: 'console', level: 'warn', message: args.join(' ') }, '*');
                origWarn.apply(console, args);
              };
            })();
          </script>
        `;
        doc.open();
        doc.write(code.includes("<html") ? code.replace("<head>", `<head>${scriptInjection}`) : `${scriptInjection}${code}`);
        doc.close();
      }
    }
  }, [code, subject, activeTab]);

  // Listen to iframe console messages
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "console") {
        setConsoleLogs((prev) => [
          ...prev.slice(-20),
          { type: e.data.level, message: e.data.message },
        ]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Run single execution in compiler
  const handleRunCode = async () => {
    if (!code.trim()) {
      onToast("danger", "No Code", "Please enter or select code to run.");
      return;
    }

    setIsRunning(true);
    setTerminalOutput("Compiling and executing...\n");

    try {
      const res = await fetch("/api/compiler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: subject === "oop" ? "cpp" : subject === "dbms" ? "sql" : "html",
          code,
          stdin,
          apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed.");

      if (data.engine) setCompilerEngine(data.engine);
      setTerminalOutput(data.output || data.stdout || "Program finished with exit code 0.");
      if (data.stderr) {
        setTerminalOutput((prev) => `${prev}\n\n[Standard Error]:\n${data.stderr}`);
      }
    } catch (err) {
      setTerminalOutput(`[Execution Error]:\n${err instanceof Error ? err.message : "Run failed"}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Run 3 Test Cases (C++ / OOP auto evaluation)
  const handleRun3TestCases = async () => {
    if (!code.trim()) {
      onToast("danger", "No Code", "Please enter or select C++ code to run test cases.");
      return;
    }

    setRunningTestCases(true);
    setTerminalOutput("Generating and executing 3 test cases...\n");

    try {
      // If we don't have test cases, generate them first
      let currentTestCases = testCases;
      if (currentTestCases.length === 0) {
        const genRes = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "testcases",
            fileName,
            fileContent: code,
            manualText,
            subject,
            apiKey,
            model: selectedModel,
          }),
        });
        const genData = await genRes.json();
        if (genData.testCases && genData.testCases.length > 0) {
          currentTestCases = genData.testCases;
          setTestCases(currentTestCases);
        }
      }

      if (currentTestCases.length === 0) {
        currentTestCases = [
          { id: 1, title: "Standard Case", input: "10\n", expectedOutput: "" },
          { id: 2, title: "Edge Case", input: "0\n", expectedOutput: "" },
          { id: 3, title: "Alternate Case", input: "-5\n", expectedOutput: "" },
        ];
        setTestCases(currentTestCases);
      }

      // Execute all 3 test cases
      const runRes = await fetch("/api/compiler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "cpp",
          code,
          testCases: currentTestCases,
          apiKey,
        }),
      });

      const runData = await runRes.json();
      if (!runRes.ok) throw new Error(runData.error || "Failed to run test cases.");

      if (runData.testResults) {
        setTestCases(runData.testResults);

        // Format summary terminal output
        const lines: string[] = [
          "============================================================",
          "🧪 OOP C++ LAB: 3 TEST CASES EXECUTION RESULTS",
          "============================================================\n",
        ];

        runData.testResults.forEach((tc: TestCase, idx: number) => {
          lines.push(`▶ [TEST CASE ${idx + 1}] ${tc.title || ""}`);
          lines.push(`  INPUT:    ${tc.input ? tc.input.trim().replace(/\n/g, " ") : "<None>"}`);
          lines.push(`  STATUS:   ${tc.status === "pass" ? "✔ PASSED" : "✖ " + tc.status?.toUpperCase()}`);
          lines.push(`  OUTPUT:\n${tc.actualOutput || "<No output>"}\n`);
        });

        setTerminalOutput(lines.join("\n"));
        onToast("success", "3 Test Cases Executed", "All test case runs evaluated successfully.");
      }
    } catch (err) {
      setTerminalOutput(`[Test Case Execution Error]:\n${err instanceof Error ? err.message : "Run failed"}`);
      onToast("danger", "Test Run Error", err instanceof Error ? err.message : "Could not complete test cases");
    } finally {
      setRunningTestCases(false);
    }
  };

  // AI Assistant: Generate Structured Lab Record
  const handleGenerateStructuredRecord = async () => {
    if (!code.trim()) {
      onToast("danger", "No Code", "Please enter or select code to analyze.");
      return;
    }

    setAssistantLoading(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "structure",
          fileName,
          fileContent: code,
          manualText,
          subject,
          apiKey,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI Assistant could not format record.");

      if (data.structured) {
        setStructuredRecord(data.structured);
        if (data.structured.testCases) {
          setTestCases(data.structured.testCases);
        }

        const newMsg: ChatMessage = {
          id: String(Date.now()),
          role: "assistant",
          content: `I've prepared the complete structured lab submission record for **${fileName}** (${subject.toUpperCase()}). You can review it below and copy it directly into your lab journal.`,
          timestamp: Date.now(),
          structured: data.structured,
        };
        setChatMessages((prev) => [...prev, newMsg]);
        onToast("success", "Lab Record Ready", "Structured record generated successfully.");
      }
    } catch (err) {
      onToast("danger", "AI Error", err instanceof Error ? err.message : "Failed to generate structure");
    } finally {
      setAssistantLoading(false);
    }
  };

  // AI Assistant: Send Chat Message
  const handleSendChatMessage = async (customPrompt?: string) => {
    const text = (customPrompt || chatInput).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setChatInput("");
    setAssistantLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          message: text,
          fileName,
          fileContent: code,
          manualText,
          subject,
          history: chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          apiKey,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get AI response.");

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: data.message || "Here is the response for your query.",
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      onToast("danger", "AI Chat Error", err instanceof Error ? err.message : "Error contacting assistant");
    } finally {
      setAssistantLoading(false);
    }
  };

  // Copy full structured record to clipboard
  const handleCopyStructuredRecord = () => {
    if (!structuredRecord) return;
    const r = structuredRecord;
    const parts: string[] = [];

    parts.push(`============================================================`);
    parts.push(`${r.questionNumber || "LAB ASSIGNMENT"}: ${r.questionTitle || fileName}`);
    parts.push(`SUBJECT: ${r.subject.toUpperCase()}`);
    parts.push(`============================================================\n`);

    parts.push(`[QUESTION / PROBLEM STATEMENT]:`);
    parts.push(r.simplifiedQuestion || "Refer to lab manual.\n");

    parts.push(`\n[SOURCE CODE]:`);
    parts.push(r.code || code);

    if (r.subject === "oop" && r.testCases && r.testCases.length > 0) {
      parts.push(`\n[3 TEST CASES & OUTPUTS]:`);
      r.testCases.forEach((tc, idx) => {
        parts.push(`\n--- Test Case ${idx + 1}: ${tc.title} ---`);
        parts.push(`INPUT:\n${tc.input || "<No input required>"}`);
        parts.push(`OUTPUT:\n${tc.actualOutput || tc.expectedOutput || "<Executed output>"}`);
      });
    }

    if (r.subject === "dbms") {
      parts.push(`\n[ORACLE SQL*PLUS OUTPUT]:`);
      parts.push(r.output);
    }

    if (r.subject === "wdu") {
      parts.push(`\n[WEB FLOW & ARCHITECTURE]:`);
      parts.push(r.webFlow || "Visual component hierarchy and DOM events handled.");
      parts.push(`\n[RENDERED OUTPUT]:`);
      parts.push(r.output);
    }

    if (r.explanation) {
      parts.push(`\n[EXPLANATION / KEY CONCEPTS]:`);
      parts.push(r.explanation);
    }

    navigator.clipboard.writeText(parts.join("\n"));
    onToast("success", "Copied to Clipboard", "Complete lab record copied, ready for submission.");
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape" && !settingsOpen && !manualOpen) {
        onClose();
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (activeTab === "compiler") {
          void handleRunCode();
        } else {
          void handleSendChatMessage();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen) return null;

  return (
    <div className="lab-modal-overlay" role="dialog" aria-modal="true" aria-label="Lab Studio & AI Assistant">
      <div className="lab-modal-window">
        {/* Header Bar */}
        <div className="lab-modal-header">
          <div className="lab-header-left">
            <div className="lab-brand-pill">
              <span className="lab-icon">🧪</span>
              <span className="lab-title">Lab Studio</span>
            </div>

            {/* Subject Selector */}
            <div className="lab-subject-select-wrapper">
              <label htmlFor="subject-select" className="visually-hidden">Lab Subject</label>
              <select
                id="subject-select"
                className="lab-select lab-subject-select"
                value={subject}
                onChange={(e) => setSubject(e.target.value as LabSubject)}
              >
                <option value="oop">OOP (C++)</option>
                <option value="dbms">DBMS (Oracle SQL*Plus)</option>
                <option value="wdu">WDU (Web Dev: HTML/CSS/JS)</option>
                <option value="general">General Code</option>
              </select>
            </div>

            {/* File Switcher Dropdown */}
            <div className="lab-file-select-wrapper">
              <label htmlFor="file-select" className="visually-hidden">Select Lab File</label>
              <select
                id="file-select"
                className="lab-select lab-file-select"
                value={selectedFileId}
                onChange={(e) => {
                  setSelectedFileId(e.target.value);
                  void loadFileContent(e.target.value);
                }}
              >
                <option value="">-- Choose file from board --</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {loadingFile && <span className="lab-file-spinner" title="Loading file content...">⏳</span>}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="lab-header-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "compiler"}
              className={`lab-nav-tab ${activeTab === "compiler" ? "active" : ""}`}
              onClick={() => setActiveTab("compiler")}
            >
              <span>⚡</span> Compiler & Terminal
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "assistant"}
              className={`lab-nav-tab ${activeTab === "assistant" ? "active" : ""}`}
              onClick={() => setActiveTab("assistant")}
            >
              <span>🤖</span> AI Lab Assistant
              {structuredRecord && <span className="lab-badge-pulse" title="Structured Record Ready" />}
            </button>
          </div>

          {/* Controls */}
          <div className="lab-header-right">
            <button
              className="lab-icon-btn"
              onClick={() => setManualOpen((prev) => !prev)}
              title="Lab Manual & Question Bank"
            >
              <span>📋</span>
              <span className="lab-btn-label">Manual {manualText ? "✓" : ""}</span>
            </button>

            <button
              className="lab-icon-btn"
              onClick={() => setSettingsOpen(true)}
              title="API Key & Model Settings"
            >
              <span>⚙️</span>
            </button>

            <button
              className="lab-close-btn"
              onClick={onClose}
              aria-label="Close Lab Studio"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Lab Manual Drawer */}
        {manualOpen && (
          <div className="lab-drawer">
            <div className="lab-drawer-header">
              <h4>📋 University Lab Manual / Question Bank</h4>
              <button className="lab-drawer-close" onClick={() => setManualOpen(false)}>✕</button>
            </div>
            <p className="lab-drawer-desc">
              Paste your lab questions, syllabus, or problem statements below. The AI Assistant will automatically map question numbers and requirements to your code.
            </p>
            <textarea
              className="lab-drawer-textarea"
              placeholder="e.g. Question 1: Write a C++ program to implement a matrix class with operator overloading...&#10;Question 2: Write SQL queries for employee department joins..."
              value={manualText}
              onChange={(e) => saveManual(e.target.value)}
              rows={4}
            />
            <div className="lab-drawer-footer">
              <span className="lab-drawer-hint">Saved automatically to your browser</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setManualOpen(false)}>Done</button>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {settingsOpen && (
          <div className="lab-submodal-overlay">
            <div className="lab-submodal">
              <div className="lab-submodal-header">
                <h3>⚙️ AI & Compiler Settings</h3>
                <button className="lab-close-btn" onClick={() => setSettingsOpen(false)}>✕</button>
              </div>
              <div className="lab-submodal-body">
                <div className="form-group">
                  <label htmlFor="gemini-key-input">Gemini API Key</label>
                  <input
                    id="gemini-key-input"
                    type="password"
                    className="form-input"
                    placeholder="AIzaSy... (leave blank to use server environment key)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="form-hint">
                    Key is securely stored in your local browser storage. Free keys are available from Google AI Studio.
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="gemini-model-select">Gemini Model</label>
                  <select
                    id="gemini-model-select"
                    className="form-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest & Recommended)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                </div>
              </div>
              <div className="lab-submodal-footer">
                <button className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
              </div>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="lab-modal-body">
          {/* TAB 1: COMPILER & TERMINAL */}
          {activeTab === "compiler" && (
            <div className="lab-compiler-grid">
              {/* Left Column: Code Editor */}
              <div className="lab-editor-pane">
                <div className="lab-pane-header">
                  <div className="lab-file-indicator">
                    <span className="lab-file-tag">{subject.toUpperCase()}</span>
                    <input
                      type="text"
                      className="lab-filename-input"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="filename.cpp"
                    />
                  </div>
                  <div className="lab-editor-actions">
                    <button
                      className="btn-text-sm"
                      onClick={() => navigator.clipboard.writeText(code).then(() => onToast("success", "Copied", "Source code copied"))}
                      title="Copy Code"
                    >
                      Copy
                    </button>
                    <button
                      className="btn-text-sm"
                      onClick={() => {
                        if (confirm("Clear editor code?")) setCode("");
                      }}
                      title="Clear Editor"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <textarea
                  className="lab-code-editor"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={`// Enter or paste your ${subject.toUpperCase()} code here...\n// Or choose an uploaded file from the dropdown above.`}
                  spellCheck={false}
                />

                {/* Stdin Area for C++ / OOP */}
                {subject === "oop" && (
                  <div className="lab-stdin-pane">
                    <div className="lab-stdin-label">
                      <span>Standard Input (stdin for cin / scanf):</span>
                      <span className="lab-stdin-tip">Newline-separated inputs</span>
                    </div>
                    <textarea
                      className="lab-stdin-input"
                      rows={2}
                      value={stdin}
                      onChange={(e) => setStdin(e.target.value)}
                      placeholder="e.g. 5&#10;10 20 30 40 50"
                    />
                  </div>
                )}

                {/* Compiler Action Bar */}
                <div className="lab-compiler-bar">
                  <button
                    className="btn btn-primary btn-sm lab-run-btn"
                    onClick={handleRunCode}
                    disabled={isRunning || runningTestCases}
                  >
                    <span>{isRunning ? "⏳" : "▶"}</span>
                    <span>{isRunning ? "Running..." : "Run Code"}</span>
                  </button>

                  {subject === "oop" && (
                    <button
                      className="btn btn-secondary btn-sm lab-testcases-btn"
                      onClick={handleRun3TestCases}
                      disabled={isRunning || runningTestCases}
                      title="Auto-generate and execute 3 test cases"
                    >
                      <span>🧪</span>
                      <span>{runningTestCases ? "Evaluating 3 Tests..." : "Run 3 Test Cases"}</span>
                    </button>
                  )}

                  <button
                    className="btn btn-outline btn-sm lab-ai-assist-jump"
                    onClick={() => {
                      setActiveTab("assistant");
                      void handleGenerateStructuredRecord();
                    }}
                    title="Send code to AI Assistant for complete Lab Record formatting"
                  >
                    <span>✨</span>
                    <span>Format Lab Record</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Execution Output / Terminal / Live Preview */}
              <div className="lab-output-pane">
                {/* WDU Web Live Preview Viewport */}
                {subject === "wdu" ? (
                  <div className="lab-web-preview-container">
                    <div className="lab-pane-header">
                      <div className="lab-viewport-toggles">
                        <button
                          className={`btn-tag ${previewViewport === "desktop" ? "active" : ""}`}
                          onClick={() => setPreviewViewport("desktop")}
                        >
                          🖥️ Desktop
                        </button>
                        <button
                          className={`btn-tag ${previewViewport === "tablet" ? "active" : ""}`}
                          onClick={() => setPreviewViewport("tablet")}
                        >
                          📱 Tablet (768px)
                        </button>
                        <button
                          className={`btn-tag ${previewViewport === "mobile" ? "active" : ""}`}
                          onClick={() => setPreviewViewport("mobile")}
                        >
                          📱 Mobile (375px)
                        </button>
                      </div>
                      <button
                        className="btn-text-sm"
                        onClick={() => {
                          if (previewIframeRef.current) {
                            previewIframeRef.current.src = "about:blank";
                            setTimeout(() => setCode((prev) => prev + " "), 50);
                          }
                        }}
                      >
                        🔄 Reload
                      </button>
                    </div>

                    <div className={`lab-preview-frame-wrap viewport-${previewViewport}`}>
                      <iframe
                        ref={previewIframeRef}
                        title="Web Lab Live Preview"
                        className="lab-preview-iframe"
                        sandbox="allow-scripts allow-modals"
                      />
                    </div>

                    {/* Web Console Output */}
                    <div className="lab-console-pane">
                      <div className="lab-console-header">
                        <span>Browser Console:</span>
                        <button className="btn-text-xs" onClick={() => setConsoleLogs([])}>Clear Console</button>
                      </div>
                      <div className="lab-console-logs">
                        {consoleLogs.length === 0 ? (
                          <div className="lab-console-empty">No console logs emitted.</div>
                        ) : (
                          consoleLogs.map((log, idx) => (
                            <div key={idx} className={`lab-console-item log-${log.type}`}>
                              <span className="log-badge">{log.type}</span>
                              <span className="log-text">{log.message}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard Terminal / SQL*Plus Output */
                  <div className="lab-terminal-container">
                    <div className="lab-pane-header">
                      <div className="lab-terminal-title">
                        <span className="terminal-dot red" />
                        <span className="terminal-dot yellow" />
                        <span className="terminal-dot green" />
                        <span className="terminal-name">
                          {subject === "dbms" ? "Oracle SQL*Plus 19c Terminal" : "Interactive Execution Terminal"}
                        </span>
                      </div>
                      {compilerEngine && <span className="lab-engine-badge">{compilerEngine}</span>}
                    </div>

                    <pre className="lab-terminal-output">{terminalOutput || "Ready for execution."}</pre>

                    {/* 3 Test Cases Cards for C++ / OOP */}
                    {subject === "oop" && testCases.length > 0 && (
                      <div className="lab-testcases-drawer">
                        <div className="lab-testcases-header">
                          <span>Auto-Evaluated Test Cases (3):</span>
                          <div className="lab-tc-pill-group">
                            <button
                              className={`btn-tag ${activeTestTab === "all" ? "active" : ""}`}
                              onClick={() => setActiveTestTab("all")}
                            >
                              All
                            </button>
                            {testCases.map((tc, idx) => (
                              <button
                                key={tc.id}
                                className={`btn-tag ${activeTestTab === idx ? "active" : ""}`}
                                onClick={() => setActiveTestTab(idx)}
                              >
                                Case {idx + 1}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="lab-testcases-cards">
                          {testCases
                            .filter((_, idx) => activeTestTab === "all" || activeTestTab === idx)
                            .map((tc, idx) => (
                              <div key={tc.id} className={`lab-tc-card status-${tc.status || "pending"}`}>
                                <div className="lab-tc-card-header">
                                  <span className="lab-tc-title">
                                    Test Case {idx + 1}: {tc.title}
                                  </span>
                                  {tc.status && (
                                    <span className={`lab-tc-badge badge-${tc.status}`}>
                                      {tc.status === "pass" ? "✔ PASS" : tc.status === "fail" ? "✖ FAIL" : "⚠ ERROR"}
                                    </span>
                                  )}
                                </div>
                                <div className="lab-tc-io">
                                  <div>
                                    <span className="lab-io-label">Input:</span>
                                    <code>{tc.input ? tc.input.trim().replace(/\n/g, " ") : "<none>"}</code>
                                  </div>
                                  <div>
                                    <span className="lab-io-label">Output:</span>
                                    <code>{tc.actualOutput || tc.expectedOutput || "<not run>"}</code>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI LAB ASSISTANT */}
          {activeTab === "assistant" && (
            <div className="lab-assistant-grid">
              {/* Left Pane: Quick Actions & Structured Output */}
              <div className="lab-assistant-left">
                <div className="lab-assistant-actions-panel">
                  <div className="lab-quick-pills">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleGenerateStructuredRecord}
                      disabled={assistantLoading}
                    >
                      🎓 Format for Lab Record
                    </button>
                    {subject === "oop" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSendChatMessage("Generate and test 3 diverse test cases for this C++ program.")}
                        disabled={assistantLoading}
                      >
                        🧪 3 Test Cases
                      </button>
                    )}
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleSendChatMessage("Provide 5 likely university viva-voce questions and concise answers for this lab program.")}
                      disabled={assistantLoading}
                    >
                      ❓ Viva Questions
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleSendChatMessage("Explain the logic and algorithm of this code step-by-step for a beginner.")}
                      disabled={assistantLoading}
                    >
                      🔍 Explain Logic
                    </button>
                  </div>
                </div>

                {/* Structured Record Card */}
                {structuredRecord ? (
                  <div className="lab-record-card">
                    <div className="lab-record-header">
                      <div>
                        <span className="lab-record-tag">{structuredRecord.subject.toUpperCase()} RECORD</span>
                        <h3 className="lab-record-title">
                          {structuredRecord.questionNumber}: {structuredRecord.questionTitle}
                        </h3>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleCopyStructuredRecord}
                        title="Copy complete record to paste into Word or LaTeX"
                      >
                        📋 Copy Record
                      </button>
                    </div>

                    <div className="lab-record-section">
                      <h4>Problem Statement / Objective:</h4>
                      <p>{structuredRecord.simplifiedQuestion}</p>
                    </div>

                    {structuredRecord.webFlow && (
                      <div className="lab-record-section">
                        <h4>Web Architecture & Layout Flow:</h4>
                        <p>{structuredRecord.webFlow}</p>
                      </div>
                    )}

                    {structuredRecord.subject === "oop" && structuredRecord.testCases && (
                      <div className="lab-record-section">
                        <h4>3 Test Cases & Execution Results:</h4>
                        <div className="lab-record-testcases">
                          {structuredRecord.testCases.map((tc, idx) => (
                            <div key={idx} className="lab-record-tc-item">
                              <span className="tc-heading">Test Case {idx + 1} ({tc.title}):</span>
                              <div className="tc-io-grid">
                                <div><strong>Input:</strong> <code>{tc.input.trim()}</code></div>
                                <div><strong>Expected Output:</strong> <code>{tc.expectedOutput.trim()}</code></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="lab-record-section">
                      <h4>
                        {structuredRecord.subject === "dbms"
                          ? "Oracle SQL*Plus Tabular Output:"
                          : "Program Output:"}
                      </h4>
                      <pre className="lab-record-output">{structuredRecord.output}</pre>
                    </div>

                    {structuredRecord.explanation && (
                      <div className="lab-record-section">
                        <h4>Key Concepts & Explanation:</h4>
                        <p>{structuredRecord.explanation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="lab-assistant-empty">
                    <span className="empty-icon">🤖</span>
                    <h3>Lab Record Assistant Ready</h3>
                    <p>
                      Click <strong>&quot;Format for Lab Record&quot;</strong> above to auto-generate the complete question, code, 3 test cases (or Oracle SQL*Plus output), and explanations formatted for university submission.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Pane: Interactive Chat & Viva */}
              <div className="lab-assistant-right">
                <div className="lab-chat-header">
                  <span>Chat & Viva-Voce Assistant</span>
                  <span className="lab-chat-model-badge">{selectedModel}</span>
                </div>

                <div className="lab-chat-messages">
                  {chatMessages.length === 0 ? (
                    <div className="lab-chat-welcome">
                      <p>
                        👋 Welcome to the AI Lab Assistant! You can ask questions about your code, request viva questions, or ask how to modify your program.
                      </p>
                      <div className="lab-chat-suggestions">
                        <button
                          className="chat-sugg-pill"
                          onClick={() => handleSendChatMessage("What edge cases could break this program?")}
                        >
                          🛡️ What edge cases could break this code?
                        </button>
                        <button
                          className="chat-sugg-pill"
                          onClick={() => handleSendChatMessage("What are 3 tricky viva questions the professor might ask?")}
                        >
                          🎓 Tricky professor viva questions
                        </button>
                        <button
                          className="chat-sugg-pill"
                          onClick={() => handleSendChatMessage("How can I optimize the time and space complexity?")}
                        >
                          ⚡ Optimize time & space complexity
                        </button>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className={`lab-chat-bubble role-${msg.role}`}>
                        <div className="chat-avatar">{msg.role === "user" ? "👤" : "🤖"}</div>
                        <div className="chat-content">
                          <pre className="chat-text">{msg.content}</pre>
                        </div>
                      </div>
                    ))
                  )}
                  {assistantLoading && (
                    <div className="lab-chat-bubble role-assistant loading">
                      <div className="chat-avatar">🤖</div>
                      <div className="chat-loading-dots">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}
                </div>

                <div className="lab-chat-input-bar">
                  <input
                    type="text"
                    className="lab-chat-input"
                    placeholder="Ask about this lab program... (Ctrl+Enter to send)"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendChatMessage();
                      }
                    }}
                    disabled={assistantLoading}
                  />
                  <button
                    className="btn btn-primary btn-sm lab-chat-send"
                    onClick={() => handleSendChatMessage()}
                    disabled={assistantLoading || !chatInput.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
