import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listActiveOrders, acceptOrder, shelfOrder, deliverOrder, getOrder } from '@refugio/delivery-api';

export function useActiveOrders() {
  return useQuery({
    queryKey: ['delivery', 'orders', 'active'],
    queryFn: () => listActiveOrders(),
    refetchInterval: 5000,
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['delivery', 'orders', id],
    queryFn: () => getOrder(id),
    refetchInterval: 5000,
  });
}

export function useRunnerActions() {
  const qc = useQueryClient();

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['delivery', 'orders'] });
  };

  const accept = useMutation({
    mutationFn: (orderId: number) => acceptOrder(orderId),
    onSuccess: invalidate,
  });

  const shelf = useMutation({
    mutationFn: (orderId: number) => shelfOrder(orderId),
    onSuccess: invalidate,
  });

  const deliver = useMutation({
    mutationFn: (orderId: number) => deliverOrder(orderId),
    onSuccess: invalidate,
  });

  return { accept, shelf, deliver };
}
