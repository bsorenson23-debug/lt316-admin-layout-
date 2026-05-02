import { NextRequest, NextResponse } from "next/server";
import {
  lookupTumblerItem,
  TumblerLookupManualEntryError,
} from "@/server/tumbler/lookupTumblerItem";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { lookupInput } = (await request.json()) as { lookupInput?: string };

    if (!lookupInput || typeof lookupInput !== "string" || !lookupInput.trim()) {
      return NextResponse.json(
        { error: "Missing lookupInput field." },
        { status: 400 },
      );
    }

    const result = await lookupTumblerItem({ lookupInput });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TumblerLookupManualEntryError) {
      return NextResponse.json(
        {
          error: error.message,
          manualEntryRequired: true,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to look up tumbler item.",
      },
      { status: 500 },
    );
  }
}
