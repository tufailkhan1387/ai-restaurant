-- 038_order_branch_transfer_workflow.sql
-- Add order transfer status, pending branch, rejection reason and notifications table

-- 1. Add transfer workflow columns to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS transfer_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pending_transfer_to_restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS transfer_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS transfer_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS transfer_responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_transfer_status ON public.orders(transfer_status);
CREATE INDEX IF NOT EXISTS idx_orders_pending_transfer_to ON public.orders(pending_transfer_to_restaurant_id);

-- 2. Create notifications table for in-app real-time & persistent alerts
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'transfer_requested', 'transfer_accepted', 'transfer_rejected', 'new_order', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_restaurant_id ON public.notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON public.notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
