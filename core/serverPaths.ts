import path from "path";

/**
 * В Vercel писать можно только в /tmp (эпемерно).
 * Локально — в ./data (как у вас было раньше).
 */
export function dataRoot() {
  return process.env.VERCEL ? "/tmp/soulnet-data" : path.join(process.cwd(), "data");
}

export function chainDir() {
  return path.join(dataRoot(), "chain");
}

export function snapshotsDir() {
  return path.join(dataRoot(), "snapshots");
}
