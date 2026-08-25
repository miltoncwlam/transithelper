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

function numberedIcon(L, n, selected) {
  return L.divIcon({
    className: `tb-stop-num${selected ? ' selected' : ''}`,
    html: `<span>${n}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

export default function StopMap({
  center,
  clusters,
  onPick,
  onMove,
  userLat,
  userLng,
  mode = 'nearby',
  routeStops,
  selectedIndex
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const moveTimer = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

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
        if (modeRef.current === 'route') return;
        clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(() => {
          const here = map.getCenter();
          onMove?.({ lat: here.lat, lng: here.lng });
        }, 400);
      });
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
    }).catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(moveTimer.current);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !layersRef.current) return;
    layersRef.current.clearLayers();

    if (mode === 'route') {
      const pts = [];
      (routeStops || []).forEach((stop, i) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng ?? stop.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        pts.push([lat, lng]);
        const marker = L.marker([lat, lng], {
          icon: numberedIcon(L, stop.seq || i + 1, String(selectedIndex) === String(stop.index ?? i)),
          keyboard: true
        });
        marker.on('click', () => onPick?.(stop));
        marker.bindTooltip(stop.name_tc || stop.name_en || String(stop.seq || i + 1), { direction: 'top' });
        marker.addTo(layersRef.current);
      });
      if (pts.length >= 2) {
        L.polyline(pts, { color: '#111', weight: 3, dashArray: '7 8', opacity: 0.85 }).addTo(layersRef.current);
      }
      if (pts.length) {
        map.fitBounds(pts, { padding: [28, 28], maxZoom: 16 });
      }
      return;
    }

    if (Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLng))) {
      L.circleMarker([userLat, userLng], { radius: 7, color: '#111', fillColor: '#111', fillOpacity: 1 }).addTo(layersRef.current);
    }
    for (const cluster of clusters || []) {
      if (!Number.isFinite(Number(cluster.lat)) || !Number.isFinite(Number(cluster.lng))) continue;
      const marker = L.circleMarker([cluster.lat, cluster.lng], {
        radius: 9,
        color: '#111',
        fillColor: '#fff',
        fillOpacity: 0.95,
        weight: 2
      });
      marker.on('click', () => onPick?.(cluster));
      marker.bindTooltip(cluster.name_tc || cluster.name_en || '', { direction: 'top' });
      marker.addTo(layersRef.current);
    }
  }, [clusters, onPick, userLat, userLng, mode, routeStops, selectedIndex]);

  useEffect(() => {
    if (mode === 'route') return;
    const map = mapRef.current;
    if (!map || !center) return;
    const lat = Number(center[0]);
    const lng = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const here = map.getCenter();
    if (Math.hypot(here.lat - lat, here.lng - lng) > 0.0008) map.setView([lat, lng], map.getZoom());
  }, [center, mode]);

  return <div ref={elRef} className="stop-map" role="application" />;
}
