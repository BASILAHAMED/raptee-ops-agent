import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// node:sqlite has no legacy bare-name alias, which trips up older Vite/vite-node
// builtin-detection during Vitest's SSR transform. Loading it via createRequire
// bypasses Vite's static import resolution entirely while still using the real
// native node:sqlite module at runtime (no better-sqlite3, per spec).
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

export type Db = InstanceType<typeof DatabaseSync>;
let dbInstance: Db | null = null;

export function openDb(path: string): Db {
  if (dbInstance) return dbInstance;
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      city TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bikes (
      vin TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES owners(id),
      model TEXT NOT NULL CHECK (model IN ('T30', 'T30 Sport')),
      color TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      current_odometer_km INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES owners(id),
      bike_vin TEXT NOT NULL REFERENCES bikes(vin),
      category TEXT NOT NULL CHECK (category IN ('battery','electrical','mechanical','software','customization')),
      description TEXT NOT NULL,
      urgency TEXT NOT NULL CHECK (urgency IN ('normal','urgent')) DEFAULT 'normal',
      status TEXT NOT NULL CHECK (status IN ('new','scheduled','in_progress','done')) DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_bookings (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('normal','urgent')) DEFAULT 'normal',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id),
      owner_id TEXT NOT NULL REFERENCES owners(id),
      incident_desc TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('filed','under_review','approved','rejected')) DEFAULT 'filed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customization_requests (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES owners(id),
      bike_vin TEXT NOT NULL REFERENCES bikes(vin),
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('requested','in_review','approved','rejected','completed')) DEFAULT 'requested',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rsa_requests (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES owners(id),
      bike_vin TEXT NOT NULL REFERENCES bikes(vin),
      location TEXT NOT NULL,
      landmark TEXT,
      status TEXT NOT NULL CHECK (status IN ('dispatched','en_route','resolved')) DEFAULT 'dispatched',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      interested_variant TEXT,
      interested_color TEXT,
      status TEXT NOT NULL CHECK (status IN ('new','test_ride_booked','test_ride_completed','purchased')) DEFAULT 'new',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_ride_bookings (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      ride_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled','no_show')) DEFAULT 'scheduled',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      sale_date TEXT NOT NULL,
      variant TEXT NOT NULL,
      color TEXT NOT NULL,
      amount_inr INTEGER NOT NULL,
      city TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS showroom_inventory (
      id TEXT PRIMARY KEY,
      variant TEXT NOT NULL,
      color TEXT NOT NULL,
      city TEXT NOT NULL,
      qty_in_stock INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Idempotent: only seeds if the owners table is empty. */
export function seedIfEmpty(db: Db): void {
  const row = db.prepare("SELECT COUNT(*) as c FROM owners").get() as { c: number };
  if (row.c > 0) return;
  seed(db);
}

function seed(db: Db): void {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  const daysFromNow = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  const insertOwner = db.prepare(
    "INSERT INTO owners (id, name, phone, email, city, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertBike = db.prepare(
    "INSERT INTO bikes (vin, owner_id, model, color, purchase_date, current_odometer_km) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertTicket = db.prepare(
    "INSERT INTO tickets (id, owner_id, bike_vin, category, description, urgency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertServiceBooking = db.prepare(
    "INSERT INTO service_bookings (id, ticket_id, slot_date, slot_time, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertClaim = db.prepare(
    "INSERT INTO claims (id, ticket_id, owner_id, incident_desc, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertRsa = db.prepare(
    "INSERT INTO rsa_requests (id, owner_id, bike_vin, location, landmark, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertLead = db.prepare(
    "INSERT INTO leads (id, name, phone, city, interested_variant, interested_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertTestRide = db.prepare(
    "INSERT INTO test_ride_bookings (id, lead_id, ride_date, time_slot, location, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertSale = db.prepare(
    "INSERT INTO sales (id, sale_date, variant, color, amount_inr, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertInventory = db.prepare(
    "INSERT INTO showroom_inventory (id, variant, color, city, qty_in_stock) VALUES (?, ?, ?, ?, ?)"
  );

  // --- Owners + bikes (6 owners, real-sounding Indian names) ---
  const owners = [
    { id: newId("OWN"), name: "Arjun Mehta", phone: "+91 98200 11223", email: "arjun.mehta@example.com", city: "Chennai" },
    { id: newId("OWN"), name: "Priya Subramaniam", phone: "+91 98400 22334", email: "priya.s@example.com", city: "Chennai" },
    { id: newId("OWN"), name: "Rahul Verma", phone: "+91 99000 33445", email: "rahul.verma@example.com", city: "Bengaluru" },
    { id: newId("OWN"), name: "Divya Krishnan", phone: "+91 97400 44556", email: "divya.k@example.com", city: "Coimbatore" },
    { id: newId("OWN"), name: "Karthik Iyer", phone: "+91 90030 55667", email: "karthik.iyer@example.com", city: "Chennai" },
    { id: newId("OWN"), name: "Sneha Reddy", phone: "+91 93800 66778", email: "sneha.reddy@example.com", city: "Hyderabad" },
    { id: newId("OWN"), name: "Vikram Nair", phone: "+91 94470 77889", email: "vikram.nair@example.com", city: "Kochi" }
  ];
  for (const o of owners) insertOwner.run(o.id, o.name, o.phone, o.email, o.city, nowIso());

  const bikeDefs = [
    { vin: "RAPT30A0001IN", owner: owners[0], model: "T30", color: "Arctic White", purchaseDaysAgo: 420, odo: 6200 },
    { vin: "RAPT30S0002IN", owner: owners[1], model: "T30 Sport", color: "Eclipse Black", purchaseDaysAgo: 150, odo: 2100 },
    { vin: "RAPT30A0003IN", owner: owners[2], model: "T30", color: "Mercury Grey", purchaseDaysAgo: 760, odo: 15400 },
    { vin: "RAPT30S0004IN", owner: owners[3], model: "T30 Sport", color: "Arctic White", purchaseDaysAgo: 40, odo: 480 },
    { vin: "RAPT30A0005IN", owner: owners[4], model: "T30", color: "Eclipse Black", purchaseDaysAgo: 900, odo: 31500 },
    { vin: "RAPT30S0006IN", owner: owners[5], model: "T30 Sport", color: "Mercury Grey", purchaseDaysAgo: 200, odo: 3600 },
    { vin: "RAPT30A0007IN", owner: owners[6], model: "T30", color: "Arctic White", purchaseDaysAgo: 10, odo: 90 }
  ] as const;
  for (const b of bikeDefs) {
    insertBike.run(b.vin, b.owner.id, b.model, b.color, iso(daysAgo(b.purchaseDaysAgo)), b.odo);
  }

  // --- Tickets: mix of statuses, staggered times ---
  const t1 = newId("TKT");
  insertTicket.run(t1, owners[0].id, bikeDefs[0].vin, "battery", "Battery not holding full charge overnight", "normal", "new", nowIso(), nowIso());

  const t2 = newId("TKT");
  insertTicket.run(t2, owners[1].id, bikeDefs[1].vin, "software", "Dashboard touchscreen freezes after OTA update", "normal", "scheduled", nowIso(), nowIso());
  insertServiceBooking.run(newId("SVC"), t2, iso(daysFromNow(1)), "10:00", "normal", nowIso());

  const t3 = newId("TKT");
  insertTicket.run(t3, owners[2].id, bikeDefs[2].vin, "mechanical", "Rear brake lever feels loose", "urgent", "scheduled", nowIso(), nowIso());
  insertServiceBooking.run(newId("SVC"), t3, iso(today), "15:30", "urgent", nowIso());

  const t4 = newId("TKT");
  insertTicket.run(t4, owners[4].id, bikeDefs[4].vin, "electrical", "Headlight flickers at night", "normal", "done", nowIso(), nowIso());

  // Overdue ticket for SLA flagging (created 4 days ago, still open)
  const t5 = newId("TKT");
  const t5Created = daysAgo(4).toISOString();
  insertTicket.run(t5, owners[5].id, bikeDefs[5].vin, "customization", "Request for aftermarket seat cover fitting check", "normal", "new", t5Created, t5Created);

  // --- Claims ---
  insertClaim.run(newId("CLM"), t3, owners[2].id, "Minor fall while parking, brake lever bent", "under_review", nowIso());

  // --- RSA requests (1-2 seeded) ---
  insertRsa.run(newId("RSA"), owners[0].id, bikeDefs[0].vin, "OMR Road, Chennai", "Near Siruseri IT Park gate 2", "resolved", daysAgo(2).toISOString());
  insertRsa.run(newId("RSA"), owners[6].id, bikeDefs[6].vin, "ECR Road, Chennai", "Opposite Muttukadu boat house", "dispatched", nowIso());

  // --- Leads (not yet converted) ---
  const leads = [
    { name: "Anita Desai", phone: "+91 98100 10101", city: "Chennai", variant: "T30", color: "Arctic White" },
    { name: "Suresh Pillai", phone: "+91 98200 20202", city: "Bengaluru", variant: "T30 Sport", color: "Eclipse Black" },
    { name: "Meera Nambiar", phone: "+91 98300 30303", city: "Coimbatore", variant: "T30", color: "Mercury Grey" }
  ];
  const leadIds: string[] = [];
  for (const l of leads) {
    const id = newId("LEAD");
    leadIds.push(id);
    insertLead.run(id, l.name, l.phone, l.city, l.variant, l.color, "new", daysAgo(3).toISOString());
  }

  // --- Test-ride bookings: today + tomorrow, staggered time slots ---
  insertTestRide.run(newId("TR"), leadIds[0], iso(today), "11:00", "Chennai - OMR Showroom", "scheduled", nowIso());
  insertTestRide.run(newId("TR"), leadIds[1], iso(today), "14:00", "Bengaluru - Indiranagar Showroom", "scheduled", nowIso());
  insertTestRide.run(newId("TR"), leadIds[2], iso(daysFromNow(1)), "12:30", "Coimbatore - RS Puram Showroom", "scheduled", nowIso());

  // --- Sales records spanning last ~14 days ---
  const salesSeed: Array<{ daysAgo: number; variant: VariantKey; color: string; city: string }> = [
    { daysAgo: 13, variant: "T30", color: "Arctic White", city: "Chennai" },
    { daysAgo: 12, variant: "T30 Sport", color: "Eclipse Black", city: "Bengaluru" },
    { daysAgo: 10, variant: "T30", color: "Mercury Grey", city: "Chennai" },
    { daysAgo: 9, variant: "T30", color: "Arctic White", city: "Coimbatore" },
    { daysAgo: 7, variant: "T30 Sport", color: "Arctic White", city: "Hyderabad" },
    { daysAgo: 6, variant: "T30", color: "Eclipse Black", city: "Chennai" },
    { daysAgo: 5, variant: "T30 Sport", color: "Mercury Grey", city: "Kochi" },
    { daysAgo: 3, variant: "T30", color: "Arctic White", city: "Chennai" },
    { daysAgo: 2, variant: "T30 Sport", color: "Eclipse Black", city: "Bengaluru" },
    { daysAgo: 1, variant: "T30", color: "Arctic White", city: "Chennai" }
  ];
  for (const s of salesSeed) {
    insertSale.run(newId("SALE"), iso(daysAgo(s.daysAgo)), s.variant, s.color, 239000, s.city, daysAgo(s.daysAgo).toISOString());
  }

  // --- Showroom inventory ---
  const inv: Array<{ variant: VariantKey; color: string; city: string; qty: number }> = [
    { variant: "T30", color: "Arctic White", city: "Chennai", qty: 5 },
    { variant: "T30", color: "Eclipse Black", city: "Chennai", qty: 2 },
    { variant: "T30", color: "Mercury Grey", city: "Chennai", qty: 0 },
    { variant: "T30 Sport", color: "Arctic White", city: "Chennai", qty: 3 },
    { variant: "T30 Sport", color: "Eclipse Black", city: "Bengaluru", qty: 4 },
    { variant: "T30", color: "Arctic White", city: "Bengaluru", qty: 1 },
    { variant: "T30 Sport", color: "Mercury Grey", city: "Coimbatore", qty: 2 },
    { variant: "T30", color: "Eclipse Black", city: "Hyderabad", qty: 3 },
    { variant: "T30 Sport", color: "Arctic White", city: "Kochi", qty: 0 }
  ];
  for (const i of inv) {
    insertInventory.run(newId("INV"), i.variant, i.color, i.city, i.qty);
  }
}

type VariantKey = "T30" | "T30 Sport";
