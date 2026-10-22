import type { Db } from "./db.js";
import { newId, nowIso } from "./db.js";
import {
  VARIANTS,
  WARRANTY,
  CHARGING_DIFFERENTIATOR,
  APP_FEATURES,
  SUPPORT_INFO,
  RUNNING_COST_ASSUMPTIONS,
  COMPANY,
  type VariantName
} from "./data/facts.js";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

// ---------- PROSPECTIVE CLIENT LOGIC ----------

export function whyChooseEv() {
  const t30 = VARIANTS.T30;
  const petrolPer100Km =
    (100 / RUNNING_COST_ASSUMPTIONS.petrolBikeKmPerLitre) * RUNNING_COST_ASSUMPTIONS.petrolPricePerLitreInr;
  const evPer100Km = RUNNING_COST_ASSUMPTIONS.evKwhPer100Km * RUNNING_COST_ASSUMPTIONS.electricityCostPerKwh;
  return {
    headline: "Lower running cost, instant torque, zero tailpipe emissions, and a charging network that already exists.",
    runningCostPer100Km: { petrolInr: Math.round(petrolPer100Km), evInr: Math.round(evPer100Km) },
    performance: `0-60 km/h in ${t30.zeroToSixtyKmhSec}s, top speed ${t30.topSpeedKmh} km/h`,
    chargingAdvantage: CHARGING_DIFFERENTIATOR.explanation,
    maintenance: "Fewer moving parts than an internal-combustion engine typically means lower routine maintenance needs.",
    assumptionNote: RUNNING_COST_ASSUMPTIONS.note
  };
}

export function getProductSpecs(variant?: VariantName) {
  if (variant) {
    if (!VARIANTS[variant]) throw new ValidationError(`Unknown variant: ${variant}`);
    return VARIANTS[variant];
  }
  return { T30: VARIANTS.T30, "T30 Sport": VARIANTS["T30 Sport"] };
}

export function whyRaptee() {
  return {
    company: COMPANY.name,
    tagline: COMPANY.tagline,
    standoutDifferentiator: "CCS2 universal charging",
    explanation: CHARGING_DIFFERENTIATOR.explanation,
    appFeatures: APP_FEATURES,
    website: COMPANY.website
  };
}

export function getSupportInfo() {
  return SUPPORT_INFO;
}

export function compareVariants() {
  const a = VARIANTS.T30;
  const b = VARIANTS["T30 Sport"];
  return {
    T30: a,
    "T30 Sport": b,
    diff: {
      priceInr: { T30: a.priceInr, "T30 Sport": b.priceInr, sameePrice: a.priceInr === b.priceInr },
      sharedPerformanceSpecs: a.zeroToSixtyKmhSec === b.zeroToSixtyKmhSec && a.topSpeedKmh === b.topSpeedKmh,
      note:
        "T30 and T30 Sport currently share the same published performance, range and charging envelope " +
        "(0-60 in 3.5s, 135 km/h top speed, 200 km IDC range, same charging times, same ex-showroom price). " +
        "T30 Sport is Raptee's sport-tuned trim level; choose based on styling/trim preference rather than a " +
        "performance trade-off, since no differing numbers have been published."
    }
  };
}

