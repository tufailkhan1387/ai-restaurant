-- Migration 033: Remove Super Admin users from restaurant_members table
DELETE FROM public.restaurant_members 
WHERE user_id IN (
    SELECT id FROM public.profiles WHERE lower(email) = 'admin@admin.com'
) OR user_id IN (
    SELECT user_id FROM public.user_roles WHERE role = 'super_admin'
);
