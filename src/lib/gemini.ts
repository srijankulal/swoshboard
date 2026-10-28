/**
 * Google Gemini API Client for Swoshboard Lab Assistant.
 * Uses native fetch to call Gemini models without external dependencies.
 */

export interface GeminiMessage {
  role: "user" | "model" | "system";
  content: string;
}

export interface LabAnalysisResult {
  subject: "oop" | "dbms" | "wdu" | "general";
  questionNumber: string;
  questionTitle: string;
  simplifiedQuestion: string;
  conceptImplemented?: string;
  code: string;
  output: string;
  interpretation?: string;
  testCases?: Array<{
    id: number;
    title: string;
    input: string;
    expectedOutput: string;
  }>;
  explanation?: string;
  vivaQuestions?: Array<{
    question: string;
    answer: string;
  }>;
  webFlow?: string;
}

export class GeminiApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "GEMINI_ERROR") {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-4-argon",
];

export function normalizeGeminiModel(inputModel?: string): string {
  if (!inputModel) return "gemini-3.8-flash";
  const trimmed = inputModel.trim();
  const lower = trimmed.toLowerCase();

  // Deprecated models according to Google Gemini API Skill rules:
  // "Models like gemini-2.5-*, gemini-2.0-*, gemini-1.5-* are legacy and deprecated. Never use them.
  // If a user asks for a deprecated model, use gemini-3.8-flash instead and note the substitution."
  if (
    lower.includes("1.5") ||
    lower.includes("2.0") ||
    (lower.includes("2.5") && !lower.includes("preview-tts"))
  ) {
    console.info(`[Gemini API] Upgrading deprecated model "${inputModel}" to "gemini-3.8-flash".`);
    return "gemini-3.8-flash";
  }

  if (lower === "3.8-flash" || lower === "gemini-3.8-flash") return "gemini-3.8-flash";
  if (lower === "3.5-flash" || lower === "gemini-3.5-flash") return "gemini-3.5-flash";
  if (lower === "3.5-flash-lite" || lower === "gemini-3.5-flash-lite") return "gemini-3.5-flash-lite";
  if (lower === "3.1-flash-lite" || lower === "gemini-3.1-flash-lite") return "gemini-3.1-flash-lite";
  if (lower === "4-argon" || lower === "gemini-4-argon") return "gemini-4-argon";

  return trimmed;
}

