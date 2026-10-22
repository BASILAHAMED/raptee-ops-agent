/**
 * Real, verified facts about Raptee.HV and the T30 / T30 Sport.
 * Source: https://www.rapteehv.com/ (as supplied for this hackathon build).
 * Every tool that quotes specs/price/warranty MUST read from here, never
 * hardcode a competing number — this is the single source of truth.
 */

export const COMPANY = {
  name: "Raptee.HV",
  website: "https://www.rapteehv.com/",
  tagline: "India's first high-voltage electric motorcycle, built with electric car DNA",
  supportPhone: "+91 89250 61646",
  supportHours: "Daily 9:30 AM - 8:00 PM",
  supportEmail: "contact@rapteehv.com"
};

export type VariantName = "T30" | "T30 Sport";

export interface VariantSpec {
  variant: VariantName;
  priceInr: number; // all-inclusive ex-showroom
  colors: string[];
  zeroToSixtyKmhSec: number;
  topSpeedKmh: number;
  idcRangeKm: number; // Indian Driving Cycle estimated range
  publicFastCharge20to80Min: number;
  homeCharge20to80Min: number;
  dashboard: string;
  notes: string;
}

export const VARIANTS: Record<VariantName, VariantSpec> = {
  T30: {
    variant: "T30",
    priceInr: 239000,
    colors: ["Arctic White", "Eclipse Black", "Mercury Grey"],
    zeroToSixtyKmhSec: 3.5,
    topSpeedKmh: 135,
    idcRangeKm: 200,
    publicFastCharge20to80Min: 36,
    homeCharge20to80Min: 60,
    dashboard: '17.7cm (7") TFT touchscreen with Raptee Maps navigation',
    notes: "Base variant of India's first high-voltage electric motorcycle."
  },
  "T30 Sport": {
    variant: "T30 Sport",
    priceInr: 239000,
    colors: ["Arctic White", "Eclipse Black", "Mercury Grey"],
    zeroToSixtyKmhSec: 3.5,
    topSpeedKmh: 135,
    idcRangeKm: 200,
    publicFastCharge20to80Min: 36,
    homeCharge20to80Min: 60,
    dashboard: '17.7cm (7") TFT touchscreen with Raptee Maps navigation',
    notes:
      "Sport-tuned trim of the T30 sharing the same published performance, range and charging envelope; cosmetically and dynamically distinguished at showroom level."
  }
};

export const WARRANTY = {
  batteryYears: 8,
  batteryKm: 80000,
  vehicleYears: 3,
  vehicleKm: 30000,
  doorstepServiceYears: 1,
  rsaYears: 1
};

export const CHARGING_DIFFERENTIATOR = {
  standard: "CCS2",
  explanation:
    "The T30 uses CCS2 universal charging - the same connector standard used by electric CARS in India. " +
    "That means it plugs into the existing and fast-growing EV car fast-charging network nationwide. " +
    "Owners are not dependent on motorcycle-specific charging infrastructure being built out; any CCS2 car " +
    "fast charger works. Public fast charging takes the battery from 20-80% in about 36 minutes; charging " +
    "at home/in-house takes about 1 hour for the same 20-80% window."
};

export const APP_FEATURES = [
  "Real-time telematics: battery, infotainment and alerts",
  "Ride analytics",
  "Charge tracking",
  "Geofencing and charge limits",
  "Over-the-air (OTA) software updates",
  "Find My Raptee / Ping My Raptee - locate a parked or lost bike"
];

export const SUPPORT_INFO = {
  warranty: WARRANTY,
  insurance:
    "Comprehensive and third-party insurance options are available at purchase and renewal through Raptee's " +
    "showroom partners; claims against an existing policy are filed through the file_insurance_claim tool.",
  maintenancePlans:
    "Doorstep service is included for the first year; scheduled workshop maintenance is booked via " +
    "book_service_slot once a service ticket exists.",
  doorstepService: `${WARRANTY.doorstepServiceYears} year(s) included from date of purchase`,
  roadsideAssistance: `${WARRANTY.rsaYears} year(s) included from date of purchase - request via request_roadside_assistance, always dispatched as urgent`,
  contact: `${COMPANY.supportPhone}, ${COMPANY.supportHours}, ${COMPANY.supportEmail}`
};

/**
 * Reference running-cost inputs for the estimate_running_cost tool.
 * Petrol-bike figures are typical Indian commuter-motorcycle averages used
 * purely as a comparison baseline (clearly labelled as an assumption, not a
 * Raptee-published number) — everything Raptee-side (price, charging) is
 * the verified data above.
 */
export const RUNNING_COST_ASSUMPTIONS = {
  petrolBikeKmPerLitre: 40, // typical 150-160cc commuter motorcycle
  petrolPricePerLitreInr: 103, // typical Indian metro pump price
  electricityCostPerKwh: 8, // INR, typical Indian domestic tariff
  evKwhPer100Km: 3.2, // typical electric motorcycle consumption estimate
  note:
    "Petrol mileage and electricity tariff are illustrative Indian averages for comparison purposes, not " +
    "Raptee-published figures; Raptee-specific price, warranty and charging numbers above are the verified facts."
};
