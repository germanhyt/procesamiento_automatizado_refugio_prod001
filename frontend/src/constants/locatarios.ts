/**
 * Lista de locatarios para Fuentes de datos (upload).
 * Sincronizada con backend app/core/constants.py. Migrable a tabla BD después.
 */
export interface Locatario {
    name: string;
    codigo: string;
}

export const LOCATARIOS: Locatario[] = [
    { name: 'Barrio Mancora', codigo: 'A03_BARRIO_MANCORA' },
    { name: 'Patio Cavenecia', codigo: 'A04_PATIO_CAVENECIA' },
    { name: 'Caja China Criolla', codigo: 'IS01_CAJA_CHINA_CRIOLLA' },
    { name: 'Bros', codigo: 'IS04_BROS' },
    { name: 'Limanesas', codigo: 'IS05_LIMANESAS' },
    { name: 'Saltao', codigo: 'L06_SALTAO' },
    { name: 'La 22', codigo: 'L13_LA_22' },
    { name: 'Choza de la Anaconda', codigo: 'L16_CHOZA_DE_LA_ANACONDA' },
    { name: 'MR SMASH', codigo: 'L17_MR_SMASH' },
    { name: 'Sisa Cafe', codigo: 'N01_SISA_CAFE' },
    { name: 'Hanzo', codigo: 'N06_HANZO' },
    { name: 'La Victoria', codigo: 'N10_LA_VICTORIA' },
    { name: 'Curich', codigo: 'T06_CURICH' },
    { name: 'Anticuching', codigo: 'T10_ANTICUCHING' },
    { name: 'Bar Refugio', codigo: 'T20_BAR_REFUGIO' },
    { name: 'Tortas Gaby', codigo: 'L18_TORTAS_GABY' },
    { name: 'Don Melchor', codigo: 'A06_DON_MELCHOR' },
    { name: 'Nashmys', codigo: 'IS07_NASHMYS' },
    { name: 'Ahumaré', codigo: 'L19_AHUMARE' },
    { name: 'Caldos Doris', codigo: 'L20_CALDOS_DORIS' },
    { name: 'Barrio Wok', codigo: 'L21_BARRIO_WOK' },
];
