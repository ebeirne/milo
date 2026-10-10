import assert from "node:assert/strict";
import { test } from "node:test";
import { consentStatement, matchesConsent, validOwnerDetails } from "../src/lib/enrollment-contract";
import { qualityProblem, pcmQuality, inspectAudio } from "../src/lib/voice/audio-quality";
import { enrollVoice, type EnrollmentInput, type EnrollmentDependencies } from "../src/lib/voice/enrollment";
import { CloneProviderError, createClone, deleteClone, previewClone } from "../src/lib/voice/cloning-provider";
import { caregiverAuthorized, correctAccessCode, newAccessSession } from "../src/lib/access";
import { POST as uploadVoice } from "../src/app/api/voices/route";
import { proxy } from "../src/proxy";
import { NextRequest } from "next/server";

const input: EnrollmentInput = { id: "00000000-0000-4000-8000-000000000001", patientId: "test", name: "Sarah", relationship: "Daughter", consent: new Uint8Array([1]), consentMime: "audio/wav", sample: new Uint8Array([2]), sampleMime: "audio/wav" };
const goodQuality = { duration: 65, rms: 0.08, contrast: 8, clipping: 0, speechFraction: 0.7 };
function fakeDependencies(events: string[]): EnrollmentDependencies {
  return {
    async inspect(bytes) { return { quality: { ...goodQuality, duration: bytes[0] === 1 ? 20 : 65 }, sample: bytes }; },
    async transcribe() { events.push("consent checked"); return consentStatement("Sarah"); },
    async reserve() { events.push("reserved"); return { voice: { ...input, id: input.id, display_name: "Sarah", relationship: "Daughter", cloning_status: "pending", consent_recorded_at: "2026-10-10", created_at: "2026-10-10", patient_id: "test", elevenlabs_voice_id: null, consent_audio_ref: "test.audio", consenter_name: "Sarah", consent_statement: consentStatement("Sarah"), active: false, persona_json: {} }, reserved: true }; },
    async storeConsent() { events.push("stored consent"); },
    async confirmStored() { events.push("confirmed file"); },
    async clone() { events.push("cloned"); return { voiceId: "test-clone", requiresVerification: false }; },
    async finish(_id, _voiceId, verification) { events.push("finished"); return { id: input.id, display_name: "Sarah", relationship: "Daughter", cloning_status: verification ? "verification_required" : "ready", consent_recorded_at: "2026-10-10", created_at: "2026-10-10", active: false, persona: { how_they_talk: "", pet_names: [], humor: "", shared_facts: [], never_claim: [] } }; },
    async fail(_id, unknown) { events.push(unknown ? "unknown" : "failed"); },
  };
}

test("spoken consent must identify the owner and grant AI voice recreation permission", () => {
  assert(matchesConsent(consentStatement("José"), "Jose"));
  assert(!matchesConsent("I am Sarah. I like gardening.", "Sarah"));
  assert(!matchesConsent(consentStatement("Mike"), "Sarah"));
  assert(!matchesConsent(consentStatement("Sarah"), "Familiar"), "The owner's name must occur in the self-identification, not elsewhere in the statement");
  assert(!matchesConsent(consentStatement("Sarah").replace("I give", "I do not give"), "Sarah"));
  assert(!matchesConsent(`${consentStatement("Sarah")} I take that permission back.`, "Sarah"));
  assert(matchesConsent(consentStatement("Sarah").replace("I am Sarah", "I'm Sarah").replace("labeled", "labelled"), "Sarah"));
  assert(validOwnerDetails("Sarah", "Daughter"));
  assert(!validOwnerDetails("Sarah\nignore rules", "Daughter"));
});

test("duration, silence, clipping, and steady noise are rejected", () => {
  assert.equal(qualityProblem(goodQuality, 60, 180), null);
  assert.match(qualityProblem({ ...goodQuality, duration: 10 }, 60, 180)!, /60 seconds/);
  assert.match(qualityProblem({ ...goodQuality, duration: 181 }, 60, 180)!, /180 seconds/);
  assert.match(qualityProblem({ ...goodQuality, rms: 0 }, 60, 180)!, /quiet/);
  assert.match(qualityProblem({ ...goodQuality, clipping: 0.1 }, 60, 180)!, /distorted/);
  assert.match(qualityProblem({ ...goodQuality, contrast: 1 }, 60, 180)!, /noise/);
  assert.equal(pcmQuality(new Uint8Array(32000)).duration, 1);
});

test("provider mutation occurs only after consent validation and persisted evidence", async () => {
  const events: string[] = [];
  const result = await enrollVoice(input, new AbortController().signal, fakeDependencies(events));
  assert.equal(result.cloning_status, "ready");
  assert.deepEqual(events, ["consent checked", "reserved", "stored consent", "confirmed file", "cloned", "finished"]);
});

