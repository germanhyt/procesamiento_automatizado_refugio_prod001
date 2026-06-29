export type PermissionRole = {
    permissions?: Array<{ codename: string }>;
};

export type PermissionUser = {
    is_superuser?: boolean;
    roles?: PermissionRole[];
};

/** Evalúa permiso RBAC del usuario cargado en sesión (`/auth/me`). */
export function hasPermission(user: PermissionUser | null | undefined, codename: string): boolean {
    if (!user) return false;
    if (user.is_superuser) return true;
    return (
        user.roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false
    );
}
