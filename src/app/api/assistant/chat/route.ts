import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveSignedDownloadUrl } from "@/lib/cloudinary";
import {
  callGeminiApi,
  detectLabSubject,
  extractJsonFromResponse,
  GeminiApiError,
  LabAnalysisResult,
  normalizeGeminiModel,
} from "@/lib/gemini";
import { simulateOracleSqlExecution } from "@/lib/sqlplus-emulator";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body.", code: "INVALID_BODY" }, { status: 400 });
    }

    const {
      message = "",
      fileName = "program.txt",
      fileContent = "",
      manualText = "",
      manualPdfBase64: inputPdfBase64,
      manualFileId,
      subject: requestedSubject,
      mode = "structure", // 'structure' | 'chat' | 'testcases' | 'viva' | 'fix' | 'questions'
      history = [],
      apiKey,
      model = "gemini-3.8-flash",
      selectedQuestion = "",
    } = body as {
      message?: string;
      fileName?: string;
      fileContent?: string;
      manualText?: string;
      manualPdfBase64?: string;
      manualFileId?: string;
      subject?: "oop" | "dbms" | "wdu" | "general";
      mode?: string;
      history?: Array<{ role: string; content: string }>;
      apiKey?: string;
      model?: string;
      selectedQuestion?: string;
    };

    const resolvedModel = normalizeGeminiModel(model);
    console.log(
      `[Assistant Route] POST /api/assistant/chat mode="${mode}", user="${user.email || user.id}", file="${fileName}", model="${model}" -> resolved="${resolvedModel}", hasSelectedQuestion=${Boolean(selectedQuestion)}`
    );
    console.log(
      `[Assistant Route] Details: codeLength=${fileContent.length}, manualText=${manualText.length} chars, hasManualPdf=${Boolean(
        inputPdfBase64
      )}, manualFileId=${manualFileId || "none"}`
    );

    // Fast-fail if no API key is available in request or server environment
    const effectiveKey = (apiKey?.trim() || process.env.GEMINI_API_KEY?.trim()) ?? "";
    if (!effectiveKey) {
      console.warn("[Assistant Route] Request rejected: No Gemini API key provided in body or environment.");
      return NextResponse.json(
        {
          error:
            "Gemini API key is required. Click the ⚙️ Settings button in Lab Studio to enter your free Google Gemini API key.",
          code: "MISSING_API_KEY",
        },
        { status: 401 }
      );
    }
    console.log(
      `[Assistant Route] Using API key prefix: "${effectiveKey.slice(0, 7)}..." (total length: ${effectiveKey.length})`
    );

    // Guard against Vercel 4.5 MB request payload overflow
    if (inputPdfBase64 && inputPdfBase64.length > 5.5 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: "Lab manual PDF payload is too large. Please upload a PDF under 3.5 MB.",
          code: "PAYLOAD_TOO_LARGE",
        },
        { status: 413 }
      );
    }

    // Resolve PDF if a file from the user's dashboard was selected as manual
    let pdfBase64 = inputPdfBase64;
    let manualFileName = "";

    if (!pdfBase64 && manualFileId) {
      try {
        const fileRes = await db.execute({
          sql: "SELECT public_id, name, bytes, mime FROM files WHERE id = ? AND user_id = ?",
          args: [manualFileId, user.id],
        });
        if (fileRes.rows.length > 0) {
          const row = fileRes.rows[0] as unknown as {
            public_id: string;
            name: string;
            bytes: number;
            mime: string | null;
          };
          if (row.bytes > 4 * 1024 * 1024) {
            return NextResponse.json(
              {
                error: `Selected manual "${row.name}" exceeds the 4 MB limit for AI analysis.`,
                code: "PAYLOAD_TOO_LARGE",
              },
              { status: 413 }
            );
          }
          manualFileName = row.name;
          const signedUrl = await resolveSignedDownloadUrl(row.public_id);
          const dlRes = await fetch(signedUrl);
          if (dlRes.ok) {
            const buf = await dlRes.arrayBuffer();
            pdfBase64 = Buffer.from(buf).toString("base64");
          }
        }
      } catch {
        // Fall back to text if retrieval failed
      }
    }

    const subject = requestedSubject || detectLabSubject(fileName, fileContent);

    // Build system instruction based on lab subject
    const subjectTitle =
      subject === "oop"
        ? "OOP (Object-Oriented Programming in C++)"
        : subject === "dbms"
          ? "DBMS (Database Management Systems with Oracle SQL*Plus)"
          : subject === "wdu"
            ? "WDU (Web Development: HTML, CSS, JavaScript)"
            : "Computer Science Lab";

    const baseSystemPrompt = `You are an elite University Computer Science Lab Instructor and Lab Record Evaluator specializing in ${subjectTitle}.
You format lab assignment solutions cleanly according to standard university lab record and viva guidelines.

Student's Subject: ${subjectTitle}
Current File Name: "${fileName}"
${
  selectedQuestion
    ? `The student has selected this specific Question / Problem Statement from their University Lab Manual:
