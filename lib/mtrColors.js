export const MTR_LINE_COLORS = {
  AEL: '#1C7670',
  TCL: '#F7943E',
  TML: '#9A3B26',
  TKL: '#7D499D',
  EAL: '#53B7E8',
  TWL: '#E2231A',
  ISL: '#0075C2',
  KTL: '#00AB4E',
  SIL: '#B5BD00',
  DRL: '#F173AC',
  LRT: '#CD9714'
};

export function mtrLineColor(line) {
  return MTR_LINE_COLORS[String(line || '').toUpperCase()] || '#2A241C';
}