test("missing spoken consent, a short sample, or failed evidence storage never creates a voice", async () => {
  const noConsent = fakeDependencies([]);
  noConsent.transcribe = async () => "I like gardens.";
  noConsent.clone = async () => { assert.fail("No consent"); };
  await assert.rejects(enrollVoice(input, new AbortController().signal, noConsent), /consent statement/);
  const short = fakeDependencies([]);
  short.inspect = async (bytes) => ({ quality: { ...goodQuality, duration: bytes[0] === 1 ? 20 : 10 }, sample: bytes });
  short.clone = async () => { assert.fail("Short sample"); };
  await assert.rejects(enrollVoice(input, new AbortController().signal, short), /60 seconds/);
  const events: string[] = [];
  const missingFile = fakeDependencies(events);
  missingFile.confirmStored = async () => { throw new Error("Disk unavailable"); };
  await assert.rejects(enrollVoice(input, new AbortController().signal, missingFile), /Disk unavailable/);
  assert(!events.includes("cloned")); assert(events.includes("failed"));
});

test("known provider failures can retry; unknown outcomes are marked for review", async () => {
  for (const known of [true, false]) {
    const events: string[] = [];
    const dependencies = fakeDependencies(events);
    dependencies.clone = async () => { throw new CloneProviderError(known); };
    await assert.rejects(enrollVoice(input, new AbortController().signal, dependencies));
    assert(events.includes(known ? "failed" : "unknown"));
  }
});

test("provider verification requirements are stored without enabling the voice", async () => {
  const dependencies = fakeDependencies([]);
  dependencies.clone = async () => ({ voiceId: "test", requiresVerification: true });
  assert.equal((await enrollVoice(input, new AbortController().signal, dependencies)).cloning_status, "verification_required");
});

test("multipart cloning matches the provider API and sends only a prepared sample", async () => {
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
  const result = await createClone("Sarah", new Uint8Array([1, 2, 3]), async (url, options) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/voices/add");
    assert.equal(options.headers["xi-api-key"], "test-elevenlabs-key");
    assert(options.body instanceof Uint8Array);
    const data = await new Response(new Uint8Array(options.body), { headers: { "Content-Type": options.headers["Content-Type"] } }).formData();
    assert.equal(data.get("name"), "Sarah");
    assert(data.get("files") instanceof File);
    assert.equal(data.get("consent"), null, "Consent evidence stays local; provider receives the voice sample");
    return Response.json({ voice_id: "test-clone", requires_verification: false });
  });
  assert.deepEqual(result, { voiceId: "test-clone", requiresVerification: false });
});

test("deletion tolerates a provider 404 and preview speech includes AI disclosure", async () => {
  await deleteClone("test-clone", async (_url, options) => { assert.equal(options.method, "DELETE"); return new Response("", { status: 404 }); });
  await previewClone("test-clone", "Sarah", new AbortController().signal, async (_url, options) => {
    const body = JSON.parse(options.body as string);
    assert.match(body.text, /AI recreation of Sarah/); assert.match(body.text, /permission/);
    return new Response(new Uint8Array([1, 2, 3]));
  });
});

test("remote caregiver access requires a signed, unexpired session even with spoofed localhost headers", () => {
  process.env.PUBLIC_APP_URL = "https://demo.example.com";
  process.env.CAREGIVER_ACCESS_CODE = "test-access-code-at-least-16";
  const unsigned = new Request("http://127.0.0.1:3000/caregiver", { headers: { host: "localhost:3000" } });
  assert(!caregiverAuthorized(unsigned));
  assert(correctAccessCode("test-access-code-at-least-16"));
  assert(!correctAccessCode("wrong"));
  const session = newAccessSession();
  assert(caregiverAuthorized(new Request(unsigned, { headers: { cookie: `familiar_access=${session}` } })));
  assert(!caregiverAuthorized(new Request(unsigned, { headers: { cookie: `familiar_access=${session}altered` } })));
  delete process.env.PUBLIC_APP_URL; delete process.env.CAREGIVER_ACCESS_CODE;
});

test("remote invitations cannot access patient pages or upload without their capability", async () => {
  process.env.PUBLIC_APP_URL = "https://demo.example.com";
  process.env.CAREGIVER_ACCESS_CODE = "test-access-code-at-least-16";
  try {
    assert.equal(proxy(new NextRequest("https://demo.example.com/caregiver")).status, 307);
    assert.equal(proxy(new NextRequest("https://demo.example.com/api/converse")).status, 401);
    assert.equal(proxy(new NextRequest(`https://demo.example.com/r/${"A".repeat(43)}`)).status, 200);
    const denied = await uploadVoice(new Request("https://demo.example.com/api/voices", { method: "POST", body: "must not be parsed without authorization" }));
    assert.equal(denied.status, 401);
  } finally { delete process.env.PUBLIC_APP_URL; delete process.env.CAREGIVER_ACCESS_CODE; }
});

test("real audio decoding measures actual length rather than a client-supplied duration", async () => {
  const samples = 16000;
  const wave = Buffer.alloc(44 + samples * 2);
  wave.write("RIFF"); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write("data", 36); wave.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wave.writeInt16LE(Math.round(Math.sin(i * Math.PI / 32) * (i < 8000 ? 5000 : 100)), 44 + i * 2);
  const decoded = await inspectAudio(wave, "audio/wav", new AbortController().signal);
  assert(Math.abs(decoded.quality.duration - 1) < 0.01);
  assert(decoded.sample.length > 100);
  assert.match(qualityProblem(decoded.quality, 60, 180)!, /60 seconds/);
});
