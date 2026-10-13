import type { ManagedUser } from '@/types/auth';

let cachedOwnProfile: ManagedUser | null = null;

export function getCachedOwnProfile(): ManagedUser | null {
  return cachedOwnProfile;
}

export function setCachedOwnProfile(profile: ManagedUser): void {
  cachedOwnProfile = profile;
}

export function clearCachedOwnProfile(): void {
  cachedOwnProfile = null;
}
