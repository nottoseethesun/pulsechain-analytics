# How the Ratio Chart Decides Its Prices

The ratio chart, `bin/end-user/pulse-token-ratio.js`, charts the ratio of
two tokens' prices over time in the terminal: token A's price divided by
token B's, at each time both have a price, and, with `--csv`, writes the
two prices and their ratio to a CSV file. It runs on Node, the program
that runs JavaScript outside a browser; npm, Node's package manager, runs
the commands that the repo's `package.json` names. It is the one tool in
this repo that decides on prices; the others read amounts, balances and a wallet's
history from the chain. Its settings are in `chart-price-ratio/config.json`,
and each can be given on the command line instead, as
`node bin/end-user/pulse-token-ratio.js --help` lists. This page follows
the chart's prices from start to finish: where they come from, which
pool's prices it reads, which times it charts, and what it does when a
source cannot give them.

## Contents

- [1. Where the Prices Come From](#1-where-the-prices-come-from)
  - [Pools and Candles](#pools-and-candles)
  - [The Three Services](#the-three-services)
  - [Which Source a Run Reads](#which-source-a-run-reads)
- [2. The Interval and the Span](#2-the-interval-and-the-span)
- [3. The Pool or Pair Each Token Is Priced In](#3-the-pool-or-pair-each-token-is-priced-in)
  - [From GeckoTerminal](#from-geckoterminal)
  - [From Moralis](#from-moralis)
- [4. Each Token's Price at a Time](#4-each-tokens-price-at-a-time)
- [5. The Ratio](#5-the-ratio)
- [6. When the Candles Cannot Be Had: DexTools](#6-when-the-candles-cannot-be-had-dextools)
- [7. When the Run Stops With No Ratio](#7-when-the-run-stops-with-no-ratio)

## 1. Where the Prices Come From

### Pools and Candles

PulseChain's tokens trade on decentralized exchanges: sets of contracts
on the chain in which people swap one token for another. Each pool of
such an exchange, also called a pair, holds two tokens and swaps one for
the other at its own rate, which is its price. The chart's prices come
from pools' candles. A candle sums up the trades of a pool over one
period, an hour or a day, starting at its open time: the first price
(open), the highest (high), the lowest (low) and the last (close). The
chart reads the close.

### The Three Services

Three services price a token from the pools of decentralized exchanges on
PulseChain, each through a client of crypto-price-fetchers, the owner's
repo of code his projects share:

- GeckoTerminal, which lists the pools with their prices and candles, and
  takes no key.
- Moralis, which gives the same kind of candles, and takes an api key.
- DexTools, which gives a token's current price, and takes an api key.

An api key is saved with `npm run api-keys`, the key manager of
crypto-price-fetchers, which keeps it encrypted with a password you
choose; a run opens a key, and has the service check it, the first time
it asks that service. A key is never a setting or a command-line
argument. The key manager also saves an order of priority for Moralis and
DexTools, which the chart does not follow (section 6).

### Which Source a Run Reads

A run reads all its candles from one source, GeckoTerminal or Moralis,
or reads none:

- With `--useDexToolsOnly`, or `useDexToolsOnly` in `config.json`, the run
  reads no candles, and takes the two tokens' current prices from DexTools
  (section 6). No flag turns the setting off once the file sets it.
- `--source moralis` or `--source geckoterminal` names the source. With
  `--source moralis` and no Moralis key saved, the run stops (section 7).
- Without `--source`, a run with no Moralis key saved reads GeckoTerminal.
  With one saved, it asks at the terminal which to read: `1`, or Enter,
  takes Moralis, and `2` GeckoTerminal. A run with no terminal to ask at,
  such as one whose input comes from a pipe, stops, and so does one given
  three answers that are none of these (section 7).

## 2. The Interval and the Span

The interval sets the time between two points of the chart. It is the
third argument, or `--interval`, or else `interval` in `config.json`:

- `hourly`: one point an hour.
- `daily`, the default: one point a day.
- `weekly`: one point a week, made from daily closes. The run keeps the
  days both tokens have a close for. The first week starts on the first
  of those days; the next starts on the first of them that comes
  `weeklyResampleDays` days (`--weekly-days`, 7 by default) or more after
  it, and so on. A week's point is at its first day, with the close of
  its last day.

The span is how far back the chart reaches:

- From GeckoTerminal, the newest `maxCandles` candles (`--max-candles`,
  1000 by default), in one request, which GeckoTerminal answers with
  fewer daily candles than that: about the last 184 days of them, as it
  gave on 2026-11-21.
- From Moralis, the last `maxCandles` hours for the hourly interval, and
  the last `moralis.days` days (`--moralis-days`, 730, two years, by
  default) for the daily and weekly ones.

The newest point can be the period the run is in, not yet over: its
close is then the last price so far, and a later run can give it
another.

## 3. The Pool or Pair Each Token Is Priced In

A token trades in several pools, each against another token, and each
pool has its own price. The chart prices each token from one pool, which
it picks by the rules below, so that the price is the market's and the
chart reaches back.

### From GeckoTerminal

1. GeckoTerminal lists the token's pools, a page of them, with the value
   each holds in USD (its liquidity).
2. The run takes the five that hold the most, and counts each one's
   daily candles, up to `maxCandles`. A pool whose candles cannot be had
   is left out; with none left, GeckoTerminal cannot give the prices
   (section 6).
3. It takes the pool with the most liquidity, unless that pool has fewer
   than half the days of the pool with the most days, as a pool new to
   the market has.
4. In that case it takes the pool with the most liquidity among those
   with the most days that hold at least a tenth of the top pool's
   liquidity; when no such pool exists, it takes the top pool after all.

### From Moralis

Moralis's candles of a pair price the token the pair lists first, as HEX
/ WPLS prices HEX. So the run lists the pairs that trade the token, keeps
those that list it first, leaves out a pair Moralis marks inactive, which
has no candles for the last day, and takes the one with the most
liquidity. With no such pair, Moralis cannot give the prices (section 6).

## 4. Each Token's Price at a Time

A token's price at a time is the close of its pool's candle that opens
at that time, in USD:

- From GeckoTerminal, the price in USD of the token's side of the pool.
- From Moralis, the pair's candle, which prices the token the pair lists
  first, in USD. The run checks that the token Moralis's answer names is
  that token; when it is another, Moralis cannot give the prices
  (section 6).

A token has no price at a time its pool has no candle for, as when
nothing traded in a GeckoTerminal pool in that period, which GeckoTerminal
makes no candle for; the other token can have one then.

## 5. The Ratio

At each time both tokens have a price above 0, the ratio is token A's
price divided by token B's. A time only one token has a price for, or a
price of 0 or less, gives no ratio and no point. With `--csv`, each row
holds the time, the two prices and the ratio.

With two points or more, the run draws the chart. With one, it draws
none: it prints `(Single data point - no historical chart available)`
and the ratio, and ends with exit code 0.

## 6. When the Candles Cannot Be Had: DexTools

The run falls back to DexTools when its source of candles cannot give the
prices: it cannot list a token's pools or pairs, finds no pool or pair to
price a token in (section 3), gives no candles of them, or, from Moralis,
gives candles that price another token (section 4). A Moralis key that
does not open, or that Moralis refuses, is no such case: it stops the
run before any candle is asked for (section 7). When the run falls
back:

- With a DexTools key saved, the run asks DexTools for each token's
  current price in USD, and gives one point: the ratio of the two prices
  now, which draws no chart (section 5).
- With no DexTools key saved, the run says how to save one, and stops
  (section 7).

The run asks DexTools only in these cases and in DexTools-only mode
(section 1), whatever order of priority the key manager saves for Moralis
and DexTools. That order says which of two services with keys a program
asks first where both can do one job, and these two do different jobs:
Moralis's candles give a series of past prices, which the chart draws,
and DexTools gives one price now, one point, which draws no chart.
Ranking DexTools first would change what the chart shows, not only which
service answers.

## 7. When the Run Stops With No Ratio

The run ends with exit code 1, and gives no ratio, when:

- `--source moralis` is given and no Moralis key is saved;
- a Moralis key is saved, no `--source` is given, and there is no
  terminal to ask at, or three answers are none of `1`, `2` and Enter;
- `--source` is given with `--useDexToolsOnly`, or with `useDexToolsOnly`
  set in `config.json`;
- the terminal closes before the source question is answered;
- the password does not open a key the run needs, or the service refuses
  it: Moralis's, which a run from Moralis opens before it asks for any
  candle, or DexTools', which a run opens when it falls back or runs in
  DexTools-only mode;
- its source cannot give the candles, or DexTools-only mode is on, and no
  DexTools key is saved;
- DexTools does not answer in time, answers with an error, or gives no
  price;
- the two tokens share no time at which both have a price above 0.
