export const WINDOW_DAYS = 90;
export const MAX_ESTIMATE_RECORDS = 100;
export const MIN_MEANINGFUL_ESTIMATES_PROD = 25;
export const MIN_MEANINGFUL_ESTIMATES_TEST = 1;

export function allowSmallDatasets(): boolean {
  return process.env.ALLOW_SMALL_DATASETS === "true";
}

export function getMinMeaningfulEstimates(): number {
  return allowSmallDatasets()
    ? MIN_MEANINGFUL_ESTIMATES_TEST
    : MIN_MEANINGFUL_ESTIMATES_PROD;
}
