/**
 * App-wide constants. Nothing secret lives here:
 * the server URL is typed in by the user and kept only on their device.
 */
const APP = {
  URL_KEY: 'ft_api_url',        // localStorage key for the server URL
  TOKEN_KEY: 'ft_session',      // sessionStorage key for the login token
  URL_PREFIX: 'https://script.google.com/macros/s/',
  RETRIES: 3,                   // tries for one call when the network or Google hiccups
  TIMEOUT_MS: 25000             // give up on one try after this long
};
