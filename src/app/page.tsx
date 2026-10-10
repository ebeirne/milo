import { Landing } from "@/components/landing";
import { getHouseholdResult } from "@/lib/db/repository";
import sample from "../../public/sample/family-voice.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The website as the app serves it: the band at the end leads into setup, or into Talk once it is set up.
export default async function Home() {
  const name = (await getHouseholdResult()).household?.patient?.preferred_name;
  return (
    <Landing
      sample={sample}
      title={name ? `Ready when ${name} is` : "Set up Milo"}
      action={name ? { href: "/talk", label: "Open Talk" } : { href: "/caregiver", label: "Start setup", down: true }}
      footerLinks={[{ href: "/caregiver", label: "Set up Milo" }, { href: "/talk", label: "Open Talk" }]}
    />
  );
}
