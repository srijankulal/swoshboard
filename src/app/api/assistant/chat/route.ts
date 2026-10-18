import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  callGeminiApi,
  detectLabSubject,
  extractJsonFromResponse,
  LabAnalysisResult,
} from "@/lib/gemini";
import { simulateOracleSqlExecution } from "@/lib/sqlplus-emulator";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      message = "",
      fileName = "program.txt",
      fileContent = "",
      manualText = "",
      subject: requestedSubject,
      mode = "structure", // 'structure' | 'chat' | 'testcases' | 'viva' | 'fix'
      history = [],
      apiKey,
      model = "gemini-2.5-flash",
    } = body;

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
${manualText ? `Lab Manual / Question Bank Provided by Student:\n"""\n${manualText}\n"""` : "No manual provided. Deduce the question statement, objective, and question number from comments and code logic."}
`;

    // 1. Structured Lab Format Request
    if (mode === "structure" || message.toLowerCase().includes("format for lab record") || message.toLowerCase().includes("lab record")) {
      let prompt = `Analyze this student's code and prepare the complete, formal Lab Record structure.\n\nCode in "${fileName}":\n\`\`\`\n${fileContent || "// No code provided yet"}\n\`\`\`\n\n`;

      if (subject === "oop") {
        prompt += `Return a valid JSON object with the following schema:
{
  "subject": "oop",
  "questionNumber": "e.g. Question 1 or Experiment 3",
  "questionTitle": "Concise title of the program",
  "simplifiedQuestion": "Simplified, clean problem statement from the manual explaining what the program does",
  "code": "The clean, formatted, well-commented C++ source code",
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
  "output": "Complete terminal output showing the test runs",
  "explanation": "Brief 3-4 bullet point explanation of the OOP concepts applied (classes, encapsulation, constructors, etc.)"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else if (subject === "dbms") {
        prompt += `Return a valid JSON object with the following schema:
{
  "subject": "dbms",
  "questionNumber": "e.g. Question 2 or Query Experiment 4",
  "questionTitle": "Title of SQL problem / query",
  "simplifiedQuestion": "Clear requirement describing the table schema, constraints, and query objective",
  "code": "Clean, formatted SQL statements with proper capitalization and semicolons",
  "output": "Authentic Oracle SQL*Plus formatted output including 'SQL> ', table columns, hyphens, and row count feedback (e.g. '1 row created.', '4 rows selected.')",
  "explanation": "Key relational concepts and SQL clauses used (e.g. INNER JOIN, GROUP BY, subquery)"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else if (subject === "wdu") {
        prompt += `Return a valid JSON object with the following schema:
{
  "subject": "wdu",
  "questionNumber": "e.g. Question 3 or Web Lab Exercise 2",
  "questionTitle": "Title of the Web Application / Page",
  "simplifiedQuestion": "Objective and functional requirements of the web layout and scripts",
  "code": "Clean HTML/CSS/JavaScript code",
  "webFlow": "Step-by-step description of component hierarchy, event handling, and UI layout flow",
  "output": "Description of the live rendered visual output, user interactions, and console responses",
  "explanation": "DOM methods, CSS flex/grid layout, and events used"
}
Output ONLY the raw JSON object. Do not wrap in markdown or add conversational preamble.`;
      } else {
        prompt += `Return a valid JSON object with keys: "subject", "questionNumber", "questionTitle", "simplifiedQuestion", "code", "output", "explanation". Output ONLY raw JSON.`;
      }

      const rawResponse = await callGeminiApi({
        prompt,
        systemInstruction: baseSystemPrompt,
        apiKey,
        model,
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
        apiKey,
        model,
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
        apiKey,
        model,
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
      apiKey,
      model,
      temperature: 0.3,
    });

    return NextResponse.json({
      success: true,
      message: chatResponse,
      subject,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to process AI assistant request.",
      },
      { status: 500 }
    );
  }
}
