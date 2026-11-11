// Stand-in answers for the public site services, in the shapes their APIs document. Test-only.
// Charlotte, NC example (Jaja's acceptance scenario). Values are illustrative, not real lookups.
exports.census = { result: { input: {}, addressMatches: [{ matchedAddress: '600 E 4TH ST, CHARLOTTE, NC, 28202', coordinates: { x: -80.838195, y: 35.220873 },
  addressComponents: { city: 'CHARLOTTE', state: 'NC', zip: '28202' },
  geographies: { 'States': [{ STUSAB: 'NC', NAME: 'North Carolina' }], 'Counties': [{ NAME: 'Mecklenburg County' }], 'Incorporated Places': [{ NAME: 'Charlotte city', BASENAME: 'Charlotte' }], 'County Subdivisions': [{ NAME: 'Charlotte township', BASENAME: 'Charlotte' }], 'Census Tracts': [{ NAME: 'Census Tract 1.03', GEOID: '37119000103' }] } }] } };
exports.censusNoMatch = { result: { addressMatches: [] } };
exports.femaZone = { features: [{ attributes: { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999, DFIRM_ID: '37119C' } }] };
exports.femaPanel = { features: [{ attributes: { FIRM_PAN: '3710454500K', EFF_DATE: 1418601600000, PANEL_TYP: 'County Wide' } }] };
exports.usgs = { location: { x: -80.838195, y: 35.220873 }, value: 719.43 };

// ---------------------------------------------------------------- jurisdiction layer: Charlotte / Mecklenburg GIS
// Shapes and field names as the City of Charlotte ArcGIS services answer them. The 600 E 4th St parcel values were read
// from the live service on 2026-11-11 (parcel 12502601, zoning UC); the other places are made-up stand-ins.
const ring = (lng, lat, w, h) => [[lng, lat], [lng + w, lat], [lng + w, lat + h], [lng, lat + h], [lng, lat]];
const parcel = (a, rings) => ({ attributes: a, geometry: { rings } });
exports.cltParcels = {
  uptown: parcel({ parcelid: '12502601', location_address: '600 E 4TH ST CHARLOTTE NC', owner1lastname: 'CITY OF CHARLOTTE', owner1firstname: null, owner2lastname: null, owner2firstname: null, billingaddress: '600 E 4TH ST', city: 'CHARLOTTE', state: 'NC', zipcode: '28202-2816', landsize: 116130.0, landunitdescription: 'SQUARE FEET', landusecode: 'O400', landuse_description: 'OFFICE', legaldescription: 'L1-4 B1 U/M', deed_book: null, deed_page: null, yearid: 2026, totallandvalue: 16200100, totalbuildingvalue: 71183700.0, totalmarketvalue: 87383800, num_heatedarea: 386012.0, total_living_units: 1, saledate: null, saleprice: null, tax_mundist: 'CHARLOTTE', gis1: '-80.83926799', gis2: '35.22127654' },
    [[[-80.838455, 35.221257], [-80.839307, 35.22063], [-80.839425, 35.220734], [-80.840093, 35.221303], [-80.839879, 35.221453], [-80.839239, 35.221942], [-80.838455, 35.221257]]]),
  house: parcel({ parcelid: '15303199', location_address: '1200 QUEENS RD CHARLOTTE NC', owner1lastname: 'SAMPLE', owner1firstname: 'PAT', owner2lastname: 'SAMPLE', owner2firstname: 'JO', billingaddress: '1200 QUEENS RD', city: 'CHARLOTTE', state: 'NC', zipcode: '28207', landsize: 0.207, landunitdescription: 'ACRES', landusecode: 'R100', landuse_description: 'SINGLE FAMILY RESIDENTIAL', legaldescription: 'L12 B3 M3-450', deed_book: '35512', deed_page: '118', yearid: 2026, totallandvalue: 610000, totalbuildingvalue: 402300, totalmarketvalue: 1012300, num_heatedarea: 2410, total_living_units: 1, saledate: 1593561600000, saleprice: 865000, tax_mundist: 'CHARLOTTE', gis1: '-80.8301', gis2: '35.1952' },
    [ring(-80.8303, 35.1951, 0.0004, 0.00025)]),
  town: parcel({ parcelid: '01910101', location_address: '100 MAIN ST HUNTERSVILLE NC', owner1lastname: 'SAMPLE HOLDINGS LLC', billingaddress: 'PO BOX 1', city: 'HUNTERSVILLE', state: 'NC', zipcode: '28078', landsize: 21780, landunitdescription: 'SQUARE FEET', landusecode: 'C100', landuse_description: 'COMMERCIAL', yearid: 2026, totalmarketvalue: 500000, tax_mundist: 'HUNTERSVILLE', gis1: '-80.8429', gis2: '35.4107' },
    [ring(-80.8431, 35.4106, 0.0004, 0.0002)]),
};
exports.cltZoningAt = {
  uptown: { ZonePetition: null, ZoneDes: 'UC', SPA: 'no', Overlay: 'none', RezoneDate: 1685592000000, ZoneClass: 'UPTOWN MIXED USE', Hyperlink: null },
  house: { ZonePetition: '2023-074', ZoneDes: 'N1-C(CD)', SPA: 'no', Overlay: 'HDO', RezoneDate: 1750046400000, ZoneClass: 'NEIGHBORHOOD 1', Hyperlink: 'https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning/2023/2023-074' },
  legacy: { ZonePetition: '2015-010', ZoneDes: 'MUDD-O', Overlay: 'none', ZoneClass: 'MIXED USE', Hyperlink: null },
};
exports.cltZonesNear = (lng, lat) => ({ features: [
  { attributes: { ZoneDes: 'UC' }, geometry: { rings: [ring(lng - 0.01, lat - 0.01, 0.012, 0.02)] } },
  { attributes: { ZoneDes: 'N2-B' }, geometry: { rings: [ring(lng + 0.002, lat - 0.01, 0.01, 0.02)] } },
] });
exports.cltLinesNear = (lng, lat) => ({ features: Array.from({ length: 12 }, (_, i) => ({ attributes: { PID: 'P' + i }, geometry: { rings: [ring(lng - 0.0015 + (i % 4) * 0.0008, lat - 0.0012 + Math.floor(i / 4) * 0.0008, 0.0007, 0.0007)] } })) });
exports.cltRezoningsNear = (lng, lat) => ({ features: [{ attributes: { Petition: '2026-067', ExistZone: 'TOD-CC', ReqZone: 'CR(CD)', Acres: 2.908, Received: 1789444800000, Hyperlink: 'https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Rezoning/2026/2026-067' }, geometry: { rings: [ring(lng + 0.0008, lat + 0.0005, 0.0012, 0.0008)] } }] });
/** Census answers for the other test places (same shape as exports.census). */
const censusFor = (matched, x, y, county, place, state = 'NC', stateName = 'North Carolina') => ({ result: { addressMatches: [{ matchedAddress: matched, coordinates: { x, y }, addressComponents: { city: place.toUpperCase(), state, zip: '' },
  geographies: { 'States': [{ STUSAB: state, NAME: stateName }], 'Counties': [{ NAME: county }], 'Incorporated Places': [{ NAME: place + ' city', BASENAME: place }], 'Census Tracts': [{ NAME: 'Census Tract 1' }] } }] } });
