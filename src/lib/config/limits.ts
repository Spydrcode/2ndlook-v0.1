export const MAX_DAYS = 90;
export const MAX_CLOSED_ESTIMATES = 100;
export const MIN_CLOSED_ESTIMATES_PROD = 25;
export const MIN_CLOSED_ESTIMATES_TEST = 1;

export function allowSmallDatasets(): boolean {
  return process.env.ALLOW_SMALL_DATASETS === "true";
}

export function getMinClosedEstimates(): number {
  return allowSmallDatasets()
    ? MIN_CLOSED_ESTIMATES_TEST
    : MIN_CLOSED_ESTIMATES_PROD;
}