"""
${selectedQuestion}
"""
You MUST use this EXACT question statement for the record's Question / simplifiedQuestion and align all concepts, code, and interpretation directly with it.`
    : pdfBase64
      ? `The student has attached their official University Lab Manual as a PDF (${manualFileName || "Manual.pdf"}). Examine the PDF pages, locate the experiment/question that corresponds to the student's code in "${fileName}", and extract the exact question number, exact question statement from the manual, constraints, and test requirements.`
      : manualText
        ? `Lab Manual / Question Bank Provided by Student:\n"""\n${manualText}\n"""`
        : "No manual provided. Deduce the question statement, objective, and question number from comments and code logic."
}
`;

    // 0. Extract Question Bank from Lab Manual
    if (mode === "questions") {
      if (!pdfBase64 && !manualText) {
        return NextResponse.json(
          {
            error: "No lab manual attached. Please upload a PDF manual or paste your lab manual text first.",
            code: "NO_MANUAL",
          },
          { status: 400 }
        );
      }

      const questionsPrompt = `Carefully review this University Lab Manual (${manualFileName || "Manual"}).
Extract all lab experiment questions, exercises, and problem statements contained in it.
Return a valid JSON array of objects with the following schema:
[
  {
    "number": "Experiment 1",
    "title": "Short title of the experiment",
    "statement": "Complete exact problem statement from the manual (e.g. Write HTML and JavaScript programs to demonstrate: JavaScript Dialog Boxes... Window Manipulation... Dropdown Selection...)"
  }
]
Extract all experiments clearly. Output ONLY the raw JSON array without conversational markdown or text.`;

      const rawQuestionsResponse = await callGeminiApi({
        prompt: questionsPrompt,
        systemInstruction: "You are an academic lab coordinator extracting a structured list of experiment questions from a university laboratory manual.",
        pdfBase64,
        apiKey,
        model: resolvedModel,
        temperature: 0.1,
      });

      const extractedQuestions = extractJsonFromResponse<Array<{ number: string; title: string; statement: string }>>(
        rawQuestionsResponse
      );

      return NextResponse.json({
        success: true,
        questions: extractedQuestions || [],
        manualFileName: manualFileName || "Manual",
      });
    }

    // 1. Structured Lab Format Request
    if (mode === "structure" || message.toLowerCase().includes("format for lab record") || message.toLowerCase().includes("lab record")) {
      let prompt = `Analyze this student's code and prepare the complete, formal Lab Record structure.\n\nCode in "${fileName}":\n\`\`\`\n${fileContent || "// No code provided yet"}\n\`\`\`\n\n`;

      if (subject === "oop") {
        prompt += `Return a valid JSON object with the following schema:
{
  "subject": "oop",
  "questionNumber": "e.g. Question 1 or Experiment 3",
  "questionTitle": "Concise title of the program",
  "simplifiedQuestion": "Clean problem statement from the lab manual",
  "conceptImplemented": "Aim & OOP concepts implemented (e.g. Classes, Constructors, Operator Overloading, Inheritance)",
  "code": "Clean, formatted C++ source code. Provide pure working code without repetitive summary text or commentary on why parts were skipped.",
  "testCases": [
    {
      "id": 1,
      "title": "Test Case 1 (Standard / Typical Input)",
      "input": "Exact standard stdin input values (e.g. 5\\n10 20 30 40 50)",
      "expectedOutput": "Exact console output corresponding to this input"
    },
    {
      "id": 2,
      "title": "Test Case 2 (Boundary / Edge Case)",
      "input": "Exact boundary stdin input values (e.g. 0 or 1 or negative)",
      "expectedOutput": "Exact console output corresponding to this input"
    },
    {
      "id": 3,
      "title": "Test Case 3 (Alternate / Stress Case)",
      "input": "Exact alternate stdin input values",
      "expectedOutput": "Exact console output corresponding to this input"
    }
  ],
  "output": "Complete terminal execution output",
  "interpretation": "Interpretation of results explaining how output confirms the OOP principles implemented",
  "explanation": "Core OOP design patterns and keywords used"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else if (subject === "dbms") {
        prompt += `Return a valid JSON object with the following schema:
{
  "subject": "dbms",
  "questionNumber": "e.g. Question 2 or Query Experiment 4",
  "questionTitle": "Title of SQL problem / query",
  "simplifiedQuestion": "Clear problem statement describing the schema, constraints, and query objective",
  "conceptImplemented": "Relational database concepts implemented (e.g. DDL constraints, GROUP BY, Subqueries, Joins)",
  "code": "Clean, formatted SQL statements with proper capitalization and semicolons. No repetitive summary text.",
  "output": "Authentic Oracle SQL*Plus formatted output including 'SQL> ', table columns, hyphens, and row count feedback (e.g. '1 row created.', '4 rows selected.')",
  "interpretation": "Relational interpretation: What data was retrieved, integrity constraints verified, and query plan efficiency",
  "explanation": "Key relational concepts and SQL clauses used"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else if (subject === "wdu") {
        prompt += `Return a valid JSON object strictly matching this university lab observation structure:
{
  "subject": "wdu",
  "questionNumber": "e.g. Question 1 or Experiment 3",
  "questionTitle": "Title of the experiment / assignment (e.g. JavaScript Dialog Boxes, Window Manipulation & Dropdown Selection)",
  "simplifiedQuestion": "The complete, exact question statement from the manual (e.g. Write HTML and JavaScript programs to demonstrate:\\nJavaScript Dialog Boxes: Using alert(), confirm(), and prompt() dialog boxes for notifications, user confirmation, and dynamic data input.\\nWindow Manipulation: Validating user credentials against an array, prompting for custom text, and opening a dynamic new browser window using window.open() and document.writeln().\\nDropdown Selection: Dynamically selecting options from an HTML <select> dropdown and handling user interactions with JavaScript.)",
  "conceptImplemented": "High-level summary of concepts implemented",
  "tagsAndAttributes": [
    { "name": "<!DOCTYPE html>", "description": "Declares the document type as standard HTML5 to ensure proper parsing across modern browsers." },
    { "name": "<html lang>", "description": "Root element wrapping all HTML tags; lang specifies the primary language (en)." },
    { "name": "<head>", "description": "Contains non-visible page metadata, titles, and embedded CSS styling declarations." },
    { "name": "<title>", "description": "Defines the title of the webpage displayed on the browser tab." },
    { "name": "<style>", "description": "Encloses internal CSS style rules for flexbox centering, layout spacing, and margins." },
    { "name": "<body>", "description": "Encapsulates all visible layout content rendered on the webpage." },
    { "name": "<h1>", "description": "Displays top-level headings to label the program or module." },
    { "name": "<div>", "description": "Generic block container used with CSS Flexbox to center components and group form elements." },
    { "name": "<label for>", "description": "Identifies descriptive text bound to input controls." },
    { "name": "<input id, class>", "description": "Interactive text field used to capture the user login name." },
    { "name": "<select id, class> / <option>", "description": "Dropdown menu container and its selectable choice items." },
    { "name": "<button onclick>", "description": "Clickable action button triggering specific JavaScript functions via the onclick event listener." },
    { "name": "<script>", "description": "Encloses JavaScript logic for event handling, window operations, and DOM manipulation." }
  ],
  "jsConcepts": [
    { "name": "alert()", "description": "Displays an informational modal dialog box with an OK button." },
    { "name": "confirm()", "description": "Displays a confirmation box with OK and Cancel buttons, returning a boolean (true/false)." },
    { "name": "prompt()", "description": "Opens an input dialog box allowing the user to enter text values." },
    { "name": "document.getElementById().value", "description": "Retrieves the current text value entered into an HTML input field." },
    { "name": "window.open()", "description": "Opens a new browser tab or blank window (_blank) dynamically." },
    { "name": "document.writeln()", "description": "Writes raw HTML content directly to the newly opened window document." },
    { "name": "Array Search & Conditional Loops", "description": "Iterates through an array of authorized usernames using for...in and validates matches." }
  ],
  "files": [
    {
      "name": "index_2.html",
      "title": "JS Dialog Boxes",
      "code": "<!DOCTYPE html>\\n<html lang=\\"en\\">...</html>"
    }
  ],
  "code": "Clean, formatted HTML/CSS/JavaScript code. Provide complete working code. Strictly pure code ONLY without repetitive summary text inside the code or comments explaining why parts were skipped.",
  "interpretation": "INTERPRETATION:\\nThe program creates interactive web pages demonstrating JavaScript popup dialogs, form input handling, and dynamic window generation. In the first module, built-in dialog methods—alert(), confirm(), and prompt()—are invoked via button clicks to notify the user, verify deletions, and capture runtime textual input. In the second module, user credentials entered into an <input> element are verified against an authorized array (user). Upon successful verification, prompt() collects a custom greeting, and window.open() creates a new browser tab where dynamic HTML content is generated at runtime using document.writeln(). The third module captures selected values from a dropdown menu (<select>) and alerts the result on demand. Through this program, I learned how to handle user events with JavaScript, interact with DOM elements, validate user inputs, utilize built-in dialog boxes, and dynamically open and populate new browser windows.",
  "output": "Summary of visual rendered layout and user interaction results"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else {
        prompt += `Return a valid JSON object with keys: "subject", "questionNumber", "questionTitle", "simplifiedQuestion", "conceptImplemented", "code", "output", "interpretation", "explanation". Output ONLY raw JSON.`;
      }

      const rawResponse = await callGeminiApi({
        prompt,
        systemInstruction: baseSystemPrompt,
        pdfBase64,
        apiKey,
        model: resolvedModel,
        temperature: 0.1,
      });

      const parsed = extractJsonFromResponse<LabAnalysisResult>(rawResponse);
      if (parsed) {
        // If DBMS and output was generic, ensure authentic SQL*Plus styling
        if (subject === "dbms" && (!parsed.output || !parsed.output.includes("SQL>"))) {
          parsed.output = simulateOracleSqlExecution(parsed.code || fileContent);
        }
        return NextResponse.json({ success: true, structured: parsed, subject });
      }

      // If JSON parsing failed, return text with fallback structure
      return NextResponse.json({
        success: true,
        structured: {
          subject,
          questionNumber: "Lab Assignment",
          questionTitle: fileName,
          simplifiedQuestion: "Lab Exercise based on " + fileName,
          code: fileContent,
          output: subject === "dbms" ? simulateOracleSqlExecution(fileContent) : rawResponse,
          explanation: "Generated analysis for " + fileName,
        },
        subject,
      });
    }

    // 2. Test Cases Mode (for OOP / C++)
    if (mode === "testcases") {
      const prompt = `Generate exactly 3 diverse, precise test cases with input and expected output for this C++ program:
File: "${fileName}"
\`\`\`cpp
${fileContent}
\`\`\`

Return a valid JSON array of test cases:
[
  { "id": 1, "title": "Standard Case", "input": "...", "expectedOutput": "..." },
  { "id": 2, "title": "Boundary / Edge Case", "input": "...", "expectedOutput": "..." },
  { "id": 3, "title": "Alternate / Stress Case", "input": "...", "expectedOutput": "..." }
]
Provide actual realistic inputs suitable for stdin (with newlines between values). Return ONLY the raw JSON array.`;

      const rawResponse = await callGeminiApi({
        prompt,
        systemInstruction: baseSystemPrompt,
        pdfBase64,
        apiKey,
        model: resolvedModel,
        temperature: 0.1,
      });

      const testCases = extractJsonFromResponse<Array<{ id: number; title: string; input: string; expectedOutput: string }>>(
        rawResponse
      );

      return NextResponse.json({
        success: true,
        testCases: testCases || [
          { id: 1, title: "Test Case 1", input: "10\n", expectedOutput: "Output for 10" },
          { id: 2, title: "Test Case 2", input: "0\n", expectedOutput: "Output for 0" },
          { id: 3, title: "Test Case 3", input: "-5\n", expectedOutput: "Output for -5" },
        ],
      });
    }

    // 3. Viva-Voce Questions Mode
    if (mode === "viva") {
      const prompt = `Generate 5 high-yield University Viva-Voce questions with short, concise answers based on this code in "${fileName}":
\`\`\`
${fileContent}
\`\`\`
Return a JSON array of objects with "question" and "answer" properties. Return ONLY the raw JSON array.`;

      const rawResponse = await callGeminiApi({
        prompt,
        systemInstruction: baseSystemPrompt,
        pdfBase64,
        apiKey,
        model: resolvedModel,
        temperature: 0.2,
      });

      const vivaQuestions = extractJsonFromResponse<Array<{ question: string; answer: string }>>(rawResponse);
      return NextResponse.json({
        success: true,
        vivaQuestions: vivaQuestions || [],
        raw: rawResponse,
      });
    }

    // 4. Conversational Chat Mode
    const formattedHistory = (history as Array<{ role: string; content: string }>)
      .slice(-6)
      .map((h) => `${h.role === "user" ? "Student" : "Assistant"}: ${h.content}`)
      .join("\n\n");

    const chatPrompt = `${formattedHistory ? `Conversation History:\n${formattedHistory}\n\n` : ""}Current Student Question: ${message}

File Content ("${fileName}"):
\`\`\`
${fileContent}
\`\`\`

Provide a clear, educational, and direct response formatted in GitHub Markdown.`;

    const chatResponse = await callGeminiApi({
      prompt: chatPrompt,
      systemInstruction: baseSystemPrompt,
      pdfBase64,
      apiKey,
      model: resolvedModel,
      temperature: 0.3,
    });

    return NextResponse.json({
      success: true,
      message: chatResponse,
      subject,
    });
  } catch (err) {
    console.error("[Assistant Route Error] Execution failed:", err);
    if (err instanceof GeminiApiError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
        },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to process AI assistant request.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
