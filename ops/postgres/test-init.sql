CREATE ROLE rakuxon_app LOGIN PASSWORD 'test-only-password';
ALTER DATABASE rakuxon OWNER TO rakuxon_app;
ALTER SCHEMA public OWNER TO rakuxon_app;
