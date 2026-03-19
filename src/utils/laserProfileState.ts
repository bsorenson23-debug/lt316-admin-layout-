import type { LaserLens, LaserProfile } from "@/types/laserProfile";
import { LASER_PROFILES_KEY, ACTIVE_LASER_PROFILE_KEY, ACTIVE_LENS_KEY } from "@/types/laserProfile";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function persist(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

export function getLaserProfiles(): LaserProfile[] {
  return load<LaserProfile[]>(LASER_PROFILES_KEY, []);
}

export function saveLaserProfile(profile: LaserProfile): LaserProfile[] {
  const profiles = getLaserProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  const next = idx >= 0
    ? profiles.map((p) => (p.id === profile.id ? profile : p))
    : [...profiles, profile];
  persist(LASER_PROFILES_KEY, next);
  return next;
}

export function deleteLaserProfile(id: string): LaserProfile[] {
  const next = getLaserProfiles().filter((p) => p.id !== id);
  persist(LASER_PROFILES_KEY, next);
  return next;
}

export function getActiveLaserId(): string | null {
  return load<string | null>(ACTIVE_LASER_PROFILE_KEY, null);
}

export function setActiveLaserId(id: string | null): void {
  persist(ACTIVE_LASER_PROFILE_KEY, id);
}

export function getActiveLensId(): string | null {
  return load<string | null>(ACTIVE_LENS_KEY, null);
}

export function setActiveLensId(id: string | null): void {
  persist(ACTIVE_LENS_KEY, id);
}

/** Returns the currently active laser profile, or null. */
export function getActiveLaserProfile(): LaserProfile | null {
  const id = getActiveLaserId();
  if (!id) return null;
  return getLaserProfiles().find((p) => p.id === id) ?? null;
}

/** Returns the active laser + lens combo, or null if either is unset. */
export function getActiveLaserAndLens(): { laser: LaserProfile; lens: LaserLens } | null {
  const laser = getActiveLaserProfile();
  if (!laser) return null;
  const lensId = getActiveLensId();
  const lens = laser.lenses.find((l) => l.id === lensId) ?? null;
  if (!lens) return null;
  return { laser, lens };
}
