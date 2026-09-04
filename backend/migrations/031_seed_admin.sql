-- Seed / ensure admin user (admin@admin.com / 11223344)
-- Idempotent: sets or updates password hash, assigns super_admin & admin roles,
-- and ensures linked to the primary restaurant.

DO $$
DECLARE
    v_user_id uuid;
    v_restaurant_id uuid;
    v_hash text := '$2a$10$YZYuliRAUE3UTh1Mw7Rgw.r5oVOiXht1XqxzQUly74eZnkjhCyCJ6';
BEGIN
    -- 1. Check or insert profile
    SELECT id INTO v_user_id FROM public.profiles WHERE lower(email) = 'admin@admin.com';
    
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO public.profiles (id, email, full_name, password_hash, status)
        VALUES (v_user_id, 'admin@admin.com', 'Super Admin', v_hash, 'available');
    ELSE
        UPDATE public.profiles
        SET password_hash = v_hash,
            full_name = COALESCE(full_name, 'Super Admin'),
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    -- 2. Ensure super_admin & admin roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- 3. Link to default restaurant if one exists
    SELECT id INTO v_restaurant_id FROM public.restaurants ORDER BY created_at ASC LIMIT 1;
    IF v_restaurant_id IS NOT NULL THEN
        INSERT INTO public.restaurant_members (restaurant_id, user_id, member_role)
        VALUES (v_restaurant_id, v_user_id, 'owner')
        ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner';
    END IF;
END $$;
