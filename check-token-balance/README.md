# Overview

Finds the balance (token count) on any given PulseChain wallet address, of any given token(s) represented by its Contract Address, including the native gas token Pulse as represented by the custom identifier "Pulse_Native_Gas_Token" (no quotes), for any given UTC date or PulseChain blockchain block.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

For details, see the file header doc in `index.js`.

## A Note on Caching

The Google Apps Script version of some of these utilities, located at `./for-google-apps/check-token-balance` has a caching option (`getTokenTransferredUseCache`), unlike the pure NodeJS version. This is because in the normal usage of Google Sheets, often times large Google Sheet spreadsheets can run code functions called in cells very many times when it is not necessary to have fresh data.  That in turn can trigger an undesired block from the API provider due to rate limits.

## Contributing

See the info on Contributing at `../../README.md`.
