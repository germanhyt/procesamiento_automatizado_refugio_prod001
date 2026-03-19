import React from 'react';

export interface AppSelectNativeOption<T = string> {
    value: T;
    label: string;
}

export interface AppSelectNativeProps<T = string> {
    options: AppSelectNativeOption<T>[];
    value?: T | null;
    onChange?: (value: T | null) => void;
    placeholder?: string;
    size?: 'sm' | 'md';
    className?: string;
    disabled?: boolean;
}

/**
 * Select nativo con estilos tema-aware. Alternativa ligera a AppSelect (react-select)
 * cuando hay problemas de render o se prefiere menor complejidad.
 */
function AppSelectNative<T = string>({
    options,
    value,
    onChange,
    placeholder,
    size = 'md',
    className = '',
    disabled = false,
}: AppSelectNativeProps<T>) {
    const sizeClass = size === 'sm' ? 'py-1.5 px-2 text-[10px]' : 'py-2 px-3 text-[11px]';

    return (
        <select
            value={value ?? ''}
            onChange={(e) => {
                const v = e.target.value;
                const opt = options.find((o) => String(o.value) === v);
                onChange?.(opt ? (opt.value as T) : null);
            }}
            disabled={disabled}
            className={`bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-xl text-[var(--app-text)] font-mono outline-none focus:border-[var(--app-accent)] transition-colors ${sizeClass} ${className}`}
        >
            {placeholder && (
                <option value="" disabled>
                    {placeholder}
                </option>
            )}
            {options.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

export default AppSelectNative;
