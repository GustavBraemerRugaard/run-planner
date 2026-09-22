// ---- Edit these values (see README) ----------------------------------------------------
// OAuth Client ID from Google Cloud Console (a "Web application" client). Not a secret.
export const GOOGLE_CLIENT_ID = '1009741131131-2b46rlgcml9egqk6vlho02s9b3maqf9n.apps.googleusercontent.com';

// ID of your "Løb" calendar: Google Calendar > Settings > "Løb" > Integrate calendar > Calendar ID.
export const CALENDAR_ID = 'd57c5481f7b76b7595690c54b1b03cd3795889cbef275c7536fe170ea0b342d4@group.calendar.google.com';

// Client ID from your Strava API application (strava.com/settings/api). Not a secret.
export const STRAVA_CLIENT_ID = '281310';

// The Cloudflare Worker's URL, from `npx wrangler deploy` in worker/ (see worker/README section in README.md).
export const STRAVA_WORKER_URL = 'https://run-planner-strava.grugaard.workers.dev';
// ---------------------------------------------------------------------------------------

// Narrowest scope that allows reading and writing events.
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Read-only access to your own activities, including private ones.
export const STRAVA_SCOPE = 'activity:read_all';

// Weeks start on Monday (0 = Sunday, 1 = Monday).
export const FIRST_DAY = 1;

// Default number of weeks shown in the weekly mileage chart (you can change it in the app too).
export const DEFAULT_CHART_WEEKS = 12;
