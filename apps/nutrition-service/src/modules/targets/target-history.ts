export type Dated = { effectiveFrom: string };

export function snapshotOn<T extends Dated>(
  snapshots: readonly T[],
  date: string,
): T | null {
  let found: T | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.effectiveFrom > date) {
      break;
    }
    found = snapshot;
  }
  return found;
}
