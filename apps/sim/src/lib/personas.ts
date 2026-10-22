export type Persona = "prospect" | "owner" | "leadership";

export interface PersonaDef {
  id: Persona;
  label: string;
  blurb: string;
  examplePrompts: string[];
}

export const PERSONAS: PersonaDef[] = [
  {
    id: "prospect",
    label: "New / Prospective Client",
    blurb: "Exploring the T30 - specs, pricing, charging, and why switch to electric.",
    examplePrompts: [
      "Why should I choose an electric motorcycle over petrol?",
      "What are the T30 specs?",
      "What makes Raptee different from other EV bikes?",
      "How much will I save on running costs over 100 km?",
      "Is the Arctic White T30 Sport available in Chennai?",
      "What's the difference between the T30 and T30 Sport?",
      "I'm interested in buying one, can you take my details?",
      "Can I book a test ride?"
    ]
  },
  {
    id: "owner",
    label: "Existing Owner",
    blurb: "Already own a Raptee - service, warranty, roadside help, claims.",
    examplePrompts: [
      "My battery won't charge properly",
      "I'm stranded on the road and need help",
      "What's the status of ticket TKT-ab12cd34?",
      "Is my brake issue covered under warranty?",
      "I want to file an insurance claim",
      "Can I get a custom seat fitted?",
      "The dashboard screen keeps freezing",
      "Book my open ticket into the workshop"
    ]
  },
  {
    id: "leadership",
    label: "Company Leadership",
    blurb: "Running the business - bookings, funnel, service queue, sales, RSA signals.",
    examplePrompts: [
      "How are bookings looking today?",
      "What's our test-ride to purchase conversion funnel this month?",
      "What's in the maintenance queue right now?",
      "Give me sales insights for the last two weeks",
      "Any unusual roadside assistance activity?",
      "Give me my daily briefing",
      "What's going on with the business today?"
    ]
  }
];

export function getPersona(id: string): PersonaDef {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) return PERSONAS[0];
  return p;
}
