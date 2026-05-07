import React from 'react';

import type { AppSelectOption } from '@/components/ui/AppSelect';

/** Opción de país/prefijo con URL de bandera (REST Countries), mismo criterio que `SisaReservaFormModal`. */
export type DialAppOption = AppSelectOption<string> & { flagUrl?: string };

export function formatDialOptionLabel(option: AppSelectOption<string>, meta: { context: string }) {
    const flagUrl = (option as DialAppOption).flagUrl;
    return (
        <span className="flex items-center gap-2 min-w-0">
            {flagUrl ? (
                <img
                    src={flagUrl}
                    alt=""
                    width={20}
                    height={14}
                    className="w-5 h-3.5 object-cover rounded-sm shrink-0 border border-app-border/40"
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <span className="w-5 h-3.5 shrink-0 rounded-sm bg-app-border/50" aria-hidden />
            )}
            <span className={meta.context === 'value' ? 'truncate' : ''}>{option.label}</span>
        </span>
    );
}
