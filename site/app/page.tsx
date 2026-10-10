import { Landing } from "@/components/landing";
import sample from "../../public/sample/family-voice.json";

const REPOSITORY = "https://github.com/ebeirne/milo";

// The public website. Setup needs the app running with a database, so the band at the end leads to the code.
export default function Home() {
  return (
    <Landing
      sample={sample}
      title="Set up Milo"
      action={{ href: `${REPOSITORY}#getting-started`, label: "Get Milo on GitHub" }}
      footerLinks={[{ href: REPOSITORY, label: "Source on GitHub" }, { href: `${REPOSITORY}#getting-started`, label: "Run Milo" }]}
    />
  );
}
