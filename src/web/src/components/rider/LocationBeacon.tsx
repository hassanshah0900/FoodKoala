'use client';

import { useEffect } from 'react';
import { reportLocation } from '@/app/rider/actions';
import { LOCATION_EVERY_MS } from '@/lib/rider';

/**
 * While the rider is online, sends where the phone is every few seconds: orders go
 * to the nearest rider with a fresh position, and a customer follows the one carrying theirs.
 */
export function LocationBeacon() {
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let last: GeolocationPosition | null = null;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        last = p;
      },
      undefined,
      { enableHighAccuracy: true },
    );
    const send = () => {
      if (last) void reportLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
    };
    const timer = setInterval(send, LOCATION_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
    };
  }, []);
  return null;
}
