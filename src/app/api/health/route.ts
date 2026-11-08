import { NextResponse } from "next/server";
import { getRuntime } from "@/app/api/_runtime";
import { getWorkerHeartbeatAgesMs, isBackgroundWorkersRunning } from "@/workers";

export async function GET() {
  try {
    const rt = await getRuntime();

    // 1. Verify DB health
    let dbStatus = "down";
    try {
      const testVal = rt.metaStore.get<string>("runtime_version");
      dbStatus = "ok";
    } catch {
      dbStatus = "down";
    }

    // 2. Verify RPC health
    let rpcStatus = "sandbox";
    let isRpcOk = true;

    if (rt.networkMode === "NEAR_TESTNET_RPC") {
      try {
        const pingRes = await fetch(rt.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "health-check",
            method: "status",
            params: [],
          }),
        });
        rpcStatus = pingRes.ok ? "reachable" : "unreachable";
        isRpcOk = pingRes.ok;
      } catch {
        rpcStatus = "unreachable";
        isRpcOk = false;
      }
    }

    // 3. Worker heartbeat ages
    const heartbeatAgesMs = getWorkerHeartbeatAgesMs();
    const workersRunning = isBackgroundWorkersRunning();

    // 4. Last indexed block height
    const lastIndexedBlock = rt.indexer.getCursor().toString();

    // 5. Overall status determination
    const overallStatus =
      dbStatus !== "ok"
        ? "down"
        : !isRpcOk
          ? "degraded"
          : "ok";

    const httpStatus = overallStatus === "down" ? 503 : 200;

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        runtimeMode: rt.networkMode,
        db: dbStatus,
        rpc: rpcStatus,
        lastIndexedBlock,
        workers: {
          running: workersRunning,
          heartbeatAgesMs,
        },
      },
      {
        status: httpStatus,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "down",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Internal health check failure",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}
