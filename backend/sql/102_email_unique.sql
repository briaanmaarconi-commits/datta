-- Un email = una cuenta, sin importar mayúsculas (el login compara en minúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_key ON auth.users (lower(email));
