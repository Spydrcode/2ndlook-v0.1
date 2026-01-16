import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    JOBBER_SCOPES: process.env.JOBBER_SCOPES,
    JOBBER_CLIENT_ID: process.env.JOBBER_CLIENT_ID ? "present" : "missing",
    JOBBER_REDIRECT_URI: process.env.JOBBER_REDIRECT_URI,
  });
}
