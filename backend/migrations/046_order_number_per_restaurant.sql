-- Sequential ORD-0001 is per restaurant. The original UNIQUE(order_number) was global,
-- so a second restaurant/manual order collided with another restaurant's ORD-NNNN.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
DROP INDEX IF EXISTS orders_order_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS orders_restaurant_id_order_number_key
  ON public.orders (restaurant_id, order_number);
