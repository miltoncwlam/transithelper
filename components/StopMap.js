'use client';

import { useEffect, useRef } from 'react';

let leafletPromise = null;

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('tb-leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'tb-leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export default function StopMap({ center, clusters, onPick, onMove, userLat, userLng }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const moveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !elRef.current || !L || mapRef.current) return;
      L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
      const map = L.map(elRef.current, { scrollWheelZoom: true, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      const lat = Number(center?.[0]) || 22.3;
      const lng = Number(center?.[1]) || 114.17;
      map.setView([lat, lng], 17);
      map.on('moveend', () => {
        clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(() => {
          const here = map.getCenter();
          onMove?.({ lat: here.lat, lng: here.lng });
        }, 400);
      });
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
    }).catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(moveTimer.current);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !markersRef.current) return;
    markersRef.current.clearLayers();
    if (Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLng))) {
      L.circleMarker([userLat, userLng], { radius: 7, color: '#287d75', fillColor: '#41c1b6', fillOpacity: 1 }).addTo(markersRef.current);
    }
    for (const cluster of clusters || []) {
      if (!Number.isFinite(Number(cluster.lat)) || !Number.isFinite(Number(cluster.lng))) continue;
      const marker = L.circleMarker([cluster.lat, cluster.lng], {
        radius: 9,
        color: '#1d4f4a',
        fillColor: '#287d75',
        fillOpacity: 0.9,
        weight: 2
      });
      marker.on('click', () => onPick?.(cluster));
      marker.bindTooltip(cluster.name_tc || cluster.name_en || '', { direction: 'top' });
      marker.addTo(markersRef.current);
    }
  }, [clusters, onPick, userLat, userLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const lat = Number(center[0]);
    const lng = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const here = map.getCenter();
    if (Math.hypot(here.lat - lat, here.lng - lng) > 0.0008) map.setView([lat, lng], map.getZoom());
  }, [center]);

  return <div ref={elRef} className="stop-map" role="application" />;
}
