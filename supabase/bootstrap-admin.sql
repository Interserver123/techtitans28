-- =============================================================================
-- Create the FIRST Super Admin (run once, after deploy.sql).
-- 1. Replace the three values below.  2. Run in Supabase SQL Editor.
-- 3. Sign in at https://<your-domain>/admin/login and enrol MFA immediately.
-- 4. Delete this query from the SQL Editor's saved snippets afterwards.
-- The password is hashed with bcrypt here and automatically upgraded to scrypt
-- at first sign-in. Further admins are created from the dashboard.
-- =============================================================================
do $$
declare
  v_email       text := 'CHANGE-ME@example.edu';
  v_name        text := 'CHANGE ME Full Name';
  v_designation text := 'Chief Election Commissioner';
  v_password    text := 'CHANGE-ME';   -- 12+ chars, upper + lower case + digit
  v_id uuid;
begin
  if v_email like 'CHANGE-ME%' or v_name like 'CHANGE ME%' or v_password = 'CHANGE-ME' then
    raise exception 'Edit v_email, v_name and v_password before running this script.';
  end if;
  if length(v_password) < 12 or v_password !~ '[a-z]' or v_password !~ '[A-Z]' or v_password !~ '[0-9]' then
    raise exception 'Password must be at least 12 characters with upper-case, lower-case letters and a digit.';
  end if;
  insert into public.election_admins (email, full_name, designation, role_code, password_hash)
  values (lower(btrim(v_email)), btrim(v_name), nullif(btrim(v_designation), ''), 'SUPER_ADMIN',
          extensions.crypt(v_password, extensions.gen_salt('bf', 12)))
  returning id into v_id;
  perform public.append_audit('SYSTEM', null, 'ADMIN.BOOTSTRAPPED', 'election_admin', v_id::text,
    jsonb_build_object('email', lower(btrim(v_email)), 'role', 'SUPER_ADMIN', 'via', 'sql_editor'), null);
  raise notice 'Super Admin % created. Sign in and enrol MFA now.', lower(btrim(v_email));
end $$;
