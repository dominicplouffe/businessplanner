import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/* The load balancer's target-group check. It touches the database on purpose:
   a task that has lost its connection pool is not healthy, and answering 200
   from memory would keep it in rotation while every request fails. */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
