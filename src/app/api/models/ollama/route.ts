import { NextResponse } from "next/server";
import { OLLAMA_CONFIG } from "@/lib/config";

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export async function GET() {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Ollama responded with ${response.status}`, connected: false },
        { status: 502 }
      );
    }

    const data = await response.json();
    const models: OllamaModelInfo[] = data.models || [];

    // Categorize models by type
    const llmModels = models.filter((m: OllamaModelInfo) => {
      const name = m.name.toLowerCase();
      // Exclude known embedding-only models
      const embeddingModels = ["bge-m3", "bge-large", "nomic-embed", "all-minilm", "snowflake-arctic-embed"];
      return !embeddingModels.some((em) => name.includes(em));
    });

    const embeddingModels = models.filter((m: OllamaModelInfo) => {
      const name = m.name.toLowerCase();
      const embeddingKeywords = ["bge", "nomic-embed", "all-minilm", "snowflake-arctic-embed", "embed"];
      return embeddingKeywords.some((kw) => name.includes(kw));
    });

    // If no embedding models found, include known embedding models that might be available
    const allEmbeddingModels = embeddingModels.length > 0
      ? embeddingModels
      : models.filter((m: OllamaModelInfo) => {
          const name = m.name.toLowerCase();
          return name.includes("bge") || name.includes("embed");
        });

    return NextResponse.json({
      connected: true,
      host: `${OLLAMA_CONFIG.host}:${OLLAMA_CONFIG.port}`,
      models: models.map((m: OllamaModelInfo) => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size || "unknown",
        family: m.details?.family || "unknown",
        quantization: m.details?.quantization_level || "unknown",
        modifiedAt: m.modified_at,
      })),
      llmModels: llmModels.map((m: OllamaModelInfo) => ({
        name: m.name,
        parameterSize: m.details?.parameter_size || "unknown",
        family: m.details?.family || "unknown",
      })),
      embeddingModels: allEmbeddingModels.map((m: OllamaModelInfo) => ({
        name: m.name,
        parameterSize: m.details?.parameter_size || "unknown",
      })),
      defaultLLM: OLLAMA_CONFIG.model,
      defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to connect to Ollama",
        connected: false,
        host: `${OLLAMA_CONFIG.host}:${OLLAMA_CONFIG.port}`,
        models: [],
        llmModels: [],
        embeddingModels: [],
        defaultLLM: OLLAMA_CONFIG.model,
        defaultEmbedding: OLLAMA_CONFIG.embeddingModel,
      },
      { status: 502 }
    );
  }
}
