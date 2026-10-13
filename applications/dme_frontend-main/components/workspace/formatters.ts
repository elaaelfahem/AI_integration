export function formatRole(role: string) {
  if (role === 'SUPERADMIN') {
    return 'Super administrateur';
  }

  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return 'Jamais';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.ceil(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}
