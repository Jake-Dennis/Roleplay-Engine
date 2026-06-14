// Direct test — bypass logger top-level-await issue
const path = require('path');
process.env.NODE_ENV = 'production'; // Skip the async_hooks import
process.chdir('C:\\Users\\JakeP\\Documents\\GitHub\\Roleplay-Engine');

async function main() {
  const { getDb } = require('C:\\Users\\JakeP\\Documents\\GitHub\\Roleplay-Engine\\src\\lib\\db.ts');
  const { generateText, getActiveJobModel } = require('C:\\Users\\JakeP\\Documents\\GitHub\\Roleplay-Engine\\src\\lib\\ollama.ts');
  const { PROMPTS } = require('C:\\Users\\JakeP\\Documents\\GitHub\\Roleplay-Engine\\src\\lib\\prompts.ts');
  
  const userId = "8aec6985-e41f-494c-ba65-99648ee80d4b";
  const db = getDb();

  const session = db.prepare("SELECT id, name FROM sessions WHERE name = 'Jake''s Middle-Earth'").get();
  if (!session) { console.log("Session not found"); return; }
  console.log("Session:", session.name);

  const messages = db.prepare("SELECT content, sender_id, timestamp FROM messages WHERE session_id = ? AND is_deleted = 0 ORDER BY timestamp ASC LIMIT 50").all(session.id);
  console.log("Messages:", messages.length);

  const messageText = messages.map(m => `${m.sender_id === null ? "AI" : "Player"}: ${m.content}`).join("\n");
  const prompt = PROMPTS.analyzeThreads(messageText);
  
  const model = getActiveJobModel(userId);
  console.log("Model:", model);
  
  try {
    const response = await generateText(prompt, { temperature: 0.3, userId });
    console.log("\n--- Response (" + response.length + " chars) ---");
    console.log(response);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("\n--- Parsed ---");
        if (parsed.threads && Array.isArray(parsed.threads)) {
          console.log("Threads found:", parsed.threads.length);
          for (const t of parsed.threads) {
            console.log("  -", t.name, "|", t.status, "|", t.keyEntities?.join(", "));
          }
        } else {
          console.log("No threads array. Keys:", Object.keys(parsed));
        }
      } catch (e) {
        console.log("JSON parse error:", e.message);
        console.log("First 500 chars:", jsonMatch[0].substring(0, 500));
      }
    } else {
      console.log("No JSON found in response");
    }
  } catch (err) {
    console.log("Ollama error:", err.message || String(err));
  }
}

main().catch(e => console.error(e));
