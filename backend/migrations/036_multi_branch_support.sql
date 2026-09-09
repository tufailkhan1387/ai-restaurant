-- Multi-Branch Support: Add parent restaurant relationship, geocoding & order assignment fields

-- 1. Restaurants table modifications
ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS parent_restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS service_radius_km DECIMAL(5, 2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS is_accepting_orders BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_branch BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_restaurants_parent_restaurant_id ON public.restaurants(parent_restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_branch ON public.restaurants(is_branch);

-- 2. Orders table modifications for auto-assignment & branch tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS assigned_branch_distance_km DECIMAL(6, 2),
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS branch_assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(50) DEFAULT 'assigned';

CREATE INDEX IF NOT EXISTS idx_orders_assignment_status ON public.orders(assignment_status);
CREATE INDEX IF NOT EXISTS idx_orders_auto_assigned ON public.orders(auto_assigned);
