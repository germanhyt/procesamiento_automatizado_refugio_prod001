export type KioskDriverAlert = {
  id: string;
  driverArrivalId: number;
  plat: string;
  code: string;
  restaurantNombre?: string;
  receivedAt: number;
};
