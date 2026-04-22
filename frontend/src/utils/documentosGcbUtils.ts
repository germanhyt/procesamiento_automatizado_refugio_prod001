import type { useAuth } from '@/context/AuthContext';

export function userHasCodename(
    user: ReturnType<typeof useAuth>['user'],
    codename: string
): boolean {
    if (!user) return false;
    if (user.is_superuser) return true;
    const roles = (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles;
    return roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false;
}

export function formatDocumentSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
