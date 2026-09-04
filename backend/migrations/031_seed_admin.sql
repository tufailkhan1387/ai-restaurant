-- Migration 031: Seed/Ensure separated roles:
-- 1. admin@admin.com (Super Admin): platform-level control (all restaurants, earnings, settings)
-- 2. royal@gmail.com (Restaurant Admin): isolated Royal Restaurant control (same as Bundu Khan & Yasir Broast)

DO $$
DECLARE
    v_super_id uuid;
    v_royal_id uuid;
    v_restaurant_id uuid;
    v_hash text := '$2a$10$YZYuliRAUE3UTh1Mw7Rgw.r5oVOiXht1XqxzQUly74eZnkjhCyCJ6'; -- bcrypt hash for 11223344
BEGIN
    -- 1. Find Royal Restaurant
    SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = 'royal-restaurant' LIMIT 1;
    IF v_restaurant_id IS NULL THEN
        SELECT id INTO v_restaurant_id FROM public.restaurants ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- 2. Setup Super Admin: admin@admin.com
    SELECT id INTO v_super_id FROM public.profiles WHERE lower(email) = 'admin@admin.com';
    IF v_super_id IS NULL THEN
        v_super_id := gen_random_uuid();
        INSERT INTO public.profiles (id, email, full_name, password_hash, status)
        VALUES (v_super_id, 'admin@admin.com', 'Super Admin', v_hash, 'available');
    ELSE
        UPDATE public.profiles
        SET password_hash = v_hash,
            full_name = 'Super Admin',
            updated_at = now()
        WHERE id = v_super_id;
    END IF;

    -- Assign role 'super_admin'
    DELETE FROM public.user_roles WHERE user_id = v_super_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_super_id, 'super_admin');

    -- 3. Setup Dedicated Royal Restaurant Admin: royal@gmail.com
    SELECT id INTO v_royal_id FROM public.profiles WHERE lower(email) = 'royal@gmail.com';
    IF v_royal_id IS NULL THEN
        v_royal_id := gen_random_uuid();
        INSERT INTO public.profiles (id, email, full_name, password_hash, status)
        VALUES (v_royal_id, 'royal@gmail.com', 'Royal Restaurant Admin', v_hash, 'available');
    ELSE
        UPDATE public.profiles
        SET password_hash = v_hash,
            full_name = 'Royal Restaurant Admin',
            updated_at = now()
        WHERE id = v_royal_id;
    END IF;

    -- Assign role 'admin' (isolated to Royal Restaurant, exactly like Yasir Broast / Bundu Khan)
    DELETE FROM public.user_roles WHERE user_id = v_royal_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_royal_id, 'admin');

    -- Link royal@gmail.com as owner of Royal Restaurant
    IF v_restaurant_id IS NOT NULL THEN
        INSERT INTO public.restaurant_members (restaurant_id, user_id, member_role)
        VALUES (v_restaurant_id, v_royal_id, 'owner')
        ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner';
    END IF;
END $$;
