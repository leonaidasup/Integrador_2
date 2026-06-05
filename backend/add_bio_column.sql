-- Add bio column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_id ON public.users(id);
