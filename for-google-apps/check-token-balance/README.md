# Overview

See the README at `../../check-token-balance/README.md`.

## Pre-requisites

See the Google Apps Script-specific Pre-requisites info at `../../README.md`.

## Installation

First, review the general Google Apps Script-specific Installation info at `../../README.md`,
and next, reference the Import info below as you follow the instructions to import the file.

You will use this i.d. to import the script (copy it to put it on your clipboard for use when importing):

```terminal
1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG
```

In case needed, here is full Deployment info (the trailing number may increase with new versions):

```terminal
Version 5 on Nov 21, 2025, 4:07 PM
Deployment ID: AKfycbyBWersgxf4_JBg40CT-h9iAwfcfC3Rj4T_3aoVtfTj1EpjLQtqH6Ac3xG7CjyGZ4c
Library URL:  https://script.google.com/macros/library/d/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/5
```

## A Note on Caching

This, the Google Apps Script version of this utility, has a caching option (`getTokenTransferredUseCache`), 
unlike the pure NodeJS version. This is because in the normal usage of Google Sheets, often times large
Google Sheet spreadsheets can run code functions called in cells very many times when it is not
necessary to have fresh data.  That in turn can trigger an undesired block from the API provider due to
rate limits.

## Contributing

See the info on Contributing at `../../README.md`.

### Development Notes

The Google Apps Script library is named, "FetchTokenAmountTransferredSA" (the "SA" at the end comes from
the fact that this is a Stand-alone Google Apps script, meaning, it's not attached to any document such
as a Google Sheet).  Optionally, find the actual Google Apps Script library file that users will be
importing,
here: <https://script.google.com/home/projects/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG>
and edit it here:
<https://script.google.com/home/projects/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/edit> .
