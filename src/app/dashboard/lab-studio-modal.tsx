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
  onToast: (type: "success" | "danger" | "info", title: string, message: string) => void;
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
  conceptImplemented?: string;
  code: string;
  output: string;
  interpretation?: string;
  testCases?: TestCase[];
  explanation?: string;
  vivaQuestions?: Array<{ question: string; answer: string }>;
  webFlow?: string;
  tagsAndAttributes?: Array<{ name: string; description: string }>;
  jsConcepts?: Array<{ name: string; description: string }>;
  files?: Array<{ name: string; title?: string; code: string }>;
}

export const SUBJECT_PROMPT_FLOWS: Record<
  LabSubject,
  {
    name: string;
    flowBadge: string;
    description: string;
    defaultPrompt: string;
  }
> = {
  wdu: {
    name: "Web (WDU)",
    flowBadge: "Flow: Question → 1. Concepts (Tags, Attributes & JS) → 2. Code → 3. Interpretation",
    description: "Web observation structure: Question, tags & attributes, JS concepts, clean code, interpretation",
    defaultPrompt:
      "Format this web project into a university lab observation record.\n- Question: Exact problem statement from lab manual\n- 1. Concepts Implemented: HTML tags & attributes and JavaScript concepts\n- 2. Code: Clean working code without repetitive notes\n- 3. Interpretation: Comprehensive execution & learning takeaway.",
  },
  dbms: {
    name: "DBMS (Oracle)",
    flowBadge: "Flow: 1. Problem & Schema → 2. SQL Queries → 3. Oracle SQL*Plus Tabular Output → 4. Relational Interpretation",
    description: "Database queries and Oracle SQL*Plus tabular terminal output",
    defaultPrompt:
      "Format this database query into a standard DBMS lab record. Flow:\n1. Objective & Relational Schema\n2. Clean SQL Queries\n3. Authentic Oracle SQL*Plus tabular terminal output\n4. Relational interpretation of retrieved data.",
  },
  oop: {
    name: "OOP (C++)",
    flowBadge: "Flow: 1. Aim & Concepts → 2. C++ Code → 3. 3 Test Cases & Console Outputs → 4. OOP Interpretation",
    description: "Object-oriented C++ program with 3 test cases",
    defaultPrompt:
      "Format this C++ program into an OOP lab record. Flow:\n1. Aim & OOP Concepts implemented\n2. Clean C++ Source Code without redundant boilerplate\n3. 3 Test Cases (Standard, Boundary, Stress) with exact stdin/stdout\n4. Interpretation confirming OOP principles.",
  },
  general: {
    name: "General CS",
    flowBadge: "Flow: 1. Aim & Objective → 2. Source Code → 3. Execution Output → 4. Interpretation",
    description: "Standard CS laboratory record",
    defaultPrompt:
      "Format this code into a formal lab record. Flow:\n1. Aim & Objective\n2. Source Code\n3. Output Results\n4. Interpretation & Conclusion.",
  },
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  structured?: StructuredLabRecord;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

  // Settings state (initialized statically to avoid hydration mismatches)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.8-flash");

  // Lab Manual (PDF or Text) state
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [manualFileId, setManualFileId] = useState<string>("");
  const [manualPdfBase64, setManualPdfBase64] = useState<string>("");
  const [manualUploadName, setManualUploadName] = useState<string>("");
  const manualUploadInputRef = useRef<HTMLInputElement>(null);
  const [manualText, setManualText] = useState<string>("");
  const [manualQuestions, setManualQuestions] = useState<Array<{ number: string; title: string; statement: string }>>([]);
  const [selectedQuestionText, setSelectedQuestionText] = useState<string>("");
  const [isExtractingQuestions, setIsExtractingQuestions] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedKey = localStorage.getItem("swosh_gemini_key");
        if (savedKey) setApiKey(savedKey);
        const savedModel = localStorage.getItem("swosh_gemini_model");
        if (savedModel) {
          if (savedModel.includes("1.5") || savedModel.includes("2.0") || (savedModel.includes("2.5") && !savedModel.includes("tts"))) {
            setSelectedModel("gemini-3.8-flash");
            try {
              localStorage.setItem("swosh_gemini_model", "gemini-3.8-flash");
            } catch {
              /* ignore */
            }
          } else {
            setSelectedModel(savedModel);
          }
        }
        const savedFileId = localStorage.getItem("swosh_manual_file_id");
        if (savedFileId) setManualFileId(savedFileId);
        const savedManual = localStorage.getItem("swosh_lab_manual");
        if (savedManual) setManualText(savedManual);
        const savedQuestion = localStorage.getItem("swosh_selected_question");
        if (savedQuestion) setSelectedQuestionText(savedQuestion);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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

  const handleDirectManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      onToast("danger", "Invalid File", "Please select a PDF document for your lab manual.");
      return;
    }

    if (file.size > 3.5 * 1024 * 1024) {
      onToast("danger", "File Too Large", "Direct PDF upload must be under 3.5 MB (Vercel payload limit). For larger manuals, upload to your board first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.replace(/^data:application\/pdf;base64,/, "");
      setManualPdfBase64(base64);
      setManualUploadName(file.name);
      setManualFileId("");
      try {
        localStorage.removeItem("swosh_manual_file_id");
      } catch {
        /* ignore */
      }
      onToast("success", "PDF Manual Attached", `"${file.name}" loaded for AI question extraction.`);
    };
    reader.onerror = () => {
      onToast("danger", "Read Error", "Failed to read the selected PDF file.");
    };
    reader.readAsDataURL(file);

    if (manualUploadInputRef.current) manualUploadInputRef.current.value = "";
  };

  const handleSelectManualFromBoard = (fileId: string) => {
    setManualFileId(fileId);
    setManualPdfBase64("");
    setManualUploadName("");
    try {
      if (fileId) {
        localStorage.setItem("swosh_manual_file_id", fileId);
        const target = files.find((f) => f.id === fileId);
        onToast("success", "PDF Manual Linked", `"${target?.name || "PDF"}" linked as your lab manual.`);
      } else {
        localStorage.removeItem("swosh_manual_file_id");
      }
    } catch {
      /* ignore */
    }
  };

  const handleClearManualPdf = () => {
    setManualFileId("");
    setManualPdfBase64("");
    setManualUploadName("");
    try {
      localStorage.removeItem("swosh_manual_file_id");
    } catch {
      /* ignore */
    }
    onToast("success", "Manual Detached", "PDF manual detached.");
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
    console.log("[Lab Studio Compiler] Running code...", {
      subject,
      codeLength: code.length,
      stdinLength: stdin.length,
      hasCustomApiKey: Boolean(apiKey),
    });

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
      console.log("[Lab Studio Compiler] Response data:", data);
      if (!res.ok) throw new Error(data.error || "Execution failed.");

      if (data.engine) setCompilerEngine(data.engine);
      setTerminalOutput(data.output || data.stdout || "Program finished with exit code 0.");
      if (data.stderr) {
        setTerminalOutput((prev) => `${prev}\n\n[Standard Error]:\n${data.stderr}`);
      }
    } catch (err) {
      console.error("[Lab Studio Compiler] Run error:", err);
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
    console.log("[Lab Studio Compiler] Running 3 test cases...", {
      fileName,
      subject,
      codeLength: code.length,
      existingCount: testCases.length,
      model: selectedModel,
      hasCustomApiKey: Boolean(apiKey),
    });

    try {
      // If we don't have test cases, generate them first
      let currentTestCases = testCases;
      if (currentTestCases.length === 0) {
        console.log("[Lab Studio Compiler] No test cases cached, generating via AI assistant...");
        const genRes = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "testcases",
            fileName,
            fileContent: code,
            manualText,
            manualFileId: manualFileId || undefined,
            manualPdfBase64: manualPdfBase64 || undefined,
            subject,
            apiKey,
            model: selectedModel,
          }),
        });
        const genData = await genRes.json();
        console.log("[Lab Studio Compiler] AI testcase generation response:", genData);
        if (genRes.status === 401 || genData.code === "MISSING_API_KEY" || genData.code === "INVALID_API_KEY") {
          setSettingsOpen(true);
          onToast("danger", "API Key Required", genData.error || "Please enter your Gemini API key in Settings.");
          setTerminalOutput(`[Authentication Error]:\n${genData.error || "Gemini API key is required."}\n\nPlease click Settings (⚙️) to enter your Gemini API key.`);
          return;
        }
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

  // AI Assistant: Extract Question Bank from Manual
  const handleExtractQuestionsFromManual = async () => {
    if (!manualPdfBase64 && !manualFileId && !manualText) {
      setManualOpen(true);
      onToast("info", "Attach Lab Manual", "Please attach a PDF manual or paste text to extract questions.");
      return;
    }

    setIsExtractingQuestions(true);
    onToast("info", "Extracting Questions", "Analyzing lab manual with AI...");
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "questions",
          fileName,
          fileContent: code,
          manualText,
          manualFileId: manualFileId || undefined,
          manualPdfBase64: manualPdfBase64 || undefined,
          apiKey,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract questions.");

      if (data.questions && data.questions.length > 0) {
        setManualQuestions(data.questions);
        if (!selectedQuestionText) {
          setSelectedQuestionText(data.questions[0].statement);
          try {
            localStorage.setItem("swosh_selected_question", data.questions[0].statement);
          } catch {
            /* ignore */
          }
        }
        onToast("success", "Questions Extracted", `Found ${data.questions.length} experiment questions in manual.`);
      } else {
        onToast("info", "No Questions Detected", "You can type or paste the exact question statement below.");
      }
    } catch (err) {
      onToast("danger", "Extraction Error", err instanceof Error ? err.message : "Failed to extract questions.");
    } finally {
      setIsExtractingQuestions(false);
    }
  };

  // AI Assistant: Generate Structured Lab Record
  const handleGenerateStructuredRecord = async () => {
    if (!code.trim()) {
      onToast("danger", "No Code", "Please enter or select code to analyze.");
      return;
    }

    setAssistantLoading(true);
    console.log("[Lab Studio AI] Requesting structured record...", {
      fileName,
      subject,
      model: selectedModel,
      codeLength: code.length,
      hasManualText: Boolean(manualText),
      hasManualPdf: Boolean(manualPdfBase64),
      manualFileId,
      hasCustomApiKey: Boolean(apiKey),
      hasSelectedQuestion: Boolean(selectedQuestionText),
    });

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "structure",
          fileName,
          fileContent: code,
          manualText,
          manualFileId: manualFileId || undefined,
          manualPdfBase64: manualPdfBase64 || undefined,
          subject,
          apiKey,
          model: selectedModel,
          selectedQuestion: selectedQuestionText || undefined,
        }),
      });

      const data = await res.json();
      console.log("[Lab Studio AI] Structure response received:", { status: res.status, ok: res.ok, data });
      if (res.status === 401 || data.code === "MISSING_API_KEY" || data.code === "INVALID_API_KEY") {
        setSettingsOpen(true);
        onToast("danger", "API Key Required", data.error || "Please enter your Gemini API key in Settings.");
        setChatMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            role: "assistant",
            content: `🔑 **Gemini API Key Required**\n\nTo generate structured lab records and viva questions, please enter your free Google Gemini API key in Settings (⚙️).\n\nYou can obtain a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }
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
      console.error("[Lab Studio AI] Structure formatting failed:", err);
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
    console.log("[Lab Studio AI] Sending chat message...", {
      message: text,
      fileName,
      subject,
      model: selectedModel,
      historyCount: chatMessages.length,
      hasCustomApiKey: Boolean(apiKey),
    });

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
          manualFileId: manualFileId || undefined,
          manualPdfBase64: manualPdfBase64 || undefined,
          subject,
          history: chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          apiKey,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      console.log("[Lab Studio AI] Chat response received:", { status: res.status, ok: res.ok, data });
      if (res.status === 401 || data.code === "MISSING_API_KEY" || data.code === "INVALID_API_KEY") {
        setSettingsOpen(true);
        onToast("danger", "API Key Required", data.error || "Please enter your Gemini API key in Settings.");
        setChatMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            role: "assistant",
            content: `🔑 **Gemini API Key Required**\n\nTo chat with the Lab Assistant, please enter your free Google Gemini API key in Settings (⚙️).\n\nYou can obtain a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to get AI response.");

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: data.message || "Here is the response for your query.",
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("[Lab Studio AI] Chat request failed:", err);
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

    if (r.subject === "wdu") {
      parts.push(`Question`);
      parts.push(
        r.simplifiedQuestion ||
          selectedQuestionText ||
          r.questionTitle ||
          "Write HTML and JavaScript programs to demonstrate web concepts."
      );

      parts.push(`\n1. Concepts Implemented (Tags & Attributes)`);
      if (r.tagsAndAttributes && r.tagsAndAttributes.length > 0) {
        r.tagsAndAttributes.forEach((t) => {
          parts.push(`${t.name}: ${t.description}`);
        });
      } else {
        parts.push(
          r.conceptImplemented ||
            "HTML5 layout tags, embedded CSS styles, form inputs, and event listeners."
        );
      }

      if (r.jsConcepts && r.jsConcepts.length > 0) {
        parts.push(`\nJavaScript Concepts Implemented`);
        r.jsConcepts.forEach((j) => {
          parts.push(`${j.name}: ${j.description}`);
        });
      }

      parts.push(`\n2. Code`);
      if (r.files && r.files.length > 0) {
        r.files.forEach((f, idx) => {
          parts.push(`File ${idx + 1}: ${f.name}${f.title ? ` (${f.title})` : ""}`);
          parts.push(`HTML`);
          parts.push(f.code.trim());
          parts.push("");
        });
      } else {
        const cleanCode = (r.code || code)
          .replace(/\/\*[\s\S]*?(why skipped|skipped).*?\*\//gi, "")
          .replace(/\/\/.*?(why skipped|skipped).*$/gmi, "")
          .trim();
        parts.push(cleanCode);
      }

      parts.push(`\n3. Interpretation`);
      const interpText = r.interpretation?.trim() || "";
      if (interpText.toUpperCase().startsWith("INTERPRETATION:")) {
        parts.push(interpText);
      } else {
        parts.push(`INTERPRETATION:\n${interpText || "The program creates interactive web pages demonstrating JavaScript popup dialogs, form input handling, and dynamic window generation..."}`);
      }
    } else if (r.subject === "dbms") {
      parts.push(`1. AIM / OBJECTIVE:`);
      parts.push(r.conceptImplemented || r.simplifiedQuestion || "Database table operations and queries.");

      parts.push(`\n2. SQL QUERIES:`);
      parts.push(r.code || code);

      parts.push(`\n3. ORACLE SQL*PLUS TABULAR OUTPUT:`);
      parts.push(r.output);

      parts.push(`\n4. RELATIONAL INTERPRETATION:`);
      parts.push(r.interpretation || r.explanation || "Query execution successfully verified against schema.");
    } else if (r.subject === "oop") {
      parts.push(`1. AIM / OOP CONCEPTS IMPLEMENTED:`);
      parts.push(r.conceptImplemented || r.simplifiedQuestion || "Object-Oriented Programming in C++.");

      parts.push(`\n2. C++ SOURCE CODE:`);
      parts.push(r.code || code);

      if (r.testCases && r.testCases.length > 0) {
        parts.push(`\n3. 3 TEST CASES & CONSOLE OUTPUTS:`);
        r.testCases.forEach((tc, idx) => {
          parts.push(`\n--- Test Case ${idx + 1}: ${tc.title} ---`);
          parts.push(`INPUT:\n${tc.input || "<No input required>"}`);
          parts.push(`OUTPUT:\n${tc.actualOutput || tc.expectedOutput || "<Executed output>"}`);
        });
      } else {
        parts.push(`\n3. CONSOLE OUTPUT:\n${r.output}`);
      }

      parts.push(`\n4. INTERPRETATION / CONCLUSION:`);
      parts.push(r.interpretation || r.explanation || "Execution satisfies problem requirements.");
    } else {
      parts.push(`1. AIM / GENERAL SUMMARY:`);
      parts.push(r.conceptImplemented || r.simplifiedQuestion || "Laboratory experiment exercise.");

      parts.push(`\n2. SOURCE CODE:`);
      parts.push(r.code || code);

      parts.push(`\n3. OUTPUT:`);
      parts.push(r.output);

      parts.push(`\n4. INTERPRETATION:`);
      parts.push(r.interpretation || r.explanation || "Program logic verified.");
    }

    navigator.clipboard.writeText(parts.join("\n"));
    onToast("success", "Copied to Clipboard", "Complete lab record copied according to subject flow.");
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

  const pdfFiles = files.filter(
    (f) => f.mime === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );
  const selectedManualFile = files.find((f) => f.id === manualFileId);
  const activeManualName =
    manualUploadName || (selectedManualFile ? selectedManualFile.name : "");
  const hasActiveManual = Boolean(activeManualName || manualText.trim());

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
              <span>⚡</span> <span className="lab-tab-label">Compiler</span><span className="lab-tab-label-full"> &amp; Terminal</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "assistant"}
              className={`lab-nav-tab ${activeTab === "assistant" ? "active" : ""}`}
              onClick={() => setActiveTab("assistant")}
            >
              <span>🤖</span> <span className="lab-tab-label">AI Assistant</span>
              {structuredRecord && <span className="lab-badge-pulse" title="Structured Record Ready" />}
            </button>
          </div>

          {/* Controls */}
          <div className="lab-header-right">
            <button
              className={`lab-icon-btn lab-manual-btn ${hasActiveManual ? "lab-btn-active" : ""}`}
              onClick={() => setManualOpen((prev) => !prev)}
              title="Lab Manual & Question Bank (PDF or Text)"
            >
              <span>📋</span>
              <span className="lab-btn-label">Manual {hasActiveManual ? "✓" : ""}</span>
            </button>

            <button
              className="lab-icon-btn lab-settings-btn"
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
              <div className="lab-drawer-title-row">
                <span className="lab-drawer-badge">LAB MANUAL</span>
                <h4>University Lab Manual (PDF)</h4>
              </div>
              <button className="lab-drawer-close" onClick={() => setManualOpen(false)}>✕</button>
            </div>
            <p className="lab-drawer-desc">
              Select an uploaded PDF from your board or upload a PDF lab manual directly. The AI Assistant analyzes the PDF pages with multimodal vision to match your code to the exact question.
            </p>

            {/* Active Attached PDF Badge */}
            {activeManualName ? (
              <div className="lab-manual-active-card">
                <div className="lab-manual-active-info">
                  <span className="lab-manual-pdf-icon" aria-hidden="true">📕</span>
                  <div>
                    <div className="lab-manual-name">{activeManualName}</div>
                    <div className="lab-manual-source">
                      {manualUploadName ? "Uploaded from your computer" : "Linked from Swoshboard files"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-text-sm danger-text"
                  onClick={handleClearManualPdf}
                  title="Detach PDF manual"
                >
                  Detach PDF ✕
                </button>
              </div>
            ) : (
              <div className="lab-manual-pickers">
                {/* Source 1: Select from Uploaded Files */}
                <div className="lab-manual-field">
                  <label htmlFor="manual-board-select" className="lab-field-label">
                    1. Select PDF from your uploaded board files:
                  </label>
                  <select
                    id="manual-board-select"
                    className="lab-select lab-manual-select"
                    value={manualFileId}
                    onChange={(e) => handleSelectManualFromBoard(e.target.value)}
                  >
                    <option value="">-- Choose uploaded PDF manual --</option>
                    {pdfFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        📄 {f.name} ({formatBytes(f.size)})
                      </option>
                    ))}
                  </select>
                  {pdfFiles.length === 0 && (
                    <span className="lab-field-hint">No PDF files uploaded on your board yet.</span>
                  )}
                </div>

                <div className="lab-manual-or-divider">OR</div>

                {/* Source 2: Direct Upload from Computer */}
                <div className="lab-manual-field">
                  <span className="lab-field-label">2. Upload PDF manual from device:</span>
                  <input
                    ref={manualUploadInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={handleDirectManualUpload}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm lab-upload-manual-btn"
                    onClick={() => manualUploadInputRef.current?.click()}
                  >
                    <span>📤</span> Choose PDF Document
                  </button>
                </div>
              </div>
            )}

            {/* Optional Specific Question Text Notes */}
            <div className="lab-manual-text-wrap">
              <label htmlFor="manual-text-notes" className="lab-field-label">
                Or enter specific question number / notes:
              </label>
              <textarea
                id="manual-text-notes"
                className="lab-drawer-textarea"
                placeholder="e.g. Experiment 3 / Question 2: Matrix multiplication (Optional if PDF is attached)"
                value={manualText}
                onChange={(e) => saveManual(e.target.value)}
                rows={2}
              />
            </div>

            <div className="lab-drawer-footer">
              <span className="lab-drawer-hint">
                {activeManualName
                  ? `✓ Active PDF manual: "${activeManualName}" will be processed directly by Gemini.`
                  : "PDF manuals are processed directly by Gemini multimodal AI."}
              </span>
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
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Ultra-Stable)</option>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (Fast)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Lightweight)</option>
                    <option value="gemini-4-argon">Gemini 4 Argon (Advanced Reasoning)</option>
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
                {/* Pre-Default Prompt & Subject Flow Selector Bar */}
                <div className="lab-subject-flow-bar">
                  <div className="lab-subject-pills">
                    <span className="flow-label">Format Template:</span>
                    {(["wdu", "dbms", "oop", "general"] as LabSubject[]).map((subjKey) => (
                      <button
                        key={subjKey}
                        type="button"
                        className={`btn-tag ${subject === subjKey ? "active" : ""}`}
                        onClick={() => setSubject(subjKey)}
                        title={SUBJECT_PROMPT_FLOWS[subjKey].description}
                      >
                        {SUBJECT_PROMPT_FLOWS[subjKey].name}
                      </button>
                    ))}
                  </div>
                  <div className="lab-flow-badge-info">
                    <span className="flow-badge-icon">⚡</span>
                    <span className="flow-badge-text">{SUBJECT_PROMPT_FLOWS[subject].flowBadge}</span>
                  </div>
                </div>

                {/* University Lab Manual Question Selector Card */}
                <div className="lab-manual-question-box">
                  <div className="question-box-header">
                    <div className="question-box-title">
                      <span className="question-icon">📖</span>
                      <span className="question-title-text">Lab Manual Question</span>
                      {hasActiveManual ? (
                        <span className="question-manual-badge" title="Linked to attached manual">
                          ✓ {activeManualName}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="question-manual-link-btn"
                          onClick={() => setManualOpen(true)}
                          title="Attach PDF Manual to extract questions"
                        >
                          📎 Attach PDF Manual
                        </button>
                      )}
                    </div>
                    <div className="question-box-actions">
                      {(hasActiveManual || manualText) && (
                        <button
                          type="button"
                          className="btn-text-xs"
                          onClick={handleExtractQuestionsFromManual}
                          disabled={isExtractingQuestions}
                          title="Extract all questions from the lab manual"
                        >
                          {isExtractingQuestions ? "Extracting..." : "⚡ Extract Questions"}
                        </button>
                      )}
                      {selectedQuestionText && (
                        <button
                          type="button"
                          className="btn-text-xs"
                          onClick={() => {
                            setSelectedQuestionText("");
                            try {
                              localStorage.removeItem("swosh_selected_question");
                            } catch {
                              /* ignore */
                            }
                          }}
                          title="Clear selected question"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {manualQuestions.length > 0 && (
                    <div className="question-dropdown-row">
                      <label htmlFor="manual-question-dropdown" className="visually-hidden">
                        Select Experiment Question from Manual
                      </label>
                      <select
                        id="manual-question-dropdown"
                        className="form-select form-select-sm"
                        value={selectedQuestionText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedQuestionText(val);
                          try {
                            if (val) localStorage.setItem("swosh_selected_question", val);
                            else localStorage.removeItem("swosh_selected_question");
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        <option value="">-- Choose question from manual ({manualQuestions.length} found) --</option>
                        {manualQuestions.map((q, idx) => (
                          <option key={idx} value={q.statement}>
                            {q.number ? `${q.number}: ` : ""}{q.title || q.statement.slice(0, 75) + "..."}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <textarea
                    className="lab-question-input"
                    rows={2}
                    placeholder={
                      hasActiveManual
                        ? 'Click "Extract Questions" above or type/paste the exact question statement from your manual...'
                        : 'Attach your manual (PDF) or type/paste the exact question statement from your syllabus...'
                    }
                    value={selectedQuestionText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedQuestionText(val);
                      try {
                        if (val) localStorage.setItem("swosh_selected_question", val);
                        else localStorage.removeItem("swosh_selected_question");
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>

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
                        <span className="lab-record-tag">{structuredRecord.subject.toUpperCase()} LAB RECORD</span>
                        <h3 className="lab-record-title">
                          {structuredRecord.questionNumber}: {structuredRecord.questionTitle}
                        </h3>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleCopyStructuredRecord}
                        title="Copy complete record formatted according to subject flow"
                      >
                        📋 Copy Record
                      </button>
                    </div>

                    {/* Web Dev (WDU) Flow: Question -> 1. Concepts (Tags & Attributes, JS) -> 2. Code -> 3. Interpretation */}
                    {structuredRecord.subject === "wdu" ? (
                      <>
                        <div className="lab-record-section question-section">
                          <h4>Question:</h4>
                          <p className="lab-question-statement">
                            {structuredRecord.simplifiedQuestion ||
                              selectedQuestionText ||
                              structuredRecord.questionTitle ||
                              "Write HTML and JavaScript programs to demonstrate web concepts."}
                          </p>
                        </div>

                        <div className="lab-record-section">
                          <h4>1. Concepts Implemented (Tags &amp; Attributes):</h4>
                          {structuredRecord.tagsAndAttributes && structuredRecord.tagsAndAttributes.length > 0 ? (
                            <ul className="lab-concept-list">
                              {structuredRecord.tagsAndAttributes.map((item, idx) => (
                                <li key={idx}>
                                  <strong><code>{item.name}</code></strong>: {item.description}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>{structuredRecord.conceptImplemented || "HTML5 layout tags, embedded CSS styles, and interactive elements."}</p>
                          )}

                          {structuredRecord.jsConcepts && structuredRecord.jsConcepts.length > 0 && (
                            <>
                              <h5 className="sub-heading">JavaScript Concepts Implemented:</h5>
                              <ul className="lab-concept-list">
                                {structuredRecord.jsConcepts.map((item, idx) => (
                                  <li key={idx}>
                                    <strong><code>{item.name}</code></strong>: {item.description}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>

                        <div className="lab-record-section">
                          <div className="section-header-row">
                            <h4>2. Source Code:</h4>
                            <button
                              type="button"
                              className="btn-text-xs"
                              onClick={() => {
                                const clean = (structuredRecord.code || code)
                                  .replace(/\/\*[\s\S]*?(why skipped|skipped).*?\*\//gi, "")
                                  .replace(/\/\/.*?(why skipped|skipped).*$/gmi, "")
                                  .trim();
                                navigator.clipboard.writeText(clean).then(() => onToast("success", "Copied", "Source code copied"));
                              }}
                            >
                              Copy All Code
                            </button>
                          </div>

                          {structuredRecord.files && structuredRecord.files.length > 0 ? (
                            <div className="lab-multifile-container">
                              {structuredRecord.files.map((file, idx) => (
                                <div key={idx} className="lab-file-block">
                                  <div className="file-header">
                                    <span className="file-name">
                                      File {idx + 1}: {file.name}{file.title ? ` (${file.title})` : ""}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn-text-xs"
                                      onClick={() => {
                                        navigator.clipboard
                                          .writeText(file.code.trim())
                                          .then(() => onToast("success", "Copied", `${file.name} copied`));
                                      }}
                                    >
                                      Copy File
                                    </button>
                                  </div>
                                  <pre className="lab-record-code">{file.code.trim()}</pre>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="lab-record-code">{structuredRecord.code || code}</pre>
                          )}
                        </div>

                        <div className="lab-record-section">
                          <h4>3. Interpretation:</h4>
                          <div className="lab-interpretation-text">
                            <p>
                              {structuredRecord.interpretation ||
                                structuredRecord.output ||
                                "Interactive web components rendered with responsive layout."}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : structuredRecord.subject === "dbms" ? (
                      /* DBMS Flow: Problem -> SQL -> Oracle SQL*Plus Tabular Output -> Relational Interpretation */
                      <>
                        <div className="lab-record-section">
                          <h4>1. Objective &amp; Relational Schema:</h4>
                          <p>{structuredRecord.conceptImplemented || structuredRecord.simplifiedQuestion}</p>
                        </div>

                        <div className="lab-record-section">
                          <div className="section-header-row">
                            <h4>2. SQL Queries / Code:</h4>
                            <button
                              type="button"
                              className="btn-text-xs"
                              onClick={() => navigator.clipboard.writeText(structuredRecord.code || code).then(() => onToast("success", "Copied", "SQL copied"))}
                            >
                              Copy SQL
                            </button>
                          </div>
                          <pre className="lab-record-code">{structuredRecord.code || code}</pre>
                        </div>

                        <div className="lab-record-section">
                          <h4>3. Oracle SQL*Plus Tabular Output:</h4>
                          <pre className="lab-record-output">{structuredRecord.output}</pre>
                        </div>

                        <div className="lab-record-section">
                          <h4>4. Relational Interpretation:</h4>
                          <p>{structuredRecord.interpretation || structuredRecord.explanation || "Query execution verifies table integrity and constraints."}</p>
                        </div>
                      </>
                    ) : structuredRecord.subject === "oop" ? (
                      /* OOP Flow: Aim -> C++ Code -> 3 Test Cases -> Interpretation */
                      <>
                        <div className="lab-record-section">
                          <h4>1. Aim &amp; OOP Concepts Implemented:</h4>
                          <p>{structuredRecord.conceptImplemented || structuredRecord.simplifiedQuestion}</p>
                        </div>

                        <div className="lab-record-section">
                          <div className="section-header-row">
                            <h4>2. C++ Source Code:</h4>
                            <button
                              type="button"
                              className="btn-text-xs"
                              onClick={() => navigator.clipboard.writeText(structuredRecord.code || code).then(() => onToast("success", "Copied", "C++ code copied"))}
                            >
                              Copy Code
                            </button>
                          </div>
                          <pre className="lab-record-code">{structuredRecord.code || code}</pre>
                        </div>

                        {structuredRecord.testCases && structuredRecord.testCases.length > 0 ? (
                          <div className="lab-record-section">
                            <h4>3. 3 Test Cases &amp; Console Execution Results:</h4>
                            <div className="lab-record-testcases">
                              {structuredRecord.testCases.map((tc, idx) => (
                                <div key={idx} className="lab-record-tc-item">
                                  <span className="tc-heading">Test Case {idx + 1} ({tc.title}):</span>
                                  <div className="tc-io-grid">
                                    <div><strong>Input:</strong> <code>{tc.input.trim() || "<No input>"}</code></div>
                                    <div><strong>Output:</strong> <code>{tc.actualOutput || tc.expectedOutput || "<Executed output>"}</code></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="lab-record-section">
                            <h4>3. Console Output:</h4>
                            <pre className="lab-record-output">{structuredRecord.output}</pre>
                          </div>
                        )}

                        <div className="lab-record-section">
                          <h4>4. OOP Interpretation &amp; Conclusion:</h4>
                          <p>{structuredRecord.interpretation || structuredRecord.explanation || "Execution confirms expected OOP behavior."}</p>
                        </div>
                      </>
                    ) : (
                      /* General CS Flow */
                      <>
                        <div className="lab-record-section">
                          <h4>1. Aim &amp; Objective:</h4>
                          <p>{structuredRecord.conceptImplemented || structuredRecord.simplifiedQuestion}</p>
                        </div>

                        <div className="lab-record-section">
                          <h4>2. Source Code:</h4>
                          <pre className="lab-record-code">{structuredRecord.code || code}</pre>
                        </div>

                        <div className="lab-record-section">
                          <h4>3. Execution Output:</h4>
                          <pre className="lab-record-output">{structuredRecord.output}</pre>
                        </div>

                        <div className="lab-record-section">
                          <h4>4. Interpretation &amp; Conclusion:</h4>
                          <p>{structuredRecord.interpretation || structuredRecord.explanation || "Program logic verified."}</p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="lab-assistant-empty">
                    <span className="empty-icon">🤖</span>
                    <h3>Lab Record Assistant Ready</h3>
                    <p>
                      Selected format: <strong>{SUBJECT_PROMPT_FLOWS[subject].name}</strong>.
                      Click <strong>&quot;Format for Lab Record&quot;</strong> above to generate the complete lab submission formatted according to the <strong>{subject.toUpperCase()}</strong> flow.
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
