// Stand-in answers for the public site services, in the shapes their APIs document. Test-only.
// Charlotte, NC example (Jaja's acceptance scenario). Values are illustrative, not real lookups.
exports.census = { result: { input: {}, addressMatches: [{ matchedAddress: '600 E 4TH ST, CHARLOTTE, NC, 28202', coordinates: { x: -80.838195, y: 35.220873 },
  addressComponents: { city: 'CHARLOTTE', state: 'NC', zip: '28202' },
  geographies: { 'States': [{ STUSAB: 'NC', NAME: 'North Carolina' }], 'Counties': [{ NAME: 'Mecklenburg County' }], 'Incorporated Places': [{ NAME: 'Charlotte city', BASENAME: 'Charlotte' }], 'County Subdivisions': [{ NAME: 'Charlotte township', BASENAME: 'Charlotte' }], 'Census Tracts': [{ NAME: 'Census Tract 1.03', GEOID: '37119000103' }] } }] } };
exports.censusNoMatch = { result: { addressMatches: [] } };
exports.femaZone = { features: [{ attributes: { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999, DFIRM_ID: '37119C' } }] };
exports.femaPanel = { features: [{ attributes: { FIRM_PAN: '3710454500K', EFF_DATE: 1418601600000, PANEL_TYP: 'County Wide' } }] };
exports.usgs = { location: { x: -80.838195, y: 35.220873 }, value: 719.43 };
