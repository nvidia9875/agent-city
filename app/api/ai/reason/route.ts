import { NextResponse } from "next/server";
import { generateAndStoreReasoning } from "@/lib/ai/reasoning";
import type { Agent } from "@/types/sim";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.AI_ENABLED === "false") {
    return NextResponse.json({
      error: "AI is disabled",
    });
  }

  let payload: { agent?: Agent; tick?: number; recentEvents?: string[] };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.agent || !payload.agent.id) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  try {
    const reasoning = await generateAndStoreReasoning({
      agent: payload.agent,
      tick: payload.tick,
      recentEvents: payload.recentEvents,
    });

    return NextResponse.json({ reasoning });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate reasoning",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
