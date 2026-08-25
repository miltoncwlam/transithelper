export const LINE_COLORS = {
  KMB: '#E1251B',
  LWB: '#F37021',
  CTB: '#F5C400',
  GMB: '#00A651',
  NLB: '#2F6FED',
  JOINT: '#8B5CF6'
};

export function lineColorForCo(co) {
  const key = String(co || 'KMB').toUpperCase();
  if (key === 'KMB/CTB' || key === 'KMBCTB') return LINE_COLORS.JOINT;
  return LINE_COLORS[key] || LINE_COLORS.KMB;
}
