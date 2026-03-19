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

type SelectSize = NonNullable<AppSelectProps['size']>;
type SelectStyleKeys =
    | 'control'
    | 'option'
    | 'singleValue'
    | 'placeholder'
    | 'input'
    | 'dropdownIndicator'
    | 'clearIndicator';

/**
 * Variantes de tamaño (parciales) sobre el resultado tematizado.
 * Nota: no incluye estilos base de react-select para no pisar el tema del sistema.
 */
const SIZE_VARIANTS: Record<SelectSize, Partial<Record<SelectStyleKeys, object>>> = {
    md: {},
    sm: {
        control: { minHeight: 36, padding: '0 2px', fontSize: '10px' },
        option: { fontSize: '10px' },
        singleValue: { fontSize: '10px' },
        placeholder: { fontSize: '10px' },
        input: { fontSize: '10px' },
        dropdownIndicator: { padding: '4px' },
        clearIndicator: { padding: '4px' },
    },
};

/**
 * Combina:
 * - base de react-select (entregado por el callback)
 * - variante del sistema (`themeStyles`)
 * - variante de tamaño (`sm`/`md`)
 */
function mergeStyleVariant(baseStyle: object, variantPartial?: object) {
    return variantPartial ? ({ ...baseStyle, ...variantPartial } as object) : baseStyle;
}

function AppSelectInner<T = string>({ options, value, onChange, styles, size = 'md', ...rest }: AppSelectProps<T>) {
    const mergedStyles = useMemo(() => {
        const sizePartials = SIZE_VARIANTS[size];

        return {
            ...themeStyles,
            control: (b: object, s: object) => mergeStyleVariant((themeStyles.control as Function)(b, s), sizePartials.control),
            option: (b: object, s: object) => mergeStyleVariant((themeStyles.option as Function)(b, s), sizePartials.option),
            singleValue: (b: object) => mergeStyleVariant((themeStyles.singleValue as Function)(b), sizePartials.singleValue),
            placeholder: (b: object) => mergeStyleVariant((themeStyles.placeholder as Function)(b), sizePartials.placeholder),
            input: (b: object) => mergeStyleVariant((themeStyles.input as Function)(b), sizePartials.input),
            dropdownIndicator: (b: object) =>
                mergeStyleVariant((themeStyles.dropdownIndicator as Function)(b), sizePartials.dropdownIndicator),
            clearIndicator: (b: object) => mergeStyleVariant((themeStyles.clearIndicator as Function)(b), sizePartials.clearIndicator),
            ...styles,
        } as StylesConfig<AppSelectOption<T>, false>;
    }, [size, styles]);

    return (
        <ReactSelect<AppSelectOption<T>, false>
            options={options as AppSelectOption<T>[]}
            value={value ?? null}
            onChange={(opt) => onChange?.(opt ?? null)}
            styles={mergedStyles}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
            menuPosition="fixed"
            {...rest}
        />
    );
}

const AppSelect = React.memo(AppSelectInner) as typeof AppSelectInner;
export default AppSelect;
