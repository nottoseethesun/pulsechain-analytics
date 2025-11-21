# Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

This is a set of utilities for checking various items on the PulseChain blockchain, such as for example the total amount of a specified token that was transferred to a wallet address during a PulseChain transaction.

In some cases, versions are provided for Google Apps Script, so that for example one can call the code from a Google Sheet in order to fill in a cell(s) in the spreadsheet.  Google Apps Script has quite a few quirks and bugs so the code for these versions will often look different and contain more code since the standard NodeJs libraries are not easily accessible.

## A Note on Caching

This version has a caching option (`getTokenTransferredUseCache`), unlike the pure NodeJS version, because in the normal usage of Google Sheets, often times large Google Sheet spreadsheets can run code functions called in cells very many times when it is not necessary to have fresh data.

## Prerequisites

### Google Apps Script Files - Prereq's

Since there is, incredibly, no version information available for Google Apps Script, one can only use the latest version, and troubleshoot any issues by comparing to the Google Apps Script Release Notes: <https://developers.google.com/apps-script/release-notes>

### NodeJS Modules - Prereq's

NodeJS 24.9.x - Earlier versions may work.

## Installation

There are two possible types of JavaScript platform used here: Google Apps Script and NodeJS.

### Google Apps Script Files - Install

If you are using a file(s) in the directory, `./for-google-apps`, then import the Deployment of this file into your Google Sheet using the following Google Apps Script Library deployment information of
this id: `1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG` and selecting Version 5.

Here's the full deployment info in case you need more info:

```terminal
Version 5 on Nov 21, 2025, 4:07 PM
Deployment ID: AKfycbyBWersgxf4_JBg40CT-h9iAwfcfC3Rj4T_3aoVtfTj1EpjLQtqH6Ac3xG7CjyGZ4c
Library URL:  https://script.google.com/macros/library/d/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/5
```

Next, because of bugs in the Google Apps Script importing of Google Apps Script libraries, you will need to use the library that you just imported from a wrapper script.  To do this, paste the contents of the included file, `./for-google-apps/wrapper.gs`, into the Google Apps Script code editor, as described below under the section heading, "Google Apps Script Files - Alternative Install".  Save the file and then call the wrapper functions you desire, from your Google Sheet.  Note that you can add your own wrappers as well.

#### Google Apps Script Files - Alternative Install

Of course, alternatively you can always just copy-paste the file contents using the Google Apps Script Editor (from your Google document, such as a Google Sheet, select the top-level menu "Extensions" and then select the option, "Apps Script").  Next, name the file (no need for a ".gs" extension) and paste in the code.

### NodeJS Modules - Install

Otherwise just do, from the command line: `npm -i`

### Usage

Refer to the module or file header documentation.  If none, look for a function with a name that starts with "test" and that will be self-explanatory as to usage.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.
