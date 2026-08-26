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

function numberedIcon(L, n, selected, color) {
  const fill = selected ? '#fff' : (color || '#000');
  const ink = selected ? (color || '#000') : '#fff';
  const edge = selected ? (color || '#000') : '#fff';
  return L.divIcon({
    className: `tb-stop-num${selected ? ' selected' : ''}${color ? ' colored' : ''}`,
    html: `<span class="tb-stop-num-inner" style="background:${fill};color:${ink};border-color:${edge}">${n}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function drawCasedLine(L, layer, coords, color) {
  L.polyline(coords, {
    color: '#111111',
    weight: 8,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(layer);
  L.polyline(coords, {
    color: color || '#E1251B',
    weight: 5,
    opacity: 1,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(layer);
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
  selectedIndex,
  path,
  lineColor,
  markerColor,
  showStraight = false,
  className = ''
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const moveTimer = useRef(null);
  const fittedKey = useRef('');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    let cancelled = false;
    let resizeObs = null;
    let onResize = null;
    loadLeaflet().then((L) => {
      if (cancelled || !elRef.current || !L || mapRef.current) return;
      L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
      const map = L.map(elRef.current, {
        scrollWheelZoom: true,
        zoomControl: true,
        tapTolerance: 28,
        touchZoom: true
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO'
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
      onResize = () => map.invalidateSize();
      if (cancelled) return;
      resizeObs = new ResizeObserver(onResize);
      resizeObs.observe(elRef.current);
      window.addEventListener('resize', onResize);
      setTimeout(onResize, 80);
      setTimeout(onResize, 400);
    }).catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(moveTimer.current);
      resizeObs?.disconnect();
      if (onResize) window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L || !layersRef.current) return;
    layersRef.current.clearLayers();

    if (mode === 'route') {
      const pts = [];
      (routeStops || []).forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng ?? stop.long);
        if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
      });
      const road = Array.isArray(path) && path.length >= 2 ? path : null;
      if (road) {
        drawCasedLine(L, layersRef.current, road, lineColor);
        if (showStraight && pts.length >= 2) {
          L.polyline(pts, { color: '#111111', weight: 2, dashArray: '5, 8', opacity: 0.45 }).addTo(layersRef.current);
        }
      } else if (showStraight && pts.length >= 2) {
        L.polyline(pts, { color: '#000000', weight: 3, dashArray: '6, 6', opacity: 0.55 }).addTo(layersRef.current);
      }
      (routeStops || []).forEach((stop, i) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng ?? stop.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const selected = String(selectedIndex) === String(stop.index ?? i);
        const hit = L.circleMarker([lat, lng], {
          radius: 18,
          color: 'transparent',
          fillColor: markerColor || '#000',
          fillOpacity: 0.01,
          weight: 0,
          bubblingMouseEvents: false
        });
        const marker = L.marker([lat, lng], {
          icon: numberedIcon(L, stop.seq || i + 1, selected, markerColor),
          keyboard: true,
          zIndexOffset: selected ? 800 : 400,
          bubblingMouseEvents: false
        });
        const pick = () => onPick?.(stop);
        hit.on('click', pick);
        marker.on('click', pick);
        marker.bindTooltip(stop.name_tc || stop.name_en || String(stop.seq || i + 1), { direction: 'top' });
        hit.addTo(layersRef.current);
        marker.addTo(layersRef.current);
      });
      const fitPts = road || pts;
      const key = `${fitPts.length}:${fitPts[0]?.join(',') || ''}:${fitPts[fitPts.length - 1]?.join(',') || ''}`;
      if (fitPts.length && fittedKey.current !== key) {
        fittedKey.current = key;
        map.fitBounds(fitPts, { padding: [28, 28], maxZoom: 16 });
      }
      return;
    }

    if (Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLng))) {
      L.circleMarker([userLat, userLng], { radius: 7, color: '#000', fillColor: '#2F6FED', fillOpacity: 1, weight: 2 }).addTo(layersRef.current);
    }
    for (const cluster of clusters || []) {
      if (!Number.isFinite(Number(cluster.lat)) || !Number.isFinite(Number(cluster.lng))) continue;
      const marker = L.circleMarker([cluster.lat, cluster.lng], {
        radius: 9,
        color: '#000',
        fillColor: '#F5C400',
        fillOpacity: 1,
        weight: 2
      });
      marker.on('click', () => onPick?.(cluster));
      marker.bindTooltip(cluster.name_tc || cluster.name_en || '', { direction: 'top' });
      marker.addTo(layersRef.current);
    }
  }, [clusters, onPick, userLat, userLng, mode, routeStops, selectedIndex, path, lineColor, markerColor, showStraight]);

  useEffect(() => {
    if (mode === 'route') return;
    const map = mapRef.current;
    if (!map || !center) return;
    const lat = Number(center[0]);
    const lng = Number(center[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const here = map.getCenter();
      if (Math.hypot(here.lat - lat, here.lng - lng) > 0.0008) map.setView([lat, lng], map.getZoom());
    }
  }, [center, mode]);

  useEffect(() => {
    if (mode !== 'route') return;
    const map = mapRef.current;
    if (!map || selectedIndex === '' || selectedIndex == null) return;
    const stop = (routeStops || []).find((row, i) => String(row.index ?? i) === String(selectedIndex));
    if (!stop) return;
    const lat = Number(stop.lat);
    const lng = Number(stop.lng ?? stop.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      const zoom = Math.max(map.getZoom() || 15, 15);
      map.setView([lat, lng], zoom, { animate: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [selectedIndex, mode, routeStops]);

  return <div ref={elRef} className={`stop-map${className ? ` ${className}` : ''}`} role="application" />;
}
