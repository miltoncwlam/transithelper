/**
 * Self-contained Transit Buddy core — copy this whole folder to use elsewhere.
 * Node 18+ (global fetch). Do not invent live ETAs.
 */
export { createCache } from './cache.js';
export { planTransfer, predictRide } from './transfer.js';
export { etasForStop } from './stopEta.js';
export { nearestStops, clusterEtas, namedStop, stopPlaceKey, attachStopMeta, kmbFetch, kmbFetchOrEmpty } from './kmb.js';
export { citybusRouteStops, citybusStopEta, citybusStopEtas, citybusRoutes, citybusAllStops, stopCompany } from './citybus.js';
export { gmbLookup, gmbRouteStops, gmbStopEta, gmbRoutes, GMB_REGION } from './gmb.js';
export { nlbEta, nlbRouteStops, nlbRoutes, nlbAllStops } from './nlb.js';
export { bindAddStops } from './addStops.js';
export {
  LRT_LINE,
  LRT_STATIONS,
  fetchLrtSchedule,
  normalizeLrtSchedule,
  planLrt
} from './lightrail.js';
export {
  MTR_LINES,
  fetchMtrSchedule,
  hopsBetween,
  lineRoutes,
  normalizeMtrSchedule,
  pathBetween,
  pickFollowedTrain,
  planMtrRide,
  publicMtrLines,
  stationName,
  trainServes
} from './mtr.js';
export { fareForRoute, attachFaresToItems, attachFaresToRoutes, getFareIndex, sectionFareHkd } from './fares.js';
export { attachDiscounts } from './discounts.js';
export { displayStopName, stopNameMissing, lookupStopMap } from './stopName.js';
