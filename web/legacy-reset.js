'use strict';
/* Retire browser-only 15m observations without touching current 3.0 analytics. */
try{localStorage.removeItem('clpro.local_events_v1');localStorage.removeItem('clpro.scan_round');}catch(e){}
