import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/* The image's health check, which the deploy waits on. It touches the database on purpose:
   a container that has lost its connection pool is not healthy, and answering 200
   from memory would report it serving while every request fails. */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
