import { closeDatabase, withTransaction } from "../src/lib/db/database";
import { addFact, addRule, listFacts, listRules } from "../src/lib/db/guidance";
import { readHousehold, writeHousehold } from "../src/lib/db/repository";
import { addScheduleItem, listSchedule } from "../src/lib/db/schedule";

// Demo data for a walkthrough. It only fills what is empty, so an existing household keeps its own details.
// Family voices are never seeded: each one needs its living owner's recorded consent.
const everyDay = [0, 1, 2, 3, 4, 5, 6];
try {
  await withTransaction(async (client) => {
    if (!(await readHousehold(client)).patient) {
      await writeHousehold(client, { patientName: "Elizabeth Harper", preferredName: "Liz", caregiverName: "Sarah Harper", caregiverEmail: "", caregiverRole: "family" });
      console.log("Created a demo household (Liz, set up by Sarah).");
    }
    const patientId = (await readHousehold(client)).patient!.id;
    if (!(await listRules(client, patientId)).length) {
      await addRule(client, patientId, "avoid", "The old house being sold");
      await addRule(client, patientId, "steer", "Her rose garden");
      await addRule(client, patientId, "steer", "Sunday baking with the grandchildren");
      await addRule(client, patientId, "never_say", "That Maria is alive. Maria passed away in 2019");
      console.log("Added demo topic rules.");
    }
    if (!(await listFacts(client, patientId)).length) {
      await addFact(client, patientId, "She has tea at four every afternoon, by the window.");
      await addFact(client, patientId, "She taught primary school for thirty years.");
      console.log("Added demo memory facts.");
    }
    if (!(await listSchedule(client, patientId)).length) {
      await addScheduleItem(client, patientId, { kind: "reminder", text: "Time for your morning pills, the ones on the kitchen table.", time: "09:00", days: everyDay, voiceId: null });
      await addScheduleItem(client, patientId, { kind: "reminder", text: "It's nearly four. Time to put the kettle on.", time: "15:55", days: everyDay, voiceId: null });
      await addScheduleItem(client, patientId, { kind: "checkin", text: "gentle", time: "11:00", days: everyDay, voiceId: null });
      console.log("Added demo reminders and a check-in, spoken by the stock voice.");
    }
  });
  console.log("Demo data is ready. Record family voices at /caregiver/voices/new.");
} catch {
  console.error("Seeding failed. Check DATABASE_URL and PostgreSQL availability.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
