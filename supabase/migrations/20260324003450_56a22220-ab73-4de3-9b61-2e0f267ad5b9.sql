
-- Fix the permissive INSERT policy on profiles
-- Drop the overly permissive policy and replace with a proper one
DROP POLICY "System can insert profiles" ON public.profiles;

-- Only allow inserts from the trigger (service role) or own user
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
