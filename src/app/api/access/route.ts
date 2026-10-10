import { ACCESS_COOKIE, correctAccessCode, newAccessSession } from "@/lib/access";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 1000)));
    if (typeof value.code !== "string" || !correctAccessCode(value.code)) return Response.json({ message: "The access code was not accepted." }, { status: 401 });
    const secure = process.env.PUBLIC_APP_URL?.startsWith("https:") || request.url.startsWith("https:");
    return Response.json({ ready: true }, { headers: { "Set-Cookie": `${ACCESS_COOKIE}=${newAccessSession()}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`, "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Please enter your access code." }, { status: 400 }); }
}
