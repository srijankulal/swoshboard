export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDb } = await import("@/lib/db");
    try {
      await initDb();
    } catch (error) {
      console.error("[swoshboard] DB schema init failed:", error);
    }
  }
}