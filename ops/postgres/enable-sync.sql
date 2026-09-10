-- Only for the explicitly requested temporary DATABASE_SYNCHRONIZE=true mode.
-- Runtime remains non-superuser, but owns entity tables so it can ALTER them.
GRANT CREATE ON DATABASE rakuxon TO rakuxon_app;
ALTER SCHEMA public OWNER TO rakuxon_app;
DO $$ DECLARE obj record; BEGIN
  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO rakuxon_app', obj.tablename);
  END LOOP;
  FOR obj IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid
    WHERE n.nspname='public' AND t.typtype='e' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO rakuxon_app', obj.typname);
  END LOOP;
END $$;
