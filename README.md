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

If you are using a file(s) in the directory, `./for-google-apps`, and the README indicates that it should be imported as a Library in Google Apps, then import the Deployment of each file you need into your Google Sheet using the Library URL path segment identifier (we'll call it "the path-id") that is seen in the Library URL just before the ending "/n", where "n" is a number.  Refer to the local README for the utility you are using to get this value.

Here's an example of full deployment info for a Google Apps Script, just to illustrate:

```terminal
Version 5 on Nov 21, 2025, 4:07 PM
Deployment ID: AKfycbyBWersgxf4_JBg40CT-h9iAwfcfC3Rj4T_3aoVtfTj1EpjLQtqH6Ac3xG7CjyGZ4c
Library URL:  https://script.google.com/macros/library/d/1HFXEAhRh3-fSqNLzi9i-oMDLwr2aV4zp8-NNxv6moDfRDVGDgHn7BtqG/5
```

Put the path-id on your clipboard, copying it from the README local to the utility you are using.  Next, navigate to the Google Apps Script management screen from the top-level of your Google doc, such as your Google Sheet: Select the top-level menu "Extensions" and then select the option, "Apps Script".  On the left, click "Libraries".  In the first text input form field of the dialog that pops up, paste in the path-id.  Next, click "Look Up".  Select the latest version (the highest number).  Finally, click "Add" and you're done importing the file.

Next, because of bugs in the Google Apps Script importing of Google Apps Script libraries, you will need to use the library/libraries that you just imported from a wrapper script, typically named `wrapper.gs`.  (To clarify, this is distinguished from being able to call them directly from e.g. a Google Sheet spreadsheet cell, which unfortunately does not seem possible).  To do this, paste the contents the file for your utility named, `wrapper.gs`, into the Google Apps Script code editor, as described below under the section heading, "Google Apps Script Files - Alternative Install".  Then call the wrapper functions you desire, from your Google Sheet.  Note that you can add your own wrappers as well.

#### Google Apps Script Files - Alternative Install

Of course, alternatively you can always just copy-paste the file contents using the Google Apps Script Editor.  First, get the code on your clipboard by copying the required file on Github: Navigate to the file and use the "Copy" button on the right to copy the raw file.  

Next, from your Google document, such as a Google Sheet, select the top-level menu "Extensions" and then select the option, "Apps Script".  Press cntrl-/cmd-a (cmd for Mac) so that all pre-existing code will be pasted over, and then press cntrl-/cmd-v to paste.  Save the file by pressing cntrl-/cmd-s (cmd for Mac).  Next, name the file (no need for a ".gs" extension).

### NodeJS Modules - Install

Otherwise just do, from the command line: `npm -i`

### Usage

Refer to the module or file header documentation.  If none, look for a function with a name that starts with "test" and that will be self-explanatory as to usage.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.
