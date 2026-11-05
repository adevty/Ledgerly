import { NextResponse } from "next/server";
import { buildDashboardSnapshot } from "@/app/api/_runtime";

export async function GET() {
  const snapshot = await buildDashboardSnapshot();
  return NextResponse.json(snapshot);
}
