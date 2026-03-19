import React, { useMemo } from 'react';
import ReactSelect, { StylesConfig, Props } from 'react-select';

export interface AppSelectOption<T = string> {
    value: T;
    label: string;
}

/**
 * Estilos tema-aware para react-select. Usa variables CSS que cambian con dark/light.
 * Memoizados para evitar re-renders innecesarios.
 */
const themeStyles: StylesConfig<AppSelectOption, false> = {
    control: (base, state) => ({
        ...base,
        backgroundColor: 'var(--app-input-bg)',
        borderColor: state.isFocused ? 'var(--app-accent)' : 'var(--app-border)',
        borderRadius: '12px',
        fontSize: '11px',
        color: 'var(--app-text)',
        padding: '2px 4px',
        minHeight: 42,
        boxShadow: 'none',
        '&:hover': { borderColor: 'var(--app-accent)' },
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: 'var(--app-panel)',
        borderRadius: '12px',
        zIndex: 9999,
        border: '1px solid var(--app-border)',
    }),
    menuList: (base) => ({
        ...base,
        padding: 4,
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? 'var(--app-accent-muted-bg)' : 'transparent',
        color: state.isFocused ? 'var(--app-accent)' : 'var(--app-muted)',
        fontSize: '11px',
        cursor: 'pointer',
    }),
    singleValue: (base) => ({
        ...base,
        color: 'var(--app-text)',
    }),
    placeholder: (base) => ({
        ...base,
        color: 'var(--app-muted)',
    }),
    input: (base) => ({
        ...base,
        color: 'var(--app-text)',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({
        ...base,
        color: 'var(--app-muted)',
        '&:hover': { color: 'var(--app-accent)' },
    }),
    clearIndicator: (base) => ({
        ...base,
        color: 'var(--app-muted)',
        '&:hover': { color: 'var(--app-accent)' },
    }),
};

export interface AppSelectProps<T = string> extends Omit<Props<AppSelectOption<T>, false>, 'options' | 'value' | 'onChange'> {
    options: AppSelectOption<T>[];
    value?: AppSelectOption<T> | null;
    onChange?: (option: AppSelectOption<T> | null) => void;
    /** Tamaño visual: 'md' por defecto, 'sm' más compacto */
    size?: 'sm' | 'md';
}

function getSizeStyles(size: 'sm' | 'md') {
    if (size === 'sm') {
        return {
            control: (base: object) => ({ ...base, minHeight: 36, padding: '0 2px', fontSize: '10px' }),
            option: (base: object) => ({ ...base, fontSize: '10px' }),
        };
    }
    return {};
}

function AppSelectInner<T = string>({ options, value, onChange, styles, size = 'md', ...rest }: AppSelectProps<T>) {
    const mergedStyles = useMemo(() => {
        const sizeOverrides = getSizeStyles(size);
        return {
            ...themeStyles,
            ...(typeof sizeOverrides.control === 'function'
                ? {
                      control: (b: object, s: object) =>
                          ({ ...(themeStyles.control as Function)(b, s), ...(sizeOverrides.control as Function)(b) } as object),
                  }
                : {}),
            ...(sizeOverrides.option ? { option: (b: object, s: object) => ({ ...(themeStyles.option as Function)(b, s), ...(sizeOverrides.option as Function)(b) } as object) } : {}),
            ...styles,
        } as StylesConfig<AppSelectOption<T>, false>;
    }, [size, styles]);

    return (
        <ReactSelect<AppSelectOption<T>, false>
            options={options as AppSelectOption<T>[]}
            value={value ?? null}
            onChange={(opt) => onChange?.(opt ?? null)}
            styles={mergedStyles}
            {...rest}
        />
    );
}

const AppSelect = React.memo(AppSelectInner) as typeof AppSelectInner;
export default AppSelect;
