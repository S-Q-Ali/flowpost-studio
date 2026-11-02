-- Where a finished connect sends the browser back: either the web app URL or
-- the desktop's flowpost://connect-callback link, already allowlisted at
-- insert time by the auth functions. Null keeps the old web behaviour.
alter table oauth_states add column if not exists return_to text;