exports.censusHouse = censusFor('1200 QUEENS RD, CHARLOTTE, NC, 28207', -80.8302, 35.1953, 'Mecklenburg County', 'Charlotte');
exports.censusTown = censusFor('100 MAIN ST, HUNTERSVILLE, NC, 28078', -80.8428, 35.4108, 'Mecklenburg County', 'Huntersville');
exports.censusRaleigh = censusFor('222 W HARGETT ST, RALEIGH, NC, 27601', -78.6417, 35.7779, 'Wake County', 'Raleigh');
exports.censusLegacy = censusFor('500 LEGACY AVE, CHARLOTTE, NC, 28203', -80.85, 35.21, 'Mecklenburg County', 'Charlotte');

/** One stand-in for every Charlotte GIS request. `down` makes the zoning service fail. Returns null for other hosts. */
exports.gisAnswer = (u, opts = {}) => {
  if (u.host !== 'gis.charlottenc.gov') return null;
  const p = u.pathname, sp = u.searchParams, where = sp.get('where') || '', geom = sp.get('geometry') || '';
  const feats = (...f) => ({ features: f });
  const which = /600 E 4TH ST/.test(where) ? 'uptown' : /1200 QUEENS RD/.test(where) ? 'house' : /100 MAIN ST/.test(where) ? 'town' : /500 LEGACY AVE/.test(where) ? 'legacy' : '';
  const nearPt = () => { const [x, y] = geom.split(',').map(Number); return y > 35.4 ? 'town' : y > 35.215 ? 'uptown' : y > 35.2 && x < -80.845 ? 'legacy' : 'house'; };
  if (p.includes('/PLN/AllParcelData/')) {
    if (where) return which && which !== 'legacy' ? feats(exports.cltParcels[which]) : feats();
    const k = nearPt(); return k === 'legacy' ? feats() : feats(exports.cltParcels[k]);
  }
  if (p.includes('/PLN/Zoning/')) {
    if (opts.down) return { error: { code: 500, message: 'Service unavailable' } };
    if (sp.get('geometryType') === 'esriGeometryPoint') { const k = nearPt(); return feats({ attributes: exports.cltZoningAt[k] || exports.cltZoningAt.uptown }); }
    const b = geom.split(',').map(Number); return exports.cltZonesNear((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  }
  if (p.includes('/CountyData/Parcels/')) { const b = geom.split(',').map(Number); return exports.cltLinesNear((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); }
  if (p.includes('/PLN/Rezonings/')) { const b = geom.split(',').map(Number); return /Pen/.test(where) ? exports.cltRezoningsNear((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) : feats(); }
  return feats();
};
exports.censusByAddress = a => /queens/i.test(a) ? exports.censusHouse : /huntersville/i.test(a) ? exports.censusTown : /raleigh/i.test(a) ? exports.censusRaleigh : /legacy/i.test(a) ? exports.censusLegacy : /nowhere/i.test(a) ? exports.censusNoMatch : exports.census;
