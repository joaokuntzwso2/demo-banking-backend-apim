"use strict";

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function isExpired(iso) {
  return Date.now() >= new Date(iso).getTime();
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { nowIso, addMinutes, hoursSince, isExpired, todayUtc };
