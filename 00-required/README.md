# TransitBuddy core (copy this folder)

**Location on this machine:** `/Users/milton/TransitBuddy/00-required`

Zip or copy **this entire folder**. It contains the working code (not stubs) for:

1. Transfer Buddy (`transfer.js`)
2. Stop ETAs and ride follow-along (`stopEta.js`, hop logic in `transfer.js`)
3. MTR Next Train (`mtr.js`)
4. Light Rail (`lightrail.js`)

Plus the operator clients those files need (KMB, Citybus, GMB, NLB).

---

## Use elsewhere

Needs **Node 18+** (built-in `fetch`). Optional: `@supabase/supabase-js` only if you load fares/discounts from Supabase.

```js
import {
  createCache,
  etasForStop,
  planTransfer,
  predictRide,
  planMtrRide,
  planLrt
} from './index.js';

const cache = createCache();

// MTR: 荃灣綫 尖沙咀 → 中環
const mtr = await planMtrRide('TWL', 'TST', 'ADM');

// Light Rail: station id from LRT_STATIONS
const lrt = await planLrt('1');

// Live buses at one pole (KMB id, or { stop, co: 'CTB'|'GMB'|'NLB' })
const etas = await etasForStop(cache, { stop: 'KMB_STOP_ID', co: 'KMB' }, []);

// One trip’s stop times
const ride = await predictRide(cache, stopMap, {
  first: { route: '81', bound: 'O', service_type: '1', co: 'KMB' },
  boardStops: ['BOARD_STOP_ID'],
  destStops: ['DEST_STOP_ID']
}, routes);

// Transfer Buddy
const transfer = await planTransfer(cache, stopMap, allStops, {
  first,
  boardStops,
  interchangeStops,
  destinationStops,
  phase: 'departures'
}, routes);
```

`stopMap` is a `Map` of stop id / `CO:id` → `{ stop, name_tc, name_en, lat, long, co }`. `routes` is the directory list of services. The host app supplies those (this pack does not download the full HK stop directory by itself).

Honesty: empty official feeds stay empty. Hops without a matching live ETA are marked **估計**.

---

## Files in this folder

| File | What it is |
| --- | --- |
| `transfer.js` | `planTransfer`, `predictRide`, follow-along stop times |
| `stopEta.js` | `etasForStop` — KMB / Citybus / GMB / NLB at one pole |
| `mtr.js` | Lines, `pathBetween`, `planMtrRide` |
| `lightrail.js` | LRT station table + Next Train |
| `kmb.js` `citybus.js` `gmb.js` `nlb.js` | Official live APIs |
| `fares.js` `discounts.js` `gtfs.js` | Fares / BBI / scheduled trip minutes |
| `cache.js` `stopName.js` `addStops.js` `supabase.js` | Helpers |
| `index.js` | Public exports |

This repo’s `lib/*.js` re-exports these files so TransitBuddy and a copied folder stay the same code.

## Official feeds

- KMB: `https://data.etabus.gov.hk/v1/transport/kmb`
- Citybus: `https://rt.data.gov.hk/v2/transport/citybus`
- GMB: `https://data.etagmb.gov.hk`
- NLB: `https://rt.data.gov.hk/v2/transport/nlb`
- MTR: `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=&sta=`
- LRT: `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=&with_special=1`
