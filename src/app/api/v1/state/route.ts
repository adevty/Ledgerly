import { NextResponse } from "next/server";
import { buildDashboardSnapshot } from "@/app/api/_runtime";

export async function GET() {
  try {
    const snapshot = await buildDashboardSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/v1/state] Error:", message);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}
