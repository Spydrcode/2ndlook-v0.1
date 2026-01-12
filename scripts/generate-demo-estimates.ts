/**
 * Generate demo estimate data for testing
 * Output: .demo/estimates-demo.csv
 * 
 * Usage: npm run demo:generate
 * 
 * Generates 60-80 closed estimates with:
 * - Deterministic randomness (seeded RNG)
 * - All price bands covered
 * - Realistic date ranges (last 90 days)
 * - No customer or line-item details
 */

import * as fs from "fs";
import * as path from "path";

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  choice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
}

// Price bands to ensure coverage
const PRICE_BANDS = [
  { min: 200, max: 450, weight: 0.3 },      // <500
  { min: 500, max: 1500, weight: 0.35 },   // 500-1500
  { min: 1500, max: 5000, weight: 0.25 },  // 1500-5000
  { min: 5000, max: 12000, weight: 0.1 },  // 5000+
];

// Job types (optional field)
const JOB_TYPES = [
  "HVAC Repair",
  "Plumbing Service",
  "Electrical Work",
  "Landscaping",
  "General Maintenance",
  "Emergency Service",
  null, // Some estimates have no job type
];

// Status (sent, accepted, or converted - meaningful statuses)
const STATUSES: ("sent" | "accepted" | "converted")[] = ["sent", "accepted", "converted"];

interface EstimateRow {
  estimate_id: string;
  created_at: string;
  closed_at: string;
  amount: number;
  status: "sent" | "accepted" | "converted";
  job_type?: string;
}

function generateDemoEstimates(count: number, seed = 42): EstimateRow[] {
  const rng = new SeededRandom(seed);
  const estimates: EstimateRow[] = [];
  
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Ensure all price bands are represented
  const bandCounts = PRICE_BANDS.map(band => 
    Math.max(5, Math.floor(count * band.weight))
  );

  let estimateCounter = 1000;

  PRICE_BANDS.forEach((band, bandIndex) => {
    const bandCount = bandCounts[bandIndex];

    for (let i = 0; i < bandCount; i++) {
      estimateCounter++;

      // Generate closed_at within last 90 days
      const daysAgo = rng.nextInt(0, 90);
      const closedAt = new Date(now);
      closedAt.setDate(closedAt.getDate() - daysAgo);

      // Generate created_at 7-150 days before closed_at (variable lead times)
      const leadTimeDays = rng.nextInt(7, 150);
      const createdAt = new Date(closedAt);
      createdAt.setDate(createdAt.getDate() - leadTimeDays);

      // Generate amount within band
      const amount = Math.round(rng.nextFloat(band.min, band.max) * 100) / 100;

      // Random status
      const status = rng.choice(STATUSES);

      // Optional job type
      const jobType = rng.choice(JOB_TYPES);

      estimates.push({
        estimate_id: `EST-${estimateCounter}`,
        created_at: createdAt.toISOString(),
        closed_at: closedAt.toISOString(),
        amount,
        status,
        ...(jobType && { job_type: jobType }),
      });
    }
  });

  // Shuffle estimates
  for (let i = estimates.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [estimates[i], estimates[j]] = [estimates[j], estimates[i]];
  }

  return estimates.slice(0, count);
}

function generateCSV(estimates: EstimateRow[]): string {
  const headers = ["estimate_id", "created_at", "closed_at", "amount", "status", "job_type"];
  const rows = [headers.join(",")];

  for (const estimate of estimates) {
    const row = [
      estimate.estimate_id,
      estimate.created_at,
      estimate.closed_at,
      estimate.amount.toString(),
      estimate.status,
      estimate.job_type || "",
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
}

function main() {
  console.log("🔧 Generating demo estimate data...");

  // Generate 60-80 estimates (deterministic)
  const estimateCount = 65;
  const estimates = generateDemoEstimates(estimateCount);

  // Ensure .demo directory exists
  const demoDir = path.join(process.cwd(), ".demo");
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  // Write CSV
  const outputPath = path.join(demoDir, "estimates-demo.csv");
  const csv = generateCSV(estimates);
  fs.writeFileSync(outputPath, csv, "utf-8");

  console.log(`✅ Generated ${estimateCount} demo estimates`);
  console.log(`📁 Output: ${outputPath}`);
  console.log("\nPrice band distribution:");

  // Show distribution
  const bandCounts = [0, 0, 0, 0];
  for (const est of estimates) {
    if (est.amount < 500) bandCounts[0]++;
    else if (est.amount < 1500) bandCounts[1]++;
    else if (est.amount < 5000) bandCounts[2]++;
    else bandCounts[3]++;
  }

  console.log(`  <$500:       ${bandCounts[0]} estimates`);
  console.log(`  $500-$1500:  ${bandCounts[1]} estimates`);
  console.log(`  $1500-$5000: ${bandCounts[2]} estimates`);
  console.log(`  $5000+:      ${bandCounts[3]} estimates`);
  console.log("\n💡 Use this data with: npm run smoke:snapshot");
}

main();
