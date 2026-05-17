import { NextResponse } from "next/server";
import { fetchLocalModels } from "@/lib/ollama";
import { OLLAMA_CONFIG } from "@/lib/config";

export async function GET() {
  // Always fetch fresh data from Ollama
  const models = await fetchLocalModels();

  return NextResponse.json({
    models,
    defaultLlm: OLLAMA_CONFIG.model,
    defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
  });
}
