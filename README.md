# Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

This is a set of utilities for checking various items on the PulseChain blockchain, such as for example the total amount of a specified token that was transferred to a wallet address during a PulseChain transaction.

In some cases, versions are provided for Google Apps Script, so that for example one can call the code from a Google Sheet in order to fill in a cell(s) in the spreadsheet.  Google Apps Script has quite a few quirks and bugs so the code for these versions will often look different and contain more code since the standard NodeJs libraries are not easily accessible.

## Prerequisites

### Google Apps Script Files - Prereq's

Since there is, incredibly, no version information available for Google Apps Script, one can only use the latest version, and troubleshoot any issues by comparing to the Google Apps Script Release Notes: <https://developers.google.com/apps-script/release-notes>

### NodeJS Modules - Prereq's

NodeJS 24.9.x - Earlier versions may work.

## Installation

There are two possible types of JavaScript platform used here: Google Apps Script and NodeJS.

### Google Apps Script Files - Install

If you are using a file(s) in the directory, `./for-google-apps`, then just copy-paste the file contents using the Google Apps Script Editor there (from your Google document, such as a Google Sheet, select the top-level menu "Extensions" and then select the option, "Apps Script").  Next, name the file (no need for a ".gs" extension) and paste in the code.

### NodeJS Modules - Install

Otherwise just do, from the command line: `npm -i`

### Usage

Refer to the module or file header documentation.  If none, look for a function with a name that starts with "test" and that will be self-explanatory as to usage.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.