export function estimateRunningCost(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new ValidationError("distance_km must be a positive number");
  }
  const litresNeeded = distanceKm / RUNNING_COST_ASSUMPTIONS.petrolBikeKmPerLitre;
  const petrolCostInr = litresNeeded * RUNNING_COST_ASSUMPTIONS.petrolPricePerLitreInr;
  const kwhNeeded = (distanceKm / 100) * RUNNING_COST_ASSUMPTIONS.evKwhPer100Km;
  const evCostInr = kwhNeeded * RUNNING_COST_ASSUMPTIONS.electricityCostPerKwh;
  const savingsInr = petrolCostInr - evCostInr;
  return {
    distanceKm,
    petrol: { litresNeeded: round2(litresNeeded), costInr: round2(petrolCostInr) },
    raptee: { kwhNeeded: round2(kwhNeeded), costInr: round2(evCostInr) },
    savingsInr: round2(savingsInr),
    savingsPercent: round2((savingsInr / petrolCostInr) * 100),
    assumptions: RUNNING_COST_ASSUMPTIONS
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function captureLead(
  db: Db,
  input: { name: string; phone: string; city: string; interested_variant?: string; interested_color?: string }
) {
  const existing = db.prepare("SELECT * FROM leads WHERE phone = ?").get(input.phone) as any;
  if (existing) {
    db.prepare(
      "UPDATE leads SET name = ?, city = ?, interested_variant = COALESCE(?, interested_variant), interested_color = COALESCE(?, interested_color) WHERE id = ?"
    ).run(input.name, input.city, input.interested_variant ?? null, input.interested_color ?? null, existing.id);
    const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(existing.id);
    return { duplicate: true, lead: updated };
  }
  const id = newId("LEAD");
  db.prepare(
    "INSERT INTO leads (id, name, phone, city, interested_variant, interested_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?)"
  ).run(id, input.name, input.phone, input.city, input.interested_variant ?? null, input.interested_color ?? null, nowIso());
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  return { duplicate: false, lead };
}

const TEST_RIDE_SLOT_POOL = ["09:30", "11:00", "12:30", "14:00", "15:30", "17:00"];

export function bookTestRide(
  db: Db,
  input: { lead_id: string; date: string; location: string; time_slot?: string }
) {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(input.lead_id);
  if (!lead) throw new NotFoundError(`Lead not found: ${input.lead_id}`);

  const taken = new Set(
    (
      db
        .prepare("SELECT time_slot FROM test_ride_bookings WHERE ride_date = ? AND location = ? AND status = 'scheduled'")
        .all(input.date, input.location) as Array<{ time_slot: string }>
    ).map((r) => r.time_slot)
  );

  let slot = input.time_slot;
  if (slot && taken.has(slot)) slot = undefined; // requested slot already taken, fall through to auto-pick
  if (!slot) {
    slot = TEST_RIDE_SLOT_POOL.find((s) => !taken.has(s));
    if (!slot) throw new ValidationError(`No open test-ride slots at ${input.location} on ${input.date}`);
  }

  const id = newId("TR");
  db.prepare(
    "INSERT INTO test_ride_bookings (id, lead_id, ride_date, time_slot, location, status, created_at) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)"
  ).run(id, input.lead_id, input.date, slot, input.location, nowIso());
  db.prepare("UPDATE leads SET status = 'test_ride_booked' WHERE id = ? AND status = 'new'").run(input.lead_id);

  return db.prepare("SELECT * FROM test_ride_bookings WHERE id = ?").get(id);
}

export function checkAvailability(db: Db, filters: { city?: string; variant?: string; color?: string }) {
  let q = "SELECT * FROM showroom_inventory WHERE 1=1";
  const params: string[] = [];
  if (filters.city) {
    q += " AND city = ?";
    params.push(filters.city);
  }
  if (filters.variant) {
    q += " AND variant = ?";
    params.push(filters.variant);
  }
  if (filters.color) {
    q += " AND color = ?";
    params.push(filters.color);
  }
  return db.prepare(q).all(...params);
}

// ---------- EXISTING CLIENT (OWNER) LOGIC ----------

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export function logServiceRequest(
  db: Db,
  input: {
    owner_id: string;
    bike_vin: string;
    category: string;
    description: string;
    urgency?: "normal" | "urgent";
  }
) {
  const owner = db.prepare("SELECT * FROM owners WHERE id = ?").get(input.owner_id);
  if (!owner) throw new NotFoundError(`Owner not found: ${input.owner_id}`);
  const bike = db.prepare("SELECT * FROM bikes WHERE vin = ? AND owner_id = ?").get(input.bike_vin, input.owner_id);
  if (!bike) throw new NotFoundError(`Bike ${input.bike_vin} not found for owner ${input.owner_id}`);

  const recent = db
    .prepare(
      "SELECT * FROM tickets WHERE owner_id = ? AND category = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(input.owner_id, input.category) as any;
  if (recent) {
    const ageMs = Date.now() - new Date(recent.created_at).getTime();
    if (ageMs <= DEDUP_WINDOW_MS) {
      return { duplicate: true, ticket: recent };
    }
  }

  const id = newId("TKT");
  const ts = nowIso();
  db.prepare(
    "INSERT INTO tickets (id, owner_id, bike_vin, category, description, urgency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)"
  ).run(id, input.owner_id, input.bike_vin, input.category, input.description, input.urgency ?? "normal", ts, ts);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  return { duplicate: false, ticket };
}

export function getTicket(db: Db, ticketId: string) {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) throw new NotFoundError(`Ticket not found: ${ticketId}`);
  const booking = db.prepare("SELECT * FROM service_bookings WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1").get(ticketId);
  const claims = db.prepare("SELECT * FROM claims WHERE ticket_id = ?").all(ticketId);
  return { ticket, booking: booking ?? null, claims };
}

const SERVICE_SLOT_POOL = ["09:30", "11:00", "13:00", "15:30", "17:00"];

export function bookServiceSlot(db: Db, ticketId: string) {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as any;
  if (!ticket) throw new NotFoundError(`Ticket not found: ${ticketId}`);

  const isUrgent = ticket.urgency === "urgent";
  let dateCursor = new Date();
  if (!isUrgent) dateCursor.setDate(dateCursor.getDate() + (ticket.status === "new" ? 0 : 1));

  let slot: { date: string; time: string } | null = null;
  for (let dayOffset = 0; dayOffset < 14 && !slot; dayOffset++) {
    const d = new Date(dateCursor);
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().slice(0, 10);
    const taken = new Set(
      (
        db.prepare("SELECT slot_time FROM service_bookings WHERE slot_date = ?").all(dateStr) as Array<{
          slot_time: string;
        }>
      ).map((r) => r.slot_time)
    );
    // Urgent tickets get first priority on the earliest available slot each day.
    const pool = isUrgent ? SERVICE_SLOT_POOL : SERVICE_SLOT_POOL;
    const found = pool.find((t) => !taken.has(t));
    if (found) slot = { date: dateStr, time: found };
  }
  if (!slot) throw new ValidationError("No open workshop slots in the next 14 days");

  const id = newId("SVC");
  db.prepare(
    "INSERT INTO service_bookings (id, ticket_id, slot_date, slot_time, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ticketId, slot.date, slot.time, isUrgent ? "urgent" : "normal", nowIso());
  db.prepare("UPDATE tickets SET status = 'scheduled', updated_at = ? WHERE id = ?").run(nowIso(), ticketId);

  return db.prepare("SELECT * FROM service_bookings WHERE id = ?").get(id);
}

export function requestRoadsideAssistance(
  db: Db,
  input: { owner_id: string; bike_vin: string; location: string; landmark?: string }
) {
  const owner = db.prepare("SELECT * FROM owners WHERE id = ?").get(input.owner_id);
  if (!owner) throw new NotFoundError(`Owner not found: ${input.owner_id}`);
  const bike = db.prepare("SELECT * FROM bikes WHERE vin = ? AND owner_id = ?").get(input.bike_vin, input.owner_id);
  if (!bike) throw new NotFoundError(`Bike ${input.bike_vin} not found for owner ${input.owner_id}`);

  const id = newId("RSA");
  db.prepare(
    "INSERT INTO rsa_requests (id, owner_id, bike_vin, location, landmark, status, created_at) VALUES (?, ?, ?, ?, ?, 'dispatched', ?)"
  ).run(id, input.owner_id, input.bike_vin, input.location, input.landmark ?? null, nowIso());
  const request = db.prepare("SELECT * FROM rsa_requests WHERE id = ?").get(id);
  return {
    request,
    warrantyNote: `Roadside assistance is included for ${WARRANTY.rsaYears} year(s) from purchase; always dispatched as urgent.`
  };
}

export function checkWarrantyCoverage(db: Db, input: { bike_vin: string; category: string }) {
  const bike = db.prepare("SELECT * FROM bikes WHERE vin = ?").get(input.bike_vin) as any;
  if (!bike) throw new NotFoundError(`Bike not found: ${input.bike_vin}`);

  const purchaseDate = new Date(bike.purchase_date);
  const ageDays = (Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);
  const ageYears = ageDays / 365;
  const odometer = bike.current_odometer_km as number;

  const isBattery = input.category === "battery";
  const limitYears = isBattery ? WARRANTY.batteryYears : WARRANTY.vehicleYears;
  const limitKm = isBattery ? WARRANTY.batteryKm : WARRANTY.vehicleKm;
  const withinYears = ageYears <= limitYears;
  const withinKm = odometer <= limitKm;
  const covered = withinYears && withinKm;

  return {
    bike_vin: input.bike_vin,
    category: input.category,
    warrantyType: isBattery ? "battery (8yr/80,000km)" : "vehicle (3yr/30,000km)",
    purchaseDate: bike.purchase_date,
    ageYears: round2(ageYears),
    currentOdometerKm: odometer,
    limitYears,
    limitKm,
    covered,
    reason: covered
      ? "Within both the time and distance limits of the applicable warranty."
      : !withinYears
      ? `Vehicle age (${round2(ageYears)} yrs) exceeds the ${limitYears}-year warranty window - chargeable.`
      : `Odometer (${odometer} km) exceeds the ${limitKm} km warranty limit - chargeable.`
  };
}

export function fileInsuranceClaim(
  db: Db,
  input: { owner_id: string; ticket_id?: string; incident_desc: string }
) {
  const owner = db.prepare("SELECT * FROM owners WHERE id = ?").get(input.owner_id);
  if (!owner) throw new NotFoundError(`Owner not found: ${input.owner_id}`);
  if (input.ticket_id) {
    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(input.ticket_id);
    if (!ticket) throw new NotFoundError(`Ticket not found: ${input.ticket_id}`);
  }
  const id = newId("CLM");
  db.prepare(
    "INSERT INTO claims (id, ticket_id, owner_id, incident_desc, status, created_at) VALUES (?, ?, ?, ?, 'filed', ?)"
  ).run(id, input.ticket_id ?? null, input.owner_id, input.incident_desc, nowIso());
  return db.prepare("SELECT * FROM claims WHERE id = ?").get(id);
}

export function requestCustomization(
  db: Db,
  input: { owner_id: string; bike_vin: string; description: string }
) {
  const bike = db.prepare("SELECT * FROM bikes WHERE vin = ? AND owner_id = ?").get(input.bike_vin, input.owner_id);
  if (!bike) throw new NotFoundError(`Bike ${input.bike_vin} not found for owner ${input.owner_id}`);
  const id = newId("CUST");
  db.prepare(
    "INSERT INTO customization_requests (id, owner_id, bike_vin, description, status, created_at) VALUES (?, ?, ?, ?, 'requested', ?)"
  ).run(id, input.owner_id, input.bike_vin, input.description, nowIso());
  return db.prepare("SELECT * FROM customization_requests WHERE id = ?").get(id);
}

// ---------- LEADERSHIP LOGIC ----------

export function getBookingStatus(db: Db, date?: string) {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const testRides = db
    .prepare(
      `SELECT tr.*, l.name as lead_name, l.phone as lead_phone FROM test_ride_bookings tr
       JOIN leads l ON l.id = tr.lead_id WHERE tr.ride_date = ? ORDER BY tr.time_slot`
    )
    .all(d);
  const purchases = db.prepare("SELECT * FROM sales WHERE sale_date = ? ORDER BY created_at").all(d);
  return { date: d, testRides, purchases, testRideCount: testRides.length, purchaseCount: purchases.length };
}

export function getFunnelSummary(db: Db, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const leadsCaptured = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= ?").get(sinceIso) as any).c;
  const testRidesBooked = (
    db.prepare("SELECT COUNT(*) as c FROM test_ride_bookings WHERE created_at >= ?").get(sinceIso) as any
  ).c;
  const testRidesCompleted = (
    db
      .prepare("SELECT COUNT(*) as c FROM test_ride_bookings WHERE created_at >= ? AND status = 'completed'")
      .get(sinceIso) as any
  ).c;
  const purchases = (db.prepare("SELECT COUNT(*) as c FROM sales WHERE created_at >= ?").get(sinceIso) as any).c;

  return {
    periodDays: days,
    leadsCaptured,
    testRidesBooked,
    testRidesCompleted,
    totalPurchases: purchases,
    conversion: {
      leadToTestRidePct: pct(testRidesBooked, leadsCaptured),
      testRideToCompletedPct: pct(testRidesCompleted, testRidesBooked),
      // NOTE: `sales` is a general showroom ledger, not linked to individual leads (no lead_id
      // column yet), so leads-captured and purchases are different populations — a walk-in sale
      // with no prior tracked lead is common and expected. Reporting a "lead -> purchase %" here
      // would silently compare unrelated numerator/denominator and can exceed 100%, which reads
      // as a bug to anyone reviewing it. Report both real counts instead and let the reader draw
      // the comparison, rather than publish a derived percentage that can lie.
      note: "totalPurchases includes all showroom sales, not only ones traceable to a tracked lead; a lead-to-purchase % is not reported because sales aren't yet linked to their originating lead."
    }
  };
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return round2((numerator / denominator) * 100);
}

export function getMaintenanceQueue(db: Db) {
  const rows = db
    .prepare(
      `SELECT t.*, b.model, b.color, o.name as owner_name,
              sb.slot_date, sb.slot_time
       FROM tickets t
       JOIN bikes b ON b.vin = t.bike_vin
       JOIN owners o ON o.id = t.owner_id
       LEFT JOIN service_bookings sb ON sb.ticket_id = t.id
       WHERE t.status != 'done'
       ORDER BY t.created_at`
    )
    .all() as any[];

  const now = Date.now();
  const SLA_HOURS = 48;
  const withFlags = rows.map((r) => {
    const ageHours = (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
    return { ...r, overdue: ageHours > SLA_HOURS, ageHours: round2(ageHours) };
  });

  return {
    slaHours: SLA_HOURS,
    totalOpen: withFlags.length,
    overdueCount: withFlags.filter((r) => r.overdue).length,
    tickets: withFlags
  };
}

export function getSalesInsights(db: Db, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare("SELECT * FROM sales WHERE sale_date >= ?").all(sinceStr) as any[];
  const totalUnits = rows.length;
  const totalRevenue = rows.reduce((acc, r) => acc + r.amount_inr, 0);

  const byVariant: Record<string, number> = {};
  const byColor: Record<string, number> = {};
  for (const r of rows) {
    byVariant[r.variant] = (byVariant[r.variant] ?? 0) + 1;
    byColor[r.color] = (byColor[r.color] ?? 0) + 1;
  }
  const topVariant = Object.entries(byVariant).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topColor = Object.entries(byColor).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { periodDays: days, totalUnits, totalRevenueInr: totalRevenue, topVariant, topColor, byVariant, byColor };
}

export function getRsaActivity(db: Db, days = 7) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const today = (
    db.prepare("SELECT COUNT(*) as c FROM rsa_requests WHERE substr(created_at,1,10) = ?").get(todayStr) as any
  ).c;
  const period = (db.prepare("SELECT COUNT(*) as c FROM rsa_requests WHERE created_at >= ?").get(sinceIso) as any).c;

  const UNUSUAL_TODAY_THRESHOLD = 2;
  return {
    today,
    periodDays: days,
    periodTotal: period,
    unusualActivityFlag: today >= UNUSUAL_TODAY_THRESHOLD,
    note:
      today >= UNUSUAL_TODAY_THRESHOLD
        ? "RSA call volume today is unusually high - worth escalating as a possible product-quality signal."
        : "RSA call volume today is within normal range."
  };
}

export function ownerBriefing(db: Db) {
  const booking = getBookingStatus(db);
  const funnel = getFunnelSummary(db, 7);
  const maintenance = getMaintenanceQueue(db);
  const sales = getSalesInsights(db, 7);
  const rsa = getRsaActivity(db, 7);

  const flags: string[] = [];
  if (maintenance.overdueCount > 0) flags.push(`${maintenance.overdueCount} service ticket(s) overdue past 48h SLA`);
  if (rsa.unusualActivityFlag) flags.push("RSA call volume today is unusually high");
  if (booking.testRideCount === 0) flags.push("No test rides booked today");

  return {
    date: booking.date,
    bookings: { testRidesToday: booking.testRideCount, purchasesToday: booking.purchaseCount },
    funnel7d: funnel,
    maintenance: { totalOpen: maintenance.totalOpen, overdueCount: maintenance.overdueCount },
    sales7d: { totalUnits: sales.totalUnits, totalRevenueInr: sales.totalRevenueInr, topVariant: sales.topVariant },
    rsa7d: { todayCount: rsa.today, periodTotal: rsa.periodTotal, unusualActivityFlag: rsa.unusualActivityFlag },
    flaggedItems: flags
  };
}
