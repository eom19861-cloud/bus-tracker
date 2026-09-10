import { NextResponse } from "next/server";
import { GbisError } from "@/lib/gbis";

export function jsonError(error: unknown) {
  if (error instanceof GbisError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
}