export async function callGeminiApi(options: {
  prompt: string;
  systemInstruction?: string;
  pdfBase64?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const key = options.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.error("[Gemini API] Error: No Gemini API key provided in options or environment variable GEMINI_API_KEY.");
    throw new GeminiApiError(
      "Gemini API key is required. Please add GEMINI_API_KEY to your environment or enter your key in Lab Studio settings (⚙️).",
      401,
      "MISSING_API_KEY"
    );
  }

  const requestedModel = normalizeGeminiModel(options.model);
  const modelsToTry = [requestedModel, ...DEFAULT_MODELS.filter((m) => m !== requestedModel)];

  console.log(`[Gemini API] Invoking Gemini API. Target model: "${requestedModel}", key prefix: "${key.slice(0, 7)}...", key length: ${key.length}`);
  if (!key.startsWith("AIzaSy")) {
    console.warn(`[Gemini API] Warning: The provided API key does not start with standard Google AI Studio prefix "AIzaSy". Key starts with: "${key.slice(0, 8)}...".`);
  }

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini API] Attempting model "${model}"...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        key
      )}`;

      const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (options.pdfBase64) {
        const cleanBase64 = options.pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
        if (cleanBase64) {
          userParts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: cleanBase64,
            },
          });
        }
      }
      userParts.push({ text: options.prompt });

      const body: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: userParts,
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: 8192,
        },
      };

      if (options.systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const rawMsg =
          (errData as { error?: { message?: string; status?: string } })?.error?.message ||
          `HTTP ${res.status}`;

        console.warn(`[Gemini API] Model "${model}" failed with HTTP ${res.status}:`, rawMsg);

        // 1. Model not found or unsupported on this endpoint
        const isNotFound =
          res.status === 404 ||
          (res.status === 400 &&
            (rawMsg.toLowerCase().includes("not found") ||
              rawMsg.toLowerCase().includes("not supported") ||
              rawMsg.toLowerCase().includes("call listmodels")));

        // 2. High demand, temporary server overload, rate limiting (503, 502, 504, 500, 429)
        const isTransientOrOverloaded =
          res.status === 503 ||
          res.status === 502 ||
          res.status === 504 ||
          res.status === 500 ||
          res.status === 429 ||
          rawMsg.toLowerCase().includes("high demand") ||
          rawMsg.toLowerCase().includes("spikes in demand") ||
          rawMsg.toLowerCase().includes("temporarily") ||
          rawMsg.toLowerCase().includes("resource has been exhausted");

        if (isNotFound || isTransientOrOverloaded) {
          const reason = isNotFound
            ? "is not available on this API version"
            : `is temporarily experiencing high demand/rate-limiting (HTTP ${res.status}: ${rawMsg})`;
          console.warn(`[Gemini API] Model "${model}" ${reason}. Falling back to next model...`);
          lastError = new GeminiApiError(
            `Model ${model} ${reason}: ${rawMsg}`,
            res.status,
            isNotFound ? "MODEL_NOT_FOUND" : res.status === 429 ? "RATE_LIMITED" : "HIGH_DEMAND"
          );
          continue; // Seamlessly try next model in fallback sequence!
        }

        // 3. Authentication errors (401, 403, or invalid API key message in 400)
        if (
          res.status === 401 ||
          res.status === 403 ||
          (res.status === 400 && rawMsg.toLowerCase().includes("api key not valid"))
        ) {
          throw new GeminiApiError(
            `Gemini API key error: ${rawMsg}. Please verify your API key in Settings (⚙️).`,
            res.status === 400 ? 400 : 401,
            "INVALID_API_KEY"
          );
        }

        // 4. Other client/upstream errors
        throw new GeminiApiError(
          `Gemini API error: ${rawMsg}`,
          res.status >= 400 && res.status < 500 ? res.status : 502,
          "UPSTREAM_ERROR"
        );
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.warn(`[Gemini API] Model "${model}" responded HTTP 200 but returned no text parts.`);
        lastError = new GeminiApiError("No response generated by Gemini model.", 502, "EMPTY_RESPONSE");
        continue;
      }
      console.log(`[Gemini API] Success! Model "${model}" generated ${text.length} characters.`);
      return text;
    } catch (err) {
      if (err instanceof GeminiApiError) {
        if (
          err.status === 404 ||
          err.status === 503 ||
          err.status === 502 ||
          err.status === 504 ||
          err.status === 500 ||
          err.status === 429 ||
          err.code === "MODEL_NOT_FOUND" ||
          err.code === "HIGH_DEMAND" ||
          err.code === "RATE_LIMITED"
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Gemini API] Network or unexpected error on model "${model}":`, lastError.message);
      continue;
    }
  }

  throw lastError || new GeminiApiError("Failed to communicate with Gemini API.", 502, "UPSTREAM_ERROR");
}

export function detectLabSubject(fileName: string, codeContent: string): "oop" | "dbms" | "wdu" | "general" {
  const lowerName = fileName.toLowerCase();
  const lowerCode = codeContent.toLowerCase();

  // DBMS / Oracle SQL*Plus
  if (
    lowerName.endsWith(".sql") ||
    lowerName.includes("dbms") ||
    lowerName.includes("oracle") ||
    lowerName.includes("query") ||
    lowerCode.includes("create table") ||
    lowerCode.includes("select ") ||
    lowerCode.includes("from ") ||
    lowerCode.includes("sql*plus") ||
    lowerCode.includes("varchar2")
  ) {
    return "dbms";
  }

  // WDU / Web Dev
  if (
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm") ||
    lowerName.endsWith(".css") ||
    lowerName.endsWith(".js") ||
    lowerName.endsWith(".jsx") ||
    lowerName.includes("wdu") ||
    lowerName.includes("web") ||
    lowerCode.includes("<!doctype html") ||
    lowerCode.includes("<html") ||
    lowerCode.includes("document.getelementbyid") ||
    lowerCode.includes("addeventlistener")
  ) {
    return "wdu";
  }

  // OOP / C++
  if (
    lowerName.endsWith(".cpp") ||
    lowerName.endsWith(".cc") ||
    lowerName.endsWith(".cxx") ||
    lowerName.endsWith(".c") ||
    lowerName.endsWith(".h") ||
    lowerName.endsWith(".hpp") ||
    lowerName.includes("oop") ||
    lowerCode.includes("#include <iostream>") ||
    lowerCode.includes("std::cout") ||
    lowerCode.includes("class ") ||
    lowerCode.includes("public:") ||
    lowerCode.includes("int main(")
  ) {
    return "oop";
  }

  return "general";
}

export function extractJsonFromResponse<T>(raw: string): T | null {
  try {
    // 1. Try directly parsing raw text
    return JSON.parse(raw) as T;
  } catch {
    // 2. Look for ```json ... ``` blocks
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]) as T;
      } catch {
        /* continue */
      }
    }
    // 3. Try to find the first { and last }
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.substring(firstBrace, lastBrace + 1)) as T;
      } catch {
        /* continue */
      }
    }
    return null;
  }
}
